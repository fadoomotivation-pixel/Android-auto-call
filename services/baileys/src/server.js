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
// The generation pointer is read while building a session, which is not an
// async context — one tiny synchronous read beats making session creation
// await, and it happens once per rep per process.
import fsSync from "node:fs";
// For the home directory, which is the one writable path on a shared host that
// a deployment does not replace.
import os from "node:os";
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
} from "@whiskeysockets/baileys";
import pino from "pino";
import QRCode from "qrcode";

/**
 * WHERE THE WHATSAPP LOGIN LIVES — AND WHY THE DEFAULT HAD TO CHANGE.
 *
 * The default used to be "./auth", relative to the app. On Hostinger that
 * resolves to something like
 *
 *     .../hostingersite.com/hbuilds/versions/01a089d9-de3b-7309-8.../auth
 *
 * — a folder created fresh FOR EACH DEPLOYMENT. So the login was not merely
 * "inside the app folder" and at risk; it was in a directory guaranteed to be
 * new on every single upload. Every deploy therefore logged the rep out, the
 * worker came back up printing "QR ready", and someone went and asked Ankita
 * to scan again. That happened five times over this one bug, and each time we
 * treated the fresh QR as a symptom of whatever we were debugging rather than
 * of the deploy itself.
 *
 * There was a startup warning about it for weeks. A warning that has to be
 * read in a hosting panel and acted on by hand is not a fix — it is a note
 * describing the bug. The default is now a path that survives deploys, so the
 * correct behaviour needs no configuration at all.
 *
 * The home directory is the one place on a shared host that is both writable
 * and outside the versioned build tree. An explicit AUTH_DIR still wins, so
 * anyone who already set one is unaffected.
 */
function resolveAuthDir() {
  const explicit = (process.env.AUTH_DIR || "").trim();
  if (explicit) return explicit;
  try {
    const home = os.homedir();
    if (home && home !== "/") {
      const dir = path.join(home, ".callpro-wa-auth");
      fsSync.mkdirSync(dir, { recursive: true });
      return dir;
    }
  } catch {
    // Unwritable or unusual home; fall through to the old behaviour, which at
    // least works until the next deploy and warns loudly below.
  }
  return "./auth";
}

/**
 * Carry an existing login across to the persistent location, once.
 *
 * Changing where credentials live would otherwise log everyone out on the very
 * deploy that fixes logging everyone out. If the old folder still holds a
 * session and the new one is empty, it moves across and nobody scans anything.
 * Baileys' multi-file auth state writes flat files, so a flat copy is complete.
 */
function migrateLegacyAuth(target) {
  const legacy = path.resolve("./auth");
  if (path.resolve(target) === legacy) return;
  try {
    if (!fsSync.existsSync(legacy)) return;
    fsSync.mkdirSync(target, { recursive: true });
    const moved = copyInto(legacy, target);
    if (moved) {
      console.log(`carried ${moved} saved-login files from ./auth to ${target} — no re-scan needed`);
    }
  } catch (e) {
    console.warn(`could not carry the old login across: ${String(e?.message || e)}`);
  }
}

/**
 * Copy a login tree across, never overwriting a newer one.
 *
 * RECURSIVE, AND THAT IS THE WHOLE POINT.
 *
 * The first version of this skipped anything that was not a plain file. The
 * founder's own session keeps its credentials as loose files directly in the
 * auth folder, so it migrated and looked like proof the move worked — while
 * every TELECALLER, whose login lives in a `rep-<id>/` subfolder, was silently
 * left behind. The one deploy that existed to stop reps being logged out would
 * have logged out exactly the reps it was written for, and the only symptom
 * would have been another QR.
 *
 * Skips any file already present at the destination, so a session that has
 * been running and writing fresh keys is never clobbered by a stale copy.
 */
function copyInto(from, to) {
  let n = 0;
  for (const entry of fsSync.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) {
      fsSync.mkdirSync(dst, { recursive: true });
      n += copyInto(src, dst);
    } else if (entry.isFile() && !fsSync.existsSync(dst)) {
      fsSync.copyFileSync(src, dst);
      n += 1;
    }
  }
  return n;
}

const PORT = Number(process.env.PORT || 8080);
const SECRET = process.env.BAILEYS_SECRET || "";
// Must point at a PERSISTENT volume. On an ephemeral filesystem the session is
// lost on every deploy and everyone is asked to rescan a QR each time, which is
// how this feature quietly stops being used.
const AUTH_DIR = resolveAuthDir();

// Where observed messages go. Only telecaller sessions ever post; the founder's
// session has no observer attached.
const INGEST_URL = process.env.INGEST_URL || "";
const INGEST_SECRET = process.env.BAILEYS_INGEST_SECRET || "";
// Batched, not per-message: a rep in a busy conversation would otherwise fire a
// request per keystroke-sized message.
const FLUSH_MS = Number(process.env.FLUSH_MS || 15_000);
const MAX_BATCH = 200;
// A batch that carries downloaded files is capped far lower: 200 voice notes
// in one POST is tens of megabytes and an edge function that times out
// halfway through a history import.
const MAX_MEDIA_BATCH = Number(process.env.MAX_MEDIA_BATCH || 10);
// How many attachments may wait to be downloaded. A year of a busy rep's
// photos fits; the cap only exists so a pathological account cannot
// exhaust memory holding message objects it will never get through.
const MAX_MEDIA_QUEUE = Number(process.env.MAX_MEDIA_QUEUE || 25_000);
const MAX_MEDIA_IN_FLIGHT = Number(process.env.MAX_MEDIA_IN_FLIGHT || 3);
// Room for a history sync, which arrives as one burst rather than a trickle.
// A year of a working telecaller's lead conversations fits comfortably; the
// non-lead ones are dropped by the CRM, not here, so this holds the raw feed.
const MAX_PENDING = Number(process.env.MAX_PENDING || 20_000);

// ── What this worker is allowed to capture ───────────────────────────────────
//
// EVERY ONE OF THESE IS A SWITCH, AND THAT IS DELIBERATE.
//
// This worker is uploaded by hand to Hostinger, so "turn that off again" would
// otherwise mean building a new zip, re-uploading, and re-linking a rep — the
// exact loop that has cost this feature days already. A capability that
// misbehaves in front of a real telecaller's WhatsApp needs to be switchable in
// the time it takes to edit an environment variable and restart.
//
// The defaults are chosen so the box does the least surprising thing: capture
// what a lead conversation is actually made of (voice notes, photos, documents)
// and watch for messages being taken back, but do not reach out to WhatsApp for
// anything extra unless asked.
const flag = (name, dflt) => {
  const v = process.env[name];
  if (v === undefined || v === "") return dflt;
  return /^(1|true|yes|on)$/i.test(v);
};

/** Download voice notes, images and documents rather than just naming them. */
const CAPTURE_MEDIA = flag("CAPTURE_MEDIA", true);
/** Bytes. A voice note is ~200KB and a brochure a few MB; past this the file is
 *  named but not fetched, so one 90MB video cannot stall a history sync. */
const MAX_MEDIA_BYTES = Number(process.env.MAX_MEDIA_BYTES || 8 * 1024 * 1024);
/** Notice "delete for everyone" and edits, and keep what the message said. */
const WATCH_EDITS = flag("WATCH_EDITS", true);
/** Learn WhatsApp's own display names, which is often the only clue who an
 *  unknown number belongs to. */
const SYNC_CONTACTS = flag("SYNC_CONTACTS", true);
/** Group chats. OFF: a broker group is dozens of people who never agreed to be
 *  recorded in someone's CRM, and the volume is large. */
// ON BY DEFAULT, BECAUSE THE GROUPS ARE THE JOB.
//
// This defaulted to false on the reasonable-sounding theory that a group is
// noise and a lead is a one-to-one chat. Ankita's actual WhatsApp says
// otherwise: "Employes updation group", "Payment claim" with a colleague
// posting a photo, site maps going out as PDFs to named deal groups — with 23
// unread across them. Every one of those was dropped at this line before it
// reached the CRM, which is a large part of why her recent work looked like an
// empty screen. A rep's day is not less visible because the buyer brought
// their brother into the chat.
const WATCH_GROUPS = flag("WATCH_GROUPS", true);
// Whether a watcher tells WhatsApp it is reachable. See makeWASocket below —
// this is the difference between receiving live messages and receiving none.
const MARK_ONLINE = flag("MARK_ONLINE", true);
/** Ask WhatsApp for online/typing state of leads. OFF: it is a per-chat
 *  subscription, it is chatty, and it is the least load-bearing of these. */
const WATCH_PRESENCE = flag("WATCH_PRESENCE", false);

/**
 * Bump this whenever src/server.js changes.
 *
 * This worker is uploaded by hand, so it is the one component that can silently
 * be a version behind everything else — and every hour lost on this feature so
 * far has been spent proving which build was actually running. /health, /status
 * and every ingest batch now carry it, so the answer is one request away
 * instead of a guess from behaviour.
 */
const WORKER_VERSION = "2026.09.17-26";

if (!SECRET) {
  console.error("BAILEYS_SECRET is not set. Refusing to start — an open send endpoint gets the number banned.");
  process.exit(1);
}

/**
 * THE REASON EVERY UPDATE COSTS A TELECALLER ANOTHER QR SCAN.
 *
 * Hostinger's "deployment from source files" REPLACES the application
 * directory. If AUTH_DIR sits inside it — and "./auth", the default, always
 * does — then every upload of a new build deletes the saved WhatsApp login
 * along with the old code. The worker comes back up healthy, logs "QR ready",
 * and someone has to go and ask a rep to scan again for what was supposed to be
 * an invisible bug fix. That has now happened on every single deploy.
 *
 * The fix is one environment variable pointing somewhere the deploy does not
 * touch. This cannot enforce it — the worker has no idea what the platform
 * will overwrite — so it says so loudly at startup, every time, until it is set.
 */
{
  const resolved = path.resolve(AUTH_DIR);
  migrateLegacyAuth(resolved);
  const insideApp = resolved.startsWith(path.resolve(process.cwd()) + path.sep);
  if (insideApp) {
    // Only reachable now if someone set AUTH_DIR to an in-app path on purpose,
    // or the home directory could not be written to. Still worth shouting
    // about, because the consequence is a rep re-scanning after every upload.
    console.warn(
      "\n" +
      "  ⚠  AUTH_DIR IS INSIDE THE APP FOLDER — the next deploy will wipe the login.\n" +
      `     Now:  ${resolved}\n` +
      "     Every upload replaces this folder, so every rep has to scan a new QR.\n" +
      "     Set AUTH_DIR to a path OUTSIDE the app directory (persistent storage),\n" +
      "     then restart ONCE and scan. After that, updates keep the session.\n",
    );
  } else {
    console.log(`auth stored at ${resolved} — outside the app folder, so deploys keep the login`);
  }
}

const log = pino({ level: process.env.LOG_LEVEL || "info" });

/** The founder's session. Kept under this name so the legacy routes read clearly. */
const FOUNDER = "founder";

/** id -> session. Created on demand, never destroyed while the process lives. */
const sessions = new Map();

