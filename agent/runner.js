// Agent runner: lets the website's Live Flow page start the agent and watch
// each step live. The agent's wallet key never leaves this process.
//
//   node runner.js        (or: npm run runner)     http://localhost:4100
//
//   GET  /agent/health                 is it up, and is a run in progress?
//   GET  /agent/tasks                  ready-made demo tasks for the Run buttons
//   POST /agent/run   {task, params}   run the agent; the reply is a live stream of steps
//                                      (Server-Sent Events, one "data: {...}" line per step)
//   GET  /agent/last                   every step of the most recent run (e.g. after a page reload)
//   GET  /agent/modes                  which fake APIs are honest / scams right now
//   POST /agent/scam  {endpointId, mode}   make an API a scam ("sanity", "empty", ...) or honest ("good")
//   POST /agent/reset                  every API back to its normal mode
//   POST /agent/cheat {kind}           try to cheat Vouch; returns how Vouch blocked it
//   POST /agent/test-round             run the tester bot once over every API now (streamed like /agent/run)
//   GET  /agent/tester                 the background tester: interval, last/next round, latest results
//
// The tester bot also runs on its own every TEST_INTERVAL_SEC (default 120s, 0 = off),
// so scams get flagged and fixed APIs recover without anyone pressing anything.
//
// Event list and page design: LIVE_FLOW_GUIDE.md.
// Settings (.env): VOUCH_URL, FAKE_APIS_URL, PAYMENTS=on, RUNNER_PORT, FAKE_APIS_ADMIN_TOKEN, MAX_RUNS_PER_HOUR
import http from "node:http";
import { generateKeyPairSigner, getBase58Decoder, signBytes } from "@solana/kit";
import { runTask } from "./agent.js";
import { testRound } from "./tester.js";
import { FAKE_APIS_URL, VOUCH_URL } from "./src/config.js";
import { ratingMessage } from "./src/vouch.js";
import { makeWallet, signer, signText } from "./src/wallet.js";

const PORT = Number(process.env.RUNNER_PORT || 4100);
const ADMIN_TOKEN = process.env.FAKE_APIS_ADMIN_TOKEN || "";
// Each run spends real (devnet) USDC, so cap how often the website can start one.
const MAX_RUNS_PER_HOUR = Number(process.env.MAX_RUNS_PER_HOUR || 30);

const TASKS = [
  { id: "btc", label: "Bitcoin price", task: "crypto-price", params: { symbol: "BTC" } },
  { id: "eth", label: "Ethereum price", task: "crypto-price", params: { symbol: "ETH" } },
  { id: "sol", label: "Solana price", task: "crypto-price", params: { symbol: "SOL" } },
  { id: "austin", label: "Weather in Austin", task: "weather", params: { city: "Austin" } },
  { id: "tokyo", label: "Weather in Tokyo", task: "weather", params: { city: "Tokyo" } },
  { id: "forecast", label: "Forecast for London", task: "weather-forecast", params: { city: "London" } },
];
const ALLOWED_TASKS = new Set(TASKS.map((t) => t.task));

let running = false;
let testing = false;
let testerRound = 0;
let testerWallet = null; // the tester bot's own wallet (TESTER_SECRET_KEY), loaded on first use
const TEST_INTERVAL_SEC = Number(process.env.TEST_INTERVAL_SEC ?? 120);
const tester = { intervalSec: TEST_INTERVAL_SEC, lastRoundAt: null, nextRoundAt: null, lastResults: [], lastError: null };
let lastRun = [];
const runTimes = [];

// ---------- helpers ----------

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 10_000) throw new Error("body too large");
  }
  return raw ? JSON.parse(raw) : {};
}

// Only simple values like "BTC" or "New York", so nothing odd reaches the APIs.
function cleanParams(params) {
  const out = {};
  for (const [k, v] of Object.entries(params || {})) {
    if (/^[a-z]{1,20}$/i.test(k) && typeof v === "string" && /^[\w .-]{1,30}$/.test(v)) out[k] = v;
  }
  return out;
}

