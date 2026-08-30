// The Baileys worker: one process, many WhatsApp logins.
//
// WHY THIS IS A SEPARATE PROCESS AND NOT AN EDGE FUNCTION
//
// Baileys is the WhatsApp Web protocol. It keeps a live WebSocket to WhatsApp's
// servers, a Signal session, and rolling encryption keys — all of it in memory,
// all of it only valid while the connection stays up. Supabase edge functions
// are Deno and die at the end of each request; Vercel is serverless. Neither can
// hold a socket open between two calls, so neither can run this. That is not a
// preference about hosting, it is what the protocol requires.
//
// WHY MANY SESSIONS IN ONE PROCESS
//
// One worker used to mean one login, so a company with a founder and three
// telecallers needed four hosts. The founder has one Hostinger web app, and
// pointing a telecaller at the founder's address did one of three silently wrong
// things: watch the FOUNDER's WhatsApp and file it under the rep, record nothing
// because that process was not observing, or — if someone set the observe flag
// to "fix" it — start returning 403 on /send and stop the Daily Pulse that
// evening. The first is the worst, because it looks like the feature working.
//
// So sessions are addressed by path instead of by host:
//
//   /status /qr /reconnect /send        the FOUNDER's session, exactly as before
//   /s/<salesperson_id>/status|qr|…     one telecaller, watch-only
//
// The legacy routes are untouched on purpose: notify-provider, wa-provider.ts
// and the admin ProviderPicker all call them and must keep working.
//
// EACH SESSION IS STILL ISOLATED. Its own auth directory, its own socket, its
// own reconnect backoff. A ban on one number logs out that session and no other.
// Sharing a process is not sharing an account.
//
// TWO ROLES, AND THE DIFFERENCE IS ENFORCED
//
// FOUNDER: sends the daily pulse to the founder's own phone. One internal
// number, one recipient, one message a day. Never a customer.
//
// TELECALLER: watch-only. /send returns 403. The rep goes on messaging buyers by
// hand from their own phone; this only writes down what happened. The CRM drops
// any message whose other party is not a lead in that rep's own company, so
// personal chats never reach the database — that filter lives server-side
// precisely so no worker configuration can skip it.
//
// SECURITY
//
// Every route except /health requires the shared bearer. Without it this is a
// public "send WhatsApp as this company" button, which is the sort of thing that
// gets a number banned by someone else's script within a day of being indexed.
import http from "node:http";
import path from "node:path";
import fs from "node:fs/promises";
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import pino from "pino";
import QRCode from "qrcode";

const PORT = Number(process.env.PORT || 8080);
const SECRET = process.env.BAILEYS_SECRET || "";
// Must point at a PERSISTENT volume. On an ephemeral filesystem the session is
// lost on every deploy and everyone is asked to rescan a QR each time, which is
// how this feature quietly stops being used.
const AUTH_DIR = process.env.AUTH_DIR || "./auth";

// Where observed messages go. Only telecaller sessions ever post; the founder's
// session has no observer attached.
const INGEST_URL = process.env.INGEST_URL || "";
const INGEST_SECRET = process.env.BAILEYS_INGEST_SECRET || "";
// Batched, not per-message: a rep in a busy conversation would otherwise fire a
// request per keystroke-sized message.
const FLUSH_MS = Number(process.env.FLUSH_MS || 15_000);
const MAX_BATCH = 200;
// Room for a history sync, which arrives as one burst rather than a trickle.
// A year of a working telecaller's lead conversations fits comfortably; the
// non-lead ones are dropped by the CRM, not here, so this holds the raw feed.
const MAX_PENDING = Number(process.env.MAX_PENDING || 20_000);

/**
 * Bump this whenever src/server.js changes.
 *
 * This worker is uploaded by hand, so it is the one component that can silently
 * be a version behind everything else — and every hour lost on this feature so
 * far has been spent proving which build was actually running. /health, /status
 * and every ingest batch now carry it, so the answer is one request away
 * instead of a guess from behaviour.
 */
const WORKER_VERSION = "2026.08.30-6";

if (!SECRET) {
  console.error("BAILEYS_SECRET is not set. Refusing to start — an open send endpoint gets the number banned.");
  process.exit(1);
}

const log = pino({ level: process.env.LOG_LEVEL || "info" });

/** The founder's session. Kept under this name so the legacy routes read clearly. */
const FOUNDER = "founder";

