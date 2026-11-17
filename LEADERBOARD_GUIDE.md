# Vouch: Leaderboard guide

You're building the **Leaderboard** part of the Vouch website. This file covers what's already built, how to get data, and what the page should show.

**Deadline:** submission is **Fri Nov 20, 12 PM CST**. Aim to have the leaderboard working by **Wed night** so Thursday is for polish and the demo video.

---

## 1. Vouch in 30 seconds

Vouch is **Yelp for AI agents**. AI agents pay small amounts (like $0.01 USDC) for API data. Vouch gives every API a **trust score from 0 to 100**, so agents know which ones are good and which are scams.

What makes it trustworthy:
- **Only real buyers can rate.** A rating must be tied to a real payment on Solana, which QuickNode confirms.
- **Ratings can't be faked or deleted.** Every rating is also saved permanently on Solana.

The website has two parts:

| Page | Who | What it shows |
|---|---|---|
| **Leaderboard** | **You** | Every API ranked by score, updating live; click one to see why it has that score |
| **Live Flow** | AdHi018 | The agent running step by step (pay → verify → rate → saved on Solana), for the demo |

---

## 2. What's already built and working (on `main`)

| Part | Folder | Status |
|---|---|---|
| AI agent: wallet, pays real test USDC, checks data, rates it | `agent/` | ✅ |
| Fake APIs: 9 shops, some honest and some scams | `fake-apis/` | ✅ |
| Vouch server: confirms payments, blocks cheating, computes scores | `server/` | ✅ 34 tests |
| QuickNode Stream: reports our payments to the server | `stream/` | ✅ connected and tested live |
| Solana program: permanent ratings, one per payment | `program/` | ✅ live on devnet |

The whole loop was tested with real (devnet) money: the agent paid, QuickNode reported it, the rating was accepted and saved on Solana, and the score updated.

**You don't need to touch any of this.** The leaderboard only **reads** from the Vouch server.

---

## 3. The data you'll use

The Vouch server runs on `http://localhost:4000`. Everything the leaderboard needs is in these read-only routes:

| Route | Use it for |
|---|---|
| `GET /scores` | **The leaderboard table** (every API with its score) |
| `GET /endpoints/:api/:name` | **The detail page** for one API (e.g. `/endpoints/crypto-api-1/price`) |
| `GET /payments?limit=20` | Optional "recent activity" panel |
| `GET /chain` | The Solana program ID and explorer link (for a footer or badge) |

### `GET /scores` (one item per API, 9 in total)

```json
{
  "endpointId": "crypto-api-1/price",
  "api": "crypto-api-1",
  "task": "crypto-price",
  "url": "http://localhost:3005/crypto-api-1/price",
  "price": 0.01,
  "score": 89,
  "label": "trusted",
  "parts": { "T": 80, "A": 100, "H": null, "R": null },
  "ratings": 2,
  "reviews": 0,
  "testScoreIsDefault": true,
  "schema": { "symbol": "string", "priceUsd": "number", "observedAt": "string" }
}
```

| Field | Meaning | How to show it |
|---|---|---|
| `score` | Trust score, 0–100 | Big number plus a colored bar |
| `label` | `trusted` (60+), `avoid` (under 60), `unrated` (no ratings yet) | 🟢 green / 🔴 red / ⚪ gray badge |
| `task` | `weather` or `crypto-price` | Tabs or a filter |
| `price` | Cost per call in USDC | `$0.01` |
| `ratings` | How many agent ratings | "2 ratings" |
| `parts` | Why it has that score (see below) | Small breakdown on the detail page |
| `testScoreIsDefault` | `true` = the test score is a placeholder (tester bot not built yet) | Optional small "est." tag |

### What `parts` means (show this on the detail page)

The score is a weighted mix of four things:

| Part | Name | Plain meaning | Weight |
|---|---|---|---|
| `T` | **Tests** | Our tester bot's score (everyone starts at 80 for now) | 40% |
| `A` | **Agent checks** | % of agent ratings that were good (recent ones count more) | 30% |
| `H` | **Human reviews** | Average stars from verified buyers | 20% |
| `R` | **Repeat buyers** | % of buyers who came back | 10% |

**`null` means "not enough data yet"**: show `—`, not `0`. Missing parts don't count against the score; their weight is shared among the others.

### `GET /endpoints/crypto-api-1/price`

The same fields as above, plus the latest ratings and reviews:

```json
"recentRatings": [
  {
    "paymentId": "4wLtEhKv...",
    "rater": "Ft84bfshg85DA5As9mcWUdKmvjBb3YQv59onpPHggQbZ",
    "rating": "good",
    "reason": null,
    "at": "2026-11-17T04:02:55.190Z",
    "onchainTx": "54aZ6SQG...",
    "explorer": "https://explorer.solana.com/tx/54aZ6SQG...?cluster=devnet"
  }
],
"recentReviews": []
```

- `rating` is `good` or `bad`. `reason` explains a bad one: `empty`, `format`, `sanity` (wrong data) or `slow`.
- **`explorer` is the best thing to show judges.** It's a link to the real, permanent rating on Solana. Show it as "View on Solana ↗" next to each rating. It can be `null` if the rating hasn't reached Solana yet; show "pending" then.

