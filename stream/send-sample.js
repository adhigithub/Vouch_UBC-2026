// Sends a signed delivery to a webhook, exactly as QuickNode would.
// Lets you (or the Vouch server) test the webhook without waiting for a real payment.
//
//   npm run send-sample                                   # → local receiver
//   npm run send-sample -- http://localhost:3000/webhook/quicknode
//   npm run send-sample -- <url> --bad                    # wrong signature, expect 401
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { signLikeQuickNode } from "./verify-signature.js";

const here = dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(join(here, ".env")); } catch {}

const args = process.argv.slice(2);
const url = args.find((a) => a.startsWith("http")) || `http://localhost:${process.env.RECEIVER_PORT || 4000}/webhook/quicknode`;
const secret = args.includes("--bad") ? "wrong-secret" : process.env.QN_STREAM_SECRET;
if (!secret) { console.error("Set QN_STREAM_SECRET in stream/.env"); process.exit(1); }

// A real devnet payment, as filter.js produced it.
const body = JSON.stringify({
  payments: [{
    paymentId: "5FYNhxfbtXBqxnKUiM2zYSyXp7C6zGUVKournWH1DsK2XxFvoDYvQtS1tW95ir8kLqW1ArEHJzkqceNPMM1KegH4",
    slot: 522993183,
    blockTime: 1794852562,
    mint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    amountRaw: "10000",
    amount: 0.01,
    from: "Ft84bfshg85DA5As9mcWUdKmvjBb3YQv59onpPHggQbZ",
    fromTokenAccount: "684pK2QEaXm8ScUZC1EvNz1fQNd7bhijxJuonmoJa7kq",
    to: "GTtYxuMqU4sYY5YCPSsd92LQJSf1qtWdMbH9Xaz8NXTL",
    toTokenAccount: "A2cc2VHmBQfG8vAcyqoAGTv4vzitefWtdVMXe6w43dd1",
  }],
});

const res = await fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json", ...signLikeQuickNode(body, secret) },
  body,
});
console.log(res.status, await res.text());
