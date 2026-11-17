// The /grok page that Grok Bot reads: it must recommend the right API, warn
// about bad ones with the reason and Solana proof, and never recommend an AVOID.
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderGrokPage, recommend } from "../src/grok.js";

const ep = (endpointId, task, score, label, price = 0.01, extra = {}) => ({
  endpointId, task, score, label, price, ratings: 0, reviews: 0,
  parts: { T: 80, A: null, H: null, R: null }, ...extra,
});
const scores = [
  ep("weather-good/current", "weather", 89, "trusted"),
  ep("weather-new/current", "weather", 80, "unrated", 0.02),
  ep("weather-junk/current", "weather", 46, "avoid", 0.01, { ratings: 1 }),
  ep("crypto-bad/price", "crypto-price", 30, "avoid"),
];
const ratings = [
  { endpointId: "weather-junk/current", rating: "bad", reason: "sanity", rater: "Ft84bfshg85DA5As9mcWUdKmvjBb3YQv59onpPHggQbZ", at: "2026-11-17T04:02:55.190Z", explorer: "https://explorer.solana.com/tx/PROOF?cluster=devnet" },
  { endpointId: "weather-good/current", rating: "good", reason: null, rater: "Ft84bfshg85DA5As9mcWUdKmvjBb3YQv59onpPHggQbZ", at: "2026-11-17T04:00:00.000Z", explorer: null },
];
const page = renderGrokPage({
  scores, ratings,
  payments: [{ endpointId: "weather-good/current", amount: 0.01, from: "Ft84bfshg85DA5As9mcWUdKmvjBb3YQv59onpPHggQbZ", receivedAt: "2026-11-17T04:00:00.000Z", source: "quicknode" }],
  chain: { programId: "PROGRAM", program: "https://explorer.solana.com/address/PROGRAM?cluster=devnet" },
  baseUrl: "https://vouch.example",
  now: new Date("2026-11-17T05:00:00Z"),
});

test("recommends the best non-AVOID API per task (score, then price)", () => {
  assert.equal(recommend(scores, "weather").endpointId, "weather-good/current");
  assert.match(page, /Weather: use weather-good\/current \(score 89, TRUSTED, \$0\.01 per call\)/);
});

test("never recommends an AVOID API, says so when nothing is safe", () => {
  assert.equal(recommend(scores, "crypto-price"), null);
  assert.match(page, /Crypto prices: no safe option right now/);
  assert.match(page, /crypto-bad\/price: score 30\. It failed Vouch's own tests \(test score 80\)\./);
});

test("warns about AVOID APIs with the reason and Solana proof", () => {
  assert.match(page, /- weather-junk\/current: score 46\. 1 agent rating\(s\) were bad: it returned data that didn't match reality\. Proof on Solana: https:\/\/explorer\.solana\.com\/tx\/PROOF/);
});

test("lists every API best first, with its breakdown", () => {
  const weather = page.slice(page.indexOf("ALL APIS: WEATHER"));
  assert.ok(weather.indexOf("weather-good") < weather.indexOf("weather-new"));
  assert.ok(weather.indexOf("weather-new") < weather.indexOf("weather-junk"));
  assert.match(page, /breakdown: tests 80, agent checks n\/a, human reviews n\/a, repeat buyers n\/a/);
});

test("shows recent ratings, QuickNode payments, and links for next steps", () => {
  assert.match(page, /2026-11-17 04:02 UTC {2}weather-junk\/current {2}BAD \(returned data that didn't match reality\)/);
  assert.match(page, /\(saving to Solana\)/); // rating not on-chain yet
  assert.match(page, /RECENT VERIFIED PAYMENTS/);
  assert.match(page, /\$0\.01 USDC to weather-good\/current from wallet Ft84…gQbZ {2}\(confirmed by QuickNode Stream\)/);
  assert.match(page, /https:\/\/vouch\.example\/best\?task=weather/);
  assert.match(page, /program PROGRAM\): https:\/\/explorer\.solana\.com\/address\/PROGRAM/);
});
