# Vouch: frontend website

Scroll-driven site for Vouch ("Yelp for AI agent purchases"). Vite + React + TypeScript, zero paid services: fonts are bundled locally (`@fontsource`), every graphic is CSS/SVG or a local asset in `public/assets/`.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static output in dist/
```

## Structure

| Path | What |
| --- | --- |
| `src/lib/vouchApi.ts` | **All data + Solana logic.** Types, mock world, live adapters. |
| `src/hooks/useScroll.ts` | Scroll progress, x402 playhead position, shared leaderboard state |
| `src/components/PlayheadRail.tsx` | Signature move: 6-step x402 transaction scrubbed by scroll (`[data-step]` markers) |
| `src/components/Hero.tsx` … `ActPipeline.tsx` | Acts I–IV (sticky, scroll-scrubbed) |
| `src/components/Leaderboard.tsx`, `DetailDrawer.tsx`, `LiveFeed.tsx` | Act V: leaderboard, PDA inspector, drawer, live payments |
| `src/components/Sandbox.tsx` | "Run Agent Loop" trace + payment-gated review form |
| `public/assets/` | Copied from `Public Resources/` and `Vouch_Concept25_Brand_Assets.zip` |

## Going live

Set `USE_MOCK_DATA = false` in `src/lib/vouchApi.ts`, and optionally `.env.local`:

```
VITE_VOUCH_API_BASE_URL=http://localhost:4000
VITE_FAKE_API_BASE_URL=http://localhost:3001
VITE_SOLANA_RPC_URL=https://api.devnet.solana.com
```

| Feature | Live call |
| --- | --- |
| Leaderboard | `GET /api/leaderboard` (array, or `{ leaderboard: [...] }`; accepts `parts: {T,A,H,R}` or `scoreBreakdown`) |
| Firehose + live scores | `GET /api/stream` (SSE; events `payment`, `rating`, `review`, `score`, `leaderboard`, or `message` with `type`) |
| Run Agent Loop | `GET /api/agent/run-demo` (SSE; `step` events with `message`/`stage`/`status`, then `done`) |
| Review | `POST /review` `{ txSig, endpointUrl, rating, comment, reviewerWallet, signature, message }` |
| Endpoint drawer | `GET /endpoints/:api/:name` (existing route) |
| Verify On-Chain | JSON-RPC `getAccountInfo` on devnet, **always real, in mock mode too** |

The review signature is the wallet's ed25519 signature (base58) over:

```
Vouch Review Authorization
Tx: <txSig>
Endpoint: <real route, e.g. /weather-api-3/current>
Rating: <0-100>
```

`ENDPOINT_REGISTRY` maps UI names to the real `fake-apis` routes and server ids. PDAs are derived at runtime from `["endpoint", endpointId]`.

### Server work still needed for live mode

The current `server/` does **not** implement `/api/leaderboard`, `/api/stream` or `/api/agent/run-demo`, and its `POST /review` expects `{ endpointId, paymentId, stars (1-5), reviewer, signature }` signed over `vouch-review-v1
...`. These need adding or adapting server-side before live mode works end to end.
