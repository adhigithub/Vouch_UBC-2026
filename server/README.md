# Vouch server

The brain in the middle: recommends trusted endpoints, verifies payments reported by QuickNode, stamps ratings that are tied to a real payment, and computes every endpoint's 0–100 score.

## Run

```bash
cd server
npm install
cp .env.example .env      # set QN_STREAM_SECRET (the Stream's security token) and ADMIN_TOKEN
npm start                 # http://localhost:4000 (loads endpoints from the fake APIs' /catalog)
npm test                  # scoring rules + every scam the server must block
```

Until the QuickNode Stream is live, run the stand-in in a second terminal. It watches Solana devnet for USDC payments into the endpoints' token accounts and posts them to the webhook in the same format:

```bash
npm run simulate-stream            # keep watching
npm run simulate-stream -- --once  # report recent payments once
```

Point the agent at the server with `VOUCH_URL=http://localhost:4000` (in `agent/.env`).

## Routes

| Route | What it does |
| --- | --- |
| `GET /best?task=weather` | Endpoints for a task, best first (score, then cheaper price) |
| `GET /scores` | Every endpoint with score, label and parts `{T, A, H, R}` |
| `GET /endpoints/:api/:name` | One endpoint plus its recent ratings and reviews |
| `GET /payments` | Recent verified payments (live feed) |
| `POST /webhook/quicknode` | Verified payments from QuickNode. Must be signed by our Stream (`X-QN-Signature`), or carry `x-vouch-webhook-secret` (the stand-in) |
| `POST /rate` | Agent rating: `{ endpointId, paymentId, rating, reason, rater, signature }` |
| `POST /review` | Human review: `{ endpointId, paymentId, stars, comment, source, reviewer, signature }` |
| `POST /admin/test-score` | Set an endpoint's test score T. Needs header `x-admin-token` |

### `/rate` rules

| Response | When |
| --- | --- |
| `200 stamped` | Payment verified, to this endpoint, at least the price, signed by the wallet that paid, never rated before |
| `400 payment_not_verified` | QuickNode hasn't reported this payment (made up, or not confirmed yet; the agent retries for ~25s) |
| `400 payment_for_different_endpoint` / `underpaid` | The payment doesn't match the endpoint being rated |
| `401 signature_required` / `bad_signature` | Not signed, or signed by someone else / tampered with |
| `403 not_the_payer` | The rater isn't the wallet that paid (payment IDs are public on Solana) |
| `409 payment_already_used` | This payment was already rated |

The signed text is built by `ratingMessage()` / `reviewMessage()` in `src/signatures.js`. The agent builds the same text in `agent/src/vouch.js`.

## Scoring (`src/scoring.js`)

`Score = 0.4 T + 0.3 A + 0.2 H + 0.1 R`

- **T** (tests): the tester bot's score. Until it exists, every endpoint starts at `DEFAULT_TEST_SCORE` (80).
- **A** (agent checks): share of good ratings. Each newer rating makes older ones count ×0.8, so a broken endpoint drops fast. Raters who have only ever paid one endpoint count half.
- **H** (human reviews): average stars, scaled to 0–100.
- **R** (repeat customers): share of paying wallets that came back. Only counted once 3+ wallets have paid.
- Missing parts have their weight shared among the rest. Ratings can't lift a score more than 10 above T. With no ratings or reviews, score = T, labelled `unrated`. Below 60 is labelled `avoid`.

## Swapping in the real pieces

- **QuickNode Stream** (`stream/` on the `quicknode-stream` branch): point the Stream's webhook at `https://<server>/webhook/quicknode` and put its security token in `QN_STREAM_SECRET`. The server checks QuickNode's HMAC signature over the raw body (`src/quicknode-signature.js`), un-gzips if needed, and de-duplicates by `paymentId`. The server must be reachable from the internet (e.g. `ngrok http 4000`).
  Quick test without QuickNode: `cd stream && npm run send-sample -- http://localhost:4000/webhook/quicknode` (same token in `stream/.env`).
- **Solana program**: `src/stamp.js` is the only place ratings are saved. Add the on-chain `submit_rating` call there.
