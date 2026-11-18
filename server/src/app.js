// The Vouch server's web routes (API contract: VOUCH.md section 11, webhook: PROJECT_STATUS.md section 5).
//
//   GET  /best?task=weather     trusted endpoints for a task, best first
//   GET  /scores                every endpoint's score and its parts
//   GET  /endpoints/:api/:name  one endpoint's score + recent ratings
//   GET  /payments              recent verified payments (live feed)
//   POST /webhook/quicknode     QuickNode reports real payments (needs the shared secret)
//   POST /rate                  agent rating, tied to a verified payment and signed by the payer
//   POST /review                human 1-5 star review, same rules
//   POST /admin/test-score      set an endpoint's test score T (tester bot; needs ADMIN_TOKEN)
import crypto from "node:crypto";
import express from "express";
import {
  getEndpoint, getPayment, insertPayment, insertReview, listEndpoints,
  ratingForPayment, reviewForPayment, setTestScore,
} from "./db.js";
import { scoreEndpoints } from "./scoring.js";
import { ratingMessage, reviewMessage, verifyWalletSignature } from "./signatures.js";
import { stampRating } from "./stamp.js";
import { verifyQuickNodeSignature } from "./quicknode-signature.js";
import { explorerAddress, explorerTx } from "./solana.js";
import { renderGrokPage } from "./grok.js";
import { recordScoreChanges, ratingCause, recentChanges } from "./history.js";

const USDC_DECIMALS = 6;
// A real Solana transaction signature (not "already-recorded" / "skipped:...").
const isTxSig = (s) => typeof s === "string" && /^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(s);

