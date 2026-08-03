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
import { rm } from "node:fs/promises";
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

if (!SECRET) {
  console.error("BAILEYS_SECRET is not set. Refusing to start — an open send endpoint gets the number banned.");
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
// Has this install ever completed a pairing? The answer changes what a
// "logged out" close MEANS, and getting that wrong is what stranded the first
// deploy — see the connection.close handler.
let paired = false;

/**
 * Throw the stored session away.
 *
 * Only ever called when there is nothing worth keeping: a pairing that never
 * completed, or an explicit reset from the admin page. Baileys will not offer a
 * new QR while half-written credentials are on disk, so the files have to go
 * before a fresh pairing can start.
 */
async function wipeAuth() {
  await rm(AUTH_DIR, { recursive: true, force: true }).catch(() => {});
  paired = false;
  state.number = null;
  log.warn("cleared stored session");
}

async function start({ reset = false } = {}) {
  clearTimeout(reconnectTimer);
  if (reset) await wipeAuth();
  state.status = "connecting";
  state.lastError = null;

  const { state: auth, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  paired = !!auth?.creds?.registered;
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth,
    // We are a sender, not a client. Marking ourselves online would make the
    // founder's phone stop showing notifications for these messages, because
    // WhatsApp thinks the account is already reading them somewhere.
    markOnlineOnConnect: false,
    // The default is 60s split across several QRs, which in practice means a
    // code has already died by the time someone has unlocked their phone and
    // found Linked devices. A full minute PER code makes it scannable at human
    // speed.
    qrTimeout: 60_000,
    logger: pino({ level: "silent" }),
    browser: ["Call Pro AI", "Chrome", "1.0.0"],
  });

  sock.ev.on("creds.update", saveCreds);

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
      paired = true;
      state.number = sock?.user?.id ? String(sock.user.id).split(":")[0] : null;
      log.info({ number: state.number }, "connected");
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      log.warn({ code, loggedOut, paired }, "connection closed");
      state.status = "disconnected";

      if (loggedOut) {
        // "Logged out" means two completely different things, and treating them
        // as one stranded the first deploy.
        //
        // If this install had PAIRED, a real session was ended from the phone
        // (Linked devices → log out) or by WhatsApp. Reconnecting with dead
        // credentials fails forever, looks like a flapping service, and is the
        // pattern that gets a number banned. Stop, and wait for a human.
        //
        // If it had NEVER paired, nothing was logged out at all: the QR simply
        // expired unscanned, and WhatsApp reports that with the same code. The
        // old code stopped here and cleared the QR, so the page showed "Scan the
        // QR again" while offering no QR to scan and no way to get one back.
        // Nothing was wrong except that the human was slower than the code.
        if (!paired) {
          state.lastError = "The QR expired before it was scanned. Making a new one…";
          await wipeAuth();
          reconnectTimer = setTimeout(() => start(), 1_000);
          return;
        }
        state.lastError = "WhatsApp logged this session out. Press Reconnect to scan a new QR.";
        state.qrDataUrl = null;
        return;
      }

      state.lastError = `Connection closed (${code ?? "unknown"}). Retrying.`;
      reconnectTimer = setTimeout(() => start(), backoffMs);
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
    }
  });
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
      number: state.number,
      last_seen: state.lastSeen,
      error: state.lastError,
    });
  }

  // The QR is only meaningful while WhatsApp is actually offering one; it
  // expires in seconds and Baileys hands us a fresh one automatically.
  if (url.pathname === "/qr") {
    return send(res, 200, { ok: true, status: state.status, qr: state.qrDataUrl });
  }

  // "Reconnect" has to mean "get me connected", because that is what the person
  // pressing it wants. So it resets when there is nothing to preserve — no
  // completed pairing — and reconnects normally when there IS a real session,
  // where wiping would cost a QR scan for no reason.
  //
  // ?reset=1 forces the wipe, for the case where a session exists but is wedged
  // and the admin has decided to re-pair.
  if (url.pathname === "/reconnect" && req.method === "POST") {
    const force = url.searchParams.get("reset") === "1";
    start({ reset: force || !paired }).catch((e) => log.error(e));
    return send(res, 200, { ok: true, status: "connecting", reset: force || !paired });
  }

  if (url.pathname === "/send" && req.method === "POST") {
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
