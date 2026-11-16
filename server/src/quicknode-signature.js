// Verifies that a webhook delivery really came from our QuickNode Stream.
// Copied from stream/verify-signature.js (quicknode-stream branch).
//
// QuickNode signs every delivery with HMAC-SHA256, keyed with the Stream's
// "Security token" (Stream settings in the dashboard):
//   X-QN-Signature = hex( HMAC_SHA256(token, nonce + timestamp + rawBody) )
// with nonce = X-QN-Nonce and timestamp = X-QN-Timestamp headers.
// rawBody is the JSON text exactly as received (after un-gzipping), NOT re-serialized.
import { createHmac, timingSafeEqual } from "node:crypto";

export const MAX_AGE_SECONDS = 5 * 60; // reject old deliveries (replay protection)

/**
 * @param {object} headers  lower-cased request headers (Node's req.headers)
 * @param {string} rawBody  the request body as a UTF-8 string
 * @param {string} token    the Stream's security token (QN_STREAM_SECRET)
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function verifyQuickNodeSignature(headers, rawBody, token) {
  if (!token) return { ok: false, reason: "QN_STREAM_SECRET not set" };
  const nonce = headers["x-qn-nonce"];
  const timestamp = headers["x-qn-timestamp"];
  const signature = headers["x-qn-signature"];
  if (!nonce || !timestamp || !signature) return { ok: false, reason: "missing X-QN-* headers" };

  const ts = Number(timestamp);
  if (Number.isFinite(ts) && Math.abs(Date.now() / 1000 - ts) > MAX_AGE_SECONDS) {
    return { ok: false, reason: "timestamp too old" };
  }

  const expected = createHmac("sha256", token).update(nonce + timestamp + rawBody).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(String(signature), "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "bad signature" };
  return { ok: true };
}

/** Signs a body the way QuickNode does. Used by send-sample.js for testing. */
export function signLikeQuickNode(rawBody, token) {
  const nonce = Math.random().toString(36).slice(2);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", token).update(nonce + timestamp + rawBody).digest("hex");
  return { "x-qn-nonce": nonce, "x-qn-timestamp": timestamp, "x-qn-signature": signature };
}
