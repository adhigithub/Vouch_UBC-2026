# QuickNode Stream: payment verification

Vouch only accepts a rating if it is tied to a **real payment**. The agent says
"I paid, here's the transaction signature", but the Vouch server doesn't take the
agent's word for it. A QuickNode Stream watches Solana and tells the server
independently which payments really happened.

```
agent pays endpoint (x402, USDC on devnet)
   → Solana confirms the transfer
   → QuickNode Stream sees the block, filter.js keeps only our payments
   → POST /webhook/quicknode on the Vouch server (signed by QuickNode)
   → server marks paymentId as "verified"
   → /rate accepts a rating only for a verified, unused paymentId
```

## Stream setup

| Setting | Value | Why |
|---|---|---|
| Chain / network | Solana **Devnet** | Our x402 endpoints charge devnet USDC |
| Dataset | **Block** (`getBlock` data, full transactions) | Token balance changes in `meta` show who paid whom |
| Start | Latest block (follow the tip) | Only new payments matter; also the only option on the free plan |
| Batch size | 1 | Lets the filter take the slot from stream metadata |
| Filter | [`filter.js`](filter.js) (JavaScript, paste the whole file) | Cuts every block down to just our payments |
| Destination | Webhook → `https://<vouch-server>/webhook/quicknode` | The server stores verified payments |
| Payload compression | None | Simpler to debug; gzip also works (receiver handles both) |
| Security token | Copy into `QN_STREAM_SECRET` on the server | Server rejects anything not signed by our Stream |

### What the filter keeps

A transaction is delivered only if **all** of these hold:

- it succeeded (`meta.err === null`)
- the USDC (mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`) balance of one of
  our **9 endpoint USDC accounts** (`usdcAta` in [`../fake-apis/wallets.json`](../fake-apis/wallets.json)) went **up**
- some other USDC account went **down** (the payer's)

Everything else, which is nearly all devnet traffic, returns `null` and nothing is sent.

**How the payer is found:** we read the token balance changes
(`meta.preTokenBalances` → `meta.postTokenBalances`) instead of decoding instructions.
`from` is the **owner of the USDC account that was debited**. That's the real buyer.
It is *not* the transaction's first signer, which is the PayAI facilitator paying the fee.
Reading balances also handles `transfer` and `transferChecked` the same way, and
it works for legacy, v0 and v1 transactions (lookup-table addresses included).

## Webhook payload

Exactly the contract in `PROJECT_STATUS.md` §5. This is a real delivery produced by
`filter.js` from devnet:

```json
{
  "payments": [
    {
      "paymentId": "5FYNhxfbtXBqxnKUiM2zYSyXp7C6zGUVKournWH1DsK2XxFvoDYvQtS1tW95ir8kLqW1ArEHJzkqceNPMM1KegH4",
      "slot": 522993183,
      "blockTime": 1794852562,
      "mint": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
      "amountRaw": "10000",
      "amount": 0.01,
      "from": "Ft84bfshg85DA5As9mcWUdKmvjBb3YQv59onpPHggQbZ",
      "fromTokenAccount": "684pK2QEaXm8ScUZC1EvNz1fQNd7bhijxJuonmoJa7kq",
      "to": "GTtYxuMqU4sYY5YCPSsd92LQJSf1qtWdMbH9Xaz8NXTL",
      "toTokenAccount": "A2cc2VHmBQfG8vAcyqoAGTv4vzitefWtdVMXe6w43dd1"
    }
  ]
}
```

## Authentication (for the Vouch server)

We use QuickNode's built-in signing instead of a custom header. Every delivery has:

| Header | |
|---|---|
| `X-QN-Nonce` | random per delivery |
| `X-QN-Timestamp` | unix seconds |
| `X-QN-Signature` | `hex(HMAC_SHA256(securityToken, nonce + timestamp + rawBody))` |

[`verify-signature.js`](verify-signature.js) does the check, with no dependencies.
The server can copy it:

```js
import { verifyQuickNodeSignature } from "./verify-signature.js";
// IMPORTANT: verify the raw body text, not JSON.stringify(req.body)
app.post("/webhook/quicknode", express.text({ type: "*/*" }), (req, res) => {
  const check = verifyQuickNodeSignature(req.headers, req.body, process.env.QN_STREAM_SECRET);
  if (!check.ok) return res.status(401).json({ error: check.reason });
  const { payments } = JSON.parse(req.body);
  // store each as verified, idempotent by paymentId
  res.json({ received: payments.length });
});
```

Server notes:
- **Reply 2xx fast.** The Stream won't move to the next block until it gets one,
  and after 3 failed retries it **pauses** (resume it in the dashboard).
- **The same payment can arrive twice.** De-duplicate by `paymentId`.
- Map `toTokenAccount` → endpoint id with `wallets.json`.

## Tools in this folder

```bash
cd stream
cp .env.example .env              # put the Stream's security token in QN_STREAM_SECRET

npm run check                     # filter.js vs wallets.json + run it on the latest real payments
node test-filter.js <sig> --block # run it on the whole block a payment landed in
npm run receiver                  # temporary webhook on :4000 (stand-in for the server)
npm run send-sample               # send a correctly signed fake delivery to it
npm run send-sample -- <url> --bad   # wrong signature, should get 401
```

No `npm install` needed (Node 22+, built-ins only).

**If you change endpoint wallets** (`npm run setup` in `fake-apis/`), update
`DESTINATIONS` in `filter.js`, re-paste it into QuickNode, and run `npm run check`.

## Step-by-step: going live

1. QuickNode dashboard → **Streams → Create Stream** → Solana, **Devnet**, dataset **Block**.
2. Paste `filter.js` into the filter editor. Use **Test filter** on a block that holds one
   of our payments (e.g. slot `522993183`) and check you get the payload above.
3. Destination: Webhook. Until the server is ready: `npm run receiver` + `ngrok http 4000`,
   and use `https://<ngrok-id>/webhook/quicknode`.
4. Copy the Stream's **security token** into `stream/.env` as `QN_STREAM_SECRET`.
5. Make a real payment: `cd fake-apis && npm run buy -- weather-api-1/current city=Austin`.
   It should show up in the receiver within a few seconds.
6. Switch the destination to the Vouch server's URL and give the server the same token.

## Fallback

If Streams ever stops delivering (paused, out of credits), the server can verify a
`paymentId` directly over RPC with `getTransaction` and run the same balance-change
logic from `filter.js` (`paymentsInTx`) on the result. `test-filter.js` already does this.
