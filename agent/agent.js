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
import { SAFETY, FALLBACK_ALLOWLIST, FAKE_APIS_URL, PAYMENTS, VOUCH_URL } from "./src/config.js";
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
  // Untried AND untested: only risk a small amount. Once Vouch's tester bot has
  // checked it (testScoreIsDefault false), the normal per-call limit applies.
  if (c.label === "unrated" && c.testScoreIsDefault !== false && c.price > SAFETY.unratedMaxPrice) {
    return `unrated and untested, and price ${usd(c.price)} is over ${usd(SAFETY.unratedMaxPrice)}`;
  }
  if (spent + c.price > SAFETY.budgetPerTask) return `would exceed the ${usd(SAFETY.budgetPerTask)} task budget`;
  return null;
}

const explorerTx = (sig) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

/** Who confirmed a payment ("quicknode" or "stand-in"), from Vouch's payment list. */
async function paymentSource(paymentId) {
  if (!VOUCH_URL) return null;
  try {
    const list = await (await fetch(`${VOUCH_URL}/payments?limit=50`, { signal: AbortSignal.timeout(3000) })).json();
    return list.find((p) => p.paymentId === paymentId)?.source ?? null;
  } catch {
    return null;
  }
}

/**
 * Run one task. Prints each step, and also reports it to `emit(event)` so the
 * website's Live Flow page can show it live (see runner.js and
 * LIVE_FLOW_GUIDE.md section 5 for the event list).
 */
export async function runTask(task, params = {}, emit = () => {}) {
  const send = (type, data = {}) => {
    try {
      emit({ type, at: new Date().toISOString(), ...data });
    } catch {
      // a listener problem must never stop the agent
    }
  };
  console.log(`\nTask: ${task} ${new URLSearchParams(params)}`);
  send("start", { task, params, wallet: signer.address, payments: PAYMENTS });
  console.log(`  wallet ${signer.address} | payments ${PAYMENTS ? "ON (x402, Solana devnet)" : "OFF (free mode)"} | vouch ${vouch.usingMock ? "stand-in" : "server"}`);

  const { list, fallback } = await candidatesFor(task);
  send("candidates", { fallback, list: list.map((c) => ({ endpointId: c.endpointId, score: c.score, label: c.label, price: c.price })) });
  if (!list.length) {
    console.log("  No endpoints known for this task.");
    send("failed", { reason: "no endpoints known for this task", spent: 0 });
    return null;
  }

  let spent = 0;
  let badResults = 0;

  for (const c of list) {
    const scoreText = c.score == null ? c.label : `score ${c.score}, ${c.label}`;
    const why = refuse(c, spent, fallback);
    if (why) {
      console.log(`  - skip ${c.endpointId} (${scoreText}): ${why}`);
      send("skip", { endpointId: c.endpointId, score: c.score, label: c.label, reason: why });
      continue;
    }

    // Step 4: pay and fetch
    console.log(`  > buy  ${c.endpointId} (${scoreText}, ${usd(c.price)})`);
    send("buy", { endpointId: c.endpointId, price: c.price, score: c.score, label: c.label });
    const url = `${c.url}?${new URLSearchParams(params)}`;
    let result;
    try {
      result = await buy(url);
    } catch (err) {
      result = { status: 0, body: "", ms: 0, paymentId: null, error: err.message };
    }
    if (result.paymentId) spent += c.price;
    if (result.paid) send("paid", { endpointId: c.endpointId, paymentId: result.paymentId, explorer: explorerTx(result.paymentId), ms: result.ms, spent });
    else send("not_charged", { endpointId: c.endpointId, status: result.status, error: result.error ?? null });

    // Step 5: the 4 checks
    const schema = c.schema || (await catalog()).find((e) => e.endpointId === c.endpointId)?.schema || {};
    const verdict = await runChecks(result, { task, schema, params });
    for (const r of verdict.results) {
      const mark = r.problem === "skipped" ? "·" : r.problem ? "x" : "✓";
      console.log(`      ${mark} ${r.check}${r.problem && r.problem !== "skipped" ? `: ${r.problem}` : ""}`);
    }
    const timing = result.paid ? `answer ${result.ms}ms incl. payment settlement, whole purchase ${result.totalMs}ms` : `${result.ms}ms`;
    console.log(`    = ${verdict.rating.toUpperCase()}${verdict.reason ? ` (bad: ${verdict.reason})` : ""}  [${timing}]`);
    send("checks", {
      endpointId: c.endpointId,
      results: verdict.results.map((r) => ({
        check: r.check,
        ok: !r.problem,
        skipped: r.problem === "skipped",
        problem: r.problem && r.problem !== "skipped" ? r.problem : null,
      })),
      rating: verdict.rating,
      reason: verdict.reason ?? null,
      ms: result.ms,
    });

    // Step 6: rate it (only possible if we actually paid)
    if (result.paymentId) {
      send("verifying", { paymentId: result.paymentId, attempt: 0 });
      const r = await vouch.rate(
        { endpointId: c.endpointId, paymentId: result.paymentId, rating: verdict.rating, reason: verdict.reason },
        { onWaiting: (attempt) => send("verifying", { paymentId: result.paymentId, attempt }) },
      );
      console.log(`    rated -> ${r.status} ${r.body}${PAYMENTS ? `  (payment ${result.paymentId})` : ""}`);
      let body = {};
      try {
        body = JSON.parse(r.body);
      } catch {
        // not JSON
      }
      if (r.status === 200) {
        send("verified", { paymentId: result.paymentId, source: await paymentSource(result.paymentId) });
        send("rated", {
          endpointId: c.endpointId,
          rating: verdict.rating,
          reason: verdict.reason ?? null,
          score: body.score ?? null,
          label: body.label ?? null,
          onchainTx: body.onchainTx ?? null,
          explorer: body.explorer ?? null,
        });
      } else {
        send("rate_failed", { endpointId: c.endpointId, paymentId: result.paymentId, status: r.status, error: body.error ?? r.body });
      }
    } else {
      console.log(`    not charged${result.error ? ` (${result.error})` : ""}, so nothing to rate`);
    }

    if (verdict.rating === "good") {
      console.log(`  Done. Spent ${usd(spent)}.`);
      const data = JSON.parse(result.body);
      send("done", { spent, endpointId: c.endpointId, result: data });
      return data;
    }

    // Step 7: retry with the next-best endpoint, up to the limit
    badResults++;
    if (badResults > SAFETY.maxRetries) {
      console.log(`  Stopping: ${badResults} bad results (retry limit ${SAFETY.maxRetries}). Spent ${usd(spent)}.`);
      send("failed", { reason: `${badResults} bad results (retry limit ${SAFETY.maxRetries})`, spent });
      return null;
    }
  }

  console.log(`  No acceptable endpoint left. Spent ${usd(spent)}.`);
  send("failed", { reason: "no acceptable endpoint left (the rest are below the cutoff, too expensive, or over budget)", spent });
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