/** id -> session. Created on demand, never destroyed while the process lives. */
const sessions = new Map();

function newSession(id, salespersonId) {
  return {
    id,
    // null for the founder. Present for a telecaller, and it is what the CRM
    // files the observed messages under.
    salespersonId: salespersonId ?? null,
    observeOnly: Boolean(salespersonId),
    // Each login gets its own directory. Sharing one would have two accounts
    // overwriting each other's keys, which presents as both being logged out.
    authDir: salespersonId ? path.join(AUTH_DIR, `rep-${salespersonId}`) : AUTH_DIR,
    sock: null,
    reconnectTimer: null,
    // start() awaits twice before it assigns s.sock, so two overlapping calls
    // (the reconnect timer firing while an admin presses Show QR) would both
    // sail past any "is there a socket already" check and build two. This is
    // the only thing that makes that impossible.
    starting: false,
    // Backoff, because a logged-out session reconnecting in a tight loop is
    // exactly the pattern WhatsApp bans a number for.
    backoffMs: 2_000,
    pending: [],
    // WhatsApp calls, queued separately from messages and flushed alongside
    // them. A call is not a message; mixing them would corrupt every message
    // count the CRM already reports.
    pendingCalls: [],
    // Read receipts: which of the BUYER's messages this rep has actually
    // opened. "Has not replied" and "has not even read it" are different
    // conversations to have with a telecaller.
    pendingReceipts: [],
    flushTimer: null,
    state: {
      status: "disconnected", // disconnected | connecting | qr | connected
      number: null,
      qrDataUrl: null,
      lastSeen: null,
      lastError: null,
    },
  };
}

function getSession(id, salespersonId) {
  let s = sessions.get(id);
  if (!s) {
    s = newSession(id, salespersonId);
    sessions.set(id, s);
    start(s).catch((e) => {
      s.state.lastError = String(e?.message || e);
      log.error({ id, err: s.state.lastError }, "initial connect failed");
    });
  }
  return s;
}

const MAX_BACKOFF_MS = 5 * 60_000;

