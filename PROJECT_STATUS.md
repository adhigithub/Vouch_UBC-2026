# Vouch: Project Status and Next Steps

**As of:** Mon Nov 16, 2026 (`main` at `607a07b`)
**Submission deadline:** Fri Nov 20, 12:00 PM CST (aim for 11 AM)
**Finals:** Sat Nov 21, in person in Austin

Full plan: `VOUCH.md`. This file covers what's built, what's still mocked, and how we split the next work so we can build in parallel.

---

## 1. The goal

Vouch gives every x402 endpoint a **trust score from 0 to 100**. Before an AI agent pays for data, it asks Vouch and only buys from endpoints that have proven they deliver. After each purchase, the agent rates what it got. Every rating must be tied to a **real payment**, and ratings are saved on **Solana** so nobody can quietly delete them.

**The must-have demo:**

```
agent pays → QuickNode sees the payment → Vouch server verifies it and stamps the rating
          → rating saved on Solana → score updates → junk endpoints get skipped
```

---

## 2. What's done (on `main`)

### `agent/`: the AI agent ✅
- **Wallet** on Solana devnet: `Ft84bfshg85DA5As9mcWUdKmvjBb3YQv59onpPHggQbZ` (secret key in `agent/.env`, gitignored).
- **Real x402 payments.** The agent pays endpoints in devnet USDC by itself. Tested end to end, and the transfers are visible on Solana Explorer.
- **The 4 checks:** got something, right format, makes sense (compared with Open-Meteo / CoinGecko), fast enough. They correctly judge all 9 fake endpoints.
- **Decision loop and safety limits** (VOUCH.md §10): min score 60, max $0.05 per call, $0.25 per task, 2 retries, allowlist if Vouch is down.
- **Rates every purchase** with `paymentId` = the Solana transaction signature.

### `fake-apis/`: practice endpoints ✅
- 9 endpoints (4 good, 5 junk), each charging USDC on devnet via x402, each with its **own receiving wallet** (`fake-apis/wallets.json`).
- All 9 endpoint USDC accounts now exist on devnet, so they can receive payments.
- `GET /catalog` lists every endpoint with URL, price, schema and wallet. `POST /admin/modes` breaks an endpoint live for demos.
- **Payment facilitator: PayAI** (`https://facilitator.payai.network`). The x402.org facilitator failed every devnet settlement with 429 rate limits.
- Good endpoints no longer serve made-up data when their upstream is slow (retry, last-real-value fallback, startup warm-up).

### How to run what exists

```bash
# Terminal 1: fake APIs with real payments
cd fake-apis && npm install && npm start          # http://localhost:3001

# Terminal 2: the agent
cd agent && npm install
PAYMENTS=on node agent.js weather city=Austin     # one real purchase
node check-all.js                                 # run the 4 checks on all 9 endpoints
node balance.js                                   # wallet SOL + USDC
```

---

## 3. What's still mocked

| Mock | Stands in for | Problem until replaced |
|---|---|---|
| `agent/src/mock-vouch.js` | The Vouch server (`/best`, `/rate`) | Runs inside the agent, so scores aren't shared |
| Its scoring (+5 good / −20 bad) | The real formula (VOUCH.md §7) | No tests, human reviews or repeat customers |
| Its "stamp" | Payment verification via QuickNode | **Accepts any paymentId**, so fake ratings get through |
| `agent/mock-scores.json` | The Solana program | Ratings live in a local file, not on-chain |

The agent switches to the real server by setting `VOUCH_URL` in `agent/.env`. No code changes needed.

---

## 4. Work split for right now

| Who | Builds | Branch | Folder |
|---|---|---|---|
| **AdHi018** | Vouch server | `vouch-server` | `server/` |
| **ameya-d5** | QuickNode Stream | `quicknode-stream` | `stream/` (filter code + setup notes) |

Both pieces meet at **one place: the webhook** (section 5). If we agree on that now, neither of us has to wait for the other.

### ameya-d5: QuickNode Stream

**Goal:** whenever an agent pays one of our endpoints, QuickNode tells the Vouch server "payment X really happened."

