// Loads the agent's wallet from .env and sets up x402 payments with it.
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { wrapFetchWithPayment, x402Client, decodePaymentResponseHeader } from "@x402/fetch";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { PAYMENTS, SOLANA_RPC_URL } from "./config.js";

function secretKeyBytes() {
  const raw = process.env.AGENT_SECRET_KEY;
  if (!raw) throw new Error("AGENT_SECRET_KEY missing from .env (run: node create-wallet.js)");
  return new Uint8Array(JSON.parse(raw));
}

export const signer = await createKeyPairSignerFromBytes(secretKeyBytes());

// Pays automatically when an endpoint answers "402 Payment Required".
const client = new x402Client().register("solana:*", new ExactSvmScheme(signer, { rpcUrl: SOLANA_RPC_URL }));

/**
 * Buy data from an endpoint.
 *
 * A paid purchase is several steps: ask -> "402, pay me" -> sign payment ->
 * ask again with payment -> endpoint answers once the payment settles.
 * `ms` times only that last request (the endpoint's answer + settlement),
 * not the 402 handshake or the signing. `totalMs` is the whole purchase.
 *
 * Returns { status, body, ms, totalMs, paid, paymentId }; paymentId is the
 * Solana transaction signature (or a placeholder in free mode).
 */
export async function buy(url) {
  // Time each underlying HTTP request; the last one is the one that returns the data.
  let lastRequestMs = 0;
  const timedFetch = async (input, init) => {
    const t = Date.now();
    const res = await fetch(input, init);
    lastRequestMs = Date.now() - t;
    return res;
  };
  const doFetch = PAYMENTS ? wrapFetchWithPayment(timedFetch, client) : timedFetch;

  const started = Date.now();
  const res = await doFetch(url, { signal: AbortSignal.timeout(15000) });
  const body = await res.text();
  const totalMs = Date.now() - started;

  let paymentId = null;
  const header = res.headers.get("PAYMENT-RESPONSE");
  if (header) {
    const settle = decodePaymentResponseHeader(header);
    if (settle.success) paymentId = settle.transaction;
  } else if (!PAYMENTS && res.status < 400) {
    paymentId = `free-${crypto.randomUUID()}`;
  }

  return { status: res.status, body, ms: lastRequestMs, totalMs, paid: PAYMENTS && !!paymentId, paymentId };
}
