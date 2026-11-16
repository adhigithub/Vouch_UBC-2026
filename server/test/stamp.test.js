// Saving ratings to the database + Solana, with a fake chain (no network needed).
import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb, ratingsPendingOnChain } from "../src/db.js";
import { stampRating, retryPendingOnChain } from "../src/stamp.js";
import { paymentSigBytes } from "../src/solana.js";

const TX = "5".repeat(88);
const rating = (paymentId, extra = {}) => ({ endpointId: "e/1", paymentId, rater: "R", rating: "good", reason: null, amountRaw: "10000", ...extra });
const chainThat = (fn) => ({ submitRating: async (r) => fn(r) });
const fail = (code, message = code) => () => { throw Object.assign(new Error(message), { code }); };
const row = (db, id) => db.prepare("SELECT onchain_tx, onchain_error FROM ratings WHERE payment_id = ?").get(id);

test("without a chain, ratings are saved in the database only", async () => {
  const db = openDb();
  assert.deepEqual(await stampRating(db, rating("p1")), { onchainTx: null, onchainError: null });
  assert.equal(row(db, "p1").onchain_tx, null);
});

test("a successful on-chain write records its transaction", async () => {
  const db = openDb();
  const r = await stampRating(db, rating("p1"), chainThat(() => TX));
  assert.equal(r.onchainTx, TX);
  assert.equal(row(db, "p1").onchain_tx, TX);
});

test("if Solana fails, the rating still counts and is retried later", async () => {
  const db = openDb();
  const r = await stampRating(db, rating("p1"), chainThat(fail(undefined, "429 Too Many Requests")));
  assert.equal(r.onchainTx, null);
  assert.match(row(db, "p1").onchain_error, /429/);

  assert.equal(ratingsPendingOnChain(db).length, 0); // too fresh: don't race the request writing it
  assert.equal(ratingsPendingOnChain(db, { minAgeMs: -1000 }).length, 1);

  db.prepare("UPDATE ratings SET created_at = '2000-01-01T00:00:00.000Z'").run();
  await retryPendingOnChain(db, chainThat(() => TX), () => {});
  assert.equal(row(db, "p1").onchain_tx, TX);
  assert.equal(row(db, "p1").onchain_error, null);
});

test("already on-chain and not-a-real-payment are final, not retried", async () => {
  const db = openDb();
  await stampRating(db, rating("p1"), chainThat(fail("already_on_chain")));
  await stampRating(db, rating("free-123"), chainThat(fail("not_a_tx_signature")));
  assert.equal(row(db, "p1").onchain_tx, "already-recorded");
  assert.equal(row(db, "free-123").onchain_tx, "skipped:not_a_tx_signature");
  assert.equal(ratingsPendingOnChain(db, { minAgeMs: -1000 }).length, 0);
});

test("a slow chain doesn't block the answer", async () => {
  const db = openDb();
  const slow = chainThat(() => new Promise((r) => setTimeout(() => r(TX), 300)));
  const r = await stampRating(db, rating("p1"), slow, { waitMs: 50 });
  assert.equal(r.onchainTx, null);
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(row(db, "p1").onchain_tx, TX); // finished in the background
});

test("payment IDs: real tx signatures are 64 bytes, others aren't", () => {
  assert.equal(paymentSigBytes("oUSzWq6nqaYrBhfg2xQrtAEPjCP4NFh82mtpQH6pXDhDMBF4gcFiG43FA7mfSKaYZG16h8YGqcxwsnM1EnLqNEK").length, 64);
  assert.equal(paymentSigBytes("free-abc"), null);
});
