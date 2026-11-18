/**
 * Vouch data layer.
 *
 * Every piece of data the UI shows comes through this file. Components import
 * only the functions and types below, so moving from mock data to the live
 * Vouch server is a one-line change:
 *
 *   USE_MOCK_DATA = false   →  ${VOUCH_API_BASE_URL}/api/leaderboard
 *                              ${VOUCH_API_BASE_URL}/api/stream            (SSE)
 *                              ${VOUCH_API_BASE_URL}/api/agent/run-demo    (SSE)
 *                              ${VOUCH_API_BASE_URL}/review                (wallet-signed POST)
 *
 * On-chain verification ALWAYS reads real Solana devnet through the free public
 * RPC, in mock mode too: PDAs are derived from the real Vouch program id.
 */

import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { ed25519 } from "@noble/curves/ed25519.js";

// ───────────────────────────── Configuration ─────────────────────────────

const env = import.meta.env;

/** Offline demo toggle. `false` = every call below goes to the live backend. */
export const USE_MOCK_DATA = true;

export const VOUCH_API_BASE_URL: string = env.VITE_VOUCH_API_BASE_URL ?? "http://localhost:4000";
/** Where fake-apis/server.js runs (the paid x402 endpoints themselves). */
export const FAKE_API_BASE_URL: string = env.VITE_FAKE_API_BASE_URL ?? "http://localhost:3001";
/** Free public devnet RPC. No paid RPC provider anywhere. */
export const SOLANA_RPC_URL: string = env.VITE_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
export const SOLANA_CLUSTER = "devnet" as const;

/** Vouch Anchor program (program/programs/vouch-program/src/lib.rs). */
export const VOUCH_PROGRAM_ID = "GyYPjRNghiX96xFtP98eNMiYjKfrF5ktKLf1Mm2YBgni";
/** Devnet USDC mint used by fake-apis (fake-apis/wallets.json). */
export const USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
/** Agent wallet (PROJECT_STATUS.md). */
export const AGENT_WALLET = "Ft84bfshg85DA5As9mcWUdKmvjBb3YQv59onpPHggQbZ";
export const TEST_BUYER_WALLET = "CFzGu1bmKqtyVuuVfZwLE7ioQVngKKU7Lh2TFXabBC88";

/** Same weights as server/src/scoring.js: Score = 0.4T + 0.3A + 0.2H + 0.1R */
export const SCORE_WEIGHTS = { canary: 0.4, agentChecks: 0.3, humanReviews: 0.2, retention: 0.1 } as const;
export const TRUST_CUTOFF = 60;
export const TEST_CAP_MARGIN = 10;

// ─────────────────────────── Endpoint registry ───────────────────────────
// Clean UI names → the real routes in fake-apis/server.js (`pathFor(id) = "/" + id`).
// `endpointId` is the id the Vouch server and the on-chain PDA seed use.

export type EndpointTag = "Verified Good" | "Wrong Schema" | "Empty Payload" | "Bad Format" | "Slow" | "Flaky";

export interface RegistryEntry {
  key: string;
  /** Server / catalog id, also the PDA seed: ["endpoint", endpointId]. */
  endpointId: string;
  /** Real route on fake-apis/server.js. */
  route: string;
  /** Path shown in the UI. */
  displayPath: string;
  displayName: string;
  tag: EndpointTag;
  category: "weather" | "crypto";
  priceUsdc: number;
  /** Receiving wallet from fake-apis/wallets.json. */
  receivingWallet: string;
}

const reg = <K extends string>(r: Record<K, Omit<RegistryEntry, "key">>) =>
  Object.fromEntries(Object.entries<Omit<RegistryEntry, "key">>(r).map(([key, v]) => [key, { key, ...v }])) as Record<K, RegistryEntry>;

export const ENDPOINT_REGISTRY = reg({
  "weather-api-1": {
    endpointId: "weather-api-1/current", route: "/weather-api-1/current", displayPath: "/weather/current",
    displayName: "Weather Prime", tag: "Verified Good", category: "weather", priceUsdc: 0.01,
    receivingWallet: "GTtYxuMqU4sYY5YCPSsd92LQJSf1qtWdMbH9Xaz8NXTL",
  },
  "weather-api-2": {
    endpointId: "weather-api-2/current", route: "/weather-api-2/current", displayPath: "/weather-api-2/current",
    displayName: "WeatherNode Premium", tag: "Verified Good", category: "weather", priceUsdc: 0.02,
    receivingWallet: "8vRvFh4QLFDNUBXCDTFoDP83d2boik49Z9oitbyoB8wK",
  },
  "weather-api-3": {
    endpointId: "weather-api-3/current", route: "/weather-api-3/current", displayPath: "/weather-api-3/current",
    displayName: "WeatherNode Backup", tag: "Wrong Schema", category: "weather", priceUsdc: 0.01,
    receivingWallet: "ALfnUtgmZa85qVhkGYYegvgDwdUz72pCrhh2S5vsdC6D",
  },
  "weather-api-4": {
    endpointId: "weather-api-4/current", route: "/weather-api-4/current", displayPath: "/weather-api-4/current",
    displayName: "WeatherText Feed", tag: "Bad Format", category: "weather", priceUsdc: 0.01,
    receivingWallet: "BBTmvGQFnE6bTFdZmtFpTXXdyjrDoH7mnKV3XXaShDwU",
  },
  "crypto-api-1": {
    endpointId: "crypto-api-1/price", route: "/crypto-api-1/price", displayPath: "/defi/prices",
    displayName: "DeFi Spot Prices", tag: "Verified Good", category: "crypto", priceUsdc: 0.01,
    receivingWallet: "nesbjtCyaTZbaj8neyZAnc4gHasXtupxwgQG5JdeifZ",
  },
  "crypto-api-2": {
    endpointId: "crypto-api-2/price", route: "/crypto-api-2/price", displayPath: "/crypto-api-2/price",
    displayName: "CryptoFeed Delayed", tag: "Slow", category: "crypto", priceUsdc: 0.01,
    receivingWallet: "D2EwMGVDsCSDHDdKKXaWQWmsUjnzgwu1UqYd3H699vrq",
  },
  "crypto-empty-1": {
    endpointId: "crypto-api-3/price", route: "/crypto-api-3/price", displayPath: "/crypto-api-3/price",
    displayName: "CryptoFeed Lite", tag: "Empty Payload", category: "crypto", priceUsdc: 0.01,
    receivingWallet: "7ioagZfQmSoZrGpvjNR1wP3SjJLHz17qmiYdtvCWm8Fj",
  },
  "crypto-api-4": {
    endpointId: "crypto-api-4/price", route: "/crypto-api-4/price", displayPath: "/crypto-api-4/price",
    displayName: "CryptoFeed Flux", tag: "Flaky", category: "crypto", priceUsdc: 0.01,
    receivingWallet: "5RPzgeqNMgoC38G4hhsznm3gmo9eJfd1AEN7hdr68noy",
  },
});

