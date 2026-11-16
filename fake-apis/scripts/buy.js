// Make one real x402 purchase from a fake endpoint and print what came back.
// Also a minimal reference for how the agent should pay.
//
//   npm run buy -- weather-api-1/current city=Austin
//   npm run buy -- crypto-api-3/price symbol=BTC
//
// Buyer key: BUYER_SECRET_KEY in .env (base58 or JSON byte array),
// otherwise the testBuyer from wallets.secret.json.

import "dotenv/config";
import fs from "node:fs";
import { createKeyPairSignerFromBytes, getBase58Encoder } from "@solana/kit";
import { wrapFetchWithPayment, x402Client, decodePaymentResponseHeader } from "@x402/fetch";
import { ExactSvmScheme } from "@x402/svm/exact/client";

const [endpointId, ...params] = process.argv.slice(2);
if (!endpointId) {
  console.error("usage: npm run buy -- <endpointId> [key=value ...]");
  process.exit(1);
}
const base = (process.env.FAKE_APIS_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/+$/, "");
const url = `${base}/${endpointId}?${new URLSearchParams(params.map((p) => p.split("=")))}`;

function loadBuyerSecret() {
  if (process.env.BUYER_SECRET_KEY) {
    const v = process.env.BUYER_SECRET_KEY.trim();
    return v.startsWith("[") ? new Uint8Array(JSON.parse(v)) : new Uint8Array(getBase58Encoder().encode(v));
  }
  const file = new URL("../wallets.secret.json", import.meta.url);
  if (!fs.existsSync(file)) throw new Error("No BUYER_SECRET_KEY and no wallets.secret.json (run npm run setup)");
  return new Uint8Array(JSON.parse(fs.readFileSync(file, "utf8")).testBuyer);
}

const signer = await createKeyPairSignerFromBytes(loadBuyerSecret());
const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const client = new x402Client().register("solana:*", new ExactSvmScheme(signer, { rpcUrl }));
const fetchWithPayment = wrapFetchWithPayment(fetch, client);

console.log(`buyer ${signer.address}\nGET ${url}`);
const started = Date.now();
const res = await fetchWithPayment(url);
const ms = Date.now() - started;
const body = await res.text();

console.log(`status ${res.status} in ${ms}ms`);
console.log(`body   ${body || "<empty>"}`);
const header = res.headers.get("PAYMENT-RESPONSE");
if (header) {
  const settle = decodePaymentResponseHeader(header);
  console.log(`paid   tx=${settle.transaction} success=${settle.success}`);
  console.log(`       https://explorer.solana.com/tx/${settle.transaction}?cluster=devnet`);
} else {
  console.log("paid   no (no PAYMENT-RESPONSE header)");
}