async function start(s) {
  // TWO SOCKETS ON ONE LOGIN IS WHAT 440 MEANS, AND WE WERE CAUSING IT.
  //
  // This function used to assign a brand-new socket over s.sock and simply
  // walk away from the old one — never ended, websocket still open, listeners
  // still attached. WhatsApp allows a set of credentials exactly one live
  // connection, so the moment a second appeared it killed one with statusCode
  // 440 (connectionReplaced). The close handler then scheduled another
  // start(), which built a third, which produced another 440… a loop the
  // worker generated itself, one orphan socket per turn, forever.
  //
  // Ankita's session sat in that loop with status "connecting" and no QR ever
  // shown, because a session with credentials on disk RESUMES rather than
  // pairing — Baileys only emits a qr event when it has nothing to resume
  // with. So the dashboard's "Waiting for WhatsApp to offer a QR…" was
  // waiting for an event that could never arrive.
  if (s.starting) {
    log.warn({ id: s.id }, "start() already in flight — ignoring the duplicate");
    return;
  }
  s.starting = true;
  clearTimeout(s.reconnectTimer);
  // Ended BEFORE the awaits below, not after: the old socket must be gone
  // before the new one authenticates, or the two overlap and 440 fires again.
  if (s.sock) {
    try { s.sock.ev.removeAllListeners(); } catch { /* nothing attached */ }
    try { s.sock.end(); } catch { /* already gone */ }
    s.sock = null;
  }
  s.state.status = "connecting";
  s.state.lastError = null;

  // The two awaits are the only part that can throw before a socket exists, so
  // they carry the guard: a failure here has to clear `starting`, or the
  // session is wedged for the life of the process and even Re-scan cannot
  // revive it.
  let auth, saveCreds, version;
  try {
    ({ state: auth, saveCreds } = await useMultiFileAuthState(s.authDir));
    ({ version } = await fetchLatestBaileysVersion());
  } catch (e) {
    s.starting = false;
    s.state.status = "disconnected";
    s.state.lastError = String(e?.message || e);
    log.error({ id: s.id, err: s.state.lastError }, "could not prepare the connection");
    throw e;
  }
  s.starting = false;

  s.sock = makeWASocket({
    version,
    auth,
    // We are a sender or a watcher, never a reader. Marking ourselves online
    // would make the phone stop showing notifications for these messages,
    // because WhatsApp would think the account is already reading them here.
    markOnlineOnConnect: false,
    // OFF BY DEFAULT, AND THAT DEFAULT COST US THE WHOLE IMPORT.
    //
    // With syncFullHistory false WhatsApp pushes only a token slice of recent
    // chats on link — enough that messaging-history.set fires and looks like it
    // worked, nowhere near enough to show a rep's actual conversations. On a
    // watch-only session there is no reason not to ask for the lot: the CRM
    // drops every non-lead message anyway, so the extra volume is discarded
    // server-side and what survives is exactly the thread an admin wants.
    //
    // Only for observers. The founder's session sends one message a day and has
    // no business pulling anybody's history.
    syncFullHistory: s.observeOnly,
    logger: pino({ level: "silent" }),
    // THE HALF OF syncFullHistory NOBODY TELLS YOU ABOUT.
    //
    // syncFullHistory: true is necessary and NOT sufficient. WhatsApp decides
    // how much history to push from the client identity in this very field —
    // it sends the full archive only to something it believes is a DESKTOP
    // app, and a phone-or-unknown client gets a token slice of recent chats.
    // "Call Pro AI / Chrome / 1.0.0" is not a client WhatsApp recognises, so
    // for every rep linked so far it took the second path: the sync fired,
    // messaging-history.set arrived, the logs said "history sync" — and it
    // carried almost nothing. That is why re-scanning never produced Ankita's
    // conversations no matter how many times she was asked to do it. The
    // scanning was never the problem.
    //
    // ["Mac OS", "Desktop", …] is the identity that gets the archive. Written
    // as a literal rather than Baileys' Browsers.macOS() helper so it is
    // obvious at a glance what is being claimed and why it must not be
    // "improved" back into a friendly product name.
    //
    // Senders do not need it: the founder session pushes one message a day and
    // has no business pulling anyone's history.
    browser: s.observeOnly ? ["Mac OS", "Desktop", "14.4.1"] : ["Call Pro AI", "Chrome", "1.0.0"],
  });

  s.sock.ev.on("creds.update", saveCreds);

  // WATCH-ONLY SESSIONS REPORT WHAT THEY SAW. The founder's session does not:
  // it exists to send one message a day and has no business recording anything.
  if (s.observeOnly) {
    // LIVE TRAFFIC AND REPLAY, BOTH.
    //
    // This used to take only type "notify" and drop "append", on the reasoning
    // that replay would re-post a rep's whole backlog on every restart. That
    // reasoning was wrong: the CRM upserts on (salesperson_id, wa_message_id)
    // and ignores duplicates, so a re-post costs one wasted request and changes
    // no number anywhere. Meanwhile the rule quietly cost the thing the feature
    // exists for — a rep scans the QR, the admin opens the lead, and the
    // conversation is empty because it all happened five minutes before the
    // scan.
    s.sock.ev.on("messages.upsert", (ev) => {
      for (const m of ev?.messages ?? []) queueObserved(s, m);
    });

    // THE CONVERSATIONS THAT ALREADY EXISTED.
    //
    // messages.upsert only ever fires for messages that arrive while we are
    // connected. Everything the rep said to a buyer BEFORE linking the device
    // comes through this event instead — WhatsApp pushes a chunk of history
    // once, shortly after the QR is scanned. Without it the CRM starts from
    // zero on a rep who has been selling on WhatsApp for a year, which is
    // exactly how the first telecaller's lead pages came up blank.
    //
    // The privacy gate is unchanged and still runs server-side on every one of
    // these: history from a non-lead is dropped the same as live traffic from a
    // non-lead. This imports the rep's conversations WITH THIS COMPANY'S LEADS
    // and nothing else.
    s.sock.ev.on("messaging-history.set", (h) => {
      const msgs = h?.messages ?? [];
      if (msgs.length) {
        log.info({ id: s.id, count: msgs.length, progress: h?.progress ?? null }, "history sync");
      }
      for (const m of msgs) queueObserved(s, m);
    });

    // WHATSAPP CALLS — the gap this whole feature was originally asked about.
    //
    // "jo lead ko call WhatsApp call se jaa rahi hai uska Daily Pulse me log
    // nahi aata." Reps in Indian real estate ring buyers on WhatsApp constantly
    // and none of it reaches the CRM: the SIM call log cannot see it, and until
    // now neither could this. A rep who spent the morning on WhatsApp calls read
    // as a rep who made no calls at all.
    //
    // Sent as its own array rather than squeezed into messages, because a call
    // is not a message and pretending otherwise would corrupt every count that
    // already exists — messages_sent, details, reply speed, all of it.
    s.sock.ev.on("call", (events) => {
      for (const c of events ?? []) {
        const from = String(c?.from ?? c?.chatId ?? "");
        if (!from.endsWith("@s.whatsapp.net")) continue;
        if (!c?.id) continue;
        s.pendingCalls.push({
          id: String(c.id),
          peer: from.split("@")[0],
          // isGroup is filtered above; outbound calls report differently across
          // WhatsApp versions, so trust the flag when present and default to
          // inbound, which is the safer thing to under-claim.
          direction: c?.isFromMe ? "out" : "in",
          // offer | ringing | accept | reject | timeout — the CRM decides what
          // "connected" means rather than the worker guessing.
          status: String(c?.status ?? "offer"),
          video: !!c?.isVideo,
          at: new Date(
            c?.date ? new Date(c.date).getTime() : Date.now(),
          ).toISOString(),
        });
      }
      if (s.pendingCalls.length && !s.flushTimer) {
        s.flushTimer = setTimeout(() => flushObserved(s), FLUSH_MS);
      }
    });

    // DID THE REP EVEN OPEN IT?
    //
    // "Buyer waiting 4 hours for a reply" is already the sharpest line in the
    // Pulse. This splits it into the two cases that deserve different
    // conversations: the rep read the question and has not answered, or the rep
    // has not looked at their WhatsApp at all. The first is a priorities
    // problem, the second is an attendance one.
    //
    // Only receipts on messages the rep RECEIVED are interesting here, and only
    // the read state. Whether the buyer read the rep's message is WhatsApp's
    // business and not something an admin needs.
    s.sock.ev.on("messages.update", (updates) => {
      for (const u of updates ?? []) {
        const jid = String(u?.key?.remoteJid ?? "");
        if (!jid.endsWith("@s.whatsapp.net")) continue;
        if (u?.key?.fromMe) continue;
        const st = u?.update?.status;
        // Baileys reports status as a number or a name depending on version.
        const readish = st === 4 || st === 5 || st === "READ" || st === "PLAYED";
        if (!readish || !u?.key?.id) continue;
        s.pendingReceipts.push({
          id: String(u.key.id),
          peer: jid.split("@")[0],
          read_at: new Date().toISOString(),
        });
      }
      if (s.pendingReceipts.length && !s.flushTimer) {
        s.flushTimer = setTimeout(() => flushObserved(s), FLUSH_MS);
      }
    });
  }

  s.sock.ev.on("connection.update", async (u) => {
    const { connection, lastDisconnect, qr } = u;

    if (qr) {
      // Rendered here rather than in the browser so the raw pairing string —
      // which is enough to hijack the session — never leaves this box in a form
      // anything else can replay.
      s.state.qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
      s.state.status = "qr";
      log.info({ id: s.id }, "QR ready — scan it from the right phone");
    }

    if (connection === "open") {
      s.state.status = "connected";
      s.state.qrDataUrl = null;
      s.state.lastSeen = new Date().toISOString();
      s.state.lastError = null;
      s.backoffMs = 2_000;
      s.state.number = s.sock?.user?.id ? String(s.sock.user.id).split(":")[0] : null;
      log.info({ id: s.id, number: s.state.number }, "connected");
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      // 440. RETRYING IS WHAT CAUSES IT, SO RETRYING CANNOT BE THE ANSWER.
      //
      // connectionReplaced means something else took this login — either the
      // orphan-socket bug above (now fixed), or a human linking the same
      // WhatsApp somewhere else. In both cases the credentials on disk are
      // contested, and every reconnect starts the fight again. Worse, a
      // session with credentials never offers a QR — it resumes — so the loop
      // is invisible from the dashboard except as "connecting" forever.
      //
      // Terminal, like loggedOut: stop, say plainly that a fresh scan is the
      // only way out, and let a human press Re-scan (which wipes the creds).
      const replaced = code === DisconnectReason.connectionReplaced;
      s.state.status = "disconnected";
      s.state.lastError = loggedOut
        ? "WhatsApp logged this session out. Press Re-scan and scan the new QR."
        : replaced
          ? "This WhatsApp got linked somewhere else, so this login no longer works. " +
            "Press Re-scan and scan the new QR from the rep's phone."
          : `Connection closed (${code ?? "unknown"}). Retrying.`;
      log.warn({ id: s.id, code, loggedOut, replaced }, "connection closed");

      if (loggedOut || replaced) {
        // Reconnecting with dead or contested credentials just fails forever
        // and looks like a flapping service. Wait for a human to scan.
        s.state.qrDataUrl = null;
        return;
      }
      s.reconnectTimer = setTimeout(() => start(s).catch((e) => log.error(e)), s.backoffMs);
      s.backoffMs = Math.min(s.backoffMs * 2, MAX_BACKOFF_MS);
    }
  });
}

