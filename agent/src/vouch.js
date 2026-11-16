// How the agent talks to Vouch.
// Uses the real Vouch server if VOUCH_URL is set, otherwise the stand-in.
import { VOUCH_URL } from "./config.js";
import * as mock from "./mock-vouch.js";
import { signer, signText } from "./wallet.js";

export const usingMock = !VOUCH_URL;

// QuickNode needs a few seconds to report a payment to Vouch, so a rating sent
// right after paying may be "not verified yet". Retry this many times.
const RATE_RETRIES = 8;
const RATE_RETRY_MS = 3000;

// Must match server/src/signatures.js exactly.
const ratingMessage = ({ endpointId, paymentId, rating, reason }) =>
  ["vouch-rating-v1", endpointId, paymentId, rating, reason ?? ""].join("\n");

/** Trusted endpoints for a task, best first. Throws if Vouch can't be reached. */
export async function best(task) {
  if (usingMock) return mock.best(task);
  const res = await fetch(`${VOUCH_URL}/best?task=${encodeURIComponent(task)}`, {
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error(`Vouch /best -> HTTP ${res.status}`);
  const body = await res.json();
  return Array.isArray(body) ? body : [body]; // contract may return one endpoint or a ranked list
}

/**
 * Send a rating, signed by this agent's wallet (the wallet that paid).
 * Returns { status, body }.
 */
export async function rate({ endpointId, paymentId, rating, reason = null }) {
  if (usingMock) return mock.rate({ endpointId, paymentId, rating, reason });

  const body = JSON.stringify({
    endpointId,
    paymentId,
    rating,
    reason,
    rater: signer.address,
    signature: await signText(ratingMessage({ endpointId, paymentId, rating, reason })),
  });

  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${VOUCH_URL}/rate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: AbortSignal.timeout(5000),
    });
    const text = await res.text();
    const notVerifiedYet = res.status === 400 && text.includes("payment_not_verified");
    if (!notVerifiedYet || attempt > RATE_RETRIES) return { status: res.status, body: text };
    await new Promise((r) => setTimeout(r, RATE_RETRY_MS));
  }
}
