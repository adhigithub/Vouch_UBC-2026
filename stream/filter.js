// Vouch: QuickNode Streams filter (Solana devnet, block dataset)
//
// Paste this whole file into the Stream's "Filter" box in the QuickNode dashboard.
// It runs inside QuickNode's sandbox: no require/import, no network, no fs.
//
// Keeps only successful USDC payments INTO one of our 9 endpoint USDC accounts and
// reshapes each one into the webhook payload agreed in PROJECT_STATUS.md section 5:
//   { payments: [ { paymentId, slot, blockTime, mint, amountRaw, amount,
//                   from, fromTokenAccount, to, toTokenAccount } ] }
//
// How a payment is detected: from the transaction's token balance changes
// (meta.preTokenBalances / meta.postTokenBalances), not by decoding instructions.
// That way `transfer` and `transferChecked` are handled the same, and the payer
// is the OWNER of the USDC account whose balance went down. That owner is the real
// buyer, not the fee payer (the PayAI facilitator pays the fee and signs first).
//
// Keep DESTINATIONS in sync with fake-apis/wallets.json (run `npm run check` in stream/).

const USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const USDC_DECIMALS = 6;

// endpoint USDC account (usdcAta) -> endpoint wallet (address)
const DESTINATIONS = {
  "A2cc2VHmBQfG8vAcyqoAGTv4vzitefWtdVMXe6w43dd1": "GTtYxuMqU4sYY5YCPSsd92LQJSf1qtWdMbH9Xaz8NXTL", // weather-api-1/current
  "BsVoMQq2Tyo6fkYgJmxo6xEY3qseoEKJSCzzaBHeZLD9": "8gX4GSt833T5a3DJn7buZg7B7qL42TtV8XdxGWEBD5EL", // weather-api-1/forecast
  "6jjvvny4oA1oqzfPXpwmvMUrN42DF6k5jTddy6bYP6og": "8vRvFh4QLFDNUBXCDTFoDP83d2boik49Z9oitbyoB8wK", // weather-api-2/current
  "AZCTBWo2bYUq8pbBgBa8Hfhh5qS4F9Zb6QhSfYu8UGxn": "ALfnUtgmZa85qVhkGYYegvgDwdUz72pCrhh2S5vsdC6D", // weather-api-3/current
  "8z18vv3vDzXPVxsTguwQVyKEBTc8PvAUhQgQDS1tKwau": "BBTmvGQFnE6bTFdZmtFpTXXdyjrDoH7mnKV3XXaShDwU", // weather-api-4/current
  "CebG8dFeZPY1vRnkdUjUUM8AsRp1qE3Hb7YNgZWDiooD": "nesbjtCyaTZbaj8neyZAnc4gHasXtupxwgQG5JdeifZ",  // crypto-api-1/price
  "EQEfBFzHAP4uw18y62t2Ga652YpWgorG9W3nJ2wjYGjt": "D2EwMGVDsCSDHDdKKXaWQWmsUjnzgwu1UqYd3H699vrq", // crypto-api-2/price
  "5SMntp4Z7yGELLPENg9w51dRCkZcv8sJ5dEy7fBQGmpj": "7ioagZfQmSoZrGpvjNR1wP3SjJLHz17qmiYdtvCWm8Fj", // crypto-api-3/price
  "8ouGs43mBzZgKwnWJocKbbDe17PQuXQv4k7E2uPs6SmE": "5RPzgeqNMgoC38G4hhsznm3gmo9eJfd1AEN7hdr68noy", // crypto-api-4/price
};

function main(stream) {
  const blocks = Array.isArray(stream.data) ? stream.data : [stream.data];
  const metadata = stream.metadata || {};
  const payments = [];

  for (const block of blocks) {
    if (!block || !Array.isArray(block.transactions)) continue;
    const slot = blockSlot(block, metadata, blocks.length);
    for (const tx of block.transactions) {
      for (const p of paymentsInTx(tx)) {
        p.slot = slot;
        p.blockTime = block.blockTime ?? null;
        payments.push(orderFields(p));
      }
    }
  }

  return payments.length ? { payments } : null; // null = deliver nothing for this block
}

// All payments into our endpoints made by one transaction (usually 0 or 1).
function paymentsInTx(tx) {
  const meta = tx && tx.meta;
  if (!meta || meta.err !== null) return []; // ignore failed transactions
  const message = tx.transaction && tx.transaction.message;
  if (!message) return [];

  const keys = accountKeys(message, meta);
  const changes = usdcBalanceChanges(meta, keys);

  const received = changes.filter((c) => c.delta > 0n && DESTINATIONS[c.account]);
  if (!received.length) return [];

  // The account whose USDC went down the most is the payer's.
  const sent = changes.filter((c) => c.delta < 0n).sort((a, b) => (a.delta < b.delta ? -1 : 1));
  const source = sent[0];
  if (!source) return []; // e.g. a mint into our account, not a payment

  return received.map((r) => ({
    paymentId: tx.transaction.signatures[0],
    mint: USDC_MINT,
    amountRaw: r.delta.toString(),
    amount: Number(r.delta) / 10 ** USDC_DECIMALS,
    from: source.owner,
    fromTokenAccount: source.account,
    to: DESTINATIONS[r.account],
    toTokenAccount: r.account,
  }));
}

// Balance change per USDC token account in this transaction.
function usdcBalanceChanges(meta, keys) {
  const byIndex = {};
  const add = (list, sign) => {
    for (const b of list || []) {
      if (b.mint !== USDC_MINT) continue;
      const e = byIndex[b.accountIndex] || (byIndex[b.accountIndex] = { owner: b.owner, delta: 0n });
      e.delta += sign * BigInt(b.uiTokenAmount.amount);
      if (!e.owner) e.owner = b.owner;
    }
  };
  add(meta.preTokenBalances, -1n);
  add(meta.postTokenBalances, 1n);

  return Object.keys(byIndex).map((i) => ({
    account: keys[Number(i)],
    owner: byIndex[i].owner,
    delta: byIndex[i].delta,
  }));
}

// Account addresses in the order token balance `accountIndex` refers to.
// "json" encoding: strings, plus lookup-table addresses in meta.loadedAddresses (v0 txs).
// "jsonParsed" encoding: objects with .pubkey that already include the loaded ones.
function accountKeys(message, meta) {
  const raw = message.accountKeys || [];
  if (raw.length && typeof raw[0] === "object") return raw.map((k) => k.pubkey);
  const loaded = meta.loadedAddresses || {};
  return raw.concat(loaded.writable || [], loaded.readonly || []);
}

// Solana getBlock results have no slot field, so fall back to the stream metadata
// when the batch holds exactly one block.
function blockSlot(block, metadata, blockCount) {
  if (block.slot != null) return block.slot;
  if (blockCount === 1 && metadata.batch_start_range != null) return Number(metadata.batch_start_range);
  return null;
}

// Same field order as the contract, so payloads are easy to compare by eye.
function orderFields(p) {
  return {
    paymentId: p.paymentId,
    slot: p.slot,
    blockTime: p.blockTime,
    mint: p.mint,
    amountRaw: p.amountRaw,
    amount: p.amount,
    from: p.from,
    fromTokenAccount: p.fromTokenAccount,
    to: p.to,
    toTokenAccount: p.toTokenAccount,
  };
}
