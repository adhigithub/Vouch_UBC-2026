// Creates a new Solana wallet for the agent and saves its secret key to .env.
// Run once: node create-wallet.js
import { Keypair } from "@solana/web3.js";
import fs from "fs";

if (fs.existsSync(".env") && fs.readFileSync(".env", "utf8").includes("AGENT_SECRET_KEY=")) {
  console.log("A wallet already exists in .env. Not creating another one.");
  process.exit(0);
}

const wallet = Keypair.generate(); // public key = address, secret key = password
const secret = JSON.stringify(Array.from(wallet.secretKey));

fs.appendFileSync(".env", `AGENT_SECRET_KEY=${secret}\n`);
console.log("Agent address:", wallet.publicKey.toBase58());
