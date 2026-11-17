// End-to-end tests of the server's rules, including the scams it must block.
// Runs against an in-memory database; no blockchain or fake APIs needed.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { openDb, upsertEndpoints } from "../src/db.js";
import { createApp } from "../src/app.js";
import { ratingMessage, reviewMessage } from "../src/signatures.js";
import { paymentsFromTransaction } from "../src/parse-payment.js";
import { signLikeQuickNode } from "../src/quicknode-signature.js";
import { gzipSync } from "node:zlib";

const MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const SECRET = "test-webhook-secret";
const ADMIN = "test-admin-token";
const QN_TOKEN = "test-quicknode-security-token";

// ---------- test wallets (real ed25519 keys, Solana-style base58 addresses) ----------

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58(bytes) {
  let n = BigInt("0x" + (Buffer.from(bytes).toString("hex") || "0"));
  let s = "";
  while (n > 0n) { s = ALPHABET[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; s = "1" + s; }
  return s;
}
function wallet() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const raw = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  return { address: b58(raw), sign: (text) => b58(crypto.sign(null, Buffer.from(text), privateKey)) };
}

const agent = wallet();
const stranger = wallet();
const owner = wallet(); // owns weather-good

// ---------- server under test ----------

let base, db, server;
after(() => server?.close());
before(async () => {
  db = openDb(":memory:");
  upsertEndpoints(db, [
    { id: "weather-good/current", api: "weather-good", task: "weather", url: "http://x/wg", price: 0.01, payTo: owner.address, payToTokenAccount: "ATA_GOOD", schema: {} },
    { id: "weather-junk/current", api: "weather-junk", task: "weather", url: "http://x/wj", price: 0.01, payTo: "JUNK_OWNER", payToTokenAccount: "ATA_JUNK", schema: {} },
    { id: "weather-pricey/current", api: "weather-pricey", task: "weather", url: "http://x/wp", price: 0.02, payTo: "P_OWNER", payToTokenAccount: "ATA_PRICEY", schema: {} },
    { id: "crypto-x/price", api: "crypto-x", task: "crypto-price", url: "http://x/c", price: 0.01, payTo: "C_OWNER", payToTokenAccount: "ATA_CRYPTO", schema: {} },
  ]);
  const app = createApp({ db, config: { qnStreamSecret: QN_TOKEN, webhookSecret: SECRET, adminToken: ADMIN, defaultTestScore: 80, usdcMint: MINT }, log: () => {} });
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://localhost:${server.address().port}`;
});

const post = async (path, body, headers = {}) => {
  const res = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};
const get = async (path) => (await fetch(base + path)).json();

const payment = (id, toAta, from = agent.address, amountRaw = "10000") =>
  ({ paymentId: id, from, toTokenAccount: toAta, to: "x", mint: MINT, amountRaw, amount: Number(amountRaw) / 1e6 });
const webhook = (payments, secret = SECRET) => post("/webhook/quicknode", { payments }, { "x-vouch-webhook-secret": secret });

function signedRating(w, { endpointId, paymentId, rating, reason = null }) {
  return { endpointId, paymentId, rating, reason, rater: w.address, signature: w.sign(ratingMessage({ endpointId, paymentId, rating, reason })) };
}

// ---------- webhook ----------

test("webhook: rejects calls without the shared secret (no faking 'verified' payments)", async () => {
  assert.equal((await webhook([payment("fake1", "ATA_GOOD")], "wrong")).status, 401);
  assert.equal((await post("/webhook/quicknode", { payments: [payment("fake2", "ATA_GOOD")] })).status, 401);
});

test("webhook: accepts our payments, ignores other mints/accounts, de-duplicates", async () => {
  const r = await webhook([
    payment("p-good-1", "ATA_GOOD"),
    payment("p-good-1", "ATA_GOOD"), // duplicate delivery
    { ...payment("p-other-mint", "ATA_GOOD"), mint: "SomeOtherToken" },
    payment("p-not-ours", "SOMEONE_ELSES_ATA"),
    payment("p-junk-1", "ATA_JUNK"),
    payment("p-cheap", "ATA_PRICEY", agent.address, "10000"), // 0.01 for a 0.02 endpoint
    payment("p-stranger", "ATA_GOOD", stranger.address),
  ]);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { received: 7, accepted: 4, duplicates: 1, ignored: 2 });
});

test("webhook: accepts deliveries signed by our QuickNode Stream (X-QN-Signature)", async () => {
  const raw = JSON.stringify({ payments: [payment("p-qn-1", "ATA_CRYPTO")] });
  const res = await fetch(base + "/webhook/quicknode", { method: "POST", headers: { "content-type": "application/json", ...signLikeQuickNode(raw, QN_TOKEN) }, body: raw });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).accepted, 1);
  const stored = (await get("/payments")).find((p) => p.paymentId === "p-qn-1");
  assert.equal(stored.source, "quicknode"); // remembered who confirmed it
});

