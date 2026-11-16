// Talks to the Vouch program on Solana (program/ in this repo).
//
// The program keeps a public, tamper-proof copy of every rating:
//   - only this server's key can write (set once by `initialize`)
//   - one rating per payment, enforced on-chain
//   - nothing can be edited or deleted
//
// Instructions are encoded by hand from the IDL (program/idl/vouch_program.json),
// so the server only needs @solana/web3.js.
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import { base58Decode } from "./signatures.js";

export const DEFAULT_PROGRAM_ID = "GyYPjRNghiX96xFtP98eNMiYjKfrF5ktKLf1Mm2YBgni";

// From the IDL: first 8 bytes of sha256("global:<instruction>") / sha256("account:<Account>").
const IX = {
  initialize: Buffer.from([175, 175, 109, 31, 13, 152, 155, 237]),
  submitRating: Buffer.from([238, 207, 253, 243, 170, 69, 73, 199]),
};
const ACCOUNT = {
  Config: Buffer.from([155, 12, 170, 224, 30, 250, 204, 130]),
  EndpointRecord: Buffer.from([254, 129, 23, 212, 108, 28, 237, 194]),
};
// Program error codes (IDL "errors").
const ERRORS = { 6000: "Unauthorized", 6001: "BadEndpointId", 6002: "ReasonTooLong", 6003: "EndpointMismatch", 6004: "Overflow" };

// ---------- Borsh encoding (the format Anchor programs read) ----------
const str = (s) => {
  const b = Buffer.from(s, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(b.length);
  return Buffer.concat([len, b]);
};
const u64 = (n) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
};

/** A Solana tx signature (base58) as 64 bytes, or null if it isn't one (e.g. free-mode IDs). */
export function paymentSigBytes(paymentId) {
  try {
    const b = base58Decode(paymentId);
    return b.length === 64 ? Buffer.from(b) : null;
  } catch {
    return null;
  }
}

export const explorerTx = (sig) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
export const explorerAddress = (addr) => `https://explorer.solana.com/address/${addr}?cluster=devnet`;

/**
 * @param {object} opts
 * @param {string} opts.rpcUrl
 * @param {string} [opts.programId]
 * @param {number[]} opts.secretKey  the server's key (JSON array, as in .env)
 */
export function createChain({ rpcUrl, programId = DEFAULT_PROGRAM_ID, secretKey }) {
  const connection = new Connection(rpcUrl, "confirmed");
  const program = new PublicKey(programId);
  const server = Keypair.fromSecretKey(Uint8Array.from(secretKey));

  const pda = (...seeds) => PublicKey.findProgramAddressSync(seeds, program)[0];
  const configPda = pda(Buffer.from("config"));
  const endpointPda = (endpointId) => pda(Buffer.from("endpoint"), Buffer.from(endpointId, "utf8"));
  const paymentPda = (sig) => pda(Buffer.from("payment"), sig.subarray(0, 32), sig.subarray(32, 64));

  const send = (ix) => sendAndConfirmTransaction(connection, new Transaction().add(ix), [server], { commitment: "confirmed" });

  return {
    programId: program.toBase58(),
    authority: server.publicKey.toBase58(),
    configAddress: configPda.toBase58(),
    connection,

    /** Who is allowed to write ratings, or null if the program isn't set up yet. */
    async configAuthority() {
      const acc = await connection.getAccountInfo(configPda);
      if (!acc) return null;
      return new PublicKey(acc.data.subarray(8, 40)).toBase58();
    },

    /** One-time setup: makes this server's key the only one that can write ratings. */
    async initialize() {
      return send(new TransactionInstruction({
        programId: program,
        keys: [
          { pubkey: server.publicKey, isSigner: true, isWritable: true },
          { pubkey: configPda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: IX.initialize,
      }));
    },

    /**
     * Write one rating on-chain. Returns the transaction signature.
     * Throws with err.code = "already_on_chain" if this payment was already recorded.
     */
    async submitRating({ endpointId, paymentId, rater, rating, reason, amountRaw }) {
      const sig = paymentSigBytes(paymentId);
      if (!sig) throw Object.assign(new Error("paymentId is not a Solana transaction signature"), { code: "not_a_tx_signature" });

      const data = Buffer.concat([
        IX.submitRating,
        str(endpointId),
        sig,
        new PublicKey(rater).toBuffer(),
        Buffer.from([rating === "good" ? 1 : 0]),
        str(reason ?? ""),
        u64(amountRaw ?? 0),
      ]);
      const ix = new TransactionInstruction({
        programId: program,
        keys: [
          { pubkey: server.publicKey, isSigner: true, isWritable: true },
          { pubkey: configPda, isSigner: false, isWritable: true },
          { pubkey: endpointPda(endpointId), isSigner: false, isWritable: true },
          { pubkey: paymentPda(sig), isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data,
      });
      try {
        return await send(ix);
      } catch (err) {
        throw explain(err);
      }
    },

    /** Has this payment already been rated on-chain? */
    async isPaymentRecorded(paymentId) {
      const sig = paymentSigBytes(paymentId);
      return !!sig && !!(await connection.getAccountInfo(paymentPda(sig)));
    },

    /** The on-chain good/bad totals for an endpoint, or null if never rated. */
    async endpointTotals(endpointId) {
      const acc = await connection.getAccountInfo(endpointPda(endpointId));
      if (!acc || !acc.data.subarray(0, 8).equals(ACCOUNT.EndpointRecord)) return null;
      const d = acc.data;
      const len = d.readUInt32LE(8);
      const o = 12 + len;
      return {
        address: endpointPda(endpointId).toBase58(),
        endpointId: d.subarray(12, o).toString("utf8"),
        good: d.readUInt32LE(o),
        bad: d.readUInt32LE(o + 4),
        lastRatedAt: Number(d.readBigInt64LE(o + 8)),
      };
    },
  };
}

// Turn Solana's raw errors into something readable.
function explain(err) {
  const logs = (err.transactionLogs || err.logs || []).join("\n");
  const text = `${err.message}\n${logs}`;
  if (/already in use/.test(text)) return Object.assign(new Error("payment already recorded on-chain"), { code: "already_on_chain" });
  const m = text.match(/custom program error: 0x([0-9a-f]+)/i);
  if (m) {
    const code = parseInt(m[1], 16);
    if (ERRORS[code]) return Object.assign(new Error(`program error ${ERRORS[code]}`), { code: ERRORS[code] });
  }
  return err;
}