const REGISTRY = Object.values(ENDPOINT_REGISTRY);

/** Find a registry entry by key, server id, real route, display path or full URL. */
export function resolveEndpoint(ref: string | null | undefined): RegistryEntry | undefined {
  if (!ref) return undefined;
  const path = ref.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
  return REGISTRY.find((e) => e.key === ref || e.endpointId === ref || e.route === path || e.displayPath === path || e.endpointId === path.replace(/^\//, ""));
}

/** EndpointRecord PDA: seeds ["endpoint", endpointId] under the Vouch program. */
const pdaCache = new Map<string, string>();
export function endpointPda(endpointId: string): string {
  let pda = pdaCache.get(endpointId);
  if (!pda) {
    const enc = new TextEncoder();
    pda = PublicKey.findProgramAddressSync([enc.encode("endpoint"), enc.encode(endpointId)], new PublicKey(VOUCH_PROGRAM_ID))[0].toBase58();
    pdaCache.set(endpointId, pda);
  }
  return pda;
}

// ───────────────────────────────── Types ─────────────────────────────────

export type TrustLabel = "trusted" | "avoid" | "unrated";
export type ScorePillar = keyof typeof SCORE_WEIGHTS;

/** The four score sources, each 0–100, or null when there's no data yet. */
export interface ScoreBreakdown {
  /** T: synthetic canary bots. */
  canary: number | null;
  /** A: agent post-flight checks (decayed share of good ratings). */
  agentChecks: number | null;
  /** H: human + @GrokBot X reviews. */
  humanReviews: number | null;
  /** R: share of paying wallets that came back. */
  retention: number | null;
}

export interface EndpointSummary {
  /** UI key: the registry display path, e.g. "/weather/current". */
  endpointUrl: string;
  /** Real route on fake-apis, e.g. "/weather-api-1/current". */
  route: string;
  registryKey: string;
  endpointId: string;
  name: string;
  tag: EndpointTag;
  category: RegistryEntry["category"];
  priceUsdc: number;
  receivingWallet: string;
  pdaAddress: string;
  vouchScore: number;
  label: TrustLabel;
  scoreBreakdown: ScoreBreakdown;
  verifiedCalls: number;
  avgLatencyMs: number;
}

export interface Review {
  id: string;
  source: "agent" | "human" | "grok";
  rater: string;
  rating: number;
  comment: string;
  txSig: string;
  createdAt: number;
}

export interface EndpointDetails extends EndpointSummary {
  blockedSybilReviews: number;
  recentReviews: Review[];
  lastChecks: { nonEmpty: boolean; schema: boolean; sanity: boolean; latencyMs: number };
  sampleResponse: unknown;
}

export interface PaymentEvent {
  paymentId: string;
  endpointUrl: string;
  from: string;
  amountUsdc: number;
  blockTime: number;
  rated: boolean;
}

export interface OnChainEndpointState {
  pdaAddress: string;
  endpointId: string;
  rpcUrl: string;
  slot: number | null;
  exists: boolean;
  owner: string | null;
  ownedByVouch: boolean;
  lamports: number | null;
  dataLength: number | null;
  /** Decoded EndpointRecord fields, when the account exists and is ours. */
  good: number | null;
  bad: number | null;
  lastRatedAt: number | null;
}

export interface ReviewSubmission {
  txSig: string;
  endpointUrl: string;
  rating: number;
  comment: string;
}

/** Anything that can sign like a Solana wallet: wallet-adapter or the mock demo signer. */
export interface WalletSigner {
  publicKey: string;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
}

/** Body sent to POST /review. */
export interface SignedReviewPayload {
  txSig: string;
  endpointUrl: string;
  rating: number;
  comment: string;
  reviewerWallet: string;
  signature: string;
  message: string;
}

export type ReviewErrorCode =
  | "invalid_signature_format"
  | "wallet_not_connected"
  | "signature_rejected"
  | "bad_signature"
  | "payment_not_verified"
  | "payment_for_different_endpoint"
  | "payment_already_used"
  | "network_error"
  | (string & {});

export type ReviewResult =
  | { ok: true; endpointUrl: string; newScore: number | null; label: TrustLabel | null; onchainTx: string; payload: SignedReviewPayload; note?: string }
  | { ok: false; code: ReviewErrorCode; message: string; payload?: SignedReviewPayload };

export type TraceKind = "query" | "block" | "request" | "402" | "pay" | "validate" | "submit" | "update" | "done" | "info";

export interface AgentTraceStep {
  kind: TraceKind;
  status: "ok" | "warn" | "fail" | "info";
  text: string;
  detail?: string;
  /** Pause before the next step (mock only; live steps arrive at real speed). */
  delayMs: number;
}

export type StreamStatus = "mock" | "connecting" | "open" | "reconnecting";

// ─────────────────────────────── Utilities ───────────────────────────────

export function computeVouchScore(b: ScoreBreakdown, cap = true): number {
  const keys = (Object.keys(SCORE_WEIGHTS) as ScorePillar[]).filter((k) => b[k] !== null);
  if (keys.length === 0) return 0;
  const wsum = keys.reduce((s, k) => s + SCORE_WEIGHTS[k], 0);
  let score = keys.reduce((s, k) => s + (SCORE_WEIGHTS[k] / wsum) * (b[k] as number), 0);
  if (cap && b.canary !== null) score = Math.min(score, b.canary + TEST_CAP_MARGIN);
  return Math.max(0, Math.min(100, score));
}

export const labelFor = (score: number): TrustLabel => (score >= TRUST_CUTOFF ? "trusted" : "avoid");

export const explorerAddressUrl = (addr: string) => `https://explorer.solana.com/address/${addr}?cluster=${SOLANA_CLUSTER}`;
export const explorerTxUrl = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=${SOLANA_CLUSTER}`;

export const shortAddr = (a: string, n = 4) => (a && a.length > n * 2 + 1 ? `${a.slice(0, n)}…${a.slice(-n)}` : a);

const B58_SIG = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
export const isValidTxSig = (s: string) => B58_SIG.test(s.trim());

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function randomSig(len = 88): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => BASE58[b % 58]).join("");
}

/** The deterministic challenge a reviewer's wallet signs. */
export const buildReviewChallenge = (txSig: string, endpointUrl: string, rating: number) =>
  `Vouch Review Authorization\nTx: ${txSig.trim()}\nEndpoint: ${endpointUrl}\nRating: ${rating}`;

/** The equivalent X command a human posts to rate via @GrokBot. */
export function grokCommand(s: Partial<ReviewSubmission>): string {
  const tx = s.txSig ? shortAddr(s.txSig.trim(), 6) : "<txSig>";
  const comment = s.comment?.trim() ? ` "${s.comment.trim().slice(0, 60)}"` : "";
  return `@GrokBot vouch ${s.endpointUrl ?? "<endpoint>"} ${s.rating ?? "<0-100>"}/100${comment} tx:${tx}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now();
const MIN = 60_000;

// ─────────────────────── Solana devnet JSON-RPC ──────────────────────────

export interface RpcAccountInfo {
  slot: number;
  value: { data: [string, string]; executable: boolean; lamports: number; owner: string; rentEpoch?: number; space?: number } | null;
}

/** Plain JSON-RPC `getAccountInfo` against devnet. No SDK, no paid provider. */
export async function getAccountInfo(address: string, rpcUrl = SOLANA_RPC_URL): Promise<RpcAccountInfo> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getAccountInfo", params: [address, { encoding: "base64", commitment: "confirmed" }] }),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? "RPC error");
  return { slot: json.result.context.slot, value: json.result.value };
}

/** Anchor EndpointRecord: [8 disc][u32 len + endpoint_id][u32 good][u32 bad][i64 last_rated_at][u8 bump] */
function decodeEndpointRecord(b64: string) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const dv = new DataView(bytes.buffer);
  let o = 8;
  const len = dv.getUint32(o, true);
  o += 4 + len;
  const last = Number(dv.getBigInt64(o + 8, true));
  return { good: dv.getUint32(o, true), bad: dv.getUint32(o + 4, true), lastRatedAt: last ? last * 1000 : null };
}

