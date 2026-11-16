// How an endpoint's 0-100 trust score is calculated (VOUCH.md section 7).
//
//   Score = 0.4 T + 0.3 A + 0.2 H + 0.1 R
//
//   T  tests             our tester bot's score (for now a fixed starting value)
//   A  agent checks      share of good agent ratings, recent + trusted raters count more
//   H  human reviews     average stars from verified payers, scaled to 0-100
//   R  repeat customers  share of paying wallets that came back for more
//
// Rules:
//   - a missing part (e.g. no human reviews yet) has its weight shared among the others
//   - test cap: ratings can only lift a score 10 points above T
//   - no agent ratings and no reviews yet -> score = T, labelled "unrated"
//   - agents won't pay below 60

export const WEIGHTS = { T: 0.4, A: 0.3, H: 0.2, R: 0.1 };
export const CUTOFF = 60;
export const TEST_CAP_MARGIN = 10;
// Each newer rating makes older ones count this much less, so an endpoint
// that breaks drops fast instead of coasting on its history.
export const RECENCY_DECAY = 0.8;
// R (repeat customers) only means something once several wallets have paid:
// with one or two first-time buyers, "nobody came back yet" isn't a signal,
// and counting it as 0 would rank proven-good endpoints below untried ones.
export const MIN_PAYERS_FOR_R = 3;

const round = (n) => Math.round(n);
const clamp = (n) => Math.max(0, Math.min(100, n));

/**
 * @param {object} input
 * @param {number} input.T                                   0-100
 * @param {{rating:"good"|"bad", weight:number}[]} input.ratings  oldest first
 * @param {{stars:number}[]} input.reviews                   1-5 stars
 * @param {Record<string, number>} input.paymentsByWallet    wallet -> payments to this endpoint
 */
export function computeScore({ T, ratings = [], reviews = [], paymentsByWallet = {} }) {
  const parts = { T: clamp(T), A: null, H: null, R: null };

  if (ratings.length) {
    let good = 0;
    let total = 0;
    ratings.forEach((r, i) => {
      const w = r.weight * RECENCY_DECAY ** (ratings.length - 1 - i);
      total += w;
      if (r.rating === "good") good += w;
    });
    parts.A = total > 0 ? (100 * good) / total : null;
  }

  if (reviews.length) {
    const avgStars = reviews.reduce((s, r) => s + r.stars, 0) / reviews.length;
    parts.H = ((avgStars - 1) / 4) * 100;
  }

  const wallets = Object.values(paymentsByWallet);
  if (wallets.length >= MIN_PAYERS_FOR_R) {
    parts.R = (100 * wallets.filter((n) => n >= 2).length) / wallets.length;
  }

  const unrated = !ratings.length && !reviews.length;
  let score;
  if (unrated) {
    score = parts.T;
  } else {
    const present = Object.keys(WEIGHTS).filter((k) => parts[k] !== null);
    const weightSum = present.reduce((s, k) => s + WEIGHTS[k], 0);
    score = present.reduce((s, k) => s + (WEIGHTS[k] / weightSum) * parts[k], 0);
    score = Math.min(score, parts.T + TEST_CAP_MARGIN);
  }
  score = round(clamp(score));

  return {
    score,
    label: unrated ? "unrated" : score >= CUTOFF ? "trusted" : "avoid",
    parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v === null ? null : round(v)])),
  };
}

/**
 * How much one rater's ratings count. Real agents buy from many endpoints;
 * a wallet that has only ever paid a single endpoint is suspicious
 * (VOUCH.md section 9), so it counts half.
 */
export function raterWeight(distinctEndpointsPaid) {
  return distinctEndpointsPaid >= 2 ? 1 : 0.5;
}

/** Score every endpoint from what's in the database. */
export function scoreEndpoints(db, { defaultTestScore }) {
  const endpoints = db.prepare("SELECT * FROM endpoints ORDER BY id").all();
  const testScores = Object.fromEntries(
    db.prepare("SELECT endpoint_id, score FROM test_scores").all().map((r) => [r.endpoint_id, r.score]),
  );
  // How many different endpoints each wallet has paid (for rater weight).
  const endpointsPaidBy = Object.fromEntries(
    db.prepare("SELECT from_wallet, COUNT(DISTINCT to_token_account) AS n FROM payments GROUP BY from_wallet").all()
      .map((r) => [r.from_wallet, r.n]),
  );

  const ratingsStmt = db.prepare("SELECT rater, rating FROM ratings WHERE endpoint_id = ? ORDER BY id");
  const reviewsStmt = db.prepare("SELECT stars FROM reviews WHERE endpoint_id = ? ORDER BY id");
  const payersStmt = db.prepare("SELECT from_wallet, COUNT(*) AS n FROM payments WHERE to_token_account = ? GROUP BY from_wallet");

  return endpoints.map((e) => {
    const ratings = ratingsStmt.all(e.id).map((r) => ({ rating: r.rating, weight: raterWeight(endpointsPaidBy[r.rater] ?? 0) }));
    const reviews = reviewsStmt.all(e.id);
    const paymentsByWallet = e.pay_to_ata
      ? Object.fromEntries(payersStmt.all(e.pay_to_ata).map((r) => [r.from_wallet, r.n]))
      : {};
    const T = testScores[e.id] ?? defaultTestScore;
    const result = computeScore({ T, ratings, reviews, paymentsByWallet });

    return {
      endpointId: e.id,
      api: e.api,
      task: e.task,
      url: e.url,
      price: e.price,
      schema: JSON.parse(e.schema_json),
      ...result,
      ratings: ratings.length,
      reviews: reviews.length,
      testScoreIsDefault: !(e.id in testScores),
    };
  });
}
