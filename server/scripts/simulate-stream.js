// Stand-in for the QuickNode Stream until it's ready (and our fallback if
// Streams can't do devnet). It watches Solana for USDC payments into our
// endpoints' token accounts and POSTs them to the Vouch webhook in exactly
// the format the real Stream will use (PROJECT_STATUS.md section 5).
//
//   npm run simulate-stream            keep watching (every 5s)
//   npm run simulate-stream -- --once  report recent payments once and exit
//
// Settings (.env): WEBHOOK_SECRET, PORT or VOUCH_URL, SOLANA_RPC_URL, USDC_MINT, WALLETS_FILE
import "dotenv/config";
import fs from "node:fs";
import { Connection, PublicKey } from "@solana/web3.js";
import { paymentsFromTransaction } from "../src/parse-payment.js";

const VOUCH_URL = (process.env.VOUCH_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/+$/, "");
const SECRET = process.env.WEBHOOK_SECRET;
const MINT = process.env.USDC_MINT || "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const WALLETS_FILE = process.env.WALLETS_FILE || new URL("../../fake-apis/wallets.json", import.meta.url);
const INTERVAL_MS = 5000;
const once = process.argv.includes("--once");

if (!SECRET) {
  console.error("Set WEBHOOK_SECRET in server/.env (the same value the server uses).");
  process.exit(1);
}

const wallets = JSON.parse(fs.readFileSync(WALLETS_FILE, "utf8"));
const accounts = Object.entries(wallets.endpoints).map(([id, w]) => ({ id, ata: w.usdcAta }));
const tokenAccounts = new Set(accounts.map((a) => a.ata));
const conn = new Connection(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com", "confirmed");
const seen = new Set();
// The free public devnet RPC rate-limits bursts (429), so pace our calls.
// With a QuickNode devnet RPC URL in SOLANA_RPC_URL this can be much lower.
const PACE_MS = Number(process.env.RPC_PACE_MS || 400);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function send(payments) {
  const res = await fetch(`${VOUCH_URL}/webhook/quicknode`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-vouch-webhook-secret": SECRET },
    body: JSON.stringify({ payments }),
  });
  console.log(`sent ${payments.length} payment(s) -> ${res.status} ${await res.text()}`);
}

async function poll() {
  for (const { ata } of accounts) {
    const sigs = await conn.getSignaturesForAddress(new PublicKey(ata), { limit: 20 }, "confirmed");
    await pause(PACE_MS);
    const found = [];
    for (const s of sigs) {
      if (seen.has(s.signature)) continue;
      if (!s.err) {
        const tx = await conn.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
        await pause(PACE_MS);
        found.push(...paymentsFromTransaction(tx, { mint: MINT, tokenAccounts }));
      }
      seen.add(s.signature); // only after it was processed, so a failed lookup is retried next poll
    }
    if (found.length) await send(found); // send as we go, so one failure doesn't lose the rest
  }
}

console.log(`Watching ${accounts.length} endpoint USDC accounts on devnet -> ${VOUCH_URL}/webhook/quicknode`);
do {
  try {
    await poll();
  } catch (err) {
    console.warn(`poll failed: ${err.message}`);
  }
  if (!once) await new Promise((r) => setTimeout(r, INTERVAL_MS));
} while (!once);