/** Reads an endpoint's real PDA on devnet. Used by the "Verify On-Chain" button in both modes. */
export async function verifyOnChain(endpoint: Pick<EndpointSummary, "pdaAddress" | "endpointId">): Promise<OnChainEndpointState> {
  const info = await getAccountInfo(endpoint.pdaAddress);
  const v = info.value;
  const base: OnChainEndpointState = {
    pdaAddress: endpoint.pdaAddress, endpointId: endpoint.endpointId, rpcUrl: SOLANA_RPC_URL, slot: info.slot,
    exists: !!v, owner: v?.owner ?? null, ownedByVouch: v?.owner === VOUCH_PROGRAM_ID,
    lamports: v?.lamports ?? null, dataLength: v ? atob(v.data[0]).length : null, good: null, bad: null, lastRatedAt: null,
  };
  if (v && base.ownedByVouch) {
    try {
      return { ...base, ...decodeEndpointRecord(v.data[0]) };
    } catch {
      /* layout changed: show the raw account only */
    }
  }
  return base;
}

// ─────────────────────────────── Mock world ──────────────────────────────
// Wallets, routes and PDAs are real. Scores, counts and reviews are simulated.

interface MockStats {
  scoreBreakdown: ScoreBreakdown;
  verifiedCalls: number;
  avgLatencyMs: number;
  blockedSybilReviews: number;
  lastChecks: EndpointDetails["lastChecks"];
  sampleResponse: unknown;
}

