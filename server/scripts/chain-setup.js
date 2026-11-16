// One-time Solana setup for the Vouch server.
//
//   npm run chain:setup
//
// 1. Creates the server's own Solana key (saved to .env as SOLANA_SERVER_SECRET_KEY)
//    if it doesn't exist yet.
// 2. Checks it has SOL (each rating costs a tiny fee + storage, ~0.003 SOL).
// 3. Runs the program's `initialize`, which makes this key the ONLY one that can
//    submit ratings. This can only ever happen once.
import "dotenv/config";
import fs from "node:fs";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createChain, DEFAULT_PROGRAM_ID, explorerAddress, explorerTx } from "../src/solana.js";

const ENV_FILE = new URL("../.env", import.meta.url);

let secret = process.env.SOLANA_SERVER_SECRET_KEY;
if (!secret) {
  const kp = Keypair.generate();
  secret = JSON.stringify(Array.from(kp.secretKey));
  fs.appendFileSync(ENV_FILE, `\n# Server's Solana key (only key allowed to write ratings). Never commit.\nSOLANA_SERVER_SECRET_KEY=${secret}\n`);
  console.log(`Created the server's Solana key and saved it to server/.env`);
}

const chain = createChain({
  rpcUrl: process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
  programId: process.env.VOUCH_PROGRAM_ID || DEFAULT_PROGRAM_ID,
  secretKey: JSON.parse(secret),
});
console.log(`Program:    ${chain.programId}`);
console.log(`Server key: ${chain.authority}`);

const owner = await chain.configAuthority();
if (owner === chain.authority) {
  console.log("Already set up: the program accepts ratings from this server key.");
} else if (owner) {
  console.error(`The program was already set up for a different key (${owner}). Use that key in SOLANA_SERVER_SECRET_KEY.`);
  process.exit(1);
} else {
  const lamports = await chain.connection.getBalance(new (await import("@solana/web3.js")).PublicKey(chain.authority));
  if (lamports < 0.01 * LAMPORTS_PER_SOL) {
    console.error(`\nThe server key has ${lamports / LAMPORTS_PER_SOL} SOL. Send it ~0.5 devnet SOL, then run this again:`);
    console.error(`  solana transfer ${chain.authority} 0.5 --allow-unfunded-recipient   (from WSL)`);
    process.exit(1);
  }
  const tx = await chain.initialize();
  console.log(`Set up! Only ${chain.authority} can submit ratings now.`);
  console.log(`  ${explorerTx(tx)}`);
}

const lamports = await chain.connection.getBalance(new (await import("@solana/web3.js")).PublicKey(chain.authority));
console.log(`Balance:    ${lamports / LAMPORTS_PER_SOL} SOL (~${Math.floor(lamports / (0.003 * LAMPORTS_PER_SOL))} ratings)`);
console.log(`Explorer:   ${explorerAddress(chain.programId)}`);
