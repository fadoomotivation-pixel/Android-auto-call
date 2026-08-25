// The Baileys worker: one logged-in WhatsApp account, held open, that Call Pro
// AI can hand a founder's daily report to.
//
// WHY THIS IS A SEPARATE PROCESS AND NOT AN EDGE FUNCTION
//
// Baileys is the WhatsApp Web protocol. It keeps a live WebSocket to WhatsApp's
// servers, a Signal session, and rolling encryption keys — all of it in memory,
// all of it only valid while the connection stays up. Supabase edge functions
// are Deno and die at the end of each request; Vercel is serverless. Neither can
// hold a socket open between two calls, so neither can run this. That is not a
// preference about hosting, it is what the protocol requires. Anything that can
// run a container for months — Railway, Render, Fly, a $5 VPS — is enough.
//
// WHAT THIS IS FOR, AND WHAT IT MUST NEVER BE USED FOR
//
// FOR: the founder's own daily pulse, going to the founder's own phone. One
// internal number, one recipient, one message a day.
//
// NEVER: anything touching a customer. Baileys is an unofficial client. It logs
// in as a real WhatsApp account with no business agreement behind it, WhatsApp's
// terms do not allow it, and accounts do get banned — sometimes for volume,
// sometimes for a report from someone who did not want the message. Losing an
// internal reporting number is an annoyance. Losing the number leads reply to is
// losing the business. The CRM's customer-facing senders deliberately do not
// read the provider setting for exactly this reason.
//
// SECURITY
//
// Every route requires the shared bearer. Without it this endpoint is a public
// "send WhatsApp as this company" button — the sort of thing that gets a number
// banned by someone else's script within a day of being indexed.
import http from "node:http";
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
// lost on every deploy and the founder is asked to rescan a QR each time, which
// is how this feature quietly stops being used.
const AUTH_DIR = process.env.AUTH_DIR || "./auth";

// ── OBSERVER MODE ────────────────────────────────────────────────────────────
//
// Set OBSERVE_SALESPERSON_ID and this process stops being a sender and becomes
// a linked device that watches one telecaller's WhatsApp and reports what it
// saw to the CRM. /send is refused outright in this mode — see the route.
//
// Why observing is the lower-risk half of Baileys: what gets a number banned
// fastest is a SENDING pattern — identical messages, bursts, a number that
// talks to strangers all day. A linked device watching conversations a human is
// already having by hand looks like a second phone, because that is what it is.
// Nothing here ever initiates a message.
//
// The CRM drops anything whose other party is not a lead in this rep's own
// company, so a rep's family and friends never reach the database. That filter
// lives server-side on purpose: it must not be something a worker can be
// reconfigured to skip.
const OBSERVE_SALESPERSON_ID = process.env.OBSERVE_SALESPERSON_ID || "";
const OBSERVING = OBSERVE_SALESPERSON_ID.length > 0;
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

if (OBSERVING && (!INGEST_URL || !INGEST_SECRET)) {
  console.error("OBSERVE_SALESPERSON_ID is set but INGEST_URL / BAILEYS_INGEST_SECRET are not. Refusing to start — a watcher with nowhere to report is a WhatsApp session opened for nothing.");
  process.exit(1);
}

const log = pino({ level: process.env.LOG_LEVEL || "info" });

/** Everything the CRM is allowed to ask about this connection. */
const state = {
  status: "disconnected", // disconnected | connecting | qr | connected
  number: null,
  qrDataUrl: null,
  lastSeen: null,
  lastError: null,
};

let sock = null;
let reconnectTimer = null;
// Backoff, because a logged-out session reconnecting in a tight loop is exactly
// the pattern WhatsApp bans a number for.
let backoffMs = 2_000;
const MAX_BACKOFF_MS = 5 * 60_000;

async function start() {
  clearTimeout(reconnectTimer);
  state.status = "connecting";
  state.lastError = null;

  const { state: auth, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth,
    // We are a sender, not a client. Marking ourselves online would make the
    // founder's phone stop showing notifications for these messages, because
    // WhatsApp thinks the account is already reading them somewhere.
    markOnlineOnConnect: false,
    logger: pino({ level: "silent" }),
    browser: ["Call Pro AI", "Chrome", "1.0.0"],
  });

  sock.ev.on("creds.update", saveCreds);

  // OBSERVER: every message this account sends or receives, batched and handed
  // to the CRM, which throws away everything that is not a lead of this rep's.
  if (OBSERVING) {
    sock.ev.on("messages.upsert", (ev) => {
      // "notify" is live traffic. "append" is history replay on reconnect, and
      // taking it would re-post a rep's whole backlog every restart.
      if (ev?.type !== "notify") return;
      for (const m of ev.messages ?? []) queueObserved(m);
    });
  }

  sock.ev.on("connection.update", async (u) => {
    const { connection, lastDisconnect, qr } = u;

    if (qr) {
      // Rendered here rather than in the browser so the raw pairing string —
      // which is enough to hijack the session — never leaves this box in a form
      // anything else can replay.
      state.qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
      state.status = "qr";
      log.info("QR ready — scan it from the founder's WhatsApp");
    }

    if (connection === "open") {
      state.status = "connected";
      state.qrDataUrl = null;
      state.lastSeen = new Date().toISOString();
      state.lastError = null;
      backoffMs = 2_000;
      state.number = sock?.user?.id ? String(sock.user.id).split(":")[0] : null;
      log.info({ number: state.number }, "connected");
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      state.status = "disconnected";
      state.lastError = loggedOut
        ? "WhatsApp logged this session out. Scan the QR again."
        : `Connection closed (${code ?? "unknown"}). Retrying.`;
      log.warn({ code, loggedOut }, "connection closed");

      if (loggedOut) {
        // Reconnecting with dead credentials just fails forever and looks like
        // a flapping service. Wait for a human to scan.
        state.qrDataUrl = null;
        return;
      }
      reconnectTimer = setTimeout(start, backoffMs);
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
    }
  });
}