const MOCK_STATS: Record<string, MockStats> = {
  "weather-api-1": {
    scoreBreakdown: { canary: 97, agentChecks: 98, humanReviews: 92, retention: 94 }, verifiedCalls: 4182, avgLatencyMs: 212, blockedSybilReviews: 37,
    lastChecks: { nonEmpty: true, schema: true, sanity: true, latencyMs: 198 },
    sampleResponse: { city: "Austin", temperature: 71.4, unit: "F", humidity: 48, windMph: 7.2, condition: "Clear", source: "open-meteo" },
  },
  "crypto-api-1": {
    scoreBreakdown: { canary: 92, agentChecks: 94, humanReviews: 86, retention: 88 }, verifiedCalls: 2917, avgLatencyMs: 341, blockedSybilReviews: 12,
    lastChecks: { nonEmpty: true, schema: true, sanity: true, latencyMs: 322 },
    sampleResponse: { symbol: "SOL", priceUsd: 187.42, source: "coingecko" },
  },
  "weather-api-2": {
    scoreBreakdown: { canary: 90, agentChecks: 90, humanReviews: 84, retention: 86 }, verifiedCalls: 1408, avgLatencyMs: 260, blockedSybilReviews: 9,
    lastChecks: { nonEmpty: true, schema: true, sanity: true, latencyMs: 244 },
    sampleResponse: { city: "Austin", temperature: 71.1, unit: "F", humidity: 49, windMph: 7.0, condition: "Clear", source: "open-meteo" },
  },
  "crypto-api-4": {
    scoreBreakdown: { canary: 55, agentChecks: 50, humanReviews: 48, retention: 60 }, verifiedCalls: 903, avgLatencyMs: 288, blockedSybilReviews: 71,
    lastChecks: { nonEmpty: true, schema: false, sanity: true, latencyMs: 301 },
    sampleResponse: { ticker: "SOL", price: "about $187" },
  },
  "crypto-api-2": {
    scoreBreakdown: { canary: 45, agentChecks: 31, humanReviews: 40, retention: 30 }, verifiedCalls: 611, avgLatencyMs: 5240, blockedSybilReviews: 54,
    lastChecks: { nonEmpty: true, schema: true, sanity: true, latencyMs: 5480 },
    sampleResponse: { symbol: "SOL", priceUsd: 187.4, source: "coingecko" },
  },
  "weather-api-4": {
    scoreBreakdown: { canary: 20, agentChecks: 15, humanReviews: 35, retention: 12 }, verifiedCalls: 822, avgLatencyMs: 118, blockedSybilReviews: 166,
    lastChecks: { nonEmpty: true, schema: false, sanity: false, latencyMs: 112 },
    sampleResponse: { location: "Austin", temperature: "71 degrees-ish", sky: "Clear" },
  },
  "weather-api-3": {
    scoreBreakdown: { canary: 12, agentChecks: 8, humanReviews: 30, retention: 10 }, verifiedCalls: 1290, avgLatencyMs: 96, blockedSybilReviews: 418,
    lastChecks: { nonEmpty: true, schema: false, sanity: false, latencyMs: 91 },
    sampleResponse: { city: "Reykjavik", temperature: 187, unit: "F", humidity: 140, windMph: 6.1, condition: "Clear" },
  },
  "crypto-empty-1": {
    scoreBreakdown: { canary: 6, agentChecks: 3, humanReviews: 20, retention: 0 }, verifiedCalls: 744, avgLatencyMs: 64, blockedSybilReviews: 203,
    lastChecks: { nonEmpty: false, schema: false, sanity: false, latencyMs: 60 },
    sampleResponse: "",
  },
};

const reviewers = ["Ft84…gZJ", "CFzG…BC88", "9xQe…7Tn2", "4hRk…Lp0a", "@dev_kai", "@solbuilder", "@0xmira"];
const commentsGood = ["schema valid, 198ms", "matches Open-Meteo within 0.3°F", "fast + consistent", "repeat buy, no issues"];
const commentsBad = ["paid 0.01, got junk", "Austin request came back as Reykjavik, 187°F", "empty body after payment", "fields renamed, temp as text"];

function seedReviews(e: RegistryEntry): Review[] {
  const good = computeVouchScore(MOCK_STATS[e.key].scoreBreakdown) >= TRUST_CUTOFF;
  return Array.from({ length: 5 }, (_, i) => ({
    id: `${e.endpointId}-${i}`,
    source: (["agent", "grok", "human"] as const)[i % 3],
    rater: reviewers[(i * 3 + e.displayPath.length) % reviewers.length],
    rating: Math.max(0, Math.min(100, (good ? 88 : 12) + ((i * 7) % 11) - 4)),
    comment: (good ? commentsGood : commentsBad)[i % 4],
    txSig: randomSig(),
    createdAt: now() - (i + 1) * 7 * MIN,
  }));
}

const mockReviews = new Map<string, Review[]>(REGISTRY.map((e) => [e.displayPath, seedReviews(e)]));

const mockPayments: PaymentEvent[] = Array.from({ length: 8 }, (_, i) => {
  const e = REGISTRY[i % REGISTRY.length];
  return {
    paymentId: randomSig(), endpointUrl: e.displayPath, from: i % 2 ? AGENT_WALLET : TEST_BUYER_WALLET,
    amountUsdc: e.priceUsdc, blockTime: Math.floor((now() - i * 41_000) / 1000), rated: i > 2,
  };
});

function summarizeMock(e: RegistryEntry): EndpointSummary {
  const s = MOCK_STATS[e.key];
  const vouchScore = computeVouchScore(s.scoreBreakdown);
  return {
    ...fromRegistry(e), vouchScore, label: labelFor(vouchScore),
    scoreBreakdown: { ...s.scoreBreakdown }, verifiedCalls: s.verifiedCalls, avgLatencyMs: s.avgLatencyMs,
  };
}

