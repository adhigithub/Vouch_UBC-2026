// Score history: what /grok shows under RECENT CHANGES, so a scheduled Grok
// task can tell users what got worse since it last checked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb, upsertEndpoints, insertPayment, insertRating } from "../src/db.js";
import { recordScoreChanges, backfillHistory, recentChanges, ratingCause } from "../src/history.js";
import { renderGrokPage } from "../src/grok.js";
import { scoreEndpoints } from "../src/scoring.js";

const MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const OPTS = { defaultTestScore: 80 };

function setup() {
  const db = openDb();
  upsertEndpoints(db, [
    { id: "crypto-a/price", api: "crypto-a", task: "crypto-price", url: "x", price: 0.01, payTo: "A", payToTokenAccount: "ATA_A", schema: {} },
    { id: "crypto-b/price", api: "crypto-b", task: "crypto-price", url: "x", price: 0.01, payTo: "B", payToTokenAccount: "ATA_B", schema: {} },
  ]);
  return db;
}
const pay = (db, id, ata) => insertPayment(db, { paymentId: id, from: "AGENT", toTokenAccount: ata, mint: MINT, amountRaw: "10000" });
const rate = (db, endpointId, paymentId, rating, reason = null) => insertRating(db, { endpointId, paymentId, rater: "AGENT", rating, reason });

test("records only real changes, with the cause", () => {
  const db = setup();
  recordScoreChanges(db, { ...OPTS, cause: "baseline" });
  assert.equal(recordScoreChanges(db, { ...OPTS, cause: "nothing happened" }).length, 0);

  pay(db, "p1", "ATA_A");
  rate(db, "crypto-a/price", "p1", "bad", "sanity");
  const saved = recordScoreChanges(db, { ...OPTS, cause: ratingCause("bad", "sanity"), endpointId: "crypto-a/price", proof: "https://proof" });
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0].from, { score: 80, label: "unrated" });
  assert.equal(saved[0].to.label, "avoid");
  assert.equal(saved[0].cause, "agent rated BAD (sanity)");

  const [c] = recentChanges(db);
  assert.equal(c.endpointId, "crypto-a/price");
  assert.equal(c.proof, "https://proof");
  assert.equal(recentChanges(db).length, 1); // baseline rows are not "changes"
});

test("backfill replays past ratings in order, ending at today's scores", () => {
  const db = setup();
  pay(db, "p1", "ATA_A");
  rate(db, "crypto-a/price", "p1", "good");
  pay(db, "p2", "ATA_A");
  rate(db, "crypto-a/price", "p2", "bad", "format");
  db.prepare("UPDATE ratings SET created_at = CASE payment_id WHEN 'p1' THEN '2026-11-16T10:00:00.000Z' ELSE '2026-11-16T11:00:00.000Z' END").run();
  db.prepare("UPDATE payments SET received_at = '2026-11-16T09:00:00.000Z'").run();

  assert.ok(backfillHistory(db, OPTS) > 0);
  assert.equal(backfillHistory(db, OPTS), 0); // only once

  const changes = recentChanges(db);
  assert.equal(changes.length, 2);
  assert.equal(changes[1].cause, "agent rated GOOD");
  assert.equal(changes[1].from.label, "unrated");
  assert.equal(changes[0].cause, "agent rated BAD (format)");
  assert.equal(changes[0].at, "2026-11-16T11:00:00.000Z");
  const now = scoreEndpoints(db, OPTS).find((s) => s.endpointId === "crypto-a/price");
  assert.deepEqual(changes[0].to, { score: now.score, label: now.label });
});

test("/grok shows changes in plain words, flags NOW AVOID, and says what to switch to", () => {
  const db = setup();
  recordScoreChanges(db, { ...OPTS, cause: "baseline" });
  pay(db, "p1", "ATA_A");
  rate(db, "crypto-a/price", "p1", "bad", "sanity");
  recordScoreChanges(db, { ...OPTS, cause: ratingCause("bad", "sanity"), endpointId: "crypto-a/price", proof: "https://proof" });

  const page = renderGrokPage({
    scores: scoreEndpoints(db, OPTS), changes: recentChanges(db), ratings: [], payments: [], chain: null, baseUrl: "https://v",
  });
  assert.match(page, /STATUS: 2 APIs tracked, 1 flagged AVOID\. Last score change: .* \(crypto-a\/price\)/);
  assert.match(page, /FOR AI ASSISTANTS MONITORING THIS PAGE/);
  assert.match(page, /crypto-a\/price: 80 UNRATED -> \d+ AVOID, an agent rated it BAD: it returned data that didn't match reality {2}<-- NOW AVOID {2}proof: https:\/\/proof/);
  assert.match(page, /What to do: if your agent uses it, switch to crypto-b\/price/);
});
