// The /grok page: Vouch's live state as plain text, written for Grok Bot on X
// (and any other AI assistant) to read, quote and act on.
//
// Grok can open a public link, so a user can say "@grok read <vouch>/grok, which
// weather API should my agent use?" or set a scheduled Grok task to watch it.
// Plain text with one fact per line is the easiest thing for an assistant to read
// correctly, so no HTML, no JavaScript, everything live from the database.

const REASONS = {
  empty: "returned nothing",
  format: "returned data in the wrong format",
  sanity: "returned data that didn't match reality",
  slow: "was too slow",
};

const TASK_NAMES = { weather: "Weather", "weather-forecast": "Weather forecasts", "crypto-price": "Crypto prices" };
const SOURCES = { quicknode: "confirmed by QuickNode Stream", "stand-in": "confirmed by Vouch's Solana watcher" };
const short = (s) => (s && s.length > 12 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s);
const money = (n) => `$${Number(n).toFixed(2)}`;
const LABEL = { trusted: "TRUSTED", avoid: "AVOID", unrated: "UNRATED" };

function partsLine(parts) {
  const name = { T: "tests", A: "agent checks", H: "human reviews", R: "repeat buyers" };
  return Object.entries(parts)
    .map(([k, v]) => `${name[k]} ${v === null ? "n/a" : v}`)
    .join(", ");
}

/** The endpoint an agent should buy from for a task: best score, then cheapest, never "avoid". */
export function recommend(scores, task) {
  return scores
    .filter((s) => s.task === task && s.label !== "avoid")
    .sort((a, b) => b.score - a.score || a.price - b.price)[0] ?? null;
}

/**
 * @param {object} d
 * @param {object[]} d.scores         scoreEndpoints() output
 * @param {object[]} d.ratings        recent ratings, newest first: { endpointId, rating, reason, rater, at, explorer }
 * @param {object[]} d.payments       recent verified payments, newest first: { endpointId, amount, from, receivedAt, source }
 * @param {object|null} d.chain       { programId, program } or null
 * @param {string} d.baseUrl          public address of this server
 * @param {Date} [d.now]
 */
export function renderGrokPage({ scores, ratings, payments, chain, baseUrl, now = new Date() }) {
  const out = [];
  const line = (s = "") => out.push(s);
  const tasks = [...new Set(scores.map((s) => s.task))].sort();

  line("VOUCH: live trust scores for paid APIs that AI agents buy from");
  line(`Updated: ${now.toISOString()} (this page is live, reload for the latest)`);
  line();
  line("Vouch is like Yelp for AI agents. Agents pay APIs small amounts of USDC on Solana for data,");
  line("then rate what they got. A rating only counts if it is tied to a real payment, confirmed by a");
  line("QuickNode Stream watching Solana, and every rating is stored permanently on Solana.");
  if (chain?.programId) line(`On-chain record (Solana devnet program ${chain.programId}): ${chain.program}`);
  line();

  line("HOW TO READ THE SCORES");
  line("- Score 0-100. 60 or more = TRUSTED. Under 60 = AVOID (agents using Vouch will not pay it).");
  line("- UNRATED = no buyer ratings yet; the score is only our own test score.");
  line("- Score = 40% tests + 30% agent checks + 20% human reviews + 10% repeat buyers.");
  line();

  line("RECOMMENDATIONS (what an agent should buy right now)");
  for (const task of tasks) {
    const best = recommend(scores, task);
    const name = TASK_NAMES[task] ?? task;
    line(best
      ? `- ${name}: use ${best.endpointId} (score ${best.score}, ${LABEL[best.label]}, ${money(best.price)} per call)`
      : `- ${name}: no safe option right now, every API for this task is flagged AVOID`);
  }
  line();

  const avoid = scores.filter((s) => s.label === "avoid").sort((a, b) => a.score - b.score);
  line("WARNINGS (do not use)");
  if (!avoid.length) line("- None right now.");
  for (const s of avoid) {
    const bad = ratings.filter((r) => r.endpointId === s.endpointId && r.rating === "bad");
    const why = [...new Set(bad.map((r) => REASONS[r.reason] ?? "failed agent checks"))];
    const proof = bad.find((r) => r.explorer)?.explorer;
    if (!bad.length) {
      line(`- ${s.endpointId}: score ${s.score}. It failed Vouch's own tests (test score ${s.parts.T}).`);
      continue;
    }
    line(`- ${s.endpointId}: score ${s.score}. ${bad.length} agent rating(s) were bad${why.length ? `: it ${why.join(" and ")}` : ""}.${proof ? ` Proof on Solana: ${proof}` : ""}`);
  }
  line();

  for (const task of tasks) {
    line(`ALL APIS: ${(TASK_NAMES[task] ?? task).toUpperCase()} (best first)`);
    scores
      .filter((s) => s.task === task)
      .sort((a, b) => b.score - a.score || a.price - b.price)
      .forEach((s, i) => {
        line(`${i + 1}. ${s.endpointId}: ${s.score} ${LABEL[s.label]}, ${money(s.price)} per call, ${s.ratings} agent rating(s), ${s.reviews} human review(s)`);
        line(`   breakdown: ${partsLine(s.parts)}`);
      });
    line();
  }

  line("RECENT AGENT RATINGS (newest first, each tied to a real payment)");
  if (!ratings.length) line("- None yet.");
  for (const r of ratings.slice(0, 10)) {
    const what = r.rating === "good" ? "GOOD" : `BAD (${REASONS[r.reason] ?? r.reason ?? "failed checks"})`;
    line(`- ${r.at.replace("T", " ").slice(0, 16)} UTC  ${r.endpointId}  ${what}  by wallet ${short(r.rater)}${r.explorer ? `  proof: ${r.explorer}` : "  (saving to Solana)"}`);
  }
  line();

  line("RECENT VERIFIED PAYMENTS (newest first, each one checked on Solana before it can be rated)");
  if (!payments.length) line("- None yet.");
  for (const p of payments.slice(0, 10)) {
    line(`- ${p.receivedAt.replace("T", " ").slice(0, 16)} UTC  ${money(p.amount)} USDC to ${p.endpointId ?? "unknown"} from wallet ${short(p.from)}${SOURCES[p.source] ? `  (${SOURCES[p.source]})` : ""}`);
  }
  line();

  line("WHAT YOU CAN DO");
  line(`- Building an agent? Ask Vouch before paying: ${baseUrl}/best?task=weather (ranked JSON, best first).`);
  line(`- Full data for every API: ${baseUrl}/scores`);
  line(`- One API in detail, with its ratings and Solana proof: ${baseUrl}/endpoints/<api>/<name>`);
  line("- If an API you use is listed under WARNINGS, switch to the recommendation for that task.");
  line("- Bought from one of these APIs yourself? You can leave a review, tied to your payment, so other buyers benefit.");

  return out.join("\n") + "\n";
}