async function fakeApisAdmin(path, body) {
  const res = await fetch(`${FAKE_APIS_URL}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", ...(ADMIN_TOKEN ? { "x-admin-token": ADMIN_TOKEN } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(5000),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

// ---------- run the agent, streaming each step ----------

async function run(req, res) {
  const { task, params } = await readJson(req);
  if (!ALLOWED_TASKS.has(task)) return json(res, 400, { error: "unknown_task", allowed: [...ALLOWED_TASKS] });
  if (running) return json(res, 409, { error: "busy", hint: "One run at a time. Wait for the current run to finish." });
  const hourAgo = Date.now() - 3_600_000;
  while (runTimes.length && runTimes[0] < hourAgo) runTimes.shift();
  if (runTimes.length >= MAX_RUNS_PER_HOUR) return json(res, 429, { error: "too_many_runs", hint: `Limit is ${MAX_RUNS_PER_HOUR} runs per hour.` });

  running = true;
  runTimes.push(Date.now());
  lastRun = [];
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
  const emit = (event) => {
    lastRun.push(event);
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  try {
    await runTask(task, cleanParams(params), emit);
  } catch (err) {
    emit({ type: "failed", at: new Date().toISOString(), reason: `agent error: ${err.message}`, spent: null });
  } finally {
    running = false;
    res.end();
  }
}

// ---------- tester bot: one round over every API, streamed ----------

/** One tester round; `emit` receives each result. Shared by the button and the background schedule. */
async function runTesterRound(emit = () => {}) {
  testing = true;
  testerWallet ??= await makeWallet(JSON.parse(process.env.TESTER_SECRET_KEY));
  emit({ type: "test_start", wallet: testerWallet.signer.address });
  const results = [];
  try {
    const all = await testRound(testerWallet, testerRound++, (ev) => {
      if (ev.type === "test") results.push(ev);
      emit(ev);
    });
    emit({ type: "test_done", tested: all.length, failed: all.filter((r) => !r.passed).length });
    tester.lastError = null;
  } catch (err) {
    tester.lastError = err.message;
    emit({ type: "test_failed", reason: err.message });
  } finally {
    testing = false;
    tester.lastRoundAt = new Date().toISOString();
    if (results.length) tester.lastResults = results;
  }
}

async function testNow(req, res) {
  if (!process.env.TESTER_SECRET_KEY) return json(res, 503, { error: "tester_not_set_up", hint: "Run: node tester-setup.js" });
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
  const emit = (event) => !res.writableEnded && res.write(`data: ${JSON.stringify({ at: new Date().toISOString(), ...event })}

`);
  // A round is already going (e.g. the background one, which may have started before
  // an API was changed): queue a fresh round to start the moment it ends.
  if (testing) {
    emit({ type: "test_queued" });
    while (testing) await new Promise((r) => setTimeout(r, 500));
  }
  try {
    await runTesterRound(emit);
  } finally {
    res.end();
  }
}

// Background schedule: a round every TEST_INTERVAL_SEC, skipped if one is already running.
function scheduleTester() {
  if (!process.env.TESTER_SECRET_KEY || !TEST_INTERVAL_SEC) return;
  const tick = async () => {
    tester.nextRoundAt = new Date(Date.now() + TEST_INTERVAL_SEC * 1000).toISOString();
    if (!testing) {
      console.log(`[tester] background round at ${new Date().toISOString()}`);
      await runTesterRound();
    }
  };
  setTimeout(tick, 5000); // first round shortly after start
  tester.nextRoundAt = new Date(Date.now() + 5000).toISOString();
  setInterval(tick, TEST_INTERVAL_SEC * 1000);
}

// ---------- "try to cheat" demos ----------

// A recent payment this agent made and already rated (a real one, for the cheats that reuse it).
async function recentRatedPayment() {
  const list = await (await fetch(`${VOUCH_URL}/payments?limit=50`, { signal: AbortSignal.timeout(5000) })).json();
  return list.find((p) => p.from === signer.address && p.rated && p.endpointId);
}

async function postRating(rating) {
  const res = await fetch(`${VOUCH_URL}/rate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(rating),
    signal: AbortSignal.timeout(5000),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const signWith = async (kp, text) =>
  getBase58Decoder().decode(await signBytes(kp.keyPair.privateKey, new TextEncoder().encode(text)));

const CHEATS = {
  fake_payment: {
    title: "Rate with a made-up payment",
    attempt: "Post a rating for a payment that never happened.",
    async run() {
      const endpointId = "crypto-api-1/price";
      const paymentId = getBase58Decoder().decode(crypto.getRandomValues(new Uint8Array(64)));
      const msg = { endpointId, paymentId, rating: "good", reason: null };
      return postRating({ ...msg, rater: signer.address, signature: await signText(ratingMessage(msg)) });
    },
  },
  rate_twice: {
    title: "Rate the same payment twice",
    attempt: "Reuse a payment the agent already rated, to rate again.",
    async run(p) {
      const msg = { endpointId: p.endpointId, paymentId: p.paymentId, rating: "good", reason: null };
      return postRating({ ...msg, rater: signer.address, signature: await signText(ratingMessage(msg)) });
    },
  },
  steal_payment: {
    title: "Use someone else's payment",
    attempt: "A stranger copies the agent's public payment ID from Solana and rates with it.",
    async run(p) {
      const stranger = await generateKeyPairSigner();
      const msg = { endpointId: p.endpointId, paymentId: p.paymentId, rating: "bad", reason: "sanity" };
      return postRating({ ...msg, rater: stranger.address, signature: await signWith(stranger, ratingMessage(msg)) });
    },
  },
  forged_signature: {
    title: "Pretend to be the agent",
    attempt: "A stranger claims to be the agent's wallet, but signs with their own key.",
    async run(p) {
      const stranger = await generateKeyPairSigner();
      const msg = { endpointId: p.endpointId, paymentId: p.paymentId, rating: "bad", reason: "sanity" };
      return postRating({ ...msg, rater: signer.address, signature: await signWith(stranger, ratingMessage(msg)) });
    },
  },
};

const EXPLAIN = {
  payment_not_verified: "No real payment with this ID exists on Solana (QuickNode never reported it).",
  payment_already_used: "This payment already has a rating. One payment, one rating (Solana enforces this too).",
  not_the_payer: "Only the wallet that paid can rate. Payment IDs are public, so copying one doesn't help.",
  bad_signature: "The signature doesn't match the wallet it claims to be from.",
};

async function cheat(req, res) {
  const { kind } = await readJson(req);
  const c = CHEATS[kind];
  if (!c) return json(res, 400, { error: "unknown_cheat", kinds: Object.keys(CHEATS) });
  if (!VOUCH_URL) return json(res, 503, { error: "VOUCH_URL not set" });

  let payment = null;
  if (kind !== "fake_payment") {
    payment = await recentRatedPayment();
    if (!payment) return json(res, 409, { error: "no_rated_payment_yet", hint: "Run the agent once first, then try this cheat." });
  }
  const r = await c.run(payment);
  json(res, 200, {
    kind,
    title: c.title,
    attempt: c.attempt,
    blocked: r.status >= 400,
    status: r.status,
    error: r.body.error ?? null,
    explanation: EXPLAIN[r.body.error] ?? r.body.hint ?? null,
  });
}

// ---------- server ----------

http
  .createServer(async (req, res) => {
    const path = new URL(req.url, "http://x").pathname;
    try {
      if (req.method === "GET" && path === "/agent/health") return json(res, 200, { ok: true, running, wallet: signer.address });
      if (req.method === "GET" && path === "/agent/tasks") return json(res, 200, TASKS);
      if (req.method === "GET" && path === "/agent/last") return json(res, 200, lastRun);
      if (req.method === "POST" && path === "/agent/run") return await run(req, res);
      if (req.method === "POST" && path === "/agent/cheat") return await cheat(req, res);
      if (req.method === "POST" && path === "/agent/test-round") return await testNow(req, res);
      if (req.method === "GET" && path === "/agent/tester")
        return json(res, 200, { ...tester, running: testing, enabled: !!(process.env.TESTER_SECRET_KEY && TEST_INTERVAL_SEC) });
      if (req.method === "GET" && path === "/agent/modes") {
        const r = await fakeApisAdmin("/admin/modes");
        return json(res, r.status, r.body);
      }
      if (req.method === "POST" && path === "/agent/scam") {
        const { endpointId, mode } = await readJson(req);
        const r = await fakeApisAdmin("/admin/modes", { endpointId, mode });
        return json(res, r.status, r.body);
      }
      if (req.method === "POST" && path === "/agent/reset") {
        const r = await fakeApisAdmin("/admin/reset", {});
        return json(res, r.status, r.body);
      }
      json(res, 404, { error: "not_found" });
    } catch (err) {
      if (!res.headersSent) json(res, 500, { error: err.message });
      else res.end();
    }
  })
  .listen(PORT, () => {
    scheduleTester();
    console.log(`Agent runner on http://localhost:${PORT}  (wallet ${signer.address}, vouch ${VOUCH_URL || "stand-in"}, fake APIs ${FAKE_APIS_URL})`);
  });
