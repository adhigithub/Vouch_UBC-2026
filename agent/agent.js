// The Vouch agent: asks Vouch for a trusted endpoint, pays it, checks the data, rates it.
//
//   node agent.js weather city=Austin
//   node agent.js crypto-price symbol=BTC
//   node agent.js weather-forecast city=Tokyo
//
// Decision loop (VOUCH.md section 10):
//   1. get a task             2. ask Vouch for the best endpoints
//   3. check the safety limits 4. pay with x402
//   5. run the 4 checks        6. send the rating + payment ID to Vouch
//   7. if the data was bad, try the next-best endpoint (within budget and retry limit)
import { SAFETY, FALLBACK_ALLOWLIST, FAKE_APIS_URL, PAYMENTS } from "./src/config.js";
import * as vouch from "./src/vouch.js";
import { signer, buy } from "./src/wallet.js";
import { runChecks } from "./src/checks.js";

const usd = (n) => `$${n.toFixed(2)}`;

// The fake APIs' catalog says what each endpoint promises to return (used by check 2).
let catalogCache = null;
async function catalog() {
  if (!catalogCache) {
    const res = await fetch(`${FAKE_APIS_URL}/catalog`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`catalog -> HTTP ${res.status}`);
    catalogCache = await res.json();
  }
  return catalogCache;
}

/** Step 2: ask Vouch. If Vouch is down, fall back to the short allowlist. */
async function candidatesFor(task) {
  try {
    return { list: await vouch.best(task), fallback: false };
  } catch (err) {
    console.log(`  ! Vouch unreachable (${err.message}). Using the fallback allowlist only.`);
    const list = (await catalog())
      .filter((e) => e.task === task && FALLBACK_ALLOWLIST.includes(e.endpointId))
      .map((e) => ({ ...e, score: null, label: "allowlisted" }));
    return { list, fallback: true };
  }
}

/** Step 3: the safety limits. Returns why an endpoint is refused, or null if allowed. */
function refuse(c, spent, fallback) {
  if (!fallback && c.score < SAFETY.minScore) return `score ${c.score} is below the cutoff of ${SAFETY.minScore}`;
  if (c.price > SAFETY.maxPricePerCall) return `price ${usd(c.price)} is over the ${usd(SAFETY.maxPricePerCall)} per-call limit`;
  if (c.label === "unrated" && c.price > SAFETY.unratedMaxPrice) return `unrated, and price ${usd(c.price)} is over ${usd(SAFETY.unratedMaxPrice)}`;
  if (spent + c.price > SAFETY.budgetPerTask) return `would exceed the ${usd(SAFETY.budgetPerTask)} task budget`;
  return null;
}

export async function runTask(task, params = {}) {
  console.log(`\nTask: ${task} ${new URLSearchParams(params)}`);
  console.log(`  wallet ${signer.address} | payments ${PAYMENTS ? "ON (x402, Solana devnet)" : "OFF (free mode)"} | vouch ${vouch.usingMock ? "stand-in" : "server"}`);

  const { list, fallback } = await candidatesFor(task);
  if (!list.length) return console.log("  No endpoints known for this task."), null;

  let spent = 0;
  let badResults = 0;

  for (const c of list) {
    const scoreText = c.score == null ? c.label : `score ${c.score}, ${c.label}`;
    const why = refuse(c, spent, fallback);
    if (why) {
      console.log(`  - skip ${c.endpointId} (${scoreText}): ${why}`);
      continue;
    }

    // Step 4: pay and fetch
    console.log(`  > buy  ${c.endpointId} (${scoreText}, ${usd(c.price)})`);
    const url = `${c.url}?${new URLSearchParams(params)}`;
    let result;
    try {
      result = await buy(url);
    } catch (err) {
      result = { status: 0, body: "", ms: 0, paymentId: null, error: err.message };
    }
    if (result.paymentId) spent += c.price;

    // Step 5: the 4 checks
    const schema = c.schema || (await catalog()).find((e) => e.endpointId === c.endpointId)?.schema || {};
    const verdict = await runChecks(result, { task, schema, params });
    for (const r of verdict.results) {
      const mark = r.problem === "skipped" ? "·" : r.problem ? "x" : "✓";
      console.log(`      ${mark} ${r.check}${r.problem && r.problem !== "skipped" ? `: ${r.problem}` : ""}`);
    }
    const timing = result.paid ? `answer ${result.ms}ms incl. payment settlement, whole purchase ${result.totalMs}ms` : `${result.ms}ms`;
    console.log(`    = ${verdict.rating.toUpperCase()}${verdict.reason ? ` (bad: ${verdict.reason})` : ""}  [${timing}]`);

    // Step 6: rate it (only possible if we actually paid)
    if (result.paymentId) {
      const r = await vouch.rate({ endpointId: c.endpointId, paymentId: result.paymentId, rating: verdict.rating, reason: verdict.reason });
      console.log(`    rated -> ${r.status} ${r.body}${PAYMENTS ? `  (payment ${result.paymentId})` : ""}`);
    } else {
      console.log(`    not charged${result.error ? ` (${result.error})` : ""}, so nothing to rate`);
    }

    if (verdict.rating === "good") {
      console.log(`  Done. Spent ${usd(spent)}.`);
      return JSON.parse(result.body);
    }

    // Step 7: retry with the next-best endpoint, up to the limit
    badResults++;
    if (badResults > SAFETY.maxRetries) {
      console.log(`  Stopping: ${badResults} bad results (retry limit ${SAFETY.maxRetries}). Spent ${usd(spent)}.`);
      return null;
    }
  }

  console.log(`  No acceptable endpoint left. Spent ${usd(spent)}.`);
  return null;
}

// ---------- command line ----------

if (process.argv[1]?.endsWith("agent.js")) {
  const [task, ...rest] = process.argv.slice(2);
  if (!task) {
    console.log("usage: node agent.js <task> [key=value ...]\n  tasks: weather, weather-forecast, crypto-price");
    process.exit(1);
  }
  const params = Object.fromEntries(rest.map((p) => p.split("=")));
  const data = await runTask(task, params);
  if (data) console.log("\nResult:", JSON.stringify(data));
}
