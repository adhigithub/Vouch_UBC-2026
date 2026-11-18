// One-time setup for the tester bot's own wallet.
//
//   node tester-setup.js            create the wallet (if needed) and give it 3 USDC
//   node tester-setup.js 5          ...or another amount
//
// 1. Creates TESTER_SECRET_KEY in .env if it doesn't exist (never commit .env).
// 2. Creates the tester's USDC account and sends it USDC from the agent's wallet.
//    The agent pays the small SOL fee; the tester's own purchases use x402, where
//    the facilitator pays the fees, so the tester only needs USDC.
import "dotenv/config";
import fs from "node:fs";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import { SOLANA_RPC_URL } from "./src/config.js";

const ENV_FILE = new URL("./.env", import.meta.url);
const USDC_MINT = new PublicKey(process.env.USDC_MINT || "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ATA_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const amount = Number(process.argv[2] || 3);

const ata = (owner) => PublicKey.findProgramAddressSync([owner.toBuffer(), TOKEN_PROGRAM.toBuffer(), USDC_MINT.toBuffer()], ATA_PROGRAM)[0];

let raw = process.env.TESTER_SECRET_KEY;
if (!raw) {
  const kp = Keypair.generate();
  raw = JSON.stringify(Array.from(kp.secretKey));
  fs.appendFileSync(ENV_FILE, `\n# Tester bot's wallet (Vouch's own inspector). Never commit.\nTESTER_SECRET_KEY=${raw}\n`);
  console.log("Created the tester bot's wallet and saved it to agent/.env");
}
const tester = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
const agent = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.AGENT_SECRET_KEY)));
const conn = new Connection(SOLANA_RPC_URL, "confirmed");

const from = ata(agent.publicKey);
const to = ata(tester.publicKey);
const raw6 = BigInt(Math.round(amount * 1e6));
const u64 = Buffer.alloc(8);
u64.writeBigUInt64LE(raw6);

const tx = new Transaction().add(
  // create the tester's USDC account if it doesn't exist yet
  new TransactionInstruction({
    programId: ATA_PROGRAM,
    keys: [
      { pubkey: agent.publicKey, isSigner: true, isWritable: true },
      { pubkey: to, isSigner: false, isWritable: true },
      { pubkey: tester.publicKey, isSigner: false, isWritable: false },
      { pubkey: USDC_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]), // CreateIdempotent
  }),
  // send USDC (transferChecked: amount + 6 decimals)
  new TransactionInstruction({
    programId: TOKEN_PROGRAM,
    keys: [
      { pubkey: from, isSigner: false, isWritable: true },
      { pubkey: USDC_MINT, isSigner: false, isWritable: false },
      { pubkey: to, isSigner: false, isWritable: true },
      { pubkey: agent.publicKey, isSigner: true, isWritable: false },
    ],
    data: Buffer.concat([Buffer.from([12]), u64, Buffer.from([6])]),
  }),
);

const sig = await sendAndConfirmTransaction(conn, tx, [agent], { commitment: "confirmed" });
const bal = await conn.getTokenAccountBalance(to);
console.log(`Tester wallet: ${tester.publicKey.toBase58()}`);
console.log(`Sent ${amount} USDC from the agent. Tester balance: ${bal.value.uiAmountString} USDC`);
console.log(`https://explorer.solana.com/tx/${sig}?cluster=devnet`);