// ── observer plumbing ────────────────────────────────────────────────────────

/** The readable part of a WhatsApp message, whatever shape it arrived in. */
function textOf(msg) {
  const m = msg?.message ?? {};
  return (
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.imageMessage?.caption ??
    m.videoMessage?.caption ??
    m.documentMessage?.caption ??
    ""
  );
}

/**
 * What was attached, by name rather than a yes/no.
 *
 * The CRM decides what counts as project details and needs the kind to do it: a
 * PDF, a photo and a video are details; a voice note is not. Reporting one
 * boolean is what let a rep's forty morning voice notes read as forty shared
 * brochures.
 *
 * pttMessage is WhatsApp's press-and-hold voice note; audioMessage is an
 * attached audio file. Both are audio and neither is a plot layout.
 */
function mediaKindOf(msg) {
  const m = msg?.message ?? {};
  if (m.documentMessage || m.documentWithCaptionMessage) return "document";
  if (m.imageMessage) return "image";
  if (m.videoMessage) return "video";
  if (m.audioMessage || m.pttMessage) return "audio";
  if (m.stickerMessage) return "sticker";
  return null;
}

/**
 * WHAT the attachment actually was, not just its category.
 *
 * "Sent a document" and "sent Dholera-Plot-A-Layout.pdf" are the same event and
 * very different sentences. The CRM cannot recover the filename later — WhatsApp
 * does not keep it anywhere the CRM can reach — so if the worker does not pass
 * it along at the moment it arrives, it is gone.
 *
 * Nothing is downloaded. This is the envelope, not the contents: no media bytes
 * ever leave the rep's phone through this worker.
 */
