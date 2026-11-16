// Turns a Solana transaction into the webhook payment format (PROJECT_STATUS.md section 5).
//
// Used by scripts/simulate-stream.js today. The QuickNode Stream filter must
// produce exactly the same shape, so this is also the reference for it.
//
// Input: a transaction as returned by getParsedTransaction (jsonParsed encoding).

const TOKEN_PROGRAMS = new Set(["spl-token", "spl-token-2022"]);

/**
 * @param {object} tx                       parsed transaction
 * @param {object} opts
 * @param {string} opts.mint                USDC mint to accept
 * @param {Set<string>} opts.tokenAccounts  our endpoints' USDC token accounts
 * @returns {object[]} matching payments (usually 0 or 1)
 */
export function paymentsFromTransaction(tx, { mint, tokenAccounts }) {
  if (!tx || tx.meta?.err) return []; // failed transactions moved no money

  const keys = tx.transaction.message.accountKeys.map((k) => (typeof k === "string" ? k : k.pubkey.toString()));
  const balanceOf = (account) => {
    const index = keys.indexOf(account);
    return (tx.meta.postTokenBalances || []).find((b) => b.accountIndex === index);
  };

  const instructions = [
    ...tx.transaction.message.instructions,
    ...(tx.meta.innerInstructions || []).flatMap((ii) => ii.instructions),
  ];

  const out = [];
  for (const ix of instructions) {
    if (!TOKEN_PROGRAMS.has(ix.program) || !ix.parsed) continue;
    const { type, info } = ix.parsed;
    if (type !== "transfer" && type !== "transferChecked") continue;
    if (!tokenAccounts.has(info.destination)) continue;

    const dest = balanceOf(info.destination);
    const ixMint = info.mint ?? dest?.mint; // plain "transfer" doesn't name the mint
    if (ixMint !== mint) continue;

    const amountRaw = String(info.tokenAmount?.amount ?? info.amount);
    out.push({
      paymentId: tx.transaction.signatures[0],
      slot: tx.slot,
      blockTime: tx.blockTime ?? null,
      mint: ixMint,
      amountRaw,
      amount: Number(amountRaw) / 1e6,
      // The payer is the transfer's authority (owner of the source account),
      // NOT the fee payer: the x402 facilitator pays fees for the buyer.
      from: info.authority ?? info.multisigAuthority,
      fromTokenAccount: info.source,
      to: dest?.owner ?? null,
      toTokenAccount: info.destination,
    });
  }
  return out;
}