/**
 * WHY A REP'S LOGIN LIVES IN A NUMBERED FOLDER.
 *
 * Re-scan used to delete `rep-<id>/` and start again. It looked right and it did
 * not work, for a reason that only shows up under a race:
 *
 *   1. reset ends the old socket but leaves its listeners attached
 *   2. the socket's close handler schedules its own reconnect, on a session
 *      object we already dropped from the map — an orphan nobody can see
 *   3. the directory is deleted
 *   4. two seconds later the orphan reconnects, and Baileys' multi-file auth
 *      state writes the credentials it still holds in memory straight back to
 *      the path we just cleared
 *   5. the new session then LOADS those resurrected credentials, resumes the
 *      old link instead of pairing, and reports "connected"
 *
 * The rep never scanned anything. The dashboard said Connected, no QR was ever
 * offered, and no history arrived — which is exactly what re-scanning Ankita's
 * number did, every time, while we blamed the QR poller.
 *
 * Deleting faster cannot win that race; there is always a write that lands
 * after the last delete. So a reset does not reuse the path at all. Generation 1
 * is the plain `rep-<id>` folder every existing login already sits in, and each
 * reset moves to `rep-<id>__g2`, `__g3` and so on. A resurrected orphan writes
 * into the folder it was born in, which nothing reads again — the race still
 * happens and no longer matters.
 */
function repAuthDir(salespersonId, gen) {
  const base = path.join(AUTH_DIR, `rep-${salespersonId}`);
  return gen > 1 ? `${base}__g${gen}` : base;
}
const genFile = (salespersonId) => path.join(AUTH_DIR, `rep-${salespersonId}.gen`);