// ── observer plumbing ────────────────────────────────────────────────────────

const pending = [];
let flushTimer = null;

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
 * The CRM decides what counts as project details, and it needs the kind to do
 * it: a PDF, a photo and a video are details; a voice note is not. Reporting
 * one boolean is what let a rep's forty morning voice notes read as forty
 * shared brochures.
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

function queueObserved(msg) {
  const jid = msg?.key?.remoteJid ?? "";
  // Groups, broadcasts and status updates are not one-to-one lead work.
  if (!jid.endsWith("@s.whatsapp.net")) return;
  const id = msg?.key?.id;
  if (!id) return;

  pending.push({
    id,
    peer: jid.split("@")[0],
    direction: msg?.key?.fromMe ? "out" : "in",
    text: String(textOf(msg) || "").slice(0, 300),
    media_kind: mediaKindOf(msg),
    sent_at: new Date(Number(msg?.messageTimestamp ?? Date.now() / 1000) * 1000).toISOString(),
  });

  // Drop the oldest rather than grow without bound if the CRM is unreachable.
  while (pending.length > MAX_BATCH * 5) pending.shift();
  if (!flushTimer) flushTimer = setTimeout(flushObserved, FLUSH_MS);
}

async function flushObserved() {
  flushTimer = null;
  if (pending.length === 0) return;
  const batch = pending.splice(0, MAX_BATCH);
  try {
    const r = await fetch(INGEST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${INGEST_SECRET}`,
      },
      body: JSON.stringify({
        salesperson_id: OBSERVE_SALESPERSON_ID,
        wa_number: state.number,
        messages: batch,
      }),
    });
    if (!r.ok) throw new Error(`ingest ${r.status}`);
    const out = await r.json().catch(() => ({}));
    log.info({ stored: out.stored, skipped: out.skipped }, "observed batch sent");
  } catch (e) {
    // Put them back at the front; the CRM de-duplicates on WhatsApp's own id,
    // so a replay after a blip cannot double-count a rep's day.
    pending.unshift(...batch);
    log.warn({ err: String(e?.message || e), queued: pending.length }, "ingest failed, will retry");
  }
  if (pending.length > 0 && !flushTimer) flushTimer = setTimeout(flushObserved, FLUSH_MS);
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  // Unauthenticated, deliberately: a deploy platform needs something to poll to
  // know the container is alive, and it reveals nothing.
  if (url.pathname === "/health") return send(res, 200, { ok: true });

  const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (bearer !== SECRET) return send(res, 401, { ok: false, error: "unauthorized" });

  if (url.pathname === "/status") {
    return send(res, 200, {
      ok: true,
      status: state.status,
      mode: OBSERVING ? "observe" : "notify",
      number: state.number,
      last_seen: state.lastSeen,
      queued: pending.length,
      error: state.lastError,
    });
  }

  // The QR is only meaningful while WhatsApp is actually offering one; it
  // expires in seconds and Baileys hands us a fresh one automatically.
  if (url.pathname === "/qr") {
    return send(res, 200, { ok: true, status: state.status, qr: state.qrDataUrl });
  }

  if (url.pathname === "/reconnect" && req.method === "POST") {
    start().catch((e) => log.error(e));
    return send(res, 200, { ok: true, status: "connecting" });
  }

  if (url.pathname === "/send" && req.method === "POST") {
    // A rep's number never sends from here. This is the whole safety property
    // of observer mode, so it is refused at the door rather than left to
    // whoever wires up the CRM next.
    if (OBSERVING) {
      return send(res, 403, {
        ok: false,
        error: "This session is observe-only. A telecaller's number sends by hand, from their own WhatsApp.",
      });
    }
    const body = await readBody(req);
    const to = body?.to;
    const text = body?.text;
    if (!to || !text) return send(res, 400, { ok: false, error: "to and text required" });
    // Told plainly rather than swallowed, so the CRM can queue it and retry
    // instead of recording a success nobody can vouch for.
    if (state.status !== "connected") {
      return send(res, 503, { ok: false, error: state.lastError || "WhatsApp is not connected. Scan the QR on the WhatsApp page." });
    }
    try {
      const r = await sock.sendMessage(toJid(to), { text: String(text) });
      state.lastSeen = new Date().toISOString();
      return send(res, 200, { ok: true, id: r?.key?.id ?? null });
    } catch (e) {
      log.error(e, "send failed");
      return send(res, 502, { ok: false, error: String(e?.message || e) });
    }
  }

  send(res, 404, { ok: false, error: "not found" });
});

server.listen(PORT, () => log.info({ port: PORT }, "baileys worker listening"));
start().catch((e) => {
  state.lastError = String(e?.message || e);
  log.error(e, "initial connect failed");
});
