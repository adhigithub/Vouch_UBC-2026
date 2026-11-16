// Shows the agent wallet's address and its devnet SOL + USDC balances.
// Run: node balance.js
import "dotenv/config";
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

const USDC_DEVNET = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const conn = new Connection("https://api.devnet.solana.com");
const wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.AGENT_SECRET_KEY)));

const sol = await conn.getBalance(wallet.publicKey);
const { value } = await conn.getParsedTokenAccountsByOwner(wallet.publicKey, { mint: USDC_DEVNET });
const usdc = value[0]?.account.data.parsed.info.tokenAmount.uiAmount ?? 0;

console.log(`Address: ${wallet.publicKey.toBase58()}`);
console.log(`SOL:     ${sol / LAMPORTS_PER_SOL}`);
console.log(`USDC:    ${usdc}`);
