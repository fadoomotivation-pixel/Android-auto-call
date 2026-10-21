// Guards supabase/functions/_shared/webpush.ts — the follow-up reminders of the
// /app web app. A wrong byte here does not error anywhere: the push service
// accepts the POST and the phone silently drops a message it cannot decrypt.
//
// The receiving side is written again, independently, with node:crypto (the
// browser's half of RFC 8291), and the VAPID JWT is checked with node:crypto.
// When written, the encryption was also checked against http_ece — the
// reference implementation the web-push npm package uses — 3/3 exact.
//
// Run: node --experimental-strip-types supabase/tests/webpush.test.mjs  (Node ≥ 22.6)
import crypto from "node:crypto";
import assert from "node:assert/strict";
import * as wp from "../functions/_shared/webpush.ts";

const hkdf = (salt, ikm, info, len) =>
  crypto.createHmac("sha256", crypto.createHmac("sha256", salt).update(ikm).digest())
    .update(Buffer.concat([info, Buffer.from([1])])).digest().subarray(0, len);

function browserDecrypt(body, ua, authSecret) {
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen);
  const ct = body.subarray(21 + idlen);
  const ecdh = ua.computeSecret(asPublic);
  const ikm = hkdf(authSecret, ecdh, Buffer.concat([Buffer.from("WebPush: info\0"), ua.getPublicKey(), asPublic]), 32);
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);
  const d = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const rec = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  assert.equal(rec[rec.length - 1], 2, "last-record delimiter");
  return rec.subarray(0, rec.length - 1).toString("utf8");
}

const ua = crypto.createECDH("prime256v1");
ua.generateKeys();
const authSecret = crypto.randomBytes(16);
const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/x", p256dh: ua.getPublicKey("base64url"), auth: authSecret.toString("base64url") };

for (const msg of ["", "hi", JSON.stringify({ title: "Call Ramesh now", body: "Booked for 3:00 PM · साइट देखनी है" }), "x".repeat(3000)]) {
  const body = Buffer.from(await wp.encryptPayload(sub, new TextEncoder().encode(msg)));
  assert.equal(body.readUInt32BE(16), 4096, "record size");
  assert.equal(browserDecrypt(body, ua, authSecret), msg);
}

const keys = await wp.generateVapidKeys();
assert.equal(wp.publicKeyFromJwk(keys.privateJwk), keys.publicKey);
const header = await wp.vapidAuthorization("https://web.push.apple.com/abc", keys, "mailto:support@callproai.in", 1_800_000_000);
const [, h, c, s, k] = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
const pub = crypto.createPublicKey({ key: { kty: "EC", crv: "P-256", x: keys.privateJwk.x, y: keys.privateJwk.y }, format: "jwk" });
assert.ok(crypto.verify("sha256", Buffer.from(`${h}.${c}`), { key: pub, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url")), "VAPID signature");
const claims = JSON.parse(Buffer.from(c, "base64url"));
assert.equal(claims.aud, "https://web.push.apple.com");
assert.equal(claims.exp, 1_800_000_000 + 12 * 3600);
assert.equal(k, keys.publicKey);

console.log("webpush: encryption and VAPID ok");
