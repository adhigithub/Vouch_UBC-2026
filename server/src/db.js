// The server's storage: one SQLite file (Node's built-in node:sqlite, no install).
//
//   endpoints    what can be bought (loaded from the fake APIs' /catalog)
//   payments     payments QuickNode confirmed really happened on Solana
//   ratings      agent good/bad ratings, one per payment
//   reviews      human 1-5 star reviews, one per payment
//   test_scores  the tester bot's latest score per endpoint (T)
//   score_history  every time an endpoint's score or label changed, and why (for /grok "recent changes")
import { DatabaseSync } from "node:sqlite";

export function openDb(file = ":memory:") {
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS endpoints (
      id            TEXT PRIMARY KEY,   -- "weather-api-1/current"
      api           TEXT NOT NULL,
      task          TEXT NOT NULL,      -- "weather", "crypto-price", ...
      url           TEXT NOT NULL,
      price         REAL NOT NULL,      -- USD
      pay_to        TEXT,               -- endpoint wallet
      pay_to_ata    TEXT,               -- endpoint's USDC token account (what payments land in)
      schema_json   TEXT NOT NULL DEFAULT '{}',
      updated_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
      payment_id         TEXT PRIMARY KEY, -- Solana transaction signature
      from_wallet        TEXT NOT NULL,    -- who paid (owner of the source USDC account)
      from_token_account TEXT,
      to_wallet          TEXT,
      to_token_account   TEXT NOT NULL,
      mint               TEXT NOT NULL,
      amount_raw         TEXT NOT NULL,    -- base units, 6 decimals for USDC
      slot               INTEGER,
      block_time         INTEGER,
      received_at        TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS payments_to ON payments(to_token_account);
    CREATE INDEX IF NOT EXISTS payments_from ON payments(from_wallet);

    CREATE TABLE IF NOT EXISTS ratings (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint_id  TEXT NOT NULL,
      payment_id   TEXT NOT NULL UNIQUE,  -- each payment can be rated once
      rater        TEXT NOT NULL,
      rating       TEXT NOT NULL CHECK (rating IN ('good', 'bad')),
      reason       TEXT,
      created_at   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ratings_endpoint ON ratings(endpoint_id);

    CREATE TABLE IF NOT EXISTS reviews (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint_id  TEXT NOT NULL,
      payment_id   TEXT NOT NULL UNIQUE,  -- each payment can be reviewed once
      reviewer     TEXT NOT NULL,
      stars        INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
      comment      TEXT,
      source       TEXT,                  -- "web" or "x"
      created_at   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS reviews_endpoint ON reviews(endpoint_id);

    CREATE TABLE IF NOT EXISTS score_history (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint_id  TEXT NOT NULL,
      score        INTEGER NOT NULL,
      label        TEXT NOT NULL,
      cause        TEXT NOT NULL,      -- e.g. "agent rated BAD (sanity)", "baseline"
      proof        TEXT,               -- Solana explorer link for the event, if any
      at           TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS score_history_endpoint ON score_history(endpoint_id, id);

    CREATE TABLE IF NOT EXISTS test_scores (
      endpoint_id  TEXT PRIMARY KEY,
      score        REAL NOT NULL,
      updated_at   TEXT NOT NULL
    );
  `);
  // Added with the Solana program: where each rating's on-chain copy is.
  const ratingCols = db.prepare("PRAGMA table_info(ratings)").all().map((c) => c.name);
  if (!ratingCols.includes("onchain_tx")) db.exec("ALTER TABLE ratings ADD COLUMN onchain_tx TEXT");       // tx signature once written
  if (!ratingCols.includes("onchain_error")) db.exec("ALTER TABLE ratings ADD COLUMN onchain_error TEXT"); // last failure, retried later
  // Who confirmed each payment: "quicknode" (the real Stream) or "stand-in" (scripts/simulate-stream.js).
  const paymentCols = db.prepare("PRAGMA table_info(payments)").all().map((c) => c.name);
  if (!paymentCols.includes("source")) db.exec("ALTER TABLE payments ADD COLUMN source TEXT");
  return db;
}

const now = () => new Date().toISOString();

// ---------- endpoints ----------

export function upsertEndpoints(db, list) {
  const stmt = db.prepare(`
    INSERT INTO endpoints (id, api, task, url, price, pay_to, pay_to_ata, schema_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET api=excluded.api, task=excluded.task, url=excluded.url,
      price=excluded.price, pay_to=excluded.pay_to, pay_to_ata=excluded.pay_to_ata,
      schema_json=excluded.schema_json, updated_at=excluded.updated_at
  `);
  for (const e of list) {
    stmt.run(e.id, e.api, e.task, e.url, e.price, e.payTo ?? null, e.payToTokenAccount ?? null, JSON.stringify(e.schema ?? {}), now());
  }
}

export const getEndpoint = (db, id) => db.prepare("SELECT * FROM endpoints WHERE id = ?").get(id);
export const listEndpoints = (db) => db.prepare("SELECT * FROM endpoints ORDER BY id").all();

// ---------- payments ----------

/** Returns true if the payment was new, false if we already had it. */
export function insertPayment(db, p, source = null) {
  const r = db
    .prepare(`
      INSERT OR IGNORE INTO payments
        (payment_id, from_wallet, from_token_account, to_wallet, to_token_account, mint, amount_raw, slot, block_time, received_at, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(p.paymentId, p.from, p.fromTokenAccount ?? null, p.to ?? null, p.toTokenAccount, p.mint, String(p.amountRaw), p.slot ?? null, p.blockTime ?? null, now(), source);
  return r.changes > 0;
}

export const getPayment = (db, id) => db.prepare("SELECT * FROM payments WHERE payment_id = ?").get(id);

// ---------- ratings + reviews ----------

export function insertRating(db, r) {
  db.prepare(`INSERT INTO ratings (endpoint_id, payment_id, rater, rating, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(r.endpointId, r.paymentId, r.rater, r.rating, r.reason ?? null, now());
}
export function markRatingOnChain(db, paymentId, { tx = null, error = null }) {
  db.prepare("UPDATE ratings SET onchain_tx = COALESCE(onchain_tx, ?), onchain_error = ? WHERE payment_id = ?").run(tx, error, paymentId);
}

/** Ratings not yet on-chain (Solana was down, or the server restarted mid-write). */
// Only ratings older than `minAgeMs`, so we don't race the /rate request that is writing it right now.
export const ratingsPendingOnChain = (db, { minAgeMs = 30_000, limit = 20 } = {}) =>
  db.prepare("SELECT r.*, p.amount_raw FROM ratings r LEFT JOIN payments p ON p.payment_id = r.payment_id WHERE r.onchain_tx IS NULL AND r.created_at < ? ORDER BY r.id LIMIT ?")
    .all(new Date(Date.now() - minAgeMs).toISOString(), limit);

export const ratingForPayment = (db, paymentId) => db.prepare("SELECT * FROM ratings WHERE payment_id = ?").get(paymentId);

export function insertReview(db, r) {
  db.prepare(`INSERT INTO reviews (endpoint_id, payment_id, reviewer, stars, comment, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(r.endpointId, r.paymentId, r.reviewer, r.stars, r.comment ?? null, r.source ?? null, now());
}
export const reviewForPayment = (db, paymentId) => db.prepare("SELECT * FROM reviews WHERE payment_id = ?").get(paymentId);

// ---------- test scores ----------

export function setTestScore(db, endpointId, score) {
  db.prepare(`
    INSERT INTO test_scores (endpoint_id, score, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(endpoint_id) DO UPDATE SET score=excluded.score, updated_at=excluded.updated_at
  `).run(endpointId, score, now());
}