| Setting | Value |
|---|---|
| Network | Solana **devnet** |
| Dataset | Transactions (or blocks, filtered down to transactions) |
| Filter | Keep only **USDC transfers whose destination token account is one of the 9 `usdcAta` values in `fake-apis/wallets.json`** |
| USDC mint (devnet) | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` (6 decimals, so 0.01 USDC = `10000`) |
| Destination | Webhook: `POST <vouch-server>/webhook/quicknode` |
| Commitment | `confirmed` or `finalized` (not `processed`) |

**Steps:**
1. **Confirm first** that QuickNode Streams supports Solana devnet with a custom filter (open question in VOUCH.md §22). If it doesn't, tell AdHi018 right away, so we can plan a fallback (server checks transactions directly over RPC).
2. Write the filter function. It reshapes each match into the payload in section 5.
3. Point the stream at a temporary receiver (e.g. webhook.site, or a tiny local server exposed with ngrok) until the Vouch server is ready.
4. Generate real test payments: `cd fake-apis && npm run buy -- weather-api-1/current city=Austin`, or run the agent with `PAYMENTS=on`.
5. Check the payload matches section 5 exactly, then switch the destination to the Vouch server.
6. Write the README section (required for the bounty): network, dataset, filter, destination, why.

**Gotchas we already hit:**
- **The fee payer is NOT the buyer.** The PayAI facilitator pays the transaction fee (its fee payer is `2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4`), so the transaction's first signer is the facilitator. The real payer is the **owner of the source USDC account** (the transfer's authority). `from` in the payload must be that wallet.
- Match on the **destination token account** (`usdcAta`), not the endpoint wallet address. USDC moves between token accounts.
- x402 on Solana uses `transferChecked`. Handle plain `transfer` too, just in case.
- Ignore failed transactions (`meta.err` not null).
- The same payment may be delivered twice. That's fine: the server de-duplicates by `paymentId`.

**Later (stretch):** a second filter for funding transfers **into** rater wallets, for the fake-wallet defense (VOUCH.md §9).

### AdHi018: Vouch server

1. **API** (VOUCH.md §11): `GET /best?task=` returns a **ranked list** (the agent retries the next-best), plus `POST /rate`, `GET /scores`, `POST /review`.
2. **`POST /webhook/quicknode`**: accept the section 5 payload, check the shared secret, store payments as "verified".
3. **`/rate` rules:** reject if the payment isn't verified (`400`, or `202 pending` if QuickNode hasn't reported it yet), was already used (`409`), went to a different endpoint than the one being rated, or was for less than the price.
4. **Scoring engine** (VOUCH.md §7): `0.4T + 0.3A + 0.2H + 0.1R`, the test cap (`score ≤ T + 10`), "Unrated" label, cutoff 60, cheaper wins ties.
5. **Register endpoints** from the fake APIs' `GET /catalog`.
6. Until the Solana program exists, keep ratings in SQLite/JSON behind one function (`saveRating()`), so swapping in the on-chain call later is a one-line change.

**Known hole to close:** payment IDs are public on-chain, so anyone could submit a rating for someone else's payment. `/rate` should require the rating to be **signed by the paying wallet** and check the signer matches `from`.

---

## 5. The webhook contract (agree on this first)

`POST /webhook/quicknode`

Header: `x-vouch-webhook-secret: <shared secret from .env>`. Or use QuickNode's built-in security token if Streams provides one; either way the server must reject unauthenticated calls, otherwise anyone can fake "verified" payments.

```json
{
  "payments": [
    {
      "paymentId": "3zvgeXJhSoCuLRvN99a9SKfwYAEotKDRriif1TH3VqXtxdJBRzBunh7aiPKAj1oTFpcVGCDk5BBVbLWuMwp1LeTQ",
      "slot": 452318871,
      "blockTime": 1763309687,
      "mint": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
      "amountRaw": "10000",
      "amount": 0.01,
      "from": "Ft84bfshg85DA5As9mcWUdKmvjBb3YQv59onpPHggQbZ",
      "fromTokenAccount": "<payer's USDC account>",
      "to": "GTtYxuMqU4sYY5YCPSsd92LQJSf1qtWdMbH9Xaz8NXTL",
      "toTokenAccount": "A2cc2VHmBQfG8vAcyqoAGTv4vzitefWtdVMXe6w43dd1"
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `paymentId` | Transaction signature, the same value the agent sends to `/rate` |
| `from` | Wallet that paid (owner of the source USDC account, **not** the fee payer) |
| `to` / `toTokenAccount` | Endpoint wallet / its USDC account (the server maps this to `endpointId` via `wallets.json`) |
| `amountRaw` / `amount` | Base units (6 decimals) / human USDC |

- Server replies `200 { "received": n }` fast, and is idempotent by `paymentId`.
- `paymentId`, `from`, `to` and `toTokenAccount` above are from a **real** devnet payment in our testing (use it to test the parser). `slot` and `blockTime` are illustrative.

---

## 6. After these two pieces

In order:
1. **Solana program** (Anchor, needs **WSL** on Windows): `Config`, `EndpointRecord`, `PaymentUsed`. Only the server's key can submit ratings, and each payment rates once. Required for **Best use of Solana**.
2. **Tester bot**: secret-shopper tests on a schedule, which feed `T` in the score. This also fixes cold start: `weather-api-2` ($0.02) is good, but no agent will try it while it's unrated.
3. **Website**: leaderboard, endpoint page, live feed, attack-demo view, review form.
4. **Grok Bot**: alerts on X first (most feasible); reviews and scouting if time allows.
5. **Submission**: README (decision loop, safety limits, program ID, Stream setup, Grok section), 2–3 min video, Devpost answers, pitch.

**If we run short on time, cut in this order:** Grok Bot → fake-wallet clusters → review form → tester bot (use fixed test scores).

---

## 7. Team rules

- Never commit keys. `.env` and `wallets.secret.json` are gitignored. **Never `git add .`**; add files by name.
- Work on branches, merge to `main` when it works, and `git pull` before starting.
- Devnet SOL: faucet.solana.com (2 requests / 8 h). Devnet USDC: faucet.circle.com (choose Solana Devnet).
- Ask early: if something in VOUCH.md §22 (Grok Bot, QuickNode devnet support) turns out not to work, tell the other person the same day.
