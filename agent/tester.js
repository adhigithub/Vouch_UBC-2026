// The tester bot: Vouch's own inspector.
//
//   node tester.js            test every API now, then again every 15 minutes
//   node tester.js --once     one round, then exit
//
// Every round it buys once from every API with its OWN wallet (TESTER_SECRET_KEY,
// set up by tester-setup.js), runs the same 4 checks as the agent, and updates
// each API's test score T on the Vouch server:
//
//   passed -> T moves halfway up toward 100     (80 -> 90 -> 95 ...)
//   failed -> T moves halfway down toward 0     (80 -> 40 -> 20 ...)
//
// Before failing an API it re-tests it once: only a second failure counts, so a
// one-off hiccup (slow network, slow payment settlement) doesn't punish an honest API.
//
// So scams are caught before customers' agents pay them, and APIs that get fixed
// earn their way back (agents stop buying from an API below 60, so without the
// tester its score could never recover).
//
// Settings (.env): TESTER_SECRET_KEY, VOUCH_URL, FAKE_APIS_URL, VOUCH_ADMIN_TOKEN,
//                  TEST_INTERVAL_MIN (default 15)
import { FAKE_APIS_URL, VOUCH_URL } from "./src/config.js";
import { makeWallet } from "./src/wallet.js";
import { runChecks } from "./src/checks.js";

const ADMIN_TOKEN = process.env.VOUCH_ADMIN_TOKEN;
const INTERVAL_MIN = Number(process.env.TEST_INTERVAL_MIN || 15);
const once = process.argv.includes("--once");

// Inputs to test with, rotated each round.
const SAMPLES = {
  weather: [{ city: "Austin" }, { city: "Tokyo" }, { city: "London" }],
  "weather-forecast": [{ city: "London" }, { city: "Austin" }, { city: "Tokyo" }],
  "crypto-price": [{ symbol: "BTC" }, { symbol: "ETH" }, { symbol: "SOL" }],
};
const REASONS = { empty: "sent nothing", format: "sent data in the wrong format", sanity: "sent data that didn't match reality", slow: "was too slow" };

/** Move T halfway toward 100 (passed) or 0 (failed). */
export const nextTestScore = (prevT, passed) => Math.round((prevT + (passed ? 100 : 0)) / 2);

async function getJson(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status} ${body.error ?? ""}`);
  return body;
}

/**
 * Test every API once. `emit(event)` reports progress (used by the agent runner):
 * { type: "test", endpointId, passed, reason, from, to } or { type: "test_skipped", endpointId, why }.
 */
export async function testRound(wallet, round = 0, emit = () => {}) {
  if (!VOUCH_URL) throw new Error("VOUCH_URL is not set");
  if (!ADMIN_TOKEN) throw new Error("VOUCH_ADMIN_TOKEN is not set (same value as ADMIN_TOKEN in server/.env)");
  const catalog = await getJson(`${FAKE_APIS_URL}/catalog`);
  const scores = Object.fromEntries((await getJson(`${VOUCH_URL}/scores`)).map((s) => [s.endpointId, s]));
  const results = [];

  // Buy once and run the checks. Returns null if our own payment failed.
  async function check(e, params) {
    let result;
    try {
      result = await wallet.buy(`${e.url}?${new URLSearchParams(params)}`);
    } catch (err) {
      result = { status: 0, body: "", ms: 0, paid: false, error: err.message };
    }
    if (!result.paid && result.error) return { skipped: result.error };
    return { result, verdict: await runChecks(result, { task: e.task, schema: e.schema, params }) };
  }

  for (const e of catalog) {
    const samples = SAMPLES[e.task] ?? [{}];
    const params = samples[round % samples.length];
    let t = await check(e, params);
    // If our payment didn't go through (e.g. no connection to Solana), that's not
    // the API's fault: skip it this round instead of lowering its score.
    if (t.skipped) {
      console.log(`  ? ${e.endpointId}: couldn't test (${t.skipped})`);
      emit({ type: "test_skipped", endpointId: e.endpointId, why: t.skipped });
      continue;
    }
    // Failed? Double-check once with another input before marking it failed.
    let rechecked = false;
    if (t.verdict.rating !== "good") {
      const again = await check(e, samples[(round + 1) % samples.length]);
      if (!again.skipped) {
        t = again;
        rechecked = true;
      }
    }
    const { result, verdict } = t;
    const passed = verdict.rating === "good";
    const from = scores[e.endpointId]?.parts?.T ?? 80;
    const to = nextTestScore(from, passed);
    const why = passed
      ? rechecked ? "passed all 4 checks (on a re-test, after a one-off failure)" : "passed all 4 checks"
      : `failed twice: it ${REASONS[verdict.reason] ?? "failed a check"}`;
    await getJson(`${VOUCH_URL}/admin/test-score`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": ADMIN_TOKEN },
      body: JSON.stringify({ endpointId: e.endpointId, score: to, reason: `tester bot ${why} (test score ${from} -> ${to})` }),
    });
    console.log(`  ${passed ? "✓" : "✗"} ${e.endpointId.padEnd(24)} ${why.padEnd(48)} T ${from} -> ${to}`);
    const r = { endpointId: e.endpointId, passed, reason: verdict.reason ?? null, rechecked, from, to, paymentId: result.paymentId };
    results.push(r);
    emit({ type: "test", ...r });
  }
  return results;
}

// ---------- command line ----------

if (process.argv[1]?.endsWith("tester.js")) {
  if (!process.env.TESTER_SECRET_KEY) {
    console.error("TESTER_SECRET_KEY missing. Run: node tester-setup.js");
    process.exit(1);
  }
  const wallet = await makeWallet(JSON.parse(process.env.TESTER_SECRET_KEY));
  console.log(`Tester bot ${wallet.signer.address} -> ${VOUCH_URL} (APIs from ${FAKE_APIS_URL})`);
  for (let round = 0; ; round++) {
    console.log(`\nRound ${round + 1} at ${new Date().toISOString()}`);
    try {
      await testRound(wallet, round);
    } catch (err) {
      console.warn(`  round failed: ${err.message}`);
    }
    if (once) break;
    console.log(`Next round in ${INTERVAL_MIN} min`);
    await new Promise((r) => setTimeout(r, INTERVAL_MIN * 60_000));
  }
}
