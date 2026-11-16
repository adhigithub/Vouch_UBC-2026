// Runs filter.js locally against REAL devnet transactions, the same way QuickNode would.
//
//   node test-filter.js                 # sync check + latest payments into each endpoint
//   node test-filter.js <signature>     # one transaction
//   node test-filter.js <signature> --block
//                                       # the whole block that transaction landed in
//                                       # (closest to what the Stream sees; slower)
//
// Exits non-zero if filter.js is out of sync with fake-apis/wallets.json.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(join(here, ".env")); } catch {}
const RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

// Load filter.js exactly as pasted into QuickNode (no exports in that file).
const filterSrc = readFileSync(join(here, "filter.js"), "utf8");
const { main, DESTINATIONS, USDC_MINT } = new Function(
  `${filterSrc}\nreturn { main, DESTINATIONS, USDC_MINT };`
)();

const args = process.argv.slice(2);
const wholeBlock = args.includes("--block");
const signature = args.find((a) => !a.startsWith("--"));

checkSync();
if (signature) await runOne(signature);
else await runLatest();

// --- checks -----------------------------------------------------------------

function checkSync() {
  const wallets = JSON.parse(readFileSync(join(here, "..", "fake-apis", "wallets.json"), "utf8"));
  const problems = [];
  if (wallets.usdcMint !== USDC_MINT) problems.push(`mint: filter ${USDC_MINT}, wallets.json ${wallets.usdcMint}`);
  const expected = Object.entries(wallets.endpoints);
  for (const [id, w] of expected) {
    if (DESTINATIONS[w.usdcAta] !== w.address) problems.push(`${id}: ${w.usdcAta} -> ${w.address} missing or wrong`);
  }
  if (Object.keys(DESTINATIONS).length !== expected.length) problems.push("filter has extra destinations");
  if (problems.length) {
    console.error("filter.js is OUT OF SYNC with fake-apis/wallets.json:\n  " + problems.join("\n  "));
    process.exit(1);
  }
  console.log(`âœ“ filter.js matches wallets.json (${expected.length} endpoints)\n`);
}

async function runOne(sig) {
  const tx = await rpc("getTransaction", [sig, { encoding: "json", maxSupportedTransactionVersion: 1, commitment: "confirmed" }]);
  if (!tx) return console.log("transaction not found (wrong signature, or not confirmed yet)");

  let block;
  if (wholeBlock) {
    block = await rpc("getBlock", [tx.slot, { encoding: "json", maxSupportedTransactionVersion: 1, transactionDetails: "full", rewards: false, commitment: "confirmed" }]);
    console.log(`block ${tx.slot}: ${block.transactions.length} transactions`);
  } else {
    block = { blockTime: tx.blockTime, transactions: [{ transaction: tx.transaction, meta: tx.meta, version: tx.version }] };
  }
  // Same shape QuickNode sends: getBlock result in data[], batch info in metadata.
  const out = main({ data: [block], metadata: { batch_start_range: tx.slot, batch_end_range: tx.slot } });
  console.log(JSON.stringify(out, null, 2));
}

async function runLatest() {
  let found = 0;
  for (const ata of Object.keys(DESTINATIONS)) {
    const sigs = await rpc("getSignaturesForAddress", [ata, { limit: 2, commitment: "confirmed" }]);
    for (const s of sigs) {
      console.log(`--- ${s.signature.slice(0, 16)}â€¦ (into ${ata.slice(0, 8)}â€¦)`);
      await runOne(s.signature);
      found++;
    }
  }
  if (!found) console.log("No transactions touch the endpoint USDC accounts yet. Make a payment first:\n  cd fake-apis && npm run buy -- weather-api-1/current city=Austin");
}

async function rpc(method, params) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (res.status === 429 && attempt < 4) { await new Promise((r) => setTimeout(r, 1000 * (attempt + 1))); continue; }
    const body = await res.json();
    if (body.error) throw new Error(`${method}: ${body.error.message}`);
    return body.result;
  }
}
