// Vouch fake APIs: practice x402 endpoints on Solana devnet, some good, some junk.
//
//   npm start                 payments ON (needs wallets.json, run `npm run setup` first)
//   PAYMENTS=off npm start    free mode, for building the agent without devnet funds

import "dotenv/config";
import express from "express";
import fs from "node:fs";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { ENDPOINTS, MODES, TASKS, pathFor } from "./src/catalog.js";
import { makeHandler } from "./src/handlers.js";
import { SUPPORTED_CITIES, SUPPORTED_SYMBOLS } from "./src/data.js";

const PORT = Number(process.env.PORT || 3001);
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/+$/, "");
const PAYMENTS = (process.env.PAYMENTS || "on").toLowerCase() !== "off";
const FACILITATOR_URL = process.env.FACILITATOR_URL || "https://x402.org/facilitator";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const SOLANA_DEVNET = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";
const WALLETS_FILE = new URL("./wallets.json", import.meta.url);

// ---------- wallets ----------

let wallets = { endpoints: {} };
if (fs.existsSync(WALLETS_FILE)) {
  wallets = JSON.parse(fs.readFileSync(WALLETS_FILE, "utf8"));
}
const missing = ENDPOINTS.filter((e) => !wallets.endpoints[e.id]);
if (PAYMENTS && missing.length) {
  console.error(
    `Missing wallets for: ${missing.map((e) => e.id).join(", ")}\n` +
      `Run "npm run setup" first, or start with PAYMENTS=off for free mode.`,
  );
  process.exit(1);
}
const payToOf = (id) => wallets.endpoints[id]?.address;
const endpointByPayTo = Object.fromEntries(ENDPOINTS.map((e) => [payToOf(e.id), e.id]));

// ---------- live modes (secret, flippable at runtime for demos) ----------

const modes = Object.fromEntries(ENDPOINTS.map((e) => [e.id, e.defaultMode]));

// ---------- recent payments (self-reported convenience log, NOT a source of truth) ----------

const recentPayments = [];
function logPayment(p) {
  recentPayments.unshift(p);
  recentPayments.length = Math.min(recentPayments.length, 200);
  console.log(`[paid] ${p.endpointId} <- ${p.payer} tx=${p.transaction}`);
}

// ---------- app ----------

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  const started = Date.now();
  res.on("finish", () => {
    if (req.path === "/health") return;
    const paid = req.get("PAYMENT-SIGNATURE") || req.get("X-PAYMENT") ? " (with payment)" : "";
    console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} in ${Date.now() - started}ms${paid}`);
  });
  next();
});

// Free routes: discovery + admin. Registered before the paywall so they are never charged.

const catalog = () =>
  ENDPOINTS.map((e) => ({
    endpointId: e.id,
    api: e.id.split("/")[0],
    task: e.task,
    method: "GET",
    url: PUBLIC_URL + pathFor(e.id),
    price: Number(e.price.replace("$", "")),
    description: e.description,
    params: TASKS[e.task].params,
    schema: TASKS[e.task].schema,
    network: SOLANA_DEVNET,
    asset: wallets.usdcMint || null,
    payTo: payToOf(e.id) || null,
    payToTokenAccount: wallets.endpoints[e.id]?.usdcAta || null,
  }));

app.get("/", (req, res) =>
  res.json({
    name: "Vouch fake APIs",
    payments: PAYMENTS ? "x402 on Solana devnet (USDC)" : "off (free mode)",
    routes: {
      "GET /catalog": "every paid endpoint with price, wallet and schema",
      "GET /health": "liveness",
      "GET /payments": "recent settled payments seen by this server",
      "GET /admin/modes": "current good/junk mode per endpoint (admin)",
      "POST /admin/modes": '{ "endpointId", "mode" } flip an endpoint live (admin)',
      "POST /admin/reset": "restore default modes (admin)",
    },
    supported: { cities: SUPPORTED_CITIES, symbols: SUPPORTED_SYMBOLS },
  }),
);
app.get("/health", (req, res) => res.json({ ok: true }));
app.get("/catalog", (req, res) => res.json(catalog()));
app.get("/payments", (req, res) => res.json(recentPayments));

function requireAdmin(req, res, next) {
  if (ADMIN_TOKEN && req.get("x-admin-token") !== ADMIN_TOKEN) {
    return res.status(401).json({ error: "bad or missing x-admin-token" });
  }
  next();
}
app.get("/admin/modes", requireAdmin, (req, res) => res.json(modes));
app.post("/admin/modes", requireAdmin, (req, res) => {
  const { endpointId, mode } = req.body || {};
  if (!(endpointId in modes)) return res.status(404).json({ error: `unknown endpointId ${endpointId}` });
  if (!MODES.includes(mode)) return res.status(400).json({ error: `mode must be one of ${MODES.join(", ")}` });
  console.log(`[admin] ${endpointId}: ${modes[endpointId]} -> ${mode}`);
  modes[endpointId] = mode;
  res.json({ endpointId, mode });
});
app.post("/admin/reset", requireAdmin, (req, res) => {
  for (const e of ENDPOINTS) modes[e.id] = e.defaultMode;
  res.json(modes);
});

// Paywall

if (PAYMENTS) {
  const resourceServer = new x402ResourceServer(new HTTPFacilitatorClient({ url: FACILITATOR_URL }))
    .register(SOLANA_DEVNET, new ExactSvmScheme())
    .onAfterSettle(async ({ result, requirements }) => {
      logPayment({
        endpointId: endpointByPayTo[requirements.payTo] || null,
        transaction: result.transaction,
        payer: result.payer,
        payTo: requirements.payTo,
        amount: requirements.amount,
        network: result.network,
        at: new Date().toISOString(),
      });
    });

  const routes = Object.fromEntries(
    ENDPOINTS.map((e) => [
      `GET ${pathFor(e.id)}`,
      {
        accepts: [{ scheme: "exact", price: e.price, network: SOLANA_DEVNET, payTo: payToOf(e.id) }],
        description: `${e.id}: ${e.description}`,
        mimeType: "application/json",
      },
    ]),
  );
  app.use(paymentMiddleware(routes, resourceServer));
}

for (const e of ENDPOINTS) {
  app.get(pathFor(e.id), makeHandler(e.task, () => modes[e.id]));
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Vouch fake APIs on ${PUBLIC_URL}  (payments: ${PAYMENTS ? "ON, " + FACILITATOR_URL : "OFF"})`);
  for (const e of ENDPOINTS) console.log(`  ${e.price.padEnd(6)} ${PUBLIC_URL}${pathFor(e.id)}`);
});
