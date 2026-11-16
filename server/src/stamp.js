// Saving a rating that passed every check ("stamping" it).
//
// 1. Save it in SQLite: the score updates immediately.
// 2. Write it to the Vouch program on Solana: a public, permanent copy that
//    nobody (including us) can edit or delete, and that rejects a second rating
//    for the same payment.
//
// If Solana is slow or down, the rating still counts; it stays "pending" and
// retryPendingOnChain() writes it later. So the agent is never blocked by the chain.
import { insertRating, markRatingOnChain, ratingsPendingOnChain } from "./db.js";

/**
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {object} rating  { endpointId, paymentId, rater, rating, reason, amountRaw }
 * @param {ReturnType<import("./solana.js").createChain> | null} chain
 * @returns {Promise<{ onchainTx: string|null, onchainError: string|null }>}
 */
export async function stampRating(db, rating, chain = null, { waitMs = 15_000 } = {}) {
  insertRating(db, rating);
  if (!chain) return { onchainTx: null, onchainError: null };
  // Wait for Solana to confirm, but not forever: past waitMs the write keeps going
  // in the background (and records its tx when done), and we answer right away.
  let timer;
  const slow = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ onchainTx: null, onchainError: "still confirming on Solana" }), waitMs);
  });
  try {
    return await Promise.race([writeOnChain(db, rating, chain), slow]);
  } finally {
    clearTimeout(timer);
  }
}

async function writeOnChain(db, rating, chain) {
  try {
    const tx = await chain.submitRating(rating);
    markRatingOnChain(db, rating.paymentId, { tx });
    return { onchainTx: tx, onchainError: null };
  } catch (err) {
    // Final outcomes: don't retry these.
    if (err.code === "already_on_chain") {
      markRatingOnChain(db, rating.paymentId, { tx: "already-recorded" });
      return { onchainTx: "already-recorded", onchainError: null };
    }
    if (err.code === "not_a_tx_signature" || err.code === "BadEndpointId" || err.code === "ReasonTooLong") {
      markRatingOnChain(db, rating.paymentId, { tx: `skipped:${err.code}` });
      return { onchainTx: null, onchainError: err.code };
    }
    // Temporary (network, rate limit, out of SOL...): keep pending, retry later.
    markRatingOnChain(db, rating.paymentId, { error: String(err.message).slice(0, 300) });
    return { onchainTx: null, onchainError: err.message };
  }
}

/** Write any ratings that didn't make it on-chain yet. Safe to call repeatedly. */
export async function retryPendingOnChain(db, chain, log = console.log) {
  for (const r of ratingsPendingOnChain(db)) {
    const result = await writeOnChain(db, {
      endpointId: r.endpoint_id,
      paymentId: r.payment_id,
      rater: r.rater,
      rating: r.rating,
      reason: r.reason,
      amountRaw: r.amount_raw ?? 0,
    }, chain);
    if (result.onchainTx) log(`[chain] caught up ${r.endpoint_id} rating -> ${result.onchainTx.slice(0, 16)}...`);
  }
}