test("webhook: gzip-compressed QuickNode deliveries work too", async () => {
  const raw = JSON.stringify({ payments: [payment("p-qn-gz", "ATA_CRYPTO")] });
  const res = await fetch(base + "/webhook/quicknode", {
    method: "POST",
    headers: { "content-type": "application/json", "content-encoding": "gzip", ...signLikeQuickNode(raw, QN_TOKEN) },
    body: gzipSync(raw),
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).accepted, 1);
});

test("webhook: rejects a wrong QuickNode signature or a body changed after signing", async () => {
  const raw = JSON.stringify({ payments: [payment("p-qn-forged", "ATA_CRYPTO")] });
  // Answered 200 (so QuickNode doesn't terminate the Stream) but nothing is stored.
  const forged = await fetch(base + "/webhook/quicknode", { method: "POST", headers: { "content-type": "application/json", ...signLikeQuickNode(raw, "not-our-token") }, body: raw });
  assert.equal((await forged.json()).accepted, 0);

  const tampered = raw.replace("10000", "99990000");
  const res = await fetch(base + "/webhook/quicknode", { method: "POST", headers: { "content-type": "application/json", ...signLikeQuickNode(raw, QN_TOKEN) }, body: tampered });
  const body = await res.json();
  assert.equal(body.accepted, 0);
  assert.equal(body.reason, "bad signature");

  // ...and the forged payment really wasn't stored: it can't be used to rate.
  const payments = await get("/payments");
  assert.ok(!payments.some((p) => p.paymentId === "p-qn-forged"));
});

// ---------- /rate: the scams ----------

test("rate: unknown endpoint -> 404", async () => {
  assert.equal((await post("/rate", signedRating(agent, { endpointId: "nope/x", paymentId: "p-good-1", rating: "good" }))).status, 404);
});

test("rate: made-up payment ID -> 400 payment_not_verified", async () => {
  const r = await post("/rate", signedRating(agent, { endpointId: "weather-good/current", paymentId: "never-happened", rating: "good" }));
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "payment_not_verified");
});

test("rate: a payment to one endpoint can't rate another -> 400", async () => {
  const r = await post("/rate", signedRating(agent, { endpointId: "weather-good/current", paymentId: "p-junk-1", rating: "good" }));
  assert.equal(r.body.error, "payment_for_different_endpoint");
});

test("rate: underpaid -> 400", async () => {
  const r = await post("/rate", signedRating(agent, { endpointId: "weather-pricey/current", paymentId: "p-cheap", rating: "good" }));
  assert.equal(r.body.error, "underpaid");
});

test("rate: unsigned -> 401", async () => {
  const r = await post("/rate", { endpointId: "weather-good/current", paymentId: "p-good-1", rating: "good", rater: agent.address });
  assert.equal(r.status, 401);
});

test("rate: someone else using the agent's public payment ID -> 403 not_the_payer", async () => {
  const r = await post("/rate", signedRating(stranger, { endpointId: "weather-good/current", paymentId: "p-good-1", rating: "bad" }));
  assert.equal(r.status, 403);
  assert.equal(r.body.error, "not_the_payer");
});

test("rate: claiming to be the payer with a forged signature -> 401 bad_signature", async () => {
  const forged = { ...signedRating(stranger, { endpointId: "weather-good/current", paymentId: "p-good-1", rating: "bad" }), rater: agent.address };
  const r = await post("/rate", forged);
  assert.equal(r.status, 401);
  assert.equal(r.body.error, "bad_signature");
});

test("rate: tampering with a signed rating (good -> bad) -> 401", async () => {
  const signed = signedRating(agent, { endpointId: "weather-good/current", paymentId: "p-good-1", rating: "good" });
  const r = await post("/rate", { ...signed, rating: "bad" });
  assert.equal(r.status, 401);
});

// ---------- /rate: the honest path ----------

test("rate: the real payer's signed rating is stamped; reusing the payment -> 409", async () => {
  const body = signedRating(agent, { endpointId: "weather-good/current", paymentId: "p-good-1", rating: "good" });
  const r = await post("/rate", body);
  assert.equal(r.status, 200);
  assert.equal(r.body.status, "stamped");

  assert.equal((await post("/rate", body)).status, 409);
  const flipped = signedRating(agent, { endpointId: "weather-good/current", paymentId: "p-good-1", rating: "bad" });
  assert.equal((await post("/rate", flipped)).status, 409);
});