/** Constant-time string compare, so the secret can't be guessed by timing responses. */
function sameSecret(given, expected) {
  const a = Buffer.from(String(given ?? ""));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * @param {object} deps
 * @param {import("node:sqlite").DatabaseSync} deps.db
 * @param {object} deps.config  { qnStreamSecret, webhookSecret, adminToken, defaultTestScore, usdcMint }
 * @param {(msg:string)=>void} [deps.log]
 * @param {ReturnType<import("./solana.js").createChain> | null} [deps.chain]  Solana program client (null = database only)
 */
export function createApp({ db, config, log = console.log, chain = null }) {
  const app = express();
  // The webhook reads its own raw body (for the QuickNode signature), so skip it here.
  const json = express.json({ limit: "1mb" });
  app.use((req, res, next) => (req.path === "/webhook/quicknode" ? next() : json(req, res, next)));

  const scores = () => scoreEndpoints(db, { defaultTestScore: config.defaultTestScore });
  const fail = (res, status, error, extra = {}) => res.status(status).json({ error, ...extra });
  // Remember score changes (for /grok "recent changes"). Never let this break a request.
  const noteChange = (opts) => {
    try {
      for (const c of recordScoreChanges(db, { defaultTestScore: config.defaultTestScore, ...opts })) {
        if (c.from) log(`[score] ${c.endpointId}: ${c.from.score} ${c.from.label} -> ${c.to.score} ${c.to.label} (${c.cause})`);
      }
    } catch (err) {
      log(`[score] could not record history: ${err.message}`);
    }
  };

  // Shared checks for /rate and /review: is this a real, verified payment to this endpoint, by this wallet?
  function checkPayment(req, res, { signer, message, signature }) {
    const { endpointId, paymentId } = req.body || {};
    const endpoint = getEndpoint(db, endpointId);
    if (!endpoint) return fail(res, 404, "unknown_endpoint");
    if (typeof paymentId !== "string" || !paymentId) return fail(res, 400, "missing_payment_id");

    const payment = getPayment(db, paymentId);
    if (!payment) return fail(res, 400, "payment_not_verified", { hint: "No confirmed payment with this ID yet. If you just paid, retry in a few seconds." });
    if (payment.to_token_account !== endpoint.pay_to_ata) return fail(res, 400, "payment_for_different_endpoint");
    const priceRaw = BigInt(Math.round(endpoint.price * 10 ** USDC_DECIMALS));
    if (BigInt(payment.amount_raw) < priceRaw) return fail(res, 400, "underpaid");

    if (!signature) return fail(res, 401, "signature_required");
    if (signer !== payment.from_wallet) return fail(res, 403, "not_the_payer", { hint: "Only the wallet that paid can rate this payment." });
    if (!verifyWalletSignature(signer, message, signature)) return fail(res, 401, "bad_signature");

    return { endpoint, payment };
  }

  // ---------- reads ----------

  app.get("/health", (req, res) => res.json({ ok: true }));

  app.get("/best", (req, res) => {
    const task = String(req.query.task || "");
    if (!task) return fail(res, 400, "missing_task");
    const ranked = scores()
      .filter((s) => s.task === task)
      .sort((a, b) => b.score - a.score || a.price - b.price); // price breaks ties
    res.json(ranked);
  });

  app.get("/scores", (req, res) => res.json(scores()));

  app.get("/endpoints/:api/:name", (req, res) => {
    const id = `${req.params.api}/${req.params.name}`;
    const s = scores().find((x) => x.endpointId === id);
    if (!s) return fail(res, 404, "unknown_endpoint");
    const recentRatings = db.prepare("SELECT payment_id AS paymentId, rater, rating, reason, created_at AS at, onchain_tx AS onchainTx FROM ratings WHERE endpoint_id = ? ORDER BY id DESC LIMIT 20").all(id)
      .map((r) => ({ ...r, explorer: isTxSig(r.onchainTx) ? explorerTx(r.onchainTx) : null }));
    const recentReviews = db.prepare("SELECT payment_id AS paymentId, reviewer, stars, comment, source, created_at AS at FROM reviews WHERE endpoint_id = ? ORDER BY id DESC LIMIT 20").all(id);
    res.json({ ...s, recentRatings, recentReviews });
  });

  // Where the on-chain copy of the ratings lives.
  app.get("/chain", async (req, res) => {
    if (!chain) return res.json({ enabled: false });
    const pending = db.prepare("SELECT COUNT(*) AS n FROM ratings WHERE onchain_tx IS NULL").get().n;
    res.json({
      enabled: true,
      programId: chain.programId,
      authority: chain.authority,
      program: explorerAddress(chain.programId),
      pendingRatings: pending,
    });
  });

  // Plain-text summary for Grok Bot on X (and other AI assistants) to read. See src/grok.js.
  app.get("/grok", (req, res) => {
    const baseUrl = `${req.get("x-forwarded-proto") || req.protocol}://${req.get("host")}`;
    const byAta = Object.fromEntries(listEndpoints(db).map((e) => [e.pay_to_ata, e.id]));
    const ratings = db.prepare("SELECT endpoint_id AS endpointId, rating, reason, rater, created_at AS at, onchain_tx AS onchainTx FROM ratings ORDER BY id DESC LIMIT 50").all()
      .map((r) => ({ ...r, explorer: isTxSig(r.onchainTx) ? explorerTx(r.onchainTx) : null }));
    const payments = db.prepare("SELECT * FROM payments ORDER BY received_at DESC LIMIT 10").all()
      .map((p) => ({ endpointId: byAta[p.to_token_account] ?? null, amount: Number(p.amount_raw) / 10 ** USDC_DECIMALS, from: p.from_wallet, receivedAt: p.received_at, source: p.source }));
    const page = renderGrokPage({
      scores: scores(),
      changes: recentChanges(db),
      ratings,
      payments,
      chain: chain ? { programId: chain.programId, program: explorerAddress(chain.programId) } : null,
      baseUrl,
    });
    res.set("cache-control", "no-store").type("text/plain; charset=utf-8").send(page);
  });

  app.get("/payments", (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const byAta = Object.fromEntries(listEndpoints(db).map((e) => [e.pay_to_ata, e.id]));
    const rows = db.prepare("SELECT * FROM payments ORDER BY received_at DESC LIMIT ?").all(limit);
    res.json(rows.map((p) => ({
      paymentId: p.payment_id,
      endpointId: byAta[p.to_token_account] ?? null,
      from: p.from_wallet,
      amount: Number(p.amount_raw) / 10 ** USDC_DECIMALS,
      blockTime: p.block_time,
      receivedAt: p.received_at,
      source: p.source ?? null, // "quicknode" = confirmed by the QuickNode Stream
      rated: !!ratingForPayment(db, p.payment_id),
    })));
  });

  // ---------- QuickNode webhook ----------

  // Two ways to prove a delivery is genuine:
  //   1. the real QuickNode Stream signs it: X-QN-Signature over the raw body, keyed
  //      with the Stream's security token (QN_STREAM_SECRET)
  //   2. our stand-in (scripts/simulate-stream.js) sends WEBHOOK_SECRET in a header
  // The raw body is read here (not by express.json) because the signature covers
  // the exact bytes QuickNode sent. express.raw also un-gzips compressed deliveries.
  app.post("/webhook/quicknode", express.raw({ type: () => true, limit: "5mb" }), (req, res) => {
    if (!config.qnStreamSecret && !config.webhookSecret) return fail(res, 503, "webhook_secret_not_configured");
    const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";

    const source = req.get("x-qn-signature") ? "quicknode" : "stand-in";
    if (source === "quicknode") {
      const check = verifyQuickNodeSignature(req.headers, raw, config.qnStreamSecret);
      if (!check.ok) {
        // Nothing from this delivery is stored. We still answer 200: QuickNode
        // terminates a Stream after 3 failed deliveries, which would kill it while
        // the token is being set up. Discarding is what keeps us safe, not the status code.
        log(`[webhook] IGNORED delivery from ${source}: ${check.reason} (QN_STREAM_SECRET doesn't match this Stream's security token)`);
        return res.json({ received: 0, accepted: 0, rejected: "bad_quicknode_signature", reason: check.reason });
      }
    } else if (!config.webhookSecret || !sameSecret(req.get("x-vouch-webhook-secret"), config.webhookSecret)) {
      log(`[webhook] REJECTED delivery without a valid signature or secret`);
      return fail(res, 401, "bad_webhook_secret");
    }

    let body;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      return fail(res, 400, "invalid_json");
    }
    const list = Array.isArray(body) ? body : Array.isArray(body?.payments) ? body.payments : body ? [body] : [];
    const ourAccounts = new Set(listEndpoints(db).map((e) => e.pay_to_ata).filter(Boolean));

    let accepted = 0, duplicates = 0, ignored = 0;
    for (const p of list) {
      const valid = p && typeof p.paymentId === "string" && typeof p.from === "string" && /^\d+$/.test(String(p.amountRaw ?? ""));
      if (!valid || p.mint !== config.usdcMint || !ourAccounts.has(p.toTokenAccount)) {
        ignored++;
        continue;
      }
      if (insertPayment(db, p, source)) {
        accepted++;
        log(`[payment] ${p.paymentId.slice(0, 12)}... ${Number(p.amountRaw) / 1e6} USDC from ${p.from.slice(0, 6)}... verified (via ${source})`);
      } else duplicates++;
    }
    if (!accepted) {
      // Say what was ignored, so a missing/wrong Stream filter is easy to spot.
      const first = list[0];
      const shape = first && typeof first === "object" ? Object.keys(first).slice(0, 6).join(",") : typeof first;
      const looksRaw = !Array.isArray(body?.payments) && !Array.isArray(body);
      log(`[webhook] delivery from ${source}: ${list.length} item(s), ${duplicates} duplicate, ${ignored} ignored` +
        (looksRaw ? ` -- not a {payments:[...]} body (keys: ${shape}). Is filter.js set on the Stream?` : ""));
    }
    res.json({ received: list.length, accepted, duplicates, ignored });
  });

  // ---------- ratings ----------

  app.post("/rate", async (req, res) => {
    const { endpointId, paymentId, rating, reason = null, rater, signature } = req.body || {};
    if (rating !== "good" && rating !== "bad") return fail(res, 400, "rating_must_be_good_or_bad");

    const ok = checkPayment(req, res, {
      signer: rater,
      message: ratingMessage({ endpointId, paymentId, rating, reason }),
      signature,
    });
    if (!ok?.endpoint) return; // checkPayment already replied
    if (ratingForPayment(db, paymentId)) return fail(res, 409, "payment_already_used");

    let onchain;
    try {
      onchain = await stampRating(db, { endpointId, paymentId, rater, rating, reason, amountRaw: ok.payment.amount_raw }, chain);
    } catch (err) {
      if (/UNIQUE/.test(err.message)) return fail(res, 409, "payment_already_used"); // lost a race
      throw err;
    }
    const s = scores().find((x) => x.endpointId === endpointId);
    const tx = isTxSig(onchain.onchainTx) ? onchain.onchainTx : null;
    noteChange({ cause: ratingCause(rating, reason), proof: tx ? explorerTx(tx) : null, endpointId });
    log(`[rating] ${endpointId} ${rating}${reason ? ` (${reason})` : ""} -> score ${s.score} ${s.label}${tx ? `  on-chain ${tx.slice(0, 12)}...` : onchain.onchainError ? `  (on-chain pending: ${onchain.onchainError.slice(0, 60)})` : ""}`);
    res.json({ status: "stamped", endpointId, score: s.score, label: s.label, onchainTx: tx, explorer: tx ? explorerTx(tx) : null });
  });

  app.post("/review", (req, res) => {
    const { endpointId, paymentId, stars, comment = null, source = "web", reviewer, signature } = req.body || {};
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) return fail(res, 400, "stars_must_be_1_to_5");

    const ok = checkPayment(req, res, {
      signer: reviewer,
      message: reviewMessage({ endpointId, paymentId, stars, comment }),
      signature,
    });
    if (!ok?.endpoint) return;
    if (reviewer === ok.endpoint.pay_to) return fail(res, 403, "cannot_review_own_endpoint");
    if (reviewForPayment(db, paymentId)) return fail(res, 409, "payment_already_reviewed");

    try {
      insertReview(db, { endpointId, paymentId, reviewer, stars, comment, source });
    } catch (err) {
      if (/UNIQUE/.test(err.message)) return fail(res, 409, "payment_already_reviewed");
      throw err;
    }
    const s = scores().find((x) => x.endpointId === endpointId);
    noteChange({ cause: `human review ${stars}/5 stars`, endpointId });
    log(`[review] ${endpointId} ${stars}/5 via ${source} -> score ${s.score} ${s.label}`);
    res.json({ status: "saved", endpointId, score: s.score, label: s.label });
  });

  // ---------- admin ----------

  // Demo reset: back up the database, then clear every rating, review, payment,
  // test score and score history, so each demo take starts from the same state.
  // Endpoints stay; on-chain ratings stay on Solana (they can't be deleted).
  app.post("/admin/reset-demo", (req, res) => {
    if (!config.adminToken) return fail(res, 503, "admin_token_not_configured");
    if (!sameSecret(req.get("x-admin-token"), config.adminToken)) return fail(res, 401, "bad_admin_token");
    let backup = null;
    if (config.dbFile && config.dbFile !== ":memory:") {
      backup = `${config.dbFile.replace(/\.db$/, "")}.backup-${new Date().toISOString().replace(/[:.]/g, "-")}.db`;
      db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
    }
    const cleared = {};
    for (const table of ["ratings", "reviews", "payments", "test_scores", "score_history"]) {
      cleared[table] = db.prepare(`DELETE FROM ${table}`).run().changes;
    }
    recordScoreChanges(db, { defaultTestScore: config.defaultTestScore, cause: "baseline" });
    log(`[admin] demo reset: cleared ${JSON.stringify(cleared)}${backup ? `, backup ${backup}` : ""}`);
    res.json({ status: "reset", cleared, backup });
  });

  app.post("/admin/test-score", (req, res) => {
    if (!config.adminToken) return fail(res, 503, "admin_token_not_configured");
    if (!sameSecret(req.get("x-admin-token"), config.adminToken)) return fail(res, 401, "bad_admin_token");
    const { endpointId, score, reason } = req.body || {};
    if (!getEndpoint(db, endpointId)) return fail(res, 404, "unknown_endpoint");
    if (typeof score !== "number" || score < 0 || score > 100) return fail(res, 400, "score_must_be_0_to_100");
    setTestScore(db, endpointId, score);
    noteChange({ cause: typeof reason === "string" && reason ? reason.slice(0, 200) : `test score set to ${score}`, endpointId });
    res.json({ endpointId, testScore: score });
  });

  // ---------- errors ----------

  app.use((err, req, res, next) => {
    if (err.type === "entity.parse.failed") return fail(res, 400, "invalid_json");
    console.error(err);
    fail(res, 500, "internal_error");
  });

  return app;
}
