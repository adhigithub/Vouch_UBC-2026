// Proving a rating came from the wallet that actually paid.
//
// Payment IDs are public on Solana, so without this anyone could grab someone
// else's payment ID and submit a rating with it. Instead, the paying wallet
// signs the rating with its secret key, and we check that signature against
// the payer's public address.
import crypto from "node:crypto";

// ---------- the exact text that gets signed ----------
// The agent builds the same text (agent/src/vouch.js). Change both together.

export const ratingMessage = ({ endpointId, paymentId, rating, reason }) =>
  ["vouch-rating-v1", endpointId, paymentId, rating, reason ?? ""].join("\n");

export const reviewMessage = ({ endpointId, paymentId, stars, comment }) =>
  ["vouch-review-v1", endpointId, paymentId, String(stars), comment ?? ""].join("\n");

// ---------- base58 (Solana's address/signature text format) ----------

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function base58Decode(text) {
  let n = 0n;
  for (const ch of text) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error("invalid base58");
    n = n * 58n + BigInt(i);
  }
  const bytes = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  for (const ch of text) {
    if (ch !== "1") break;
    bytes.unshift(0); // each leading "1" is a leading zero byte
  }
  return Uint8Array.from(bytes);
}

// ---------- ed25519 verification (Solana's signature scheme) ----------

// A raw 32-byte ed25519 public key wrapped in the standard DER header Node expects.
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/** True if `signatureB58` is `wallet`'s signature over `message`. Never throws. */
export function verifyWalletSignature(wallet, message, signatureB58) {
  try {
    const pub = base58Decode(wallet);
    const sig = base58Decode(signatureB58);
    if (pub.length !== 32 || sig.length !== 64) return false;
    const key = crypto.createPublicKey({ key: Buffer.concat([SPKI_PREFIX, pub]), format: "der", type: "spki" });
    return crypto.verify(null, Buffer.from(message, "utf8"), key, sig);
  } catch {
    return false;
  }
}
