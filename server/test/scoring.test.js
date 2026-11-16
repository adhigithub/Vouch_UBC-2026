import { test } from "node:test";
import assert from "node:assert/strict";
import { computeScore, raterWeight } from "../src/scoring.js";

// Helpers: n ratings of one kind, from fully trusted raters.
const good = (n) => Array.from({ length: n }, () => ({ rating: "good", weight: 1 }));
const bad = (n) => Array.from({ length: n }, () => ({ rating: "bad", weight: 1 }));

test("VOUCH.md example: T=90 A=80 H=70 R=60 gives 80", () => {
  const r = computeScore({
    T: 90,
    // older good (weight 5, decayed x0.8 = 4) vs newest bad (weight 1): 4 / 5 = 80% good
    ratings: [{ rating: "good", weight: 5 }, { rating: "bad", weight: 1 }],
    reviews: [{ stars: 3.8 }], // (3.8 - 1) / 4 * 100 = 70
    paymentsByWallet: { a: 2, b: 2, c: 2, d: 1, e: 1 }, // 3 of 5 wallets came back = 60
  });
  assert.deepEqual(r.parts, { T: 90, A: 80, H: 70, R: 60 });
  assert.equal(r.score, 80); // 36 + 24 + 14 + 6
  assert.equal(r.label, "trusted");
});

test("unrated endpoint: score is just T, labelled unrated", () => {
  const r = computeScore({ T: 72 });
  assert.equal(r.score, 72);
  assert.equal(r.label, "unrated");
});

test("missing human reviews: their 20% is shared among T, A, R", () => {
  // (0.4*80 + 0.3*100 + 0.1*0) / 0.8 = 77.5 -> 78
  const r = computeScore({ T: 80, ratings: good(3), paymentsByWallet: { a: 1, b: 1, c: 1 } });
  assert.equal(r.parts.H, null);
  assert.equal(r.score, 78);
});

test("R is left out until 3 different wallets have paid", () => {
  const r = computeScore({ T: 80, ratings: good(2), paymentsByWallet: { a: 1, b: 1 } });
  assert.equal(r.parts.R, null);
  // (0.4*80 + 0.3*100) / 0.7 = 88.6, capped at T+10 = 90 -> 89
  assert.equal(r.score, 89);
  // ...so a proven-good endpoint ranks above an untried one (score = T = 80)
  assert.ok(r.score > computeScore({ T: 80 }).score);
});

test("test cap: perfect ratings can't lift a score more than 10 above T", () => {
  const r = computeScore({ T: 40, ratings: good(20), reviews: [{ stars: 5 }], paymentsByWallet: { a: 5, b: 5 } });
  assert.equal(r.score, 50);
  assert.equal(r.label, "avoid");
});

test("one bad rating drops a junk endpoint below the cutoff", () => {
  // Default T=80, one agent paid once and rated bad: (0.4*80 + 0.3*0) / 0.7 = 45.7 -> 46
  const r = computeScore({ T: 80, ratings: bad(1), paymentsByWallet: { agent: 1 } });
  assert.equal(r.score, 46);
  assert.equal(r.label, "avoid");
});

test("recent results count more: an endpoint that breaks drops fast", () => {
  const history = good(10);
  const before = computeScore({ T: 80, ratings: history, paymentsByWallet: { a: 10 } });
  const after = computeScore({ T: 80, ratings: [...history, ...bad(3)], paymentsByWallet: { a: 13 } });
  assert.ok(before.score >= 60);
  assert.ok(after.parts.A < 50, `A should collapse after 3 recent bad ratings, got ${after.parts.A}`);
  assert.ok(after.score < before.score - 15);
});

test("rater weight: wallets that only ever paid one endpoint count half", () => {
  assert.equal(raterWeight(1), 0.5);
  assert.equal(raterWeight(3), 1);
});