function fromRegistry(e: RegistryEntry) {
  return {
    endpointUrl: e.displayPath, route: e.route, registryKey: e.key, endpointId: e.endpointId, name: e.displayName, tag: e.tag,
    category: e.category, priceUsdc: e.priceUsdc, receivingWallet: e.receivingWallet, pdaAddress: endpointPda(e.endpointId),
  };
}

const mustResolve = (ref: string) => {
  const e = resolveEndpoint(ref);
  if (!e) throw new Error(`Unknown endpoint ${ref}`);
  return e;
};

function applyMockRating(ref: string, rating: number, source: Review["source"], txSig: string, rater: string, comment: string) {
  const e = mustResolve(ref);
  const b = MOCK_STATS[e.key].scoreBreakdown;
  if (source === "agent") b.agentChecks = Math.round((0.8 * (b.agentChecks ?? 50) + 0.2 * (rating >= TRUST_CUTOFF ? 100 : 0)) * 10) / 10;
  else b.humanReviews = Math.round((0.85 * (b.humanReviews ?? 50) + 0.15 * rating) * 10) / 10;
  mockReviews.get(e.displayPath)!.unshift({ id: txSig, source, rater, rating, comment, txSig, createdAt: now() });
  emitLeaderboard();
  return summarizeMock(e);
}

// ───────────────────────────── Event hub ─────────────────────────────────
// One place both modes publish to; the UI only subscribes.

const leaderboardListeners = new Set<() => void>();
const paymentListeners = new Set<(p: PaymentEvent) => void>();
const statusListeners = new Set<(s: StreamStatus) => void>();
let streamStatus: StreamStatus = USE_MOCK_DATA ? "mock" : "connecting";

let lbTimer: ReturnType<typeof setTimeout> | null = null;
function emitLeaderboard() {
  if (lbTimer) return;
  lbTimer = setTimeout(() => {
    lbTimer = null;
    leaderboardListeners.forEach((l) => l());
  }, 120);
}
function emitPayment(p: PaymentEvent) {
  if (USE_MOCK_DATA) {
    mockPayments.unshift(p);
    mockPayments.length = Math.min(mockPayments.length, 40);
  }
  paymentListeners.forEach((l) => l(p));
}
function setStreamStatus(s: StreamStatus) {
  streamStatus = s;
  statusListeners.forEach((l) => l(s));
}

let mockTimer: ReturnType<typeof setInterval> | null = null;
let liveSource: EventSource | null = null;

/** Starts the mock firehose, or the shared SSE connection to /api/stream. */
function ensureStream() {
  if (USE_MOCK_DATA) {
    if (mockTimer) return;
    mockTimer = setInterval(() => {
      if (paymentListeners.size === 0) return;
      const r = Math.random();
      const e = r < 0.45 ? ENDPOINT_REGISTRY["weather-api-1"] : r < 0.7 ? ENDPOINT_REGISTRY["crypto-api-1"] : REGISTRY[Math.floor(Math.random() * REGISTRY.length)];
      MOCK_STATS[e.key].verifiedCalls++;
      emitPayment({ paymentId: randomSig(), endpointUrl: e.displayPath, from: Math.random() < 0.5 ? AGENT_WALLET : TEST_BUYER_WALLET,
        amountUsdc: e.priceUsdc, blockTime: Math.floor(now() / 1000), rated: false });
      emitLeaderboard();
    }, 4200);
    return;
  }
  if (liveSource) return;
  setStreamStatus("connecting");
  liveSource = new EventSource(`${VOUCH_API_BASE_URL}/api/stream`);
  liveSource.onopen = () => setStreamStatus("open");
  liveSource.onerror = () => setStreamStatus("reconnecting"); // EventSource retries on its own
  const handle = (type: string) => (ev: MessageEvent) => {
    const data = parseJson(ev.data);
    if (!data || typeof data !== "object") return;
    const kind = String(data.type ?? data.event ?? type).toLowerCase();
    const payment = normalizePayment(data.payment ?? data);
    if (payment && /payment|transfer|quicknode|message/.test(kind)) emitPayment(payment);
    emitLeaderboard(); // any payment / rating / review / score event can move the board
  };
  for (const t of ["message", "payment", "rating", "review", "score", "leaderboard"]) liveSource.addEventListener(t, handle(t) as EventListener);
}

function maybeStopStream() {
  if (paymentListeners.size || leaderboardListeners.size || statusListeners.size) return;
  if (mockTimer) clearInterval(mockTimer), (mockTimer = null);
  if (liveSource) liveSource.close(), (liveSource = null);
}

/** Live feed of verified payments (mock firehose or /api/stream). Returns unsubscribe. */
export function subscribePayments(onPayment: (p: PaymentEvent) => void): () => void {
  paymentListeners.add(onPayment);
  ensureStream();
  return () => {
    paymentListeners.delete(onPayment);
    maybeStopStream();
  };
}

/** Fires whenever scores may have changed. Returns unsubscribe. */
export function subscribeLeaderboard(onChange: () => void): () => void {
  leaderboardListeners.add(onChange);
  ensureStream();
  return () => {
    leaderboardListeners.delete(onChange);
    maybeStopStream();
  };
}

export function subscribeStreamStatus(onStatus: (s: StreamStatus) => void): () => void {
  statusListeners.add(onStatus);
  onStatus(streamStatus);
  ensureStream();
  return () => {
    statusListeners.delete(onStatus);
    maybeStopStream();
  };
}