function mediaMetaOf(msg) {
  const m = msg?.message ?? {};
  const d = m.documentMessage ?? m.documentWithCaptionMessage?.message?.documentMessage;
  const node = d ?? m.imageMessage ?? m.videoMessage ?? m.audioMessage ?? m.pttMessage;
  if (!node) return {};
  return {
    file_name: d?.fileName ?? null,
    mime_type: node.mimetype ?? null,
    // Reported by WhatsApp as a string on some shapes and a Long on others.
    file_size: node.fileLength ? Number(node.fileLength) : null,
    // Voice notes and videos. A 3-second voice note and a 4-minute one are not
    // the same effort, and the CRM currently cannot tell them apart.
    duration_seconds: node.seconds ? Number(node.seconds) : null,
  };
}

function queueObserved(s, msg) {
  const jid = msg?.key?.remoteJid ?? "";
  // Groups, broadcasts and status updates are not one-to-one lead work.
  if (!jid.endsWith("@s.whatsapp.net")) return;
  const id = msg?.key?.id;
  if (!id) return;

  const peer = jid.split("@")[0];
  const text = String(textOf(msg) || "");
  const kind = mediaKindOf(msg);

  // THE REP TALKING TO THEMSELVES IS NOT LEAD WORK.
  //
  // WhatsApp's "Message yourself" chat, and a run of contentless protocol
  // messages WhatsApp addresses to your own JID during a sync, both arrive
  // here with remoteJid set to the rep's OWN number. Ankita's entire observed
  // history was sixteen of these — every one addressed to 919310012981, her
  // own number, with an empty body — which the dashboard then reported as
  // "16 messages seen, none with a lead". Technically true and completely
  // misleading: there was nothing there to match in the first place.
  const own = String(s.sock?.user?.id ?? "").split(":")[0].split("@")[0];
  if (own && peer === own) return;

  // An empty shell is not a message. No text, no attachment — nothing a human
  // sent and nothing anyone could read on a lead page. Counting them makes the
  // "seen" figure a measure of protocol chatter rather than of the rep's work.
  if (!text.trim() && !kind) return;

  s.pending.push({
    id,
    peer,
    direction: msg?.key?.fromMe ? "out" : "in",
    // What WhatsApp shows this contact as. Useful when the CRM's name for a
    // lead is "Facebook Lead 4412" and the buyer's own profile says who they
    // are. Never used for matching — that is phone-number-only, on purpose.
    peer_name: msg?.pushName ?? null,
    ...mediaMetaOf(msg),
    // The whole message. The worker is not where privacy is decided — it cannot
    // even tell whether this number is a lead. The CRM's match_wa_contact drops
    // every non-lead conversation on arrival, so clipping here would only
    // truncate the threads that DO get kept.
    //
    // Capped well above any real WhatsApp message purely so one pasted novel
    // cannot blow the batch size; WhatsApp's own limit is around 65k.
    text: text.slice(0, 8000),
    media_kind: kind,
    sent_at: new Date(Number(msg?.messageTimestamp ?? Date.now() / 1000) * 1000).toISOString(),
  });

  // A bound is still needed — the CRM can be unreachable and this must not grow
  // until the box runs out of memory. But 1,000 was sized for live traffic only,
  // and a history sync arrives in one burst of many thousands: at that ceiling
  // the shift() below would silently throw away the oldest conversations, which
  // are precisely the ones being imported. Raised, and the drop is now logged
  // rather than happening in silence.
  if (s.pending.length > MAX_PENDING) {
    const dropped = s.pending.length - MAX_PENDING;
    s.pending.splice(0, dropped);
    log.warn({ id: s.id, dropped, queued: s.pending.length },
      "observed buffer full — oldest messages discarded, CRM not keeping up");
  }
  // A history burst should not wait the full flush interval before it starts
  // draining; once there is a whole batch ready, send it now.
  if (s.pending.length >= MAX_BATCH) {
    clearTimeout(s.flushTimer);
    s.flushTimer = null;
    flushObserved(s).catch((e) => log.error(e));
    return;
  }
  if (!s.flushTimer) s.flushTimer = setTimeout(() => flushObserved(s), FLUSH_MS);
}