test("rate: a bad rating sends a junk endpoint below the cutoff", async () => {
  const r = await post("/rate", signedRating(agent, { endpointId: "weather-junk/current", paymentId: "p-junk-1", rating: "bad", reason: "sanity" }));
  assert.equal(r.status, 200);
  assert.ok(r.body.score < 60, `expected < 60, got ${r.body.score}`);
  assert.equal(r.body.label, "avoid");
});

// ---------- /best + /scores ----------

test("best: ranks by score, then cheaper price; only the requested task", async () => {
  const list = await get("/best?task=weather");
  assert.deepEqual(list.map((e) => e.endpointId), ["weather-good/current", "weather-pricey/current", "weather-junk/current"]);
  assert.ok(list.every((e) => e.task === "weather"));
  assert.equal(list[1].label, "unrated");
  assert.equal((await get("/best?task=crypto-price")).length, 1);
});

test("scores: every endpoint with its parts", async () => {
  const all = await get("/scores");
  assert.equal(all.length, 4);
  const good = all.find((e) => e.endpointId === "weather-good/current");
  assert.equal(good.ratings, 1);
  assert.ok("T" in good.parts && "A" in good.parts);
});

test("grok: plain-text page with live scores for Grok Bot", async () => {
  const res = await fetch(base + "/grok");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/plain/);
  const text = await res.text();
  assert.match(text, /VOUCH: live trust scores/);
  assert.match(text, /weather-junk\/current: score \d+\. 1 agent rating\(s\) were bad/); // warned, from the real rating above
  assert.match(text, /Weather: use weather-good\/current/);
});

// ---------- /review ----------

test("review: verified payer can review once; owners can't review themselves", async () => {
  const ok = { endpointId: "weather-good/current", paymentId: "p-stranger", stars: 4, comment: "solid", source: "web", reviewer: stranger.address };
  ok.signature = stranger.sign(reviewMessage(ok));
  assert.equal((await post("/review", ok)).status, 200);
  assert.equal((await post("/review", ok)).status, 409);

  await webhook([payment("p-owner", "ATA_GOOD", owner.address)]);
  const self = { endpointId: "weather-good/current", paymentId: "p-owner", stars: 5, comment: "", reviewer: owner.address };
  self.signature = owner.sign(reviewMessage(self));
  const r = await post("/review", self);
  assert.equal(r.status, 403);
  assert.equal(r.body.error, "cannot_review_own_endpoint");

  assert.equal((await post("/review", { ...ok, paymentId: "p-owner", stars: 9 })).status, 400);
});

// ---------- admin ----------

test("admin: test score needs the token, and changes T", async () => {
  assert.equal((await post("/admin/test-score", { endpointId: "crypto-x/price", score: 30 })).status, 401);
  assert.equal((await post("/admin/test-score", { endpointId: "crypto-x/price", score: 30 }, { "x-admin-token": ADMIN })).status, 200);
  const c = (await get("/scores")).find((e) => e.endpointId === "crypto-x/price");
  assert.equal(c.score, 30);
  assert.equal(c.label, "unrated");
});

// ---------- payment parser (QuickNode stand-in) ----------

test("parser: finds the payer (transfer authority, not the fee payer) and ignores failed txs", () => {
  const tx = {
    slot: 1, blockTime: 2,
    transaction: {
      signatures: ["SIG1"],
      message: {
        accountKeys: [{ pubkey: "FEE_PAYER" }, { pubkey: "SRC_ATA" }, { pubkey: "ATA_GOOD" }],
        instructions: [
          { program: "spl-token", parsed: { type: "transferChecked", info: { source: "SRC_ATA", destination: "ATA_GOOD", authority: "AGENT", mint: MINT, tokenAmount: { amount: "10000" } } } },
        ],
      },
    },
    meta: { err: null, innerInstructions: [], postTokenBalances: [{ accountIndex: 2, mint: MINT, owner: "ENDPOINT_WALLET" }] },
  };
  const [p] = paymentsFromTransaction(tx, { mint: MINT, tokenAccounts: new Set(["ATA_GOOD"]) });
  assert.equal(p.paymentId, "SIG1");
  assert.equal(p.from, "AGENT");
  assert.equal(p.to, "ENDPOINT_WALLET");
  assert.equal(p.amountRaw, "10000");
  assert.equal(p.amount, 0.01);

  assert.equal(paymentsFromTransaction({ ...tx, meta: { ...tx.meta, err: { x: 1 } } }, { mint: MINT, tokenAccounts: new Set(["ATA_GOOD"]) }).length, 0);
  assert.equal(paymentsFromTransaction(tx, { mint: "OTHER", tokenAccounts: new Set(["ATA_GOOD"]) }).length, 0);
});