// ─────────────────────────────── Live adapters ───────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = Record<string, any>;

function parseJson(s: string): Json | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${VOUCH_API_BASE_URL}${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body?.message ?? body?.error ?? res.statusText), { status: res.status, body });
  return body as T;
}

const num = (...v: unknown[]) => {
  for (const x of v) if (x !== null && x !== undefined && x !== "" && !Number.isNaN(Number(x))) return Number(x);
  return null;
};

/** Accepts either { scoreBreakdown: {...} } or the server's { parts: { T, A, H, R } }. */
function normalizeBreakdown(r: Json): ScoreBreakdown {
  const b = r.scoreBreakdown ?? {};
  const p = r.parts ?? {};
  return {
    canary: num(b.canary, p.T), agentChecks: num(b.agentChecks, p.A),
    humanReviews: num(b.humanReviews, p.H), retention: num(b.retention, p.R),
  };
}

function normalizeRow(r: Json): EndpointSummary | null {
  const e = resolveEndpoint(r.registryKey ?? r.endpointId ?? r.id ?? r.endpoint ?? r.route ?? r.endpointUrl);
  const id: string = e?.endpointId ?? r.endpointId ?? r.id ?? "";
  if (!id) return null;
  const vouchScore = num(r.vouchScore, r.score) ?? 0;
  return {
    endpointUrl: e?.displayPath ?? r.endpointUrl ?? `/${id}`,
    route: e?.route ?? r.route ?? `/${id}`,
    registryKey: e?.key ?? id,
    endpointId: id,
    name: e?.displayName ?? r.name ?? id,
    tag: e?.tag ?? r.tag ?? (vouchScore >= TRUST_CUTOFF ? "Verified Good" : "Flaky"),
    category: e?.category ?? (id.startsWith("crypto") ? "crypto" : "weather"),
    priceUsdc: num(r.priceUsdc, r.price) ?? e?.priceUsdc ?? 0.01,
    receivingWallet: r.receivingWallet ?? r.payTo ?? r.pay_to ?? e?.receivingWallet ?? "",
    pdaAddress: r.pdaAddress ?? endpointPda(id),
    vouchScore,
    label: r.label ?? labelFor(vouchScore),
    scoreBreakdown: normalizeBreakdown(r),
    verifiedCalls: num(r.verifiedCalls, r.payments, r.ratings) ?? 0,
    avgLatencyMs: num(r.avgLatencyMs, r.latencyMs) ?? 0,
  };
}

function normalizePayment(p: Json): PaymentEvent | null {
  const id = p.paymentId ?? p.txSig ?? p.signature;
  if (!id || typeof id !== "string") return null;
  const e = resolveEndpoint(p.endpointId ?? p.endpoint ?? p.endpointUrl ?? p.route);
  return {
    paymentId: id,
    endpointUrl: e?.displayPath ?? p.endpointUrl ?? p.endpointId ?? "unknown",
    from: p.from ?? p.payer ?? p.from_wallet ?? "",
    amountUsdc: num(p.amountUsdc, p.amount) ?? 0.01,
    blockTime: num(p.blockTime, p.block_time) ?? Math.floor(now() / 1000),
    rated: !!p.rated,
  };
}

// ─────────────────────────────── Public API ──────────────────────────────

export async function fetchLeaderboard(): Promise<EndpointSummary[]> {
  if (USE_MOCK_DATA) {
    await sleep(150);
    return REGISTRY.map(summarizeMock).sort((a, b) => b.vouchScore - a.vouchScore);
  }
  const body = await api<Json>("/api/leaderboard");
  const rows: Json[] = Array.isArray(body) ? body : body.leaderboard ?? body.endpoints ?? body.rows ?? [];
  return rows.map(normalizeRow).filter((r): r is EndpointSummary => !!r).sort((a, b) => b.vouchScore - a.vouchScore);
}

export async function fetchEndpointDetails(endpointUrl: string): Promise<EndpointDetails> {
  const e = mustResolve(endpointUrl);
  if (USE_MOCK_DATA) {
    await sleep(200);
    const s = MOCK_STATS[e.key];
    return {
      ...summarizeMock(e), blockedSybilReviews: s.blockedSybilReviews,
      recentReviews: mockReviews.get(e.displayPath)!.slice(0, 6), lastChecks: s.lastChecks, sampleResponse: s.sampleResponse,
    };
  }
  // Existing server route: GET /endpoints/:api/:name
  const d = await api<Json>(`/endpoints/${e.endpointId}`);
  const base = normalizeRow({ ...d, endpointId: e.endpointId })!;
  const reviews: Review[] = [
    ...(d.recentRatings ?? []).map((r: Json) => ({
      id: r.paymentId, source: "agent" as const, rater: r.rater,
      rating: r.rating === "good" ? 100 : r.rating === "bad" ? 0 : Number(r.rating), comment: r.reason ?? "",
      txSig: r.paymentId, createdAt: r.createdAt ?? now(),
    })),
    ...(d.recentReviews ?? []).map((r: Json) => ({
      id: r.paymentId, source: (r.source === "grok" ? "grok" : "human") as Review["source"], rater: r.reviewer ?? r.reviewerWallet,
      rating: num(r.rating) ?? Math.round(((r.stars - 1) / 4) * 100), comment: r.comment ?? "",
      txSig: r.paymentId ?? r.txSig, createdAt: r.createdAt ?? now(),
    })),
  ].sort((a, b) => b.createdAt - a.createdAt);
  return {
    ...base,
    blockedSybilReviews: num(d.blockedSybilReviews, d.blockedSybil) ?? 0,
    recentReviews: reviews.slice(0, 6),
    lastChecks: d.lastChecks ?? { nonEmpty: true, schema: true, sanity: true, latencyMs: base.avgLatencyMs },
    sampleResponse: d.sampleResponse ?? null,
  };
}

