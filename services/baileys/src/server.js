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
    // Backoff, because a logged-out session reconnecting in a tight loop is
    // exactly the pattern WhatsApp bans a number for.
    backoffMs: 2_000,
    pending: [],
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
  clearTimeout(s.reconnectTimer);
  s.state.status = "connecting";
  s.state.lastError = null;

  const { state: auth, saveCreds } = await useMultiFileAuthState(s.authDir);
  const { version } = await fetchLatestBaileysVersion();

  s.sock = makeWASocket({
    version,
    auth,
    // We are a sender or a watcher, never a reader. Marking ourselves online
    // would make the phone stop showing notifications for these messages,
    // because WhatsApp would think the account is already reading them here.
    markOnlineOnConnect: false,
    logger: pino({ level: "silent" }),
    browser: ["Call Pro AI", "Chrome", "1.0.0"],
  });

  s.sock.ev.on("creds.update", saveCreds);

  // WATCH-ONLY SESSIONS REPORT WHAT THEY SAW. The founder's session does not:
  // it exists to send one message a day and has no business recording anything.
  if (s.observeOnly) {
    s.sock.ev.on("messages.upsert", (ev) => {
      // "notify" is live traffic. "append" is history replay on reconnect, and
      // taking it would re-post a rep's whole backlog on every restart.
      if (ev?.type !== "notify") return;
      for (const m of ev.messages ?? []) queueObserved(s, m);
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
      s.state.status = "disconnected";
      s.state.lastError = loggedOut
        ? "WhatsApp logged this session out. Scan the QR again."
        : `Connection closed (${code ?? "unknown"}). Retrying.`;
      log.warn({ id: s.id, code, loggedOut }, "connection closed");

      if (loggedOut) {
        // Reconnecting with dead credentials just fails forever and looks like
        // a flapping service. Wait for a human to scan.
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

function queueObserved(s, msg) {
  const jid = msg?.key?.remoteJid ?? "";
  // Groups, broadcasts and status updates are not one-to-one lead work.
  if (!jid.endsWith("@s.whatsapp.net")) return;
  const id = msg?.key?.id;
  if (!id) return;

  s.pending.push({
    id,
    peer: jid.split("@")[0],
    direction: msg?.key?.fromMe ? "out" : "in",
    text: String(textOf(msg) || "").slice(0, 300),
    media_kind: mediaKindOf(msg),
    sent_at: new Date(Number(msg?.messageTimestamp ?? Date.now() / 1000) * 1000).toISOString(),
  });

  // Drop the oldest rather than grow without bound if the CRM is unreachable.
  while (s.pending.length > MAX_BATCH * 5) s.pending.shift();
  if (!s.flushTimer) s.flushTimer = setTimeout(() => flushObserved(s), FLUSH_MS);
}

async function flushObserved(s) {
  s.flushTimer = null;
  if (s.pending.length === 0) return;
  if (!INGEST_URL || !INGEST_SECRET) {
    // Said once per flush rather than silently dropping: a watcher with nowhere
    // to report looks identical to a rep who sent nothing.
    log.warn({ id: s.id, queued: s.pending.length }, "no INGEST_URL/BAILEYS_INGEST_SECRET — cannot report");
    return;
  }
  const batch = s.pending.splice(0, MAX_BATCH);
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
      }),
    });
    if (!r.ok) throw new Error(`ingest ${r.status}`);
    const out = await r.json().catch(() => ({}));
    log.info({ id: s.id, stored: out.stored, skipped: out.skipped }, "observed batch sent");
  } catch (e) {
    // Put them back at the front; the CRM de-duplicates on WhatsApp's own id,
    // so a replay after a blip cannot double-count a rep's day.
    s.pending.unshift(...batch);
    log.warn({ id: s.id, err: String(e?.message || e), queued: s.pending.length }, "ingest failed, will retry");
  }
  if (s.pending.length > 0 && !s.flushTimer) s.flushTimer = setTimeout(() => flushObserved(s), FLUSH_MS);
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
  if (url.pathname === "/health") return send(res, 200, { ok: true, sessions: sessions.size });

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