async function flushObserved(s) {
  s.flushTimer = null;
  // Any of the three is worth a round trip. Calls and receipts arrive without
  // any message alongside them — a rep who only rang a buyer produces no
  // messages at all — so gating on s.pending alone would have made WhatsApp
  // calls invisible for exactly the reps who make the most of them.
  if (s.pending.length === 0 && s.pendingCalls.length === 0 && s.pendingReceipts.length === 0) return;
  if (!INGEST_URL || !INGEST_SECRET) {
    // Said once per flush rather than silently dropping: a watcher with nowhere
    // to report looks identical to a rep who sent nothing.
    log.warn({ id: s.id, queued: s.pending.length }, "no INGEST_URL/BAILEYS_INGEST_SECRET — cannot report");
    return;
  }
  const batch = s.pending.splice(0, MAX_BATCH);
  const calls = s.pendingCalls.splice(0, MAX_BATCH);
  const receipts = s.pendingReceipts.splice(0, MAX_BATCH);
  try {
    const r = await fetch(INGEST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${INGEST_SECRET}`,
      },
      body: JSON.stringify({
        salesperson_id: s.salespersonId,
        wa_number: s.state.number,
        messages: batch,
        // Sent whether or not the CRM understands them yet. An older ingest
        // reads `messages` and ignores the rest, which is the ordering this
        // deployment needs: the worker is the side that takes a manual upload,
        // so it ships AHEAD of the CRM and waits to be caught up with.
        calls,
        receipts,
        // So the dashboard can tell which worker build is live without anyone
        // guessing from behaviour.
        worker_version: WORKER_VERSION,
      }),
    });
    if (!r.ok) throw new Error(`ingest ${r.status}`);
    const out = await r.json().catch(() => ({}));
    log.info({
      id: s.id, stored: out.stored, skipped: out.skipped,
      calls: calls.length, receipts: receipts.length, queued: s.pending.length,
    }, "observed batch sent");
    // A backlog drains at its own pace, not the idle heartbeat's. At one batch
    // per FLUSH_MS a history sync would take half an hour to land, and the
    // admin watching the lead page would conclude it had not worked.
    if (s.pending.length > 0) {
      s.flushTimer = setTimeout(() => flushObserved(s), 500);
      return;
    }
  } catch (e) {
    // Put them back at the front; the CRM de-duplicates on WhatsApp's own id,
    // so a replay after a blip cannot double-count a rep's day.
    s.pending.unshift(...batch);
    s.pendingCalls.unshift(...calls);
    s.pendingReceipts.unshift(...receipts);
    log.warn({ id: s.id, err: String(e?.message || e), queued: s.pending.length }, "ingest failed, will retry");
  }
  if ((s.pending.length > 0 || s.pendingCalls.length > 0 || s.pendingReceipts.length > 0) && !s.flushTimer) {
    s.flushTimer = setTimeout(() => flushObserved(s), FLUSH_MS);
  }
}

/** WhatsApp wants 91xxxxxxxxxx@s.whatsapp.net; the CRM stores 91xxxxxxxxxx. */
function toJid(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return `${digits}@s.whatsapp.net`;
}

function send(res, code, obj) {
  const payload = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      // A sender endpoint has no reason to accept a megabyte.
      if (raw.length > 200_000) req.destroy();
    });
    req.on("end", () => {
      try { resolve(JSON.parse(raw || "{}")); } catch { resolve({}); }
    });
  });
}

function statusOf(s) {
  return {
    ok: true,
    session: s.id,
    role: s.observeOnly ? "observe" : "notify",
    status: s.state.status,
    number: s.state.number,
    last_seen: s.state.lastSeen,
    queued: s.pending.length,
    queued_calls: s.pendingCalls.length,
    queued_receipts: s.pendingReceipts.length,
    worker_version: WORKER_VERSION,
    error: s.state.lastError,
  };
}

/** A QR page a rep can actually use, instead of raw JSON on a phone screen. */
function qrPage(s) {
  const body = s.state.qrDataUrl
    ? `<img src="${s.state.qrDataUrl}" width="320" height="320" alt="WhatsApp QR" />
       <p>WhatsApp → Settings → Linked devices → Link a device</p>`
    : s.state.status === "connected"
      ? `<p class="ok">Connected${s.state.number ? ` as ${s.state.number}` : ""}.</p>
         <p>Nothing to scan. You can close this page.</p>`
      : `<p>Waiting for a QR…</p><p>${s.state.lastError ?? "Starting up."}</p>`;
  return `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connect WhatsApp</title>
<style>body{font-family:system-ui,sans-serif;text-align:center;padding:24px;color:#1c1c1e}
img{max-width:90vw;height:auto}.ok{color:#15803d;font-weight:600}</style>
<h3>Connect WhatsApp</h3>${body}
<script>setTimeout(()=>location.reload(),8000)</script>`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  // Unauthenticated, deliberately: a deploy platform needs something to poll to
  // know the container is alive, and it reveals nothing.
  // Unauthenticated on purpose, and the version belongs here rather than behind
  // the bearer: "which build is running?" is the first question of every
  // debugging session and it should not need a secret to answer.
  if (url.pathname === "/health") {
    return send(res, 200, { ok: true, sessions: sessions.size, worker_version: WORKER_VERSION });
  }

  const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "")
    // A rep opening the QR page on their phone cannot set a header, so the
    // bearer may arrive as a query parameter for that one read-only view. It is
    // the same secret either way; what it must never unlock is /send.
    || url.searchParams.get("k") || "";
  if (bearer !== SECRET) return send(res, 401, { ok: false, error: "unauthorized" });

  // /s/<salesperson_id>/<action> — one telecaller's watch-only session.
  const rep = url.pathname.match(/^\/s\/([0-9a-fA-F-]{8,})(\/[a-z]+)?$/);
  if (rep) {
    const salespersonId = rep[1];
    const action = (rep[2] || "/status").slice(1);

    // RESET IS THE ONLY WAY BACK TO A REAL QR, AND IT RUNS BEFORE getSession.
    //
    // /reconnect reuses the saved credentials, so once a rep has linked once it
    // never shows a QR again — and WhatsApp only pushes conversation history on
    // a FRESH link. That combination is why a rep could be "Connected" with an
    // empty lead page and no button anywhere would fix it: the control labelled
    // Re-scan could not re-scan.
    //
    // This closes the socket, deletes that rep's auth directory and forgets the
    // session, so the next request starts from nothing: new QR, new link, and a
    // history sync. Destructive by design — the rep must scan again — so the
    // dashboard asks first.
    //
    // Deliberately before getSession(): creating the session only to tear it
    // down would race the reconnect timer against the directory delete.
    if (action === "reset" && req.method === "POST") {
      const existing = sessions.get(salespersonId);
      if (existing) {
        clearTimeout(existing.reconnectTimer);
        clearTimeout(existing.flushTimer);
        // Anything it saw but never delivered dies with it; the CRM keeps what
        // it already stored, and the fresh link re-sends the history anyway.
        existing.pending.length = 0;
        existing.pendingCalls.length = 0;
        existing.pendingReceipts.length = 0;
        try { existing.sock?.end?.(); } catch { /* already gone */ }
        sessions.delete(salespersonId);
      }
      const dir = path.join(AUTH_DIR, `rep-${salespersonId}`);
      try {
        await fs.rm(dir, { recursive: true, force: true });
      } catch (e) {
        log.error({ id: salespersonId, err: String(e?.message || e) }, "could not clear auth dir");
        return send(res, 500, { ok: false, error: "could not clear the saved login" });
      }
      log.info({ id: salespersonId }, "session reset — next request will offer a fresh QR");
      // Start it again so a QR is already being generated by the time the
      // dashboard asks for one.
      getSession(salespersonId, salespersonId);
      return send(res, 200, { ok: true, status: "connecting" });
    }

    const s = getSession(salespersonId, salespersonId);

    if (action === "status") return send(res, 200, statusOf(s));
    if (action === "qr") {
      // HTML by default so the rep can just open the link; JSON on request for
      // the dashboard.
      if (url.searchParams.get("format") === "json") {
        return send(res, 200, { ok: true, status: s.state.status, qr: s.state.qrDataUrl });
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(qrPage(s));
    }
    if (action === "reconnect" && req.method === "POST") {
      start(s).catch((e) => log.error(e));
      return send(res, 200, { ok: true, status: "connecting" });
    }
    if (action === "send") {
      // The whole safety property of a telecaller session, refused at the door
      // rather than left to whoever wires up the CRM next.
      return send(res, 403, {
        ok: false,
        error: "This session is watch-only. A telecaller's number sends by hand, from their own WhatsApp.",
      });
    }
    return send(res, 404, { ok: false, error: "not found" });
  }

  // Every session at a glance, for the dashboard and for debugging.
  if (url.pathname === "/sessions") {
    return send(res, 200, { ok: true, sessions: [...sessions.values()].map(statusOf) });
  }

  // ── legacy routes: the FOUNDER's session, unchanged ───────────────────────
  const f = getSession(FOUNDER, null);

  if (url.pathname === "/status") return send(res, 200, statusOf(f));

  // The QR is only meaningful while WhatsApp is actually offering one; it
  // expires in seconds and Baileys hands us a fresh one automatically.
  if (url.pathname === "/qr") {
    return send(res, 200, { ok: true, status: f.state.status, qr: f.state.qrDataUrl });
  }

  if (url.pathname === "/reconnect" && req.method === "POST") {
    start(f).catch((e) => log.error(e));
    return send(res, 200, { ok: true, status: "connecting" });
  }

  if (url.pathname === "/send" && req.method === "POST") {
    const body = await readBody(req);
    const to = body?.to;
    const text = body?.text;
    if (!to || !text) return send(res, 400, { ok: false, error: "to and text required" });
    // Told plainly rather than swallowed, so the CRM can queue it and retry
    // instead of recording a success nobody can vouch for.
    if (f.state.status !== "connected") {
      return send(res, 503, { ok: false, error: f.state.lastError || "WhatsApp is not connected. Scan the QR on the WhatsApp page." });
    }
    try {
      const r = await f.sock.sendMessage(toJid(to), { text: String(text) });
      f.state.lastSeen = new Date().toISOString();
      return send(res, 200, { ok: true, id: r?.key?.id ?? null });
    } catch (e) {
      log.error(e, "send failed");
      return send(res, 502, { ok: false, error: String(e?.message || e) });
    }
  }

  send(res, 404, { ok: false, error: "not found" });
});

server.listen(PORT, () => log.info({ port: PORT }, "baileys worker listening"));

// The founder's session starts with the process, the way it always has. Rep
// sessions start the first time their route is touched, so adding a telecaller
// in the dashboard and opening their QR link is the whole setup.
getSession(FOUNDER, null);
