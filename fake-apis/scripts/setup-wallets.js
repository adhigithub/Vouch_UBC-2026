// One-time setup: give every endpoint its own Solana devnet wallet and USDC account.
//
//   npm run setup
//
// Writes:
//   wallets.secret.json  secret keys (GITIGNORED, never commit)
//   wallets.json         public addresses + USDC token accounts (safe to commit;
//                        the Vouch server / QuickNode filter use these)
//
// x402 payments transfer USDC into the endpoint's USDC token account (ATA), but
// do not create it, so we create them here. That costs ~0.002 SOL each, paid by
// a "setup payer" wallet (SETUP_PAYER_SECRET_KEY in .env, or one generated here).
// Safe to re-run: existing keys are kept and existing accounts are skipped.

import "dotenv/config";
import fs from "node:fs";
import crypto from "node:crypto";
import {
  address,
  airdropFactory,
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createKeyPairSignerFromPrivateKeyBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  getAddressEncoder,
  getBase58Encoder,
  getSignatureFromTransaction,
  lamports,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import {
  TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync,
} from "@solana-program/token";
import { ENDPOINTS } from "../src/catalog.js";

const USDC_DEVNET_MINT = address("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const WS_URL = process.env.SOLANA_WS_URL || RPC_URL.replace(/^http/, "ws");
const SECRET_FILE = new URL("../wallets.secret.json", import.meta.url);
const PUBLIC_FILE = new URL("../wallets.json", import.meta.url);
const MIN_PAYER_LAMPORTS = 30_000_000n; // 0.03 SOL covers ~9 accounts + fees

const rpc = createSolanaRpc(RPC_URL);
const rpcSubscriptions = createSolanaRpcSubscriptions(WS_URL);
const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

// ---------- key helpers (64-byte secret = Solana CLI / Phantom-compatible format) ----------

async function newSecret() {
  const seed = crypto.randomBytes(32);
  const signer = await createKeyPairSignerFromPrivateKeyBytes(seed);
  return [...seed, ...getAddressEncoder().encode(signer.address)];
}

function parseSecret(value) {
  const v = String(value).trim();
  return v.startsWith("[") ? new Uint8Array(JSON.parse(v)) : new Uint8Array(getBase58Encoder().encode(v));
}

const signerOf = (secret) => createKeyPairSignerFromBytes(new Uint8Array(secret));

// ---------- 1 + 2. keys and public file ----------
//
// wallets.json is committed, but wallets.secret.json only exists on the machine
// that first ran setup. On any other machine we must NOT generate new keys:
// that would silently replace the endpoint addresses everyone else relies on.
// Instead we run in "accounts-only" mode: read the committed addresses and just
// create any missing USDC accounts (which needs a payer, not the endpoint keys).

const committed = fs.existsSync(PUBLIC_FILE) ? JSON.parse(fs.readFileSync(PUBLIC_FILE, "utf8")) : null;
const accountsOnly = !fs.existsSync(SECRET_FILE) && Object.keys(committed?.endpoints || {}).length > 0;

let secrets = null;
let pub;

if (accountsOnly) {
  const missing = ENDPOINTS.filter((e) => !committed.endpoints[e.id]);
  if (missing.length) {
    console.error(
      `wallets.json has no wallet for: ${missing.map((e) => e.id).join(", ")}\n` +
        `New endpoint wallets can only be added on the machine that has wallets.secret.json.`,
    );
    process.exit(1);
  }
  pub = committed;
  console.log("No wallets.secret.json here: using the committed wallets.json as-is (accounts-only mode).");
} else {
  secrets = fs.existsSync(SECRET_FILE)
    ? JSON.parse(fs.readFileSync(SECRET_FILE, "utf8"))
    : { note: "DEVNET ONLY. Never commit this file.", payer: null, testBuyer: null, endpoints: {} };

  secrets.payer ??= await newSecret();
  secrets.testBuyer ??= await newSecret();
  for (const e of ENDPOINTS) secrets.endpoints[e.id] ??= await newSecret();
  fs.writeFileSync(SECRET_FILE, JSON.stringify(secrets, null, 2));

  pub = { network: "solana-devnet", usdcMint: USDC_DEVNET_MINT, testBuyer: null, endpoints: {} };
  pub.testBuyer = (await signerOf(secrets.testBuyer)).address;
  for (const e of ENDPOINTS) {
    const owner = (await signerOf(secrets.endpoints[e.id])).address;
    const [usdcAta] = await findAssociatedTokenPda({ owner, mint: USDC_DEVNET_MINT, tokenProgram: TOKEN_PROGRAM_ADDRESS });
    pub.endpoints[e.id] = { address: owner, usdcAta };
  }
  fs.writeFileSync(PUBLIC_FILE, JSON.stringify(pub, null, 2) + "\n");
  console.log(`Wrote ${ENDPOINTS.length} endpoint wallets to wallets.json`);
}

// ---------- 3. create missing USDC accounts ----------

const todo = [];
for (const e of ENDPOINTS) {
  const { value } = await rpc.getAccountInfo(pub.endpoints[e.id].usdcAta, { encoding: "base64" }).send();
  if (!value) todo.push(e.id);
}
if (!todo.length) {
  console.log("All endpoint USDC accounts already exist. Done.");
  printNextSteps();
  process.exit(0);
}
console.log(`Need to create ${todo.length} USDC account(s).`);

if (!process.env.SETUP_PAYER_SECRET_KEY && !secrets) {
  console.error("Accounts-only mode needs a payer: set SETUP_PAYER_SECRET_KEY to a devnet wallet with ~0.03 SOL.");
  process.exit(1);
}
const payer = process.env.SETUP_PAYER_SECRET_KEY
  ? await createKeyPairSignerFromBytes(parseSecret(process.env.SETUP_PAYER_SECRET_KEY))
  : await signerOf(secrets.payer);

let { value: balance } = await rpc.getBalance(payer.address).send();
if (balance < MIN_PAYER_LAMPORTS) {
  console.log(`Setup payer ${payer.address} has ${Number(balance) / 1e9} SOL, requesting devnet airdrop...`);
  try {
    await airdropFactory({ rpc, rpcSubscriptions })({
      recipientAddress: payer.address,
      lamports: lamports(1_000_000_000n),
      commitment: "confirmed",
    });
    ({ value: balance } = await rpc.getBalance(payer.address).send());
  } catch (err) {
    console.error(
      `\nAirdrop failed (${err.message}). The public devnet faucet is often rate-limited.\n` +
        `Fund the setup payer with ~0.1 devnet SOL at https://faucet.solana.com :\n\n    ${payer.address}\n\n` +
        `then run "npm run setup" again.`,
    );
    process.exit(1);
  }
}

const BATCH = 4;
for (let i = 0; i < todo.length; i += BATCH) {
  const ids = todo.slice(i, i + BATCH);
  const ixs = await Promise.all(
    ids.map((id) =>
      getCreateAssociatedTokenIdempotentInstructionAsync({
        payer,
        owner: address(pub.endpoints[id].address),
        mint: USDC_DEVNET_MINT,
      }),
    ),
  );
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  const msg = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstructions(ixs, m),
  );
  const signed = await signTransactionMessageWithSigners(msg);
  await sendAndConfirm(signed, { commitment: "confirmed" });
  console.log(`  created USDC accounts for ${ids.join(", ")}  tx=${getSignatureFromTransaction(signed)}`);
}
console.log("Done.");
printNextSteps();
process.exit(0);

function printNextSteps() {
  console.log(
    `\nTo test a purchase, fund the test buyer with devnet USDC at https://faucet.circle.com (network: Solana Devnet):\n` +
      `    ${pub.testBuyer}\n` +
      `It needs no SOL: the x402 facilitator pays transaction fees.\n` +
      `Then: npm start   and   npm run buy -- weather-api-1/current city=Austin`,
  );
}