### `GET /payments?limit=20` (optional)

```json
{ "paymentId": "4wLtEhKv...", "endpointId": "crypto-api-1/price", "from": "Ft84bf...",
  "amount": 0.01, "blockTime": 1794888169, "receivedAt": "2026-11-17T04:02:52.382Z", "rated": true }
```

Each one is a payment that **QuickNode confirmed** really happened on Solana.

### `GET /chain`

```json
{ "enabled": true, "programId": "GyYPjRNghiX96xFtP98eNMiYjKfrF5ktKLf1Mm2YBgni",
  "program": "https://explorer.solana.com/address/GyYPjRNghiX96xFtP98eNMiYjKfrF5ktKLf1Mm2YBgni?cluster=devnet" }
```

Use it for a footer badge: "Ratings stored on Solana ↗".

---

## 4. What the leaderboard should look like

### Main page (`/`)

- **Tabs:** All · Weather · Crypto price
- **Table, best first** (sort by `score` high to low, then `price` low to high, the same order agents use):

```
 #  API                      Score              Label       Price   Ratings
 1  crypto-api-1 / price     ████████▉  89      🟢 trusted  $0.01   2
 2  crypto-api-2 / price     ████████   80      ⚪ unrated  $0.01   0
 …
 8  weather-api-3 / current  ████▌      46      🔴 avoid    $0.01   1
```

- **Live updates:** re-fetch `/scores` every 3 seconds. When a score changes, **flash the row** and animate the bar. During the demo the agent runs on the other page and judges should see scores move here, especially when a scam API drops into the red.
- Click a row to open its detail page.

### Detail page (`/endpoints/[api]/[name]`)

- Big score, label and price.
- **The breakdown** T / A / H / R as four small bars with the plain-English names from the table above.
- **Recent ratings:** 👍 good or 👎 bad (with reason), time, and a **"View on Solana ↗"** link.
- One line explaining why it's trustworthy: "Every rating here is tied to a real payment confirmed by QuickNode and stored permanently on Solana."

### Look and feel

- Clean and readable from the back of a room: big numbers, clear colors.
- Green = trusted, red = avoid, gray = unrated. Use the same colors everywhere.
- A shared header with **Leaderboard | Live Flow** links. AdHi018 builds Live Flow in the same app.

---

## 5. Getting it running on your machine

**Tech (agreed for the whole site):** Next.js + Tailwind, in a new `web/` folder at the repo root.

### Step 1: start the fake APIs and the Vouch server (two terminals)

```bash
# terminal 1
cd fake-apis
npm install
PAYMENTS=off PORT=3001 node server.js

# terminal 2
cd server
npm install
cp .env.example .env        # set FAKE_APIS_URL=http://localhost:3001 and ADMIN_TOKEN=anything-long
npm start                   # http://localhost:4000
```

Check it works: open `http://localhost:4000/scores`. You'll see 9 APIs.

On a fresh machine every API starts **unrated at 80**, because the ratings come from real paid purchases (which need the agent's wallet). To see different scores and colors while building, set test scores with the admin route:

```bash
curl -X POST localhost:4000/admin/test-score -H "content-type: application/json" \
  -H "x-admin-token: <your ADMIN_TOKEN>" -d '{"endpointId":"weather-api-3/current","score":35}'
```

Or build with the sample JSON in section 3 as mock data first. AdHi018 can also run the full demo with real ratings on their machine whenever you want to test against real data.

### Step 2: avoid browser CORS errors

The server doesn't send CORS headers, so **don't call `localhost:4000` straight from the browser**. Use a Next.js rewrite instead, so the browser only talks to the website:

```js
// web/next.config.js
module.exports = {
  async rewrites() {
    return [{ source: "/api/vouch/:path*", destination: `${process.env.VOUCH_URL || "http://localhost:4000"}/:path*` }];
  },
};
```

Then fetch `/api/vouch/scores`, `/api/vouch/endpoints/crypto-api-1/price`, and so on. When the server is hosted online later, only `VOUCH_URL` changes.

---

## 6. Team rules

- **Branch:** work on `website-leaderboard`, and open a PR into `main` when it works. Don't push straight to `main`.
- **Only add your own files.** Use `git add web/...`, never `git add .`, so nobody's `.env` (which holds wallet keys) is committed by accident.
- **Never commit `.env` files, wallet files or `*.db` files.**
- **Need a new field from the server?** Ask AdHi018 rather than changing `server/`, so the agent and the Live Flow page don't break.
- **Coordinate the shared parts** (header, colors, layout) with AdHi018, since Live Flow lives in the same `web/` app.

---

## 7. What's left for the whole team

| Item | Who | Target |
|---|---|---|
| **Leaderboard + detail page** | **You** | **Wed** |
| Live Flow page (agent running step by step, "make it a scam" and "try to cheat" buttons) | AdHi018 | Wed |
| Backup payment check (demo works even if the QuickNode Stream pauses) | AdHi018 | Tue–Wed |
| Host the server and website online (permanent address) | Team | Thu |
| Tester bot (real starting scores instead of 80) | TBD | Thu |
| Grok bot (Grok prize) | TBD | Thu |
| README, 2–3 min demo video, submission | Team | Thu → Fri 11 AM |

**Questions:** message AdHi018.