/** Which generation this rep is on. Survives a restart; defaults to the original folder. */
function readGen(salespersonId) {
  try {
    const n = parseInt(fsSync.readFileSync(genFile(salespersonId), "utf8").trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  } catch {
    return 1;
  }
}

function writeGen(salespersonId, gen) {
  try {
    fsSync.mkdirSync(AUTH_DIR, { recursive: true });
    fsSync.writeFileSync(genFile(salespersonId), String(gen));
  } catch (e) {
    // Not fatal: the running process keeps the generation in the session. A
    // restart would fall back to an older folder, which shows a QR rather than
    // silently resuming — the safe direction to fail in.
    log.error({ id: salespersonId, err: String(e?.message || e) }, "could not record the login generation");
  }
}

/**
 * Delete the credential folders a rep has moved on from.
 *
 * Housekeeping, deliberately separated from the reset itself and run after it:
 * a stale login left on disk costs a few kilobytes, whereas deleting a folder
 * something is still writing to is the race this whole scheme exists to avoid.
 * Waiting a few seconds first lets any dying socket finish and be wrong in a
 * place nothing reads.
 */
async function cleanOldAuthDirs(salespersonId, keepGen) {
  await new Promise((r) => setTimeout(r, 15_000));
  for (let g = 1; g < keepGen; g += 1) {
    try {
      await fs.rm(repAuthDir(salespersonId, g), { recursive: true, force: true });
    } catch (e) {
      log.warn({ id: salespersonId, gen: g, err: String(e?.message || e) },
        "could not remove an old login folder — harmless, it is no longer read");
    }
  }
}

/**
 * Take a session out of service permanently.
 *
 * Order matters and is the whole point: listeners come off BEFORE the socket is
 * ended, so the close event that end() causes cannot reach the handler that
 * schedules a reconnect. `dead` is the second line of defence for anything
 * already queued.
 */
function destroySession(s) {
  s.dead = true;
  clearTimeout(s.reconnectTimer);
  clearTimeout(s.flushTimer);
  clearInterval(s.heartbeatTimer);
  s.reconnectTimer = null;
  s.flushTimer = null;
  s.heartbeatTimer = null;
  s.pending.length = 0;
  s.pendingCalls.length = 0;
  s.pendingReceipts.length = 0;
  s.pendingEdits.length = 0;
  s.pendingContacts.length = 0;
  s.pendingPresence.length = 0;
  s.pendingMedia.length = 0;
  s.pendingLidMap.length = 0;
  s.mediaQueue.length = 0;
  // Not the LID map or the group names: those describe WhatsApp, not this
  // socket, and re-learning them costs another round of unresolved numbers.
  s.groupAsked.clear();
  if (s.sock) {
    try { s.sock.ev.removeAllListeners(); } catch { /* nothing attached */ }
    try { s.sock.end(); } catch { /* already gone */ }
    s.sock = null;
  }
}

function newSession(id, salespersonId) {
  return {
    id,
    // null for the founder. Present for a telecaller, and it is what the CRM
    // files the observed messages under.
    salespersonId: salespersonId ?? null,
    observeOnly: Boolean(salespersonId),
    // Which re-link this is. 1 is the original folder; every reset moves on by
    // one so a dying socket cannot write its old credentials back underneath us.
    // The dashboard reads it too: "connected" only counts as a successful scan
    // when it is the generation the admin just asked for.
    gen: salespersonId ? readGen(salespersonId) : 1,
    // Each login gets its own directory. Sharing one would have two accounts
    // overwriting each other's keys, which presents as both being logged out.
    authDir: salespersonId
      ? repAuthDir(salespersonId, readGen(salespersonId))
      : AUTH_DIR,
    sock: null,
    // Set once a session has been replaced. A dead session must never
    // reconnect: it is the orphan that resurrects deleted credentials.
    dead: false,
    reconnectTimer: null,
    // Says "still here" to the CRM on a timer, so a quiet rep is not mistaken
    // for a broken link.
    heartbeatTimer: null,
    // When WhatsApp last sent us anything at all. The watchdog reads it.
    lastEventAt: Date.now(),
    // QR churn. A session with no credentials regenerates one every twenty
    // seconds for as long as it is allowed to, which floods the host's log
    // until it is truncated — the founder's own sender has been doing exactly
    // that for weeks, unnoticed, because nothing was watching for it.
    qrCount: 0,
    lastQrRequestAt: 0,
    // "Link with phone number instead" — the eight characters the rep types
    // into WhatsApp rather than pointing a camera at a screen. See /paircode.
    pairingCode: null,
    pairingPhone: null,
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
    // Deletions and edits, keyed by WhatsApp's message id. Separate from
    // messages because they PATCH a row that is already stored rather than
    // adding one — mixing them would have the ingest inserting empty shells.
    pendingEdits: [],
    // WhatsApp display names for numbers, so an unknown number on the dashboard
    // has a human attached to it.
    pendingContacts: [],
    // LID → phone number, learned as WhatsApp reveals it. Held for the life of
    // the session so the second message from a contact resolves even when only
    // the first carried sender_pn.
    lidPn: new Map(),
    // The mappings not yet reported, so the CRM can re-key rows it stored
    // before the number was known.
    pendingLidMap: [],
    // Group subjects. Ten rows all reading "Group chat" is not a conversation
    // list, and the subject is the only thing that tells them apart.
    groupNames: new Map(),
    // Groups whose metadata we have already asked WhatsApp for. One query per
    // group per session — it is a network round trip, not a lookup.
    groupAsked: new Set(),
    // Addresses thrown away, by their suffix. The LID bug was invisible for a
    // fortnight because a dropped message left no trace anywhere; this is how
    // the next such mistake gets noticed in a day.
    dropped: new Map(),
    // Messages that arrived and could not be decrypted, per peer, and which
    // peers have already said so in the log. A poisoned Signal store fails
    // every message in a chat, so this counts fast and must not log fast.
    undecryptable: new Map(),
    undecryptableLogged: new Set(),
    // Online/typing states, when WATCH_PRESENCE is on.
    pendingPresence: [],
    // Attachments still to download, and the files already fetched and waiting
    // to be reported. Separate because one is work and the other is a result.
    mediaQueue: [],
    mediaWorkers: 0,
    mediaQueueWarned: false,
    pendingMedia: [],
    flushTimer: null,
    // Handshakes that died before WhatsApp ever offered a QR. A wrong protocol
    // version or an identity WhatsApp will not accept both look like this, and
    // both are invisible from the dashboard without counting them.
    handshakeFails: 0,
    // The client identity these credentials were paired with, if they already
    // exist. Read from disk so a worker restart keeps claiming the same thing —
    // WhatsApp registered the device under it, and coming back as something
    // else is not the device it linked.
    pinnedIdentity: salespersonId
      ? readPinnedIdentity(repAuthDir(salespersonId, readGen(salespersonId)))
      : null,
    // Whether this attempt got as far as a QR. Reset per attempt, because
    // "closed after showing a QR" (the rep was slow) and "closed instead of
    // showing one" (we were refused) need opposite responses.
    sawQr: false,
    state: {
      status: "disconnected", // disconnected | connecting | qr | connected
      number: null,
      qrDataUrl: null,
      lastSeen: null,
      lastError: null,
      // What we told WhatsApp we are, and where those answers came from. The
      // first questions worth asking when a handshake is refused.
      waVersion: null,
      waVersionSource: null,
      identity: null,
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

/**
 * WHICH WHATSAPP WEB VERSION WE CLAIM TO BE — AND WHY IT IS WORTH THIS MUCH CODE.
 *
 * WhatsApp refuses handshakes from protocol versions it has retired. When it
 * does, the stream is closed before any qr event is emitted, so the symptom is
 * "Connection closed (428)" on repeat and a QR that never appears. No amount of
 * re-scanning helps, because there is nothing to scan.
 *
 * The trap is that fetchLatestBaileysVersion() DOES NOT THROW when it cannot
 * reach GitHub. It catches its own error and hands back the version baked into
 * the installed Baileys, with `isLatest: false`. So a blocked outbound request
 * on the host looks exactly like a successful lookup, and the worker
 * confidently introduces itself with a version that may be a year stale. We
 * were treating that return value as authoritative.
 *
 * So: check `isLatest`, keep the last good answer on disk, and try a second
 * source before giving up — jsdelivr serves the same file from a different
 * network path, and shared hosts often block one and not the other. Whatever
 * happens, the source is recorded and shown on the dashboard, because "which
 * version did we actually claim" is the first question when a handshake fails
 * and it used to be unanswerable.
 */
const VERSION_CACHE = path.join(AUTH_DIR, "wa-version.json");
const VERSION_URL =
  "https://cdn.jsdelivr.net/gh/WhiskeySockets/Baileys@master/src/Defaults/baileys-version.json";
let waVersionMemo = null;

async function resolveWaVersion() {
  if (waVersionMemo) return waVersionMemo;

  // An explicit override always wins. This is the escape hatch when WhatsApp
  // moves and neither source is reachable from the host: set WA_VERSION to
  // something like 2.3000.1027000000 and restart, no redeploy needed.
  const forced = (process.env.WA_VERSION || "").trim();
  if (forced) {
    const parts = forced.split(".").map((n) => Number(n));
    if (parts.length === 3 && parts.every(Number.isFinite)) {
      waVersionMemo = { version: parts, source: `WA_VERSION env (${forced})` };
      log.info({ version: forced }, "using the WhatsApp version pinned in WA_VERSION");
      return waVersionMemo;
    }
    log.warn({ WA_VERSION: forced }, "WA_VERSION is not three numbers separated by dots — ignoring it");
  }

  // Baileys' own lookup first: when it works it is the right answer.
  try {
    const r = await Promise.race([
      fetchLatestBaileysVersion(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timed out")), 8_000)),
    ]);
    if (r?.isLatest && Array.isArray(r.version)) {
      await cacheWaVersion(r.version);
      waVersionMemo = { version: r.version, source: "fetched live" };
      return waVersionMemo;
    }
    log.warn({ err: String(r?.error ?? "no error given") },
      "the WhatsApp version lookup did not reach GitHub — it returned the version bundled with Baileys");
  } catch (e) {
    log.warn({ err: String(e?.message || e) }, "the WhatsApp version lookup failed outright");
  }

  // Second source, different network path.
  try {
    const res = await Promise.race([
      fetch(VERSION_URL),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timed out")), 8_000)),
    ]);
    if (res?.ok) {
      const j = await res.json();
      if (Array.isArray(j?.version) && j.version.length === 3) {
        await cacheWaVersion(j.version);
        waVersionMemo = { version: j.version, source: "fetched from the mirror" };
        return waVersionMemo;
      }
    }
  } catch (e) {
    log.warn({ err: String(e?.message || e) }, "the mirror lookup failed too");
  }

  // The last answer that did work, from a previous run. Better than the
  // bundled one by definition: it was current at some point on this box.
  try {
    const cached = JSON.parse(await fs.readFile(VERSION_CACHE, "utf8"));
    if (Array.isArray(cached?.version) && cached.version.length === 3) {
      waVersionMemo = {
        version: cached.version,
        source: `saved from ${String(cached.at ?? "an earlier run").slice(0, 10)}`,
      };
      log.warn({ version: cached.version.join(".") },
        "both lookups failed — using the last version that worked on this box");
      return waVersionMemo;
    }
  } catch { /* no cache yet */ }

  // Nothing left. Omitting the field makes Baileys use its own bundled
  // version, which is the thing most likely to be refused — so this is
  // reported loudly rather than passed off as normal.
  waVersionMemo = {
    version: null,
    source: "UNKNOWN — using the version bundled with Baileys, which WhatsApp may refuse",
  };
  return waVersionMemo;
}

const DESKTOP_IDENTITY = ["Mac OS", "Desktop", "14.4.1"];
const BROWSER_IDENTITY = ["Call Pro AI", "Chrome", "1.0.0"];

/**
 * What this session tells WhatsApp it is — AND WHY IT MUST NOT CHANGE LATER.
 *
 * A watcher claims to be a desktop app because that is the only client
 * WhatsApp pushes a full history archive to — the discovery that recovered a
 * year of Ankita's conversations. The claim only pays off if the handshake
 * succeeds, so after two refusals it drops to an ordinary browser.
 *
 * The part that cost us a scan: the identity is registered WITH the device.
 * WhatsApp remembers what linked, and a reconnect that introduces itself
 * differently is not the device it paired with. That matters immediately,
 * because a fresh pair is always followed by a mandatory restart — so the very
 * next connection after the rep scans must make the identical claim.
 *
 * It did not. The QR was only produced after falling back to the browser
 * identity, and rendering that QR reset the failure counter, so the restart
 * went back to claiming Desktop. The phone had paired with one client and a
 * different one came back. It sat on "Logging in…" until it gave up.
 *
 * So: whatever identity gets as far as a QR is pinned next to the credentials
 * it created, and every later connection on that generation reuses it. The
 * fallback decides once, at pairing time, and never again.
 */
function identityFor(s) {
  if (!s.observeOnly) return BROWSER_IDENTITY;
  if (s.pinnedIdentity) return s.pinnedIdentity;
  // ONE refusal is enough to move on. WhatsApp is currently declining the
  // desktop identity outright, and every extra attempt is another twenty
  // seconds in which the card says "Disconnected" and a human goes looking for
  // a problem that is about to fix itself.
  return s.handshakeFails >= 1 ? BROWSER_IDENTITY : DESKTOP_IDENTITY;
}

const identityFile = (authDir) => path.join(authDir, "identity.json");

/** Read the identity these credentials were created with, if they have one. */
function readPinnedIdentity(authDir) {
  try {
    const v = JSON.parse(fsSync.readFileSync(identityFile(authDir), "utf8"));
    return Array.isArray(v) && v.length === 3 ? v : null;
  } catch {
    return null;
  }
}

/** Remember it, so every reconnect on this credential set says the same thing. */
async function pinIdentity(s, identity) {
  if (s.pinnedIdentity) return;
  s.pinnedIdentity = identity;
  try {
    await fs.mkdir(s.authDir, { recursive: true });
    await fs.writeFile(identityFile(s.authDir), JSON.stringify(identity));
  } catch (e) {
    log.warn({ id: s.id, err: String(e?.message || e) },
      "could not save the client identity — a restart may claim a different one");
  }
}

async function cacheWaVersion(version) {
  try {
    await fs.mkdir(AUTH_DIR, { recursive: true });
    await fs.writeFile(VERSION_CACHE, JSON.stringify({ version, at: new Date().toISOString() }));
  } catch { /* a cache that cannot be written is not worth failing a connect over */ }
}

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
  // A session that has been replaced never comes back. Without this, the close
  // event from its own teardown schedules a reconnect that recreates the
  // credentials a reset just threw away.
  if (s.dead) {
    log.warn({ id: s.id }, "start() on a replaced session — ignoring");
    return;
  }
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
  // Per attempt, not per session: the identity fallback keys off whether THIS
  // handshake was refused, and a QR seen twenty minutes ago says nothing about
  // the one starting now.
  s.sawQr = false;
  // A code belongs to one pairing attempt. Carrying it across a restart would
  // show the rep eight characters WhatsApp has already forgotten.
  s.pairingCode = null;

  // Reading the saved login is the only step here that must succeed, so it
  // carries the guard: a failure has to clear `starting`, or the session is
  // wedged for the life of the process and even Re-scan cannot revive it.
  let auth, saveCreds;
  try {
    ({ state: auth, saveCreds } = await useMultiFileAuthState(s.authDir));
  } catch (e) {
    s.starting = false;
    s.state.status = "disconnected";
    s.state.lastError = `Could not read the saved login at ${s.authDir}: ${String(e?.message || e)}`;
    log.error({ id: s.id, err: s.state.lastError }, "could not prepare the connection");
    throw e;
  }

  const { version, source: versionSource } = await resolveWaVersion();
  s.state.waVersion = Array.isArray(version) ? version.join(".") : null;
  s.state.waVersionSource = versionSource;

  // Reset can land while the awaits above are in flight. If it did, this
  // session is already the old one — building its socket now would reconnect
  // the very login the admin asked to forget.
  if (s.dead) {
    s.starting = false;
    log.warn({ id: s.id }, "session was replaced while connecting — dropping it");
    return;
  }

  // Everything from here to the end of the function is wrapped so that ANY
  // throw still clears `starting`. Without that, one bad build or one missing
  // native dependency leaves the session permanently "already in flight" and
  // every later attempt — including Re-scan — returns silently.
  try {
  s.sock = makeWASocket({
    // Omitted entirely when the lookup above did not answer, so Baileys falls
    // back to the version it ships with rather than being handed a null.
    ...(version ? { version } : {}),
    auth,
    // We are a sender or a watcher, never a reader. Marking ourselves online
    // would make the phone stop showing notifications for these messages,
    // because WhatsApp would think the account is already reading them here.
    // "I AM UNAVAILABLE" IS WHY NOTHING LIVE EVER ARRIVED.
    //
    // Baileys turns this flag into a presence update on connect — false sends
    // sendPresenceUpdate('unavailable') (Socket/chats.js), which tells WhatsApp
    // this device is not reachable. WhatsApp then has no reason to route live
    // message notifications to it, and the offline queue is never flushed here.
    //
    // It matches the evidence exactly. The socket connects, contact sync runs,
    // the heartbeat is green, and a fresh link still pulls a full history —
    // none of which depend on presence. What never arrived, for ANY rep, in the
    // entire life of this feature, was a single live message: zero since the
    // 30 August history sync while the rep's phone shows a full working day,
    // and zero media files captured platform-wide.
    //
    // It was set false to protect the rep's own phone notifications. That is a
    // real concern and it is worth less than the feature working at all — a
    // watcher that is told to be unavailable is not a watcher. Baileys' own
    // default is true. MARK_ONLINE=0 puts it back if a rep ever complains.
    markOnlineOnConnect: s.observeOnly ? MARK_ONLINE : false,
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
    //
    // WITH A FALLBACK, BECAUSE HISTORY IS WORTH LESS THAN LINKING AT ALL.
    //
    // The desktop identity is the one that gets the archive, and it is also the
    // more exotic claim — if WhatsApp declines to shake hands with it from this
    // host, the rep can never link, and a rep who cannot link has no history
    // either. So after two handshakes that die before a QR appears, the next
    // attempt asks as a plain browser instead. Thinner sync, but a working
    // link, and the dashboard says which one it settled on.
    browser: identityFor(s),
  });
  s.state.identity = identityFor(s).join(" · ");

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
      // Not awaited: queueObserved may pause on a media download, and blocking
      // the event loop on it would stall every other WhatsApp event behind it.
      // Each message is independent and the CRM upserts on WhatsApp's own id,
      // so completion order does not matter.
      noteEvent(s);
      for (const m of ev?.messages ?? []) {
        void queueObserved(s, m).catch((e) =>
          log.warn({ id: s.id, err: String(e?.message || e) }, "could not queue a message"));
      }
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
      // THE TWO ARRAYS THAT WERE BEING THROWN AWAY.
      //
      // A history sync does not only carry messages. It carries the chat list —
      // with every group's subject and, for a migrated contact, the LID beside
      // the phone number — and a contacts list with the display names. Reading
      // only `messages` is why a year of imported chat arrived with every single
      // name blank, and why the numbers behind LID conversations stayed unknown
      // when WhatsApp had just handed them over.
      //
      // These run BEFORE the messages so a name and a number are already known
      // by the time the first message that needs them is queued.
      for (const c of h?.contacts ?? []) {
        if (c?.lid && c?.jid) noteLid(s, c.lid, c.jid);
        const name = c?.name ?? c?.notify ?? c?.verifiedName ?? null;
        const peer = phoneFor(s, String(c?.id ?? ""), c?.jid)
          ?? (isLidJid(c?.id) ? jidDigits(c.id) : null);
        if (name && peer) noteName(s, peer, name);
      }
      for (const c of h?.chats ?? []) {
        const id = String(c?.id ?? "");
        if (c?.lidJid) noteLid(s, c.lidJid, id);
        if (!c?.name) continue;
        if (isGroupJid(id)) noteName(s, id, c.name);
        else {
          const peer = phoneFor(s, id) ?? (isLidJid(id) ? jidDigits(id) : null);
          if (peer) noteName(s, peer, c.name);
        }
      }

      const msgs = h?.messages ?? [];
      if (msgs.length) {
        log.info({
          id: s.id, count: msgs.length, progress: h?.progress ?? null,
          chats: (h?.chats ?? []).length, contacts: (h?.contacts ?? []).length,
          lids: s.lidPn.size,
        }, "history sync");
      }
      for (const m of msgs) {
        void queueObserved(s, m).catch((e) =>
          log.warn({ id: s.id, err: String(e?.message || e) }, "could not queue history message"));
      }
      if (s.pendingContacts.length && !s.flushTimer) {
        s.flushTimer = setTimeout(() => flushObserved(s), FLUSH_MS);
      }
    });

    // WHAT THE REP TOOK BACK.
    //
    // "Delete for everyone" was invisible: the row sat in the CRM as though the
    // message still stood. A rep quietly retracting a price, a promise or an
    // abuse is precisely what a super admin wants this feature for, and
    // WhatsApp announces it — a protocolMessage of type REVOKE naming the
    // message it kills. The original text is already stored and is deliberately
    // KEPT; only a flag and a timestamp are added.
    //
    // Edits ride the same path. WhatsApp allows one within fifteen minutes and
    // reports it as an editedMessage, and the CRM keeps what was first sent.
    if (WATCH_EDITS) {
      s.sock.ev.on("messages.upsert", (ev) => {
        for (const m of ev?.messages ?? []) {
          const proto = m?.message?.protocolMessage;
          const revokedId = proto?.type === 0 || proto?.type === "REVOKE"
            ? proto?.key?.id : null;
          if (revokedId) {
            s.pendingEdits.push({ id: String(revokedId), deleted_at: new Date().toISOString() });
            continue;
          }
          const edited = m?.message?.editedMessage?.message?.protocolMessage
            ?? (proto?.type === 14 || proto?.type === "MESSAGE_EDIT" ? proto : null);
          const editedId = edited?.key?.id;
          if (editedId) {
            s.pendingEdits.push({
              id: String(editedId),
              edited_at: new Date().toISOString(),
              text: String(textOf(edited?.editedMessage ?? {}) || "").slice(0, 8000) || null,
            });
          }
        }
        if (s.pendingEdits.length && !s.flushTimer) {
          s.flushTimer = setTimeout(() => flushObserved(s), FLUSH_MS);
        }
      });
    }

    // WHO AN UNKNOWN NUMBER ACTUALLY IS.
    //
    // The dashboard now lists numbers a rep talks to that are not leads, and a
    // bare 9199… tells a founder nothing. WhatsApp's own display name is
    // usually the only clue, and it arrives here. Names only — never used for
    // matching, which stays phone-number-only on purpose.
    if (SYNC_CONTACTS) {
      const noteContact = (c) => {
        const jid = String(c?.id ?? "");
        // A Baileys contact carries BOTH addresses when it knows both, which
        // makes this the richest source of LID mappings there is — richer than
        // the messages themselves, because it covers people who have not
        // written today.
        if (c?.lid && c?.jid) noteLid(s, c.lid, c.jid);
        const name = c?.name ?? c?.notify ?? c?.verifiedName ?? null;
        if (!name) return;
        // Name the number when we can, and the LID when that is all there is —
        // the row will be re-keyed to the number the moment one turns up.
        const peer = phoneFor(s, jid, c?.jid) ?? (isLidJid(jid) ? jidDigits(jid) : null);
        // From the rep's own address book — the best name there is.
        if (peer) noteName(s, peer, name, "book");
      };
      s.sock.ev.on("contacts.upsert", (cs) => { for (const c of cs ?? []) noteContact(c); });
      s.sock.ev.on("contacts.update", (cs) => { for (const c of cs ?? []) noteContact(c); });

      // WhatsApp announcing, unprompted, that a LID belongs to a number. This
      // is the event the whole LID fix hangs on and it was not being listened
      // for at all.
      s.sock.ev.on("chats.phoneNumberShare", (p) => noteLid(s, p?.lid, p?.jid));
    }

    // WHAT THE GROUP IS CALLED.
    //
    // Ten conversations all titled "Group chat" is not a list a founder can use.
    // Subjects arrive on these events when they change, and are asked for once
    // per group otherwise (askGroupName).
    if (WATCH_GROUPS) {
      const noteGroups = (gs) => {
        for (const g of gs ?? []) if (g?.id && g?.subject) noteName(s, g.id, g.subject);
      };
      s.sock.ev.on("groups.upsert", noteGroups);
      s.sock.ev.on("groups.update", noteGroups);
    }

    // WHEN THE BUYER IS ACTUALLY HOLDING THEIR PHONE.
    //
    // The best moment to ring a lead is while they are on WhatsApp, and that is
    // knowable — WhatsApp publishes presence for chats you subscribe to. Off by
    // default because it is the one capability here that TALKS TO WhatsApp
    // rather than just listening: a subscription per lead, from a number that
    // has just linked a new device, is exactly the shape of traffic that gets a
    // number looked at. Switch it on per company once the rest is settled.
    if (WATCH_PRESENCE) {
      s.sock.ev.on("presence.update", (u) => {
        const jid = String(u?.id ?? "");
        if (!isPersonJid(jid)) return;
        const peer = phoneFor(s, jid);
        if (!peer) return;
        for (const st of Object.values(u?.presences ?? {})) {
          const kind = st?.lastKnownPresence;
          if (!kind) continue;
          s.pendingPresence.push({ peer, presence: String(kind), at: new Date().toISOString() });
          break;
        }
        if (s.pendingPresence.length && !s.flushTimer) {
          s.flushTimer = setTimeout(() => flushObserved(s), FLUSH_MS);
        }
      });
    }

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
        // A WhatsApp call from a LID-addressed buyer is still a call. Only its
        // number needs resolving, and an unresolved one is dropped here rather
        // than stored — a call row exists to be counted against a lead, and a
        // LID cannot be.
        if (!isPersonJid(from) || !c?.id) continue;
        const peer = phoneFor(s, from);
        if (!peer) continue;
        s.pendingCalls.push({
          id: String(c.id),
          peer,
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
        if (!isPersonJid(jid)) continue;
        if (u?.key?.fromMe) continue;
        const st = u?.update?.status;
        // Baileys reports status as a number or a name depending on version.
        const readish = st === 4 || st === 5 || st === "READ" || st === "PLAYED";
        if (!readish || !u?.key?.id) continue;
        // Keyed by WhatsApp's own message id, so a LID here is harmless: the
        // CRM finds the row by id and the peer is only a hint.
        s.pendingReceipts.push({
          id: String(u.key.id),
          peer: phoneFor(s, jid, u?.key?.senderPn) ?? jidDigits(jid),
          read_at: new Date().toISOString(),
        });
      }
      if (s.pendingReceipts.length && !s.flushTimer) {
        s.flushTimer = setTimeout(() => flushObserved(s), FLUSH_MS);
      }
    });
  }

  s.sock.ev.on("connection.update", async (u) => {
    // Nothing a replaced session hears can be acted on: not a QR nobody will
    // scan, not an "open" that would report the forgotten login as connected,
    // and above all not a "close" that schedules its own return.
    if (s.dead) return;
    noteEvent(s);
    const { connection, lastDisconnect, qr } = u;

    if (qr) {
      // Wrapped because this is an async listener: an throw in here rejects a
      // promise nobody is awaiting, so a failure to render would discard the
      // one QR WhatsApp offered and leave the panel waiting on a code that
      // already came and went.
      try {
        // Rendered here rather than in the browser so the raw pairing string —
        // which is enough to hijack the session — never leaves this box in a
        // form anything else can replay.
        s.state.qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
        s.state.status = "qr";
        // A handshake that got this far was accepted. Whatever we claimed to be
        // is now the thing the rep is about to pair with, so it is pinned here
        // and reused for every reconnect on these credentials — the restart
        // that follows a scan MUST introduce itself identically.
        //
        // handshakeFails is deliberately NOT reset. It is what chose this
        // identity; zeroing it would un-choose it on the very next connect,
        // which is precisely how a scanned QR ended up stuck on "Logging in…".
        s.sawQr = true;
        s.qrCount = (s.qrCount || 0) + 1;
        // Back to a short retry, so the mandatory post-pair restart is not
        // sitting behind a backoff grown by the failures that came before.
        s.backoffMs = 2_000;
        await pinIdentity(s, identityFor(s));
        log.info({ id: s.id, identity: s.state.identity }, "QR ready — scan it from the right phone");

        // NOBODY IS LOOKING AT THIS ONE.
        //
        // A session with no saved login regenerates a QR every twenty seconds
        // for as long as the socket lives. The founder's own sender has been
        // doing that for weeks — it filled the host's runtime log to its cap,
        // buried every line worth reading, and nothing was watching for it.
        // The dashboard polls /qr while a human has the panel open, so that
        // poll is the signal that someone is actually there to scan. Two
        // minutes of squares with nobody asking means stop and wait to be
        // asked.
        if (s.qrCount > 6 && Date.now() - (s.lastQrRequestAt || 0) > 60_000) {
          s.state.qrDataUrl = null;
          s.state.status = "disconnected";
          s.state.lastError = "No one scanned the QR, so it stopped refreshing. Press Show QR to start again.";
          s.qrCount = 0;
          log.warn({ id: s.id }, "QR went unscanned — pausing until someone asks for it");
          try { s.sock?.ev.removeAllListeners(); } catch { /* nothing attached */ }
          try { s.sock?.end(); } catch { /* already gone */ }
          s.sock = null;
        }
      } catch (e) {
        s.state.lastError = `Could not render the QR image: ${String(e?.message || e)}`;
        log.error({ id: s.id, err: s.state.lastError }, "QR render failed");
      }
    }

    if (connection === "open") {
      s.state.status = "connected";
      s.state.qrDataUrl = null;
      s.state.lastSeen = new Date().toISOString();
      s.state.lastError = null;
      s.backoffMs = 2_000;
      s.state.number = s.sock?.user?.id ? String(s.sock.user.id).split(":")[0] : null;
      // Tell the CRM immediately, then keep saying it. Without the first one,
      // a rep who links and then has a quiet morning would not appear
      // connected on the dashboard until their first message to a lead.
      startHeartbeat(s);
      log.info({ id: s.id, number: s.state.number }, "connected");
      if (s.observeOnly) void learnNames(s);
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;

      // 515 IS NOT A FAILURE. IT IS THE SECOND HALF OF PAIRING.
      //
      // WhatsApp always drops the socket with restartRequired immediately
      // after a fresh scan: the credentials are written, and the client is
      // expected to come straight back on them. Until it does, the rep's phone
      // sits on "Logging in…" — which is exactly where Ankita's stopped.
      //
      // It used to fall through to the generic retry below, and therefore
      // waited `backoffMs`. That counter only reset on a successful open, so
      // after the run of 428 refusals it had doubled its way to the five-minute
      // ceiling. The scan worked; the reconnect it depends on was parked for
      // five minutes; the phone gave up long before.
      //
      // Handled first, on its own, with no backoff and nothing recorded as an
      // error — because nothing went wrong.
      if (code === DisconnectReason.restartRequired) {
        s.state.status = "connecting";
        s.state.lastError = null;
        s.backoffMs = 2_000;
        log.info({ id: s.id }, "paired — restarting straight away to finish logging in");
        s.reconnectTimer = setTimeout(() => start(s).catch((e) => log.error(e)), 250);
        return;
      }
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

      // CLOSED BEFORE A QR EVER APPEARED IS A DIFFERENT ANIMAL.
      //
      // If WhatsApp shuts the stream during the handshake, no qr event is ever
      // emitted, so the dashboard sits on "waiting" while the worker quietly
      // retries forever. There is nothing for the rep to scan and no amount of
      // re-scanning creates one. In practice it means WhatsApp declined what we
      // introduced ourselves as — a retired protocol version, or a client
      // identity it will not accept from this host.
      const refused = !s.sawQr;
      if (refused) s.handshakeFails += 1;
      // MID-RETRY IS NOT GIVING UP.
      //
      // A refused handshake set status "disconnected", so the card read
      // "Never connected — have the rep scan the QR" during the twenty seconds
      // before the next attempt produced one. That is the same lie that has
      // sent someone to fetch a telecaller more than once. We are retrying, so
      // say so.
      if (refused && !loggedOut && !replaced) s.state.status = "connecting";

      s.state.lastError = loggedOut
        ? "WhatsApp logged this session out. Press Re-scan and scan the new QR."
        : replaced
          ? "This WhatsApp got linked somewhere else, so this login no longer works. " +
            "Press Re-scan and scan the new QR from the rep's phone."
          : refused
            ? `WhatsApp closed the connection (${code ?? "unknown"}) before offering a QR — ` +
              `attempt ${s.handshakeFails}. It is refusing what we identify as, not the scan. ` +
              `Claiming version ${s.state.waVersion ?? "bundled/unknown"} (${s.state.waVersionSource ?? "?"}) ` +
              `as ${s.state.identity ?? "?"}.` +
              (s.handshakeFails >= 1 ? " Retrying as a plain browser." : " Retrying.")
            : `Connection closed (${code ?? "unknown"}). Retrying.`;
      log.warn({
        id: s.id, code, loggedOut, replaced, refused,
        handshakeFails: s.handshakeFails,
        waVersion: s.state.waVersion, identity: s.state.identity,
      }, "connection closed");

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

  } catch (e) {
    s.state.status = "disconnected";
    s.state.lastError = `Could not open the WhatsApp connection: ${String(e?.message || e)}`;
    log.error({ id: s.id, err: s.state.lastError }, "makeWASocket failed");
    throw e;
  } finally {
    // Cleared only now that the socket exists and every listener is attached.
    // Cleared any earlier and a third caller could slip through the guard while
    // this one was still wiring up, which is how two sockets got onto one login.
    s.starting = false;
  }
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

/**
 * The file itself, not just its name.
 *
 * A rep's WhatsApp day in Indian real estate is voice notes and photos, and the
 * CRM was storing the word "audio". Downloaded here and handed to the ingest as
 * base64, because the worker deliberately holds no Supabase service key — it
 * can talk to one CRM endpoint with one shared secret and nothing else, so the
 * upload has to happen on the far side.
 *
 * Failure is never fatal. A message whose media cannot be fetched is still a
 * message and still gets stored with its text and its kind; only the file is
 * missing. Losing the conversation because one download 404'd would be a far
 * worse trade than losing the attachment.
 */
async function fetchMedia(s, msg, kind, declaredSize) {
  // WHY THIS RETURNS A REASON AND NOT JUST null.
  //
  // Every failure here used to come back as null and end there, which put the
  // panel in the one state it cannot explain: a message that says it has a
  // photo, and no photo. The founder read "the file was not saved" and had no
  // way to tell a file that was too big from one WhatsApp had expired from one
  // that simply had not started yet. Each of those needs a different sentence,
  // and none of them is a spinner.
  const mb = (n) => `${(Number(n) / 1024 / 1024).toFixed(1)} MB`;
  if (!CAPTURE_MEDIA || !kind) return { b64: null, error: null };
  if (declaredSize && Number(declaredSize) > MAX_MEDIA_BYTES) {
    log.info({ id: s.id, kind, size: Number(declaredSize) }, "media too large — naming it only");
    return { b64: null, error: `Too big to store (${mb(declaredSize)}); the limit is ${mb(MAX_MEDIA_BYTES)}.` };
  }
  try {
    const buf = await downloadMediaMessage(msg, "buffer", {}, {
      logger: pino({ level: "silent" }),
      reuploadRequest: s.sock.updateMediaMessage,
    });
    if (!buf?.length) return { b64: null, error: "WhatsApp returned an empty file." };
    // Re-checked after the fact: WhatsApp's declared fileLength is absent on
    // some message shapes, so the only trustworthy size is the one we hold.
    if (buf.length > MAX_MEDIA_BYTES) {
      log.info({ id: s.id, kind, size: buf.length }, "media over cap after download — dropped");
      return { b64: null, error: `Too big to store (${mb(buf.length)}); the limit is ${mb(MAX_MEDIA_BYTES)}.` };
    }
    return { b64: buf.toString("base64"), error: null };
  } catch (e) {
    const why = String(e?.message || e);
    log.warn({ id: s.id, kind, err: why }, "media download failed — keeping the message");
    return {
      b64: null,
      // WhatsApp deletes a file from its servers after about a month; the
      // message survives the file, and that is the commonest cause by far.
      error: /410|404|not found|expired/i.test(why)
        ? "WhatsApp no longer has this file — it only keeps one for about a month."
        : `Could not download: ${why.slice(0, 120)}`,
    };
  }
}

/**
 * The attachment backlog, and the loop that works through it.
 *
 * A history sync arrives as one burst of thousands. Downloading inline would
 * either serialise the whole import behind the files, or — fired in parallel —
 * open thousands of simultaneous fetches at WhatsApp's media CDN from a number
 * that has just linked a new device, which is the behaviour that gets a number
 * flagged. Skipping them, which is what the first version did, loses precisely
 * the photos and brochures a re-scan exists to recover.
 *
 * So: bounded concurrency, unbounded patience. The queue holds the message
 * objects (Baileys needs the original to decrypt), a few workers pull from it
 * continuously, and each finished file is reported to the CRM as a patch
 * against the message id that is already stored. Slow is fine. Lossy is not.
 */
function queueMedia(s, msg, waId, kind, declaredSize) {
  if (declaredSize && Number(declaredSize) > MAX_MEDIA_BYTES) return false;
  if (s.mediaQueue.length >= MAX_MEDIA_QUEUE) {
    // Bounded so a pathological account cannot exhaust memory. Logged rather
    // than silent, because "some files missing" with no explanation is the
    // thing that cost days on this feature already.
    if (!s.mediaQueueWarned) {
      s.mediaQueueWarned = true;
      log.warn({ id: s.id, cap: MAX_MEDIA_QUEUE }, "media backlog full — later attachments will be named only");
    }
    return false;
  }
  s.mediaQueue.push({ msg, waId, kind });
  void drainMedia(s);
  return true;
}

async function drainMedia(s) {
  if (s.mediaWorkers >= MAX_MEDIA_IN_FLIGHT) return;
  s.mediaWorkers += 1;
  try {
    while (s.mediaQueue.length) {
      const job = s.mediaQueue.shift();
      if (!job) break;
      const got = await fetchMedia(s, job.msg, job.kind, null);
      // Reported either way. A file that failed is a fact the screen needs, and
      // reporting only successes is what left 347 attachments sitting on
      // "Downloading…" with nothing behind them and no reason given.
      s.pendingMedia.push({
        id: job.waId,
        media_b64: got.b64,
        error: got.error,
        mime_type: mediaMetaOf(job.msg).mime_type ?? null,
      });
      if (!s.flushTimer) s.flushTimer = setTimeout(() => flushObserved(s), FLUSH_MS);
      // Every completed file frees the message object for collection; holding
      // a whole history's worth of them is what the cap above is protecting.
      job.msg = null;
    }
  } catch (e) {
    log.warn({ id: s.id, err: String(e?.message || e) }, "media drainer stopped");
  } finally {
    s.mediaWorkers -= 1;
  }
}

async function queueObserved(s, msg) {
  const jid = msg?.key?.remoteJid ?? "";
  // A person — by phone number or by LID, see the note on jidDigits — or a
  // group when groups are switched on. Broadcasts and status updates are never
  // included either way.
  const isGroup = isGroupJid(jid);
  if (!isPersonJid(jid) && !(WATCH_GROUPS && isGroup)) {
    const suffix = String(jid).includes("@") ? `@${String(jid).split("@").pop()}` : "(no jid)";
    s.dropped.set(suffix, (s.dropped.get(suffix) ?? 0) + 1);
    return;
  }
  const id = msg?.key?.id;
  if (!id) return;

  // For a group this is the group's own id and always resolves. For a person it
  // is their number when WhatsApp has revealed it, and their LID when it has
  // not — kept either way, and flagged so the CRM does not try to match a LID
  // against a lead's phone number.
  const resolved = isGroup ? jidDigits(jid) : phoneFor(s, jid, msg?.key?.senderPn);
  const peer = resolved || jidDigits(jid);
  const peerIsLid = !isGroup && !resolved;
  if (!peer) return;
  const text = String(textOf(msg) || "");
  const kind = mediaKindOf(msg);

  // ── A MESSAGE THAT ARRIVED AND COULD NOT BE READ ───────────────────────────
  //
  // WhatsApp hands Baileys an encrypted envelope; if the Signal session no
  // longer matches, decryption fails and Baileys still emits the message — with
  // messageStubType CIPHERTEXT (2), an empty body, and the libsignal error in
  // messageStubParameters ("Bad MAC", "No session record", …).
  //
  // Until now that landed two lines below, in `if (!text.trim() && !kind)
  // return;`, and was thrown away without a word. That silence is expensive:
  // this box's log has been full of "Failed to decrypt message with any known
  // session / Session error: Bad MAC" for a fortnight while the dashboard
  // showed a clean, healthy, empty screen. Nobody could tell the difference
  // between "this rep has no one-to-one chats" and "every one of them arrived
  // and none could be opened".
  //
  // Those are opposite problems with opposite fixes, and they now look
  // different. The row is stored — number, direction, timestamp, and a flag —
  // so the conversation EXISTS on screen and says honestly that its contents
  // could not be unlocked. A founder can see a buyer is messaging even when the
  // words are unavailable, which is the difference between a quiet rep and a
  // broken link.
  //
  // Bad MAC itself has no repair. Only a fresh pairing mints new keys.
  const CIPHERTEXT_STUB = 2;
  const failed = msg?.messageStubType === CIPHERTEXT_STUB
    || msg?.messageStubType === "CIPHERTEXT";
  if (failed) {
    const why = String(msg?.messageStubParameters?.[0] ?? "could not decrypt").slice(0, 120);
    s.undecryptable.set(peer, (s.undecryptable.get(peer) ?? 0) + 1);
    // Once per peer per session. A poisoned key store fails EVERY message, and
    // a line each would bury the host log the way it did before.
    if (!s.undecryptableLogged.has(peer)) {
      s.undecryptableLogged.add(peer);
      log.warn({ id: s.id, peer, group: isGroup, why },
        "message arrived but could not be decrypted — this chat needs a fresh link");
    }
  }

  // THE REP TALKING TO THEMSELVES IS NOT LEAD WORK.
  //
  // WhatsApp's "Message yourself" chat, and a run of contentless protocol
  // messages WhatsApp addresses to your own JID during a sync, both arrive
  // here with remoteJid set to the rep's OWN number. Ankita's entire observed
  // history was sixteen of these — every one addressed to 919310012981, her
  // own number, with an empty body — which the dashboard then reported as
  // "16 messages seen, none with a lead". Technically true and completely
  // misleading: there was nothing there to match in the first place.
  //
  // Both identities, because the rep now HAS two: WhatsApp gives the account a
  // phone-number id and a LID, and a self-addressed stanza may arrive under
  // either. Checking only the first let the LID copies through.
  const ownPn = jidDigits(s.sock?.user?.id);
  const ownLid = jidDigits(s.sock?.user?.lid);
  if (!isGroup && ((ownPn && peer === ownPn) || (ownLid && peer === ownLid))) return;

  // An empty shell is not a message. No text, no attachment — nothing a human
  // sent and nothing anyone could read on a lead page. Counting them makes the
  // "seen" figure a measure of protocol chatter rather than of the rep's work.
  //
  // A message that failed to decrypt is the exception: it is empty for a
  // reason worth knowing, and it is kept.
  if (!text.trim() && !kind && !failed) return;

  const meta = mediaMetaOf(msg);

  // TEXT NOW, FILE AFTER — AND THE FILE IS NEVER DROPPED.
  //
  // The first version of this downloaded inline and gave up whenever the box
  // was already busy, which meant a history sync — thousands of messages in one
  // burst, the exact moment every old photo and brochure arrives — captured
  // almost no files at all. It degraded silently and would have wasted the one
  // re-scan a telecaller can reasonably be asked for.
  //
  // Now the message itself is queued immediately, so the conversation lands
  // fast and in order, and the attachment is handed to a drainer that works
  // through the backlog at a controlled rate and reports each file as it
  // arrives. A sync of four thousand photos takes a while and finishes; nothing
  // is thrown away because the queue happened to be deep when it appeared.
  const queued = kind && CAPTURE_MEDIA ? queueMedia(s, msg, id, kind, meta.file_size) : false;

  // A group we have not named yet. WhatsApp does not put the subject on the
  // message, so it is asked for once — the alternative is the conversation list
  // the founder is looking at now, ten rows all reading "Group chat".
  // learnNames() fetches every group on connect; this only catches one the rep
  // was added to afterwards.
  if (isGroup && !s.groupNames.has(peer)) askGroupName(s, jid);

  s.pending.push({
    id,
    peer,
    direction: msg?.key?.fromMe ? "out" : "in",
    // WHOSE NAME pushName ACTUALLY IS.
    //
    // It is the name of whoever SENT the message, and that is only the peer in
    // one of the three cases here. Taking it blindly produced a conversation
    // list where seven different buyers were all called "fanbedevelopers0001" —
    // Ankita's own WhatsApp name, copied off her own outgoing messages — and
    // where a group named itself after whoever had spoken in it last, so the
    // PVC-panels group was filed under "sunder singh".
    //
    //   inbound, one-to-one   pushName IS the peer. Use it.
    //   outbound, one-to-one   pushName is the REP. Never the peer's name.
    //   group                  pushName is the participant, not the group.
    //                          The subject comes from groupMetadata instead.
    //
    // History-synced messages carry no pushName at all (WhatsApp sends those
    // separately, as a PUSH_NAME sync), which is why a year of imported chat
    // came through with every name blank.
    peer_name: isGroup
      ? (s.groupNames.get(peer) ?? null)
      : (msg?.key?.fromMe ? null : (msg?.pushName ?? null)),
    // In a group the participant's name IS worth keeping — it is what turns a
    // thread of fifteen-digit ids into people talking to each other.
    sender_name: isGroup && !msg?.key?.fromMe ? (msg?.pushName ?? null) : null,
    ...meta,
    is_group: isGroup,
    // True when WhatsApp addressed this person by LID and has not told us their
    // number. The conversation is kept and readable; the CRM just knows better
    // than to match this against a lead's phone number, and re-keys the rows
    // as soon as a mapping arrives.
    peer_is_lid: peerIsLid,
    // WAITING, NOT MISSING. Set when the attachment has actually been handed to
    // the download queue, so the panel can say "coming" where it is true and
    // stop saying it where it never will be.
    media_status: kind ? (queued ? "queued" : "skipped") : null,
    // Arrived, could not be opened. See the block above.
    decrypt_failed: failed,
    decrypt_error: failed
      ? String(msg?.messageStubParameters?.[0] ?? "could not decrypt").slice(0, 120)
      : null,
    // In a group, peer_phone is the GROUP's id and says nothing about who
    // spoke. WhatsApp puts the actual sender on key.participant — as a LID for
    // a migrated account, with the number alongside on participant_pn — and
    // without it a group thread reads as one anonymous voice.
    sender_phone: isGroup
      ? (phoneFor(s, msg?.key?.participant, msg?.key?.participantPn)
         ?? jidDigits(msg?.key?.participant) ?? null) || null
      : null,
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

/**
 * "Still here" — the message a watcher sends when it has nothing to say.
 *
 * The dashboard used to infer a rep's connection from when data last arrived,
 * because that was the only signal it had. So a linked, healthy watcher on a
 * quiet morning was indistinguishable from a dead one, and the card said
 * "Never connected — have the rep scan the QR" about a device the rep's own
 * phone was listing as active. Someone then went and asked her to scan again.
 *
 * Silence had to stop being ambiguous, and the only way is to break it on
 * purpose. This posts nothing but the fact of being connected, so the CRM can
 * tell a quiet rep from a broken link without the dashboard being open.
 */
const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS || 4 * 60_000);

/**
 * A SOCKET THAT SAYS "CONNECTED" IS NOT PROOF WHATSAPP IS STILL TALKING TO US.
 *
 * The heartbeat reports s.state.status, an in-memory flag set once when the
 * connection opened. It proves the worker process is alive. It does not prove
 * the WhatsApp stream is still delivering, and those came apart: this session
 * has reported "connected" continuously since 9 September while the rep's
 * phone shows a working day of messages, voice calls and PDFs that never
 * arrived here. A stream can stop delivering without ever emitting a close,
 * and nothing in the worker was positioned to notice.
 *
 * So: every WhatsApp event of any kind stamps lastEventAt, and a connected
 * session that has heard absolutely nothing for WATCHDOG_MS rebuilds its
 * socket on the same credentials. No QR, no human, nothing lost — a reconnect
 * is cheap and a silent day is not.
 *
 * Deliberately generous at 90 minutes. A watched number genuinely goes quiet
 * at night, and the cost of being wrong is one needless reconnect.
 */
const WATCHDOG_MS = Number(process.env.WATCHDOG_MS || 90 * 60_000);
/** How long a session may sit off WhatsApp before it is rebuilt regardless of
 *  what the reconnect logic thinks it is doing. See checkStuck. */
const STUCK_MS = Number(process.env.STUCK_MS || 10 * 60_000);

function noteEvent(s) {
  s.lastEventAt = Date.now();
  // Counted as well as timed. "When did WhatsApp last say anything" answers
  // whether the socket is alive; "how many times" answers whether it is busy —
  // and a stream that is busy while the CRM sees nothing is a filter bug, not
  // a connection one. Two very different mornings of work.
  s.eventCount = (s.eventCount ?? 0) + 1;
}

/**
 * A SESSION THAT HAS FALLEN OFF WHATSAPP AND IS NOT COMING BACK.
 *
 * Every reconnect path here schedules its own retry, so a stuck session should
 * be impossible — and yet one sat disconnected for fourteen hours with the
 * process alive and answering HTTP. A timer that was cleared and never
 * re-armed, a retry that threw before it could schedule the next, a backoff
 * that walked to its ceiling: any of them ends here, and none of them leaves a
 * trace.
 *
 * So there is one check that does not trust any of that. If the socket has been
 * anything other than connected for ten minutes, and it is not waiting for a
 * human to scan a QR and has not been logged out, it is rebuilt. Logged out is
 * excluded deliberately: reconnecting a dead login in a loop is what gets a
 * number banned, and it needs a person with the rep's phone, not a retry.
 */
function checkStuck(s) {
  if (s.dead || !s.observeOnly || s.starting) return;
  if (s.state.status === "connected") { s.notConnectedSince = null; return; }
  // Waiting on a human. Retrying does not help and costs a fresh QR.
  if (s.state.status === "qr" || s.state.status === "logged_out") {
    s.notConnectedSince = null;
    return;
  }
  // Tracked here rather than at every place status is assigned, so no future
  // branch can forget to stamp it and quietly opt itself out of recovery.
  if (!s.notConnectedSince) { s.notConnectedSince = Date.now(); return; }
  const since = Date.now() - s.notConnectedSince;
  if (since < STUCK_MS) return;
  log.warn({ id: s.id, status: s.state.status, stuckMinutes: Math.round(since / 60000) },
    "not connected for a long time and nothing is retrying — rebuilding");
  s.notConnectedSince = Date.now();
  void start(s).catch((e) => log.error(e));
}

function checkStreamAlive(s) {
  if (s.dead || !s.observeOnly) return;
  if (s.state.status !== "connected") return;
  const since = Date.now() - (s.lastEventAt || 0);
  if (since < WATCHDOG_MS) return;
  log.warn({ id: s.id, quietMinutes: Math.round(since / 60000) },
    "connected but the WhatsApp stream has been silent — rebuilding the socket");
  s.state.lastError = "The WhatsApp stream went quiet while connected, so the link was rebuilt.";
  s.lastEventAt = Date.now();
  void start(s).catch((e) => log.error({ id: s.id, err: String(e?.message || e) }, "watchdog restart failed"));
}

async function sendHeartbeat(s) {
  if (s.dead || !s.observeOnly) return;
  if (!INGEST_URL || !INGEST_SECRET) return;

  // IT USED TO STOP HERE WHEN THE SOCKET WAS NOT CONNECTED.
  //
  // `if (s.state.status !== "connected") return;` meant a session whose
  // WhatsApp link had dropped sent NOTHING — which on the CRM side is
  // indistinguishable from the whole box being dead. Fourteen hours were spent
  // believing the process had been killed by the host; it was up the whole
  // time, answering /health, with a socket that had fallen off WhatsApp and
  // never come back.
  //
  // Silence is the one thing a health signal must never use to mean something.
  // It reports whatever the state actually is, and the CRM decides what that
  // deserves.

  // SAYING "I AM HERE" TO WHATSAPP, NOT ONLY TO THE CRM.
  //
  // markOnlineOnConnect sends presence exactly ONCE, at connect. Setting it
  // true is what made live messages arrive for the first time in the life of
  // this feature (v17) — telling WhatsApp the device is unreachable meant
  // nothing was ever routed here.
  //
  // But "once" is the problem now. The socket connects, messages flow for
  // three quarters of an hour, and then stop dead while the connection stays
  // open and the stream stays healthy: 13:47 to 19:21 with a fresh heartbeat
  // and not one message, across nineteen conversations that are certainly not
  // idle. A device that announced itself once and then went quiet looks, from
  // WhatsApp's side, like a device that has gone away.
  //
  // So presence is re-asserted on the same timer. A real client does this too.
  // It is one small stanza every four minutes, and it is the difference
  // between being a linked device and being a forgotten one.
  if (MARK_ONLINE) {
    try { await s.sock?.sendPresenceUpdate?.("available"); }
    catch (e) { log.debug({ id: s.id, err: String(e?.message || e) }, "presence refresh failed"); }
  }

  try {
    await fetch(INGEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${INGEST_SECRET}` },
      body: JSON.stringify({
        salesperson_id: s.salespersonId,
        wa_number: s.state.number,
        heartbeat: true,
        status: s.state.status,
        worker_version: WORKER_VERSION,
        // WHAT THE BOX CAN SEE AND NOBODY ELSE COULD.
        //
        // These counters have existed on /status since v20, and /status is a
        // bearer-protected endpoint on a host nobody can curl from the CRM. So
        // "is anything arriving and being dropped?" — the exact question five
        // hours of silence raises — was unanswerable without SSH.
        //
        // They ride the heartbeat now. Four minutes old at worst, readable
        // with a select, and they turn the next round of this into a
        // measurement instead of another theory.
        diag: {
          dropped: Object.fromEntries(s.dropped),
          undecryptable: [...s.undecryptable.values()].reduce((a, b) => a + b, 0),
          lids_known: s.lidPn.size,
          groups_named: s.groupNames.size,
          queued: s.pending.length,
          queued_media: s.mediaQueue.length,
          // Anything at all from WhatsApp, not just a message we kept. If this
          // is moving while messages are not, the socket is alive and the
          // filter is wrong. If it is frozen, WhatsApp has stopped talking.
          events: s.eventCount ?? 0,
          last_event_at: s.lastEventAt ?? null,
        },
      }),
    });
  } catch (e) {
    // A missed heartbeat is not worth a log line every four minutes; the CRM
    // notices the gap on its own, which is the entire point of sending them.
    log.debug({ id: s.id, err: String(e?.message || e) }, "heartbeat failed");
  }
}

/** One timer per session, started when it connects and cleared when it dies. */
function startHeartbeat(s) {
  if (!s.observeOnly) return;
  clearInterval(s.heartbeatTimer);
  void sendHeartbeat(s);
  s.heartbeatTimer = setInterval(() => {
    void sendHeartbeat(s);
    checkStreamAlive(s);
    checkStuck(s);
  }, HEARTBEAT_MS);
}

async function flushObserved(s) {
  s.flushTimer = null;
  // Any of the three is worth a round trip. Calls and receipts arrive without
  // any message alongside them — a rep who only rang a buyer produces no
  // messages at all — so gating on s.pending alone would have made WhatsApp
  // calls invisible for exactly the reps who make the most of them.
  if (s.pending.length === 0 && s.pendingCalls.length === 0 && s.pendingReceipts.length === 0
      && s.pendingEdits.length === 0 && s.pendingContacts.length === 0
      && s.pendingPresence.length === 0 && s.pendingMedia.length === 0
      && s.pendingLidMap.length === 0) return;
  if (!INGEST_URL || !INGEST_SECRET) {
    // Said once per flush rather than silently dropping: a watcher with nowhere
    // to report looks identical to a rep who sent nothing.
    log.warn({ id: s.id, queued: s.pending.length }, "no INGEST_URL/BAILEYS_INGEST_SECRET — cannot report");
    return;
  }
  // Media makes a batch far heavier than it used to be — 200 voice notes in one
  // POST is tens of megabytes and an edge function that times out mid-import.
  // A batch carrying files is capped much lower, by payload rather than count.
  const carriesMedia = s.pending.some((m) => m.media_b64);
  const batch = s.pending.splice(0, carriesMedia ? MAX_MEDIA_BATCH : MAX_BATCH);
  const calls = s.pendingCalls.splice(0, MAX_BATCH);
  const receipts = s.pendingReceipts.splice(0, MAX_BATCH);
  const edits = s.pendingEdits.splice(0, MAX_BATCH);
  const contacts = s.pendingContacts.splice(0, MAX_BATCH);
  const presence = s.pendingPresence.splice(0, MAX_BATCH);
  // LID → phone number. Sent before anything else is read so the CRM can
  // re-key rows it stored while the number was still hidden.
  const lidmap = s.pendingLidMap.splice(0, MAX_BATCH);
  // Files are orders of magnitude bigger than any other row here, so a
  // media batch is capped by its own much smaller limit.
  const media = s.pendingMedia.splice(0, MAX_MEDIA_BATCH);
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
        edits,
        contacts,
        presence,
        media,
        lidmap,
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
    if (s.pendingMedia.length > 0 && !s.flushTimer) {
      s.flushTimer = setTimeout(() => flushObserved(s), 1500);
    }
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
    s.pendingEdits.unshift(...edits);
    s.pendingContacts.unshift(...contacts);
    s.pendingPresence.unshift(...presence);
    s.pendingMedia.unshift(...media);
    s.pendingLidMap.unshift(...lidmap);
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

// ── HOW WHATSAPP ADDRESSES PEOPLE NOW ───────────────────────────────────────
//
// THE BUG THESE FOUR LINES EXIST TO FIX.
//
// Every listener in this worker used to begin `if (!jid.endsWith(
// "@s.whatsapp.net")) return;`. That was correct for years: a one-to-one chat
// was addressed by phone number, and anything else was a group, a broadcast or
// a status update we did not want.
//
// WhatsApp has since moved accounts onto LID addressing — an opaque per-account
// id at "@lid" that does not reveal a phone number — and a migrated contact's
// one-to-one chat now arrives as `<lid>@lid`. Baileys decodes it faithfully
// (Utils/decode-wa-message.js: `if (isJidUser(from) || isLidUser(from))`), hands
// it to us, and the line above threw every one of them away.
//
// What that looked like from the outside, and cost a fortnight:
//
//   · Ankita's capture held 673 messages in August and 15 in September, then
//     nothing — "ye to sirf august tak ka data h". Not a sync that stopped: the
//     month her contacts finished migrating to LID.
//   · The re-link after that imported 1,106 messages in ten conversations, and
//     every single one was a GROUP — groups are still "@g.us" and sailed
//     through. "ye to khali group chat khol raha h."
//   · Three re-scans, none of which could have helped, because nothing was
//     wrong with the pairing.
//
// The fix is to accept "@lid" and then answer the question it hides: which
// phone number is this? WhatsApp tells us, on the stanza itself — `sender_pn`
// for a one-to-one chat and `participant_pn` inside a group, surfaced by
// Baileys as key.senderPn / key.participantPn. Those are recorded as they pass
// (noteLid) so a later message from the same person resolves even when the
// attribute is absent, and the mapping is shipped to the CRM so rows already
// stored under a LID can be re-keyed to the real number.
//
// When it cannot be resolved the conversation is still kept, flagged
// peer_is_lid. An unreadable number is a poor outcome; a missing conversation
// is a worse one, and the founder can still read what was said.

/** The number part of any WhatsApp address: 9199…@s.whatsapp.net, 1234@lid,
 *  9199…:3@s.whatsapp.net and 12036…@g.us all reduce to their digits. */
function jidDigits(jid) {
  const local = String(jid ?? "").split("@")[0].split(":")[0];
  // A GROUP ID IS NOT A NUMBER AND MUST NOT BE TREATED AS ONE.
  //
  // Modern groups are plain digits (120363…), but a group made years ago is
  // "<creator>-<timestamp>", hyphen and all. Stripping non-digits turned
  // 919991804787-1578638344 into 9199918047871578638344 — so the name
  // "Employes updation group" was filed under an id that matches none of that
  // group's 526 messages, and the conversation stayed called "Group chat"
  // while its name sat in the directory one row away.
  if (String(jid ?? "").endsWith("@g.us")) return local;
  return local.replace(/\D/g, "");
}
const isPnJid = (jid) => String(jid ?? "").endsWith("@s.whatsapp.net");
const isLidJid = (jid) => String(jid ?? "").endsWith("@lid");
const isGroupJid = (jid) => String(jid ?? "").endsWith("@g.us");
/** A person, however WhatsApp chose to address them. */
const isPersonJid = (jid) => isPnJid(jid) || isLidJid(jid);

/** Remember that this LID belongs to this phone number, and tell the CRM once. */
function noteLid(s, lidJid, pnJid) {
  const lid = jidDigits(lidJid);
  const phone = jidDigits(pnJid);
  if (!lid || !phone || lid === phone) return;
  if (s.lidPn.get(lid) === phone) return;
  s.lidPn.set(lid, phone);
  // The CRM re-keys anything it already stored under the LID. Without this a
  // buyer would sit in the dashboard as two separate conversations: the one
  // captured before the number was known, and the one after.
  s.pendingLidMap.push({ lid, phone });
}

/**
 * The phone number behind an address, or null when WhatsApp has not revealed it.
 * `hint` is the sender_pn / participant_pn WhatsApp attaches to LID stanzas.
 */
function phoneFor(s, jid, hint) {
  if (hint && jidDigits(hint)) { noteLid(s, jid, hint); return jidDigits(hint); }
  if (isPnJid(jid)) return jidDigits(jid) || null;
  if (isLidJid(jid)) return s.lidPn.get(jidDigits(jid)) ?? null;
  return null;
}

/**
 * Record a name for a number or a group, and let the CRM backfill it.
 *
 * `source` says how much to trust it, because three different things call
 * themselves a name here and only two of them are any good:
 *
 *   book   the name saved in the rep's own phone, or a group's real subject.
 *          Authoritative — it is what the rep sees on their handset.
 *   push   the display name WhatsApp attaches to a message. Whatever the
 *          sender chose to call themselves, and for an outbound message it is
 *          the REP's own name, which is how seven buyers ended up sharing one.
 *
 * The CRM keeps them apart and never lets a push name overwrite a book one.
 */
function noteName(s, key, name, source = "book") {
  const peer = jidDigits(key);
  const clean = String(name ?? "").trim().slice(0, 120);
  if (!peer || !clean) return;
  if (isGroupJid(key)) {
    if (s.groupNames.get(peer) === clean) return;
    s.groupNames.set(peer, clean);
  }
  s.pendingContacts.push({ peer, name: clean, source });
}

/**
 * ASK FOR THE NAMES INSTEAD OF WAITING FOR THEM.
 *
 * Both of these arrive on their own — but only on a FRESH LINK, in the initial
 * app-state sync. A worker that reconnects on existing credentials skips that
 * sync entirely (Socket/chats.js only runs it when syncState is Syncing), which
 * is why after four worker uploads the conversation list still read as bare
 * phone numbers and "Group chat" ten times over, while the rep's own handset
 * showed names for every one of them.
 *
 * So they are requested explicitly, once per connection:
 *
 *   groupFetchAllParticipating  every group this account is in, with its
 *                               subject, in a single query. The previous
 *                               approach asked for one group's metadata the
 *                               first time a message arrived in it, which meant
 *                               a quiet group stayed nameless indefinitely.
 *
 *   resyncAppState              re-delivers the address book as contacts.upsert,
 *                               so "917056208162" becomes whatever the rep has
 *                               that number saved as.
 *
 * Neither is allowed to fail the connection. A rep with no groups, or an
 * account WhatsApp declines to resync, still gets everything else.
 */
async function learnNames(s) {
  try {
    const groups = await s.sock?.groupFetchAllParticipating?.();
    let n = 0;
    for (const g of Object.values(groups ?? {})) {
      if (g?.id && g?.subject) { noteName(s, g.id, g.subject); n += 1; }
      if (g?.id) s.groupAsked.add(jidDigits(g.id));
    }
    if (n) log.info({ id: s.id, groups: n }, "group names fetched");
  } catch (e) {
    log.warn({ id: s.id, err: String(e?.message || e) }, "could not fetch group names");
  }

  try {
    // The collections that carry contacts and chats. critical_block is the
    // blocklist and is no use here.
    await s.sock?.resyncAppState?.(
      ["critical_unblock_low", "regular_high", "regular_low", "regular"], false,
    );
    log.info({ id: s.id }, "address book resynced");
  } catch (e) {
    log.warn({ id: s.id, err: String(e?.message || e) }, "could not resync the address book");
  }

  if (s.pendingContacts.length && !s.flushTimer) {
    s.flushTimer = setTimeout(() => flushObserved(s), FLUSH_MS);
  }
}

/**
 * Ask WhatsApp what a group is called. Once per group per session — it is a
 * network round trip, and a rep in forty groups should not produce forty
 * queries every time the socket reconnects.
 */
function askGroupName(s, jid) {
  const gid = jidDigits(jid);
  if (!gid || s.groupAsked.has(gid) || !s.sock?.groupMetadata) return;
  s.groupAsked.add(gid);
  void s.sock.groupMetadata(jid)
    .then((md) => { if (md?.subject) noteName(s, jid, md.subject); })
    .catch((e) => log.debug({ id: s.id, gid, err: String(e?.message || e) }, "no group metadata"));
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
    // Which re-link this session is on. The dashboard compares it with the
    // generation its reset returned, so a "connected" left over from the login
    // being replaced can never be mistaken for the rep having just scanned.
    gen: s.gen,
    // What we claimed to be, and where that claim came from. When WhatsApp
    // refuses a handshake these are the only two facts that matter, and until
    // now neither left the box.
    wa_version: s.state.waVersion,
    wa_version_source: s.state.waVersionSource,
    identity: s.state.identity,
    last_seen: s.state.lastSeen,
    queued: s.pending.length,
    queued_calls: s.pendingCalls.length,
    queued_receipts: s.pendingReceipts.length,
    // WHAT IS BEING THROWN AWAY, AND WHAT HAS BEEN WORKED OUT.
    //
    // A dropped message used to leave no trace anywhere, which is how "we only
    // accept @s.whatsapp.net" survived a full WhatsApp addressing change and a
    // fortnight of re-scans without anyone being able to see it. Both numbers
    // are one request away now.
    dropped: Object.fromEntries(s.dropped),
    lids_known: s.lidPn.size,
    groups_named: s.groupNames.size,
    // THE QUESTION THIS ANSWERS IN ONE REQUEST.
    //
    // "No one-to-one chats are showing up" has two opposite causes — nothing
    // arrived, or everything arrived and none of it could be opened. These two
    // numbers say which, and until now neither existed.
    undecryptable: [...s.undecryptable.values()].reduce((a, b) => a + b, 0),
    undecryptable_chats: s.undecryptable.size,
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
    // THE PROCESS BEING UP IS NOT THE SAME AS THE LINK BEING UP.
    //
    // This returned { ok, sessions, worker_version } — which answered 200 with
    // "sessions: 1" while that one session had been disconnected from WhatsApp
    // for fourteen hours. The only unauthenticated view of this worker was
    // therefore reassuring and wrong, and the CRM, which cannot reach the
    // bearer-protected /status, had nothing better to go on.
    //
    // Counts by state, and the last error. No rep id, no phone number, nothing
    // that identifies a person — this route has no bearer on purpose so it can
    // be pinged, and it must stay safe to leave open.
    const states = {};
    let lastError = null;
    for (const s of sessions.values()) {
      const k = s.state.status || "unknown";
      states[k] = (states[k] ?? 0) + 1;
      if (s.state.lastError) lastError = s.state.lastError;
    }
    return send(res, 200, {
      ok: true,
      sessions: sessions.size,
      states,
      last_error: lastError,
      worker_version: WORKER_VERSION,
    });
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
    // It tells WhatsApp to unlink the device, retires the session, and moves the
    // rep to a NEW credential folder, so the next request starts from nothing:
    // new QR, new link, and a history sync. Destructive by design — the rep must
    // scan again — so the dashboard asks first.
    //
    // Deliberately before getSession(): creating the session only to tear it
    // down would race the reconnect timer against the teardown.
    if (action === "reset" && req.method === "POST") {
      const existing = sessions.get(salespersonId);
      if (existing) {
        // LOG OUT FIRST, WHILE THERE IS STILL A SOCKET TO SAY IT ON.
        //
        // Deleting credentials only makes us forget the device; WhatsApp still
        // has it listed and will happily resume it if a copy of those keys
        // survives anywhere. logout() invalidates them at the source, which
        // also means the rep sees the old entry disappear from Linked devices
        // instead of accumulating one dead row per attempt. Best effort: it
        // throws when the socket is not open, and that is fine — the folder
        // move below is what actually guarantees the fresh start.
        if (existing.state.status === "connected") {
          try { await existing.sock?.logout?.(); } catch { /* not connected; nothing to unlink */ }
        }
        // Anything it saw but never delivered dies with it; the CRM keeps what
        // it already stored, and the fresh link re-sends the history anyway.
        destroySession(existing);
        sessions.delete(salespersonId);
      }

      // The old folder is left behind on purpose for a moment: a socket that is
      // still shutting down may write to it, and letting it do so harmlessly is
      // the entire trick. The new session reads a different path.
      const oldGen = existing?.gen ?? readGen(salespersonId);
      const nextGen = oldGen + 1;
      writeGen(salespersonId, nextGen);
      log.info({ id: salespersonId, from: oldGen, to: nextGen },
        "session reset — new credential generation, a fresh QR is on its way");

      // Start it again so a QR is already being generated by the time the
      // dashboard asks for one.
      const fresh = getSession(salespersonId, salespersonId);

      // Now sweep the folders this rep no longer uses. Late — after the new
      // session is already reading somewhere else — so a straggling write from
      // the old socket cannot land back in a path anybody cares about. Failing
      // to delete is untidy, never wrong, so it does not fail the request.
      void cleanOldAuthDirs(salespersonId, nextGen);

      return send(res, 200, { ok: true, status: "connecting", gen: fresh.gen });
    }

    const s = getSession(salespersonId, salespersonId);

    // LINK WITH A PHONE NUMBER INSTEAD OF A CAMERA.
    //
    // WhatsApp's own second option, and for this product it is the better one.
    // The QR has to survive a screenshot, a WhatsApp forward and a rep holding
    // one phone up to another screen, and it expires every twenty seconds while
    // that happens. An eight-character code can be read out over the phone.
    //
    // It is the same socket and the same pairing handshake — only the way the
    // rep proves they are there changes — so everything downstream (history
    // sync, groups, media) behaves identically.
    if (action === "paircode" && req.method === "POST") {
      const body = await readBody(req);
      const phone = String(body?.phone ?? "").replace(/\D/g, "");
      if (phone.length < 10) {
        return send(res, 400, { ok: false, error: "Give the rep's WhatsApp number with country code, e.g. 919310012981." });
      }
      if (s.sock?.authState?.creds?.registered) {
        return send(res, 409, { ok: false, error: "This rep is already linked. Press Re-scan first if you want to start over." });
      }

      // The socket has to be far enough along to send the request. A QR event
      // is Baileys telling us it is ready to pair, so that is the signal to
      // wait for rather than a guessed delay.
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline && !(s.sock && (s.state.status === "qr" || s.state.qrDataUrl))) {
        if (!s.sock && !s.starting) {
          void start(s).catch((e) => log.error({ id: s.id, err: String(e?.message || e) }, "start for pairing failed"));
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      if (!s.sock) {
        return send(res, 503, { ok: false, error: s.state.lastError || "The WhatsApp connection is not ready yet. Try again in a few seconds." });
      }

      try {
        const code = await s.sock.requestPairingCode(phone);
        s.pairingCode = String(code);
        s.pairingPhone = phone;
        s.state.lastError = null;
        log.info({ id: s.id, phone }, "pairing code issued");
        return send(res, 200, { ok: true, pair_code: s.pairingCode, phone });
      } catch (e) {
        const msg = String(e?.message || e);
        s.state.lastError = `Could not get a pairing code: ${msg}`;
        log.error({ id: s.id, err: msg }, "pairing code failed");
        return send(res, 502, { ok: false, error: s.state.lastError });
      }
    }

    if (action === "status") return send(res, 200, statusOf(s));
    if (action === "qr") {
      // HTML by default so the rep can just open the link; JSON on request for
      // the dashboard.
      s.lastQrRequestAt = Date.now();
      // Asked for while paused: start again so the panel gets a fresh square.
      if (!s.sock && !s.starting) {
        void start(s).catch((e) => log.error({ id: s.id, err: String(e?.message || e) }, "restart for QR failed"));
      }
      if (url.searchParams.get("format") === "json") {
        // THE REASON, NOT JUST THE ABSENCE.
        //
        // This used to answer with status and qr alone, so every distinct
        // failure — a version lookup that never returned, an unreadable auth
        // folder, a socket that threw on construction — reached the dashboard
        // as an empty qr and rendered as "Waiting for WhatsApp to offer a QR…".
        // The worker knew exactly what was wrong the whole time and had no way
        // to say it. worker_version rides along for the same reason: "is the
        // new build even running?" was costing a round trip through Hostinger's
        // panel every single time.
        return send(res, 200, {
          ok: true,
          status: s.state.status,
          qr: s.state.qrDataUrl,
          gen: s.gen,
          // The eight characters, when the admin chose the phone-number route.
          // Carried on the same poll as the QR so the panel needs one call.
          pair_code: s.pairingCode,
          error: s.state.lastError,
          worker_version: WORKER_VERSION,
          wa_version: s.state.waVersion,
          wa_version_source: s.state.waVersionSource,
        });
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
