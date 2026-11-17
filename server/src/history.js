// Score history: every time an endpoint's score or label changes, remember the
// new value, what caused it, and the Solana proof. The /grok page shows these as
// "recent changes", so Grok (running a scheduled check) can tell users what got
// worse since it last looked and what to do about it.
import { scoreEndpoints } from "./scoring.js";
import { explorerTx } from "./solana.js";

const REASON_CODES = { empty: "empty", format: "format", sanity: "sanity", slow: "slow" };
const isTxSig = (s) => typeof s === "string" && /^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(s);

/** The latest recorded { score, label } per endpoint. */
function lastRecorded(db) {
  return Object.fromEntries(
    db.prepare(`
      SELECT h.endpoint_id, h.score, h.label FROM score_history h
      JOIN (SELECT endpoint_id, MAX(id) AS id FROM score_history GROUP BY endpoint_id) m ON m.id = h.id
    `).all().map((r) => [r.endpoint_id, { score: r.score, label: r.label }]),
  );
}

/**
 * Save the current score of every endpoint whose score or label changed since
 * the last record. Returns the changes saved.
 * @param {object} opts
 * @param {number} opts.defaultTestScore
 * @param {string} opts.cause           why it changed, in plain words
 * @param {string|null} [opts.proof]    Solana explorer link
 * @param {string|null} [opts.endpointId]  only this endpoint gets `cause`/`proof`; others get "recalculated"
 * @param {string} [opts.at]            ISO time (default now)
 * @param {string|null} [opts.asOf]     score as of this time (for replaying history)
 */
export function recordScoreChanges(db, { defaultTestScore, cause, proof = null, endpointId = null, at = new Date().toISOString(), asOf = null }) {
  const last = lastRecorded(db);
  const insert = db.prepare("INSERT INTO score_history (endpoint_id, score, label, cause, proof, at) VALUES (?, ?, ?, ?, ?, ?)");
  const saved = [];
  for (const s of scoreEndpoints(db, { defaultTestScore, asOf })) {
    const prev = last[s.endpointId];
    if (prev && prev.score === s.score && prev.label === s.label) continue;
    const mine = !endpointId || endpointId === s.endpointId;
    const why = !prev ? (cause === "baseline" ? "baseline" : "new API listed") : mine ? cause : "recalculated";
    insert.run(s.endpointId, s.score, s.label, why, mine ? proof : null, at);
    saved.push({ endpointId: s.endpointId, from: prev ?? null, to: { score: s.score, label: s.label }, cause: why });
  }
  return saved;
}

export function ratingCause(rating, reason) {
  return rating === "good" ? "agent rated GOOD" : `agent rated BAD (${REASON_CODES[reason] ?? "failed checks"})`;
}

/**
 * First run with existing data: rebuild the history by replaying every rating
 * and review in the order they happened. Does nothing if history already exists.
 */
export function backfillHistory(db, { defaultTestScore }) {
  if (db.prepare("SELECT COUNT(*) AS n FROM score_history").get().n > 0) return 0;
  const events = [
    ...db.prepare("SELECT endpoint_id AS endpointId, rating, reason, onchain_tx AS tx, created_at AS at FROM ratings").all()
      .map((r) => ({ ...r, cause: ratingCause(r.rating, r.reason), proof: isTxSig(r.tx) ? explorerTx(r.tx) : null })),
    ...db.prepare("SELECT endpoint_id AS endpointId, stars, created_at AS at FROM reviews").all()
      .map((r) => ({ ...r, cause: `human review ${r.stars}/5 stars`, proof: null })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  // Starting point: just before the first event, every endpoint at its test score.
  const start = events.length ? new Date(new Date(events[0].at).getTime() - 1).toISOString() : new Date().toISOString();
  let n = recordScoreChanges(db, { defaultTestScore, cause: "baseline", at: start, asOf: start }).length;
  for (const e of events) {
    n += recordScoreChanges(db, { defaultTestScore, cause: e.cause, proof: e.proof, endpointId: e.endpointId, at: e.at, asOf: e.at }).length;
  }
  return n;
}

/**
 * Recent changes, newest first, each with the score before it.
 * Leaves out "baseline" rows (the starting point, not a change).
 */
export function recentChanges(db, { limit = 15 } = {}) {
  const rows = db.prepare("SELECT * FROM score_history ORDER BY id").all();
  const prevByEndpoint = {};
  const changes = [];
  for (const r of rows) {
    const prev = prevByEndpoint[r.endpoint_id];
    prevByEndpoint[r.endpoint_id] = r;
    if (r.cause === "baseline") continue;
    changes.push({
      endpointId: r.endpoint_id,
      from: prev ? { score: prev.score, label: prev.label } : null,
      to: { score: r.score, label: r.label },
      cause: r.cause,
      proof: r.proof,
      at: r.at,
    });
  }
  return changes.reverse().slice(0, limit);
}
