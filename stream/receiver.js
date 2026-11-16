// Temporary webhook receiver, a stand-in for the Vouch server's POST /webhook/quicknode.
// Point the QuickNode Stream here (through ngrok) to see real deliveries before
// the Vouch server exists. It verifies the signature, checks every payment has the
// contract's fields, de-duplicates by paymentId, and logs what arrived.
//
//   npm run receiver            # http://localhost:4000/webhook/quicknode
//   ngrok http 4000             # then use https://<id>.ngrok-free.app/webhook/quicknode
//   GET /payments               # everything received so far
import { createServer } from "node:http";
import { gunzipSync } from "node:zlib";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { verifyQuickNodeSignature } from "./verify-signature.js";

const here = dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(join(here, ".env")); } catch {}
const PORT = Number(process.env.RECEIVER_PORT || 4000);
const SECRET = process.env.QN_STREAM_SECRET || "";
const LOG_FILE = join(here, "received.jsonl"); // gitignored

const FIELDS = ["paymentId", "slot", "blockTime", "mint", "amountRaw", "amount", "from", "fromTokenAccount", "to", "toTokenAccount"];
const payments = new Map(); // paymentId -> payment

createServer(async (req, res) => {
  const send = (status, obj) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };

  if (req.method === "GET" && req.url === "/payments") return send(200, [...payments.values()]);
  if (req.method !== "POST" || req.url !== "/webhook/quicknode") return send(404, { error: "not found" });

  let buf = Buffer.concat(await Array.fromAsync(req));
  if (req.headers["content-encoding"] === "gzip") buf = gunzipSync(buf);
  const raw = buf.toString("utf8");

  const check = verifyQuickNodeSignature(req.headers, raw, SECRET);
  if (!check.ok) {
    console.log(`✗ rejected: ${check.reason}`);
    return send(401, { error: check.reason });
  }

  let body;
  try { body = JSON.parse(raw); } catch { return send(400, { error: "invalid JSON" }); }
  const list = Array.isArray(body?.payments) ? body.payments : [];

  let fresh = 0;
  for (const p of list) {
    const missing = FIELDS.filter((f) => !(f in p));
    if (missing.length) console.log(`  ! ${p.paymentId ?? "?"} missing fields: ${missing.join(", ")}`);
    if (payments.has(p.paymentId)) { console.log(`  = duplicate ${p.paymentId.slice(0, 16)}… (ignored)`); continue; }
    payments.set(p.paymentId, p);
    fresh++;
    console.log(`  ✓ ${p.amount} USDC  ${p.from.slice(0, 6)}… → ${p.to.slice(0, 6)}…  ${p.paymentId.slice(0, 16)}…`);
    appendFileSync(LOG_FILE, JSON.stringify(p) + "\n");
  }
  console.log(`delivery: ${list.length} payment(s), ${fresh} new`);
  send(200, { received: list.length });
}).listen(PORT, () => {
  console.log(`receiver on http://localhost:${PORT}/webhook/quicknode`);
  if (!SECRET) console.log("! QN_STREAM_SECRET is empty: every delivery will be rejected. Set it in stream/.env");
});
