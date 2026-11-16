// Starts the Vouch server.
//   npm start      (reads settings from .env, see .env.example)
import "dotenv/config";
import { openDb } from "./src/db.js";
import { createApp } from "./src/app.js";
import { syncCatalog } from "./src/catalog.js";

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
const app = createApp({ db, config });

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
setInterval(refreshCatalog, 60_000).unref();

app.listen(config.port, () => {
  console.log(`Vouch server on http://localhost:${config.port}  (${n} endpoints loaded, db ${config.dbFile})`);
});
