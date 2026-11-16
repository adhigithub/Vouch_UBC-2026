// All the agent's settings in one place.
// Safety limits come from VOUCH.md section 10.
import "dotenv/config";

export const SAFETY = {
  minScore: 60,          // never pay endpoints scored below this
  maxPricePerCall: 0.05, // USD
  budgetPerTask: 0.25,   // USD, total spend allowed for one task
  unratedMaxPrice: 0.01, // unrated endpoints only for calls this cheap or cheaper
  maxRetries: 2,         // after a bad result, try at most this many more endpoints
  maxResponseMs: 3000,   // check 4: "fast enough" (the endpoint's own time)
  // A paid endpoint holds its answer until the payment settles on Solana, so the
  // agent can't time the endpoint alone. Paid requests get this much extra.
  // Measured: settlement usually ~1.5s, occasionally ~4s.
  paymentAllowanceMs: 2500,
};

// Endpoints the agent may still use if Vouch is unreachable.
export const FALLBACK_ALLOWLIST = ["weather-api-1/current", "crypto-api-1/price"];

// Where the fake APIs run (your partner's server).
export const FAKE_APIS_URL = (process.env.FAKE_APIS_URL || "http://localhost:3001").replace(/\/+$/, "");

// Where the Vouch server runs. Empty = use the built-in stand-in (src/mock-vouch.js).
export const VOUCH_URL = (process.env.VOUCH_URL || "").replace(/\/+$/, "");

// on = pay with real x402 on Solana devnet, off = free mode (fake API started with PAYMENTS=off)
export const PAYMENTS = (process.env.PAYMENTS || "off").toLowerCase() === "on";

export const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