export async function fetchRecentPayments(limit = 12): Promise<PaymentEvent[]> {
  if (USE_MOCK_DATA) return mockPayments.slice(0, limit);
  const rows = await api<Json[]>(`/payments?limit=${limit}`);
  return rows.map(normalizePayment).filter((p): p is PaymentEvent => !!p);
}

/** In-browser ed25519 keypair so the review flow can be demoed without a wallet extension. Mock mode only. */
export function createDemoSigner(): WalletSigner {
  const sk = ed25519.utils.randomSecretKey();
  return { publicKey: bs58.encode(ed25519.getPublicKey(sk)), signMessage: async (m) => ed25519.sign(m, sk) };
}

/**
 * Payment-gated, wallet-signed review: 1 verified x402 payment = 1 rating.
 * The connected wallet signs `buildReviewChallenge(...)`; the server checks the
 * signature, that the tx is a verified payment to that endpoint, and first use.
 */
export async function submitReview(sub: ReviewSubmission, signer: WalletSigner | null): Promise<ReviewResult> {
  const txSig = sub.txSig.trim();
  if (!isValidTxSig(txSig)) return { ok: false, code: "invalid_signature_format", message: "That isn't a base58 Solana transaction signature (64–88 chars)." };
  if (!signer) return { ok: false, code: "wallet_not_connected", message: "Connect Phantom or Solflare to sign the review." };

  const message = buildReviewChallenge(txSig, sub.endpointUrl, sub.rating);
  const msgBytes = new TextEncoder().encode(message);
  let sigBytes: Uint8Array;
  try {
    sigBytes = await signer.signMessage(msgBytes);
  } catch (err) {
    return { ok: false, code: "signature_rejected", message: (err as Error).message || "The wallet declined to sign." };
  }
  const payload: SignedReviewPayload = {
    txSig, endpointUrl: sub.endpointUrl, rating: sub.rating, comment: sub.comment,
    reviewerWallet: signer.publicKey, signature: bs58.encode(sigBytes), message,
  };

  if (USE_MOCK_DATA) {
    await sleep(600);
    if (!ed25519.verify(sigBytes, msgBytes, bs58.decode(signer.publicKey)))
      return { ok: false, code: "bad_signature", message: "Signature does not match the reviewer wallet.", payload };
    const target = resolveEndpoint(sub.endpointUrl);
    const p = mockPayments.find((x) => x.paymentId === txSig);
    if (!p) return { ok: false, code: "payment_not_verified", message: "QuickNode hasn't reported a USDC payment with this signature. No payment, no rating.", payload };
    if (resolveEndpoint(p.endpointUrl)?.key !== target?.key)
      return { ok: false, code: "payment_for_different_endpoint", message: `This payment went to ${p.endpointUrl}, not ${sub.endpointUrl}.`, payload };
    if (p.rated) return { ok: false, code: "payment_already_used", message: "This payment was already used for a rating. One payment, one voice.", payload };
    p.rated = true;
    const s = applyMockRating(sub.endpointUrl, sub.rating, "human", txSig, shortAddr(signer.publicKey), sub.comment);
    return { ok: true, endpointUrl: sub.endpointUrl, newScore: s.vouchScore, label: s.label, onchainTx: randomSig(), payload,
      note: "mock: signature verified in-browser; payer-match check skipped" };
  }

  try {
    const r = await api<Json>("/review", { method: "POST", body: JSON.stringify(payload) });
    emitLeaderboard();
    return { ok: true, endpointUrl: sub.endpointUrl, newScore: num(r.score, r.vouchScore), label: r.label ?? null, onchainTx: r.onchainTx ?? "", payload };
  } catch (err) {
    const e = err as Error & { body?: Json; status?: number };
    return { ok: false, code: e.body?.error ?? (e.status ? `http_${e.status}` : "network_error"), message: e.message, payload };
  }
}

// ───────────────────────────── Agent loop ────────────────────────────────

/** Mock mode: simulated loop. Live mode: the real backend agent over SSE. */
export function runAgentLoop(task: "weather" = "weather"): AsyncGenerator<AgentTraceStep> {
  return USE_MOCK_DATA ? runMockAgentLoop(task) : runLiveAgentLoop();
}

const KIND_RULES: [RegExp, TraceKind][] = [
  [/quer|lookup|best/i, "query"],
  [/block|skip|refus|avoid/i, "block"],
  [/\b402\b|payment required/i, "402"],
  [/pay|usdc|transfer|settle/i, "pay"],
  [/check|valid|schema|sanity|post-?flight/i, "validate"],
  [/stamp|rat(e|ing)|review|chain|pda|solana/i, "submit"],
  [/done|complete|finish/i, "done"],
];

