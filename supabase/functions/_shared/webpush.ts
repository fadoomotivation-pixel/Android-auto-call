// Web Push with nothing but WebCrypto: RFC 8291 message encryption (aes128gcm)
// and RFC 8292 VAPID. No npm package — web-push leans on node:crypto ECDH and
// node:https, which is exactly the kind of thing that deploys green on the edge
// runtime and then fails to boot.
//
// Checked against http_ece (the reference implementation the web-push package
// uses) when written, and guarded by supabase/tests/webpush.test.mjs, which
// decrypts with an independent node:crypto receiver and verifies the VAPID JWT.

export type PushSubscriptionKeys = { endpoint: string; p256dh: string; auth: string };
export type VapidKeys = { publicKey: string; privateJwk: JsonWebKey };

const te = new TextEncoder();

export function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function unb64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

/** A fresh VAPID key pair. The private half goes to Vault, never to a file. */
export async function generateVapidKeys(): Promise<VapidKeys> {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  return { publicKey: b64url(raw), privateJwk: await crypto.subtle.exportKey("jwk", kp.privateKey) };
}

/** The application server key a browser subscribes with: 0x04 || x || y. */
export function publicKeyFromJwk(jwk: JsonWebKey): string {
  return b64url(concat(new Uint8Array([4]), unb64url(jwk.x!), unb64url(jwk.y!)));
}

/** RFC 8292: `Authorization: vapid t=<jwt>, k=<public key>`. */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys, subject: string, nowSec = Math.floor(Date.now() / 1000)): Promise<string> {
  const header = b64url(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url(te.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: nowSec + 12 * 3600, sub: subject })));
  const input = `${header}.${claims}`;
  const key = await crypto.subtle.importKey("jwk", { ...keys.privateJwk, key_ops: ["sign"] },
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  // WebCrypto returns r||s (64 bytes), which is what JWS ES256 wants.
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, te.encode(input)));
  return `vapid t=${input}.${b64url(sig)}, k=${keys.publicKey}`;
}

/** RFC 8291 aes128gcm body for one subscription. One record; payloads here are tiny. */
export async function encryptPayload(sub: PushSubscriptionKeys, plaintext: Uint8Array,
  opts: { salt?: Uint8Array; senderKeys?: CryptoKeyPair } = {}): Promise<Uint8Array> {
  const uaPublic = unb64url(sub.p256dh);
  const authSecret = unb64url(sub.auth);
  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const as = opts.senderKeys ?? await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, as.privateKey, 256));

  // IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" 0x00 ua_public as_public, 32)
  const prkKey = await hmac(authSecret, ecdhSecret);
  const ikm = await hmac(prkKey, concat(te.encode("WebPush: info\0"), uaPublic, asPublic, new Uint8Array([1])));
  // CEK / NONCE = HKDF(salt, IKM, "Content-Encoding: …" 0x00, 16 / 12)
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(te.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(te.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);

  const key = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  // 0x02 marks the last (and only) record.
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(plaintext, new Uint8Array([2]))));

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ct);
}

export type SendResult = { ok: boolean; status: number; gone: boolean; body?: string };

/** POST one notification. `gone` = the browser unsubscribed; delete the row. */
export async function sendWebPush(sub: PushSubscriptionKeys, payload: unknown, keys: VapidKeys,
  subject: string, ttlSec = 3600): Promise<SendResult> {
  const body = await encryptPayload(sub, te.encode(JSON.stringify(payload)));
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidAuthorization(sub.endpoint, keys, subject),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(ttlSec),
      Urgency: "high",
    },
    body,
  });
  const text = res.ok ? undefined : (await res.text().catch(() => "")).slice(0, 300);
  return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410, body: text };
}
