# fake-apis

Practice x402 endpoints for Vouch. Each one charges USDC on **Solana devnet**. Some return good data and some are junk, so the agent and the tester bot have something to tell apart.

## Endpoints

| Endpoint ID | Task | Price | Behaviour (secret) | Fails check |
| --- | --- | --- | --- | --- |
| `weather-api-1/current` | weather | $0.01 | good | none |
| `weather-api-1/forecast` | weather-forecast | $0.01 | good | none |
| `weather-api-2/current` | weather | $0.02 | good, pricier | none (price tie-break) |
| `weather-api-3/current` | weather | $0.01 | wrong city, 150°F+ temps | 3. makes sense |
| `weather-api-4/current` | weather | $0.01 | temperature as text, renamed fields | 2. right format |
| `crypto-api-1/price` | crypto-price | $0.01 | good | none |
| `crypto-api-2/price` | crypto-price | $0.01 | correct but ~5s late | 4. fast enough |
| `crypto-api-3/price` | crypto-price | $0.01 | takes payment, returns empty body | 1. got something |
| `crypto-api-4/price` | crypto-price | $0.01 | good 50% of the time | random |

- Weather: `?city=Austin` (also Vancouver, New York, San Francisco, Chicago, Seattle, Miami, London, Tokyo, Toronto). Temperatures are in °F.
- Crypto: `?symbol=BTC` (also ETH, SOL, USDC).
- Good endpoints use live data from Open-Meteo and CoinGecko, so the agent's "makes sense" check can compare against a second source. They fall back to simulated values if those services are down.
- Junk responses are HTTP 200 on purpose. x402 only charges for responses below 400, so the buyer pays for garbage, which is the scam Vouch catches. Bad input (an unknown city) returns 400 and is never charged.

## Free routes

| Route | Use |
| --- | --- |
| `GET /catalog` | Every endpoint with URL, price, task, schema, `payTo` wallet and its USDC token account. The Vouch server can register endpoints from this. |
| `GET /payments` | Recent payments this server settled, with tx signatures. For debugging only; QuickNode is the source of truth. |
| `GET /admin/modes` | Current mode per endpoint |
| `POST /admin/modes` | `{"endpointId":"weather-api-1/current","mode":"sanity"}` breaks an endpoint live, for the "score crashes" demo |
| `POST /admin/reset` | Restore default modes |

Modes: `good`, `slow`, `format`, `sanity`, `empty`, `flaky`, `error` (500, not charged). If `ADMIN_TOKEN` is set, admin routes need the `x-admin-token` header.

## Run

```bash
cd fake-apis
npm install
cp .env.example .env

# Free mode (no wallets or funds needed, good for building the agent):
npm run start:free

# Real x402 payments:
npm run setup     # makes wallets + endpoint USDC accounts (see below)
npm start         # http://localhost:3001
npm run buy -- weather-api-1/current city=Austin
```

### One-time devnet setup

1. `npm run setup` generates a wallet per endpoint and writes `wallets.json` (public, committed) and `wallets.secret.json` (secret keys, gitignored).
2. Each endpoint needs a USDC token account before it can receive x402 payments. Creating them costs about 0.02 SOL in total. If the automatic airdrop fails, send ~0.1 devnet SOL from https://faucet.solana.com to the **setup payer** address it prints, then run `npm run setup` again.
3. To test buying, get devnet USDC from https://faucet.circle.com (choose Solana Devnet) and send it to the **test buyer** address it prints. Buyers need no SOL because the facilitator pays fees.

## For the other parts of Vouch

- **Agent:** see [scripts/buy.js](scripts/buy.js) for paying with `@x402/fetch` and `@x402/svm`. The tx signature in the `PAYMENT-RESPONSE` header is the `paymentId` for `POST /rate`.
- **QuickNode Stream filter:** USDC transfers whose destination is one of the `usdcAta` values in [wallets.json](wallets.json). Mint: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`.
- **Vouch server:** register endpoints from `GET /catalog`. Never trust `/payments` for stamping.