function toTraceStep(eventName: string, raw: string): AgentTraceStep {
  const d = parseJson(raw) ?? { message: raw };
  const text: string = d.message ?? d.text ?? d.label ?? d.step ?? raw;
  const hint = `${d.kind ?? ""} ${d.stage ?? ""} ${d.step ?? ""} ${eventName} ${text}`;
  const kind: TraceKind = (d.kind as TraceKind) ?? KIND_RULES.find(([re]) => re.test(hint))?.[1] ?? "info";
  const s = String(d.status ?? d.level ?? "").toLowerCase();
  const status: AgentTraceStep["status"] =
    /fail|error|bad|block/.test(s) ? "fail" : /warn/.test(s) ? "warn" : /ok|success|pass|done/.test(s) ? "ok"
      : kind === "block" ? "fail" : kind === "402" ? "warn" : kind === "query" || kind === "info" ? "info" : "ok";
  const tx = d.txSig ?? d.paymentId ?? d.onchainTx ?? d.signature;
  const detail = d.detail ?? (typeof d.data === "object" ? JSON.stringify(d.data) : tx ? `tx ${tx}` : undefined);
  return { kind, status, text, detail: typeof detail === "string" ? detail : JSON.stringify(detail), delayMs: 0 };
}

/**
 * Opens an EventSource on /api/agent/run-demo, which starts the real agent on the
 * backend, and yields each streamed step until the server sends a done event.
 */
export async function* runLiveAgentLoop(url = `${VOUCH_API_BASE_URL}/api/agent/run-demo`): AsyncGenerator<AgentTraceStep> {
  const queue: (AgentTraceStep | Error | null)[] = [];
  let wake: (() => void) | null = null;
  const push = (x: AgentTraceStep | Error | null) => {
    queue.push(x);
    wake?.();
  };
  let opened = false;
  let finished = false;
  const es = new EventSource(url);
  const finish = (last?: AgentTraceStep | Error) => {
    if (finished) return;
    finished = true;
    es.close(); // close before the browser's auto-reconnect can re-trigger the demo
    if (last) push(last);
    push(null);
  };
  es.onopen = () => (opened = true);
  es.onerror = () => finish(opened ? undefined : new Error(`Couldn't reach ${url}. Is the Vouch server running?`));
  const onStep = (name: string) => (ev: MessageEvent) => {
    const step = toTraceStep(name, ev.data);
    const d = parseJson(ev.data);
    if (name === "done" || name === "end" || name === "complete" || d?.done === true || step.kind === "done") finish(step);
    else if (name === "error") finish({ ...step, status: "fail" });
    else push(step);
  };
  for (const n of ["message", "step", "done", "end", "complete", "error"]) es.addEventListener(n, onStep(n) as EventListener);

  try {
    for (;;) {
      if (!queue.length) await new Promise<void>((r) => (wake = r));
      wake = null;
      const next = queue.shift();
      if (next === null || next === undefined) break;
      if (next instanceof Error) throw next;
      yield next;
    }
  } finally {
    finish();
    emitLeaderboard();
  }
}

async function* runMockAgentLoop(task: "weather"): AsyncGenerator<AgentTraceStep> {
  const board = await fetchLeaderboard();
  const candidates = board.filter((e) => e.category === task);
  const best = candidates[0];
  const blocked = candidates.filter((c) => c.vouchScore < TRUST_CUTOFF);

  yield { kind: "query", status: "info", text: `querying Vouch · GET /best?task=${task}`, delayMs: 650,
    detail: candidates.map((c) => `${c.endpointUrl.padEnd(24)} ${String(Math.round(c.vouchScore)).padStart(3)}  ${c.tag}`).join("\n") };
  for (const b of blocked) {
    yield { kind: "block", status: "fail", text: `blocking bad endpoint ${b.endpointUrl} (${b.name}): score ${Math.round(b.vouchScore)} < ${TRUST_CUTOFF}`, delayMs: 450,
      detail: `${b.tag} · 0.01 USDC not spent` };
  }
  yield { kind: "request", status: "info", text: `GET ${FAKE_API_BASE_URL}${best.route}?city=Austin`, delayMs: 550 };
  yield { kind: "402", status: "warn", text: "HTTP/1.1 402 Payment Required", delayMs: 650,
    detail: JSON.stringify({ scheme: "exact", network: "solana-devnet", asset: "USDC", maxAmountRequired: "10000", payTo: shortAddr(best.receivingWallet, 6) }) };

  const txSig = randomSig();
  const before = best.vouchScore;
  emitPayment({ paymentId: txSig, endpointUrl: best.endpointUrl, from: AGENT_WALLET, amountUsdc: best.priceUsdc, blockTime: Math.floor(now() / 1000), rated: false });
  yield { kind: "pay", status: "ok", text: `paying 0.01 USDC → ${shortAddr(best.receivingWallet)} (X-PAYMENT)`, delayMs: 900, detail: `tx ${shortAddr(txSig, 8)} · confirmed on devnet` };
  yield { kind: "validate", status: "ok", text: "running 4 checks · got something ✓  right format ✓  makes sense ✓  fast enough ✓", delayMs: 800,
    detail: JSON.stringify(MOCK_STATS[best.registryKey].sampleResponse) };
  MOCK_STATS[best.registryKey].verifiedCalls++;
  const after = applyMockRating(best.endpointUrl, 96, "agent", txSig, shortAddr(AGENT_WALLET), "agent post-flight: all checks passed").vouchScore;
  const p = mockPayments.find((x) => x.paymentId === txSig);
  if (p) p.rated = true;
  yield { kind: "submit", status: "ok", text: `stamping on Solana · submit_rating → PDA ${shortAddr(best.pdaAddress)}`, delayMs: 850,
    detail: `POST /rate 200 stamped · ${best.endpointUrl} score ${before.toFixed(2)} → ${after.toFixed(2)}` };
  yield { kind: "done", status: "ok", text: `Task complete. Spent 0.01 USDC. Refused ${blocked.length} untrusted endpoint${blocked.length === 1 ? "" : "s"}.`, delayMs: 0 };
}
