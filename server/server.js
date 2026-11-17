// Starts the Vouch server.
//   npm start      (reads settings from .env, see .env.example)
import "dotenv/config";
import { openDb } from "./src/db.js";
import { createApp } from "./src/app.js";
import { syncCatalog } from "./src/catalog.js";
import { createChain, DEFAULT_PROGRAM_ID } from "./src/solana.js";
import { retryPendingOnChain } from "./src/stamp.js";
import { backfillHistory, recordScoreChanges } from "./src/history.js";

const config = {
  port: Number(process.env.PORT || 4000),
  fakeApisUrl: process.env.FAKE_APIS_URL || "http://localhost:3001",
  dbFile: process.env.DB_FILE || "vouch.db",
  qnStreamSecret: process.env.QN_STREAM_SECRET || "",
  webhookSecret: process.env.WEBHOOK_SECRET || "",
  adminToken: process.env.ADMIN_TOKEN || "",
  defaultTestScore: Number(process.env.DEFAULT_TEST_SCORE ?? 80),
  usdcMint: process.env.USDC_MINT || "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
};

if (!config.qnStreamSecret && !config.webhookSecret) {
  console.warn("WARNING: neither QN_STREAM_SECRET nor WEBHOOK_SECRET is set, so the webhook will refuse every payment.");
}

const db = openDb(config.dbFile);

// Solana program (optional: without a server key, ratings stay in the database only).
let chain = null;
if (process.env.SOLANA_SERVER_SECRET_KEY) {
  chain = createChain({
    rpcUrl: process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
    programId: process.env.VOUCH_PROGRAM_ID || DEFAULT_PROGRAM_ID,
    secretKey: JSON.parse(process.env.SOLANA_SERVER_SECRET_KEY),
  });
  const owner = await chain.configAuthority().catch(() => undefined);
  if (owner === null) console.warn("WARNING: the Vouch program isn't set up yet. Run: npm run chain:setup");
  else if (owner && owner !== chain.authority) console.warn(`WARNING: the program only accepts ratings from ${owner}, not this server's key ${chain.authority}.`);
  else if (owner) console.log(`Solana: writing ratings to program ${chain.programId} as ${chain.authority}`);
  // Catch up on ratings that didn't reach Solana (network hiccups, restarts).
  const catchUp = () => retryPendingOnChain(db, chain).catch((e) => console.warn(`[chain] retry failed: ${e.message}`));
  setTimeout(catchUp, 5_000).unref();
  setInterval(catchUp, 60_000).unref();
} else {
  console.warn("Solana: SOLANA_SERVER_SECRET_KEY not set, ratings are saved in the database only. Run: npm run chain:setup");
}

const app = createApp({ db, config, chain });

// Keep the endpoint list in sync with the fake APIs (they may start after us).
async function refreshCatalog() {
  try {
    const n = await syncCatalog(db, config.fakeApisUrl);
    return n;
  } catch (err) {
    console.warn(`Could not load catalog from ${config.fakeApisUrl} (${err.message}). Will retry.`);
    return 0;
  }
}
const n = await refreshCatalog();
// Score history for /grok "recent changes": rebuild it from past ratings on first run,
// then note any newly listed APIs after each catalog refresh.
const replayed = backfillHistory(db, { defaultTestScore: config.defaultTestScore });
if (replayed) console.log(`Score history: rebuilt ${replayed} entries from past ratings`);
const noteNewApis = () => recordScoreChanges(db, { defaultTestScore: config.defaultTestScore, cause: "new API listed" });
noteNewApis();
setInterval(async () => { await refreshCatalog(); noteNewApis(); }, 60_000).unref();

app.listen(config.port, () => {
  console.log(`Vouch server on http://localhost:${config.port}  (${n} endpoints loaded, db ${config.dbFile})`);
});
