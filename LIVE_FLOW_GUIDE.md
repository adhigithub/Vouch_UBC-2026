# Vouch: Live Flow guide

You're building the **Live Flow** page: the part of the website that **shows the whole Vouch process happening live** during the demo, so judges watch it instead of reading terminal logs. This is the page we present from.

**Deadline:** submission is **Fri Nov 20, 12 PM CST**. Target: the page working by **Wed night**, so Thursday is polish and recording the demo video.

---

## 1. Vouch in 30 seconds

**Vouch is Yelp for AI agents.** AI agents pay APIs small amounts of USDC on Solana for data. Vouch gives every API a **trust score (0–100)** so agents know which to trust. What makes it different:

- **Only real buyers can rate.** A rating must match a real Solana payment, confirmed independently by a **QuickNode Stream**.
- **Ratings can't be faked or deleted.** Each one is stored permanently by our **Solana program**.
- **Scams get caught automatically.** The agent checks every answer and rates bad data BAD, so the score drops and other agents avoid it.

Your page makes those three points **visible**.

---

## 2. What's built and working (all on `main`)

| Part | Folder | Status |
|---|---|---|
| AI agent: wallet, pays real test USDC, 4 checks, signed ratings | `agent/` | ✅ |
| Fake APIs: 9 shops, some honest and some scams, switchable live | `fake-apis/` | ✅ |
| Vouch server: confirms payments, blocks cheating, computes scores | `server/` | ✅ 40 tests |
| QuickNode Stream: reports our payments to the server | `stream/` | ✅ connected, tested live |
| Solana program: permanent ratings, one per payment | `program/` | ✅ live on devnet |
| `/grok` page: live summary that Grok Bot on X reads | `server/src/grok.js` | ✅ built, testing on X now |

**Proven with real (devnet) money:** the agent paid $0.01 → QuickNode reported it ("verified (via quicknode)") → the rating was accepted → it was saved on Solana → the score updated.

**What's missing for your page:** the agent currently only runs from the terminal (`node agent.js crypto-price symbol=BTC`). The website needs a way to **start the agent and get its steps live**. That's the **agent runner** in section 5.

---

## 3. The flow your page shows

This is exactly what happens on each run, in order. Each step should be a box or stage that **lights up** when it happens:

```
 ① Task           "Get the Bitcoin price"
 ② Ask Vouch      "Who's the best crypto API?"  → ranked list with scores
 ③ Safety check   skip anything under 60, too expensive, or over budget
 ④ Pay            $0.01 USDC on Solana (x402)               [Solana link]
 ⑤ QuickNode      "Payment confirmed on-chain"              (the Stream reports it)
 ⑥ Check data     ✓ got something  ✓ right format  ✓ makes sense  ✓ fast enough
 ⑦ Rate           GOOD or BAD (with reason), signed by the agent's wallet
 ⑧ Saved forever  rating written to the Solana program      [Solana link]
 ⑨ Score updates  crypto-api-1: 89 → 89 (trusted)
```

**If the data is BAD** (step ⑥ fails), the agent rates it BAD, then **tries the next-best API** (up to 2 retries, within a $0.25 budget). Show that as a red path that loops back to ④ with the next API.

**Timing in real life:** the whole run takes about **3–10 seconds**. ④ payment ≈ 1–2 s, ⑤ QuickNode ≈ 1–5 s, ⑧ Solana ≈ 1–2 s. Animate each stage when its event arrives, not on a fixed timer, so the page always shows the truth.

---

## 4. Demo controls (buttons on your page)

These make the demo interactive. Each one shows a real effect.

### a) "Run agent"
Choose a task (Bitcoin price, Ethereum price, Weather in Austin, …) and press Run. This starts the flow above.

### b) "Make this API a scam" ⭐ (the best demo moment)
Switches a good API into scam mode **live**, using the fake APIs' admin route:

```
POST http://localhost:3005/admin/modes      header: x-admin-token: <fake-apis ADMIN_TOKEN>
{ "endpointId": "crypto-api-1/price", "mode": "sanity" }
```

| Mode | What the API does | The agent's check that catches it |
|---|---|---|
| `good` | Honest data | none, rated GOOD |
| `sanity` | Plausible but **wrong** data (wrong price or city) | "makes sense" |
| `format` | Broken data shape | "right format" |
| `empty` | Returns nothing | "got something" |
| `slow` | Takes 5+ seconds | "fast enough" |
| `flaky` | Randomly good or bad | varies |

Then press Run again: the agent catches it, rates it **BAD**, the score **drops into the red**, and the next run **skips it**. `POST /admin/reset` puts everything back to normal.

### c) "Try to cheat" (security demo)
Buttons that send fake ratings to the Vouch server, each answered with a big red **BLOCKED** and the reason:

| Button | What it sends | Server says |
|---|---|---|
| Fake payment | a rating with a made-up payment ID | `400 payment_not_verified` |
| Rate twice | the same payment rated again | `409 payment_already_used`, and Solana would refuse it too |
| Steal a payment | someone else's real payment ID | `403 not_the_payer` |
| Forged signature | a rating claiming to be from the agent | `401 bad_signature` |

These go through the agent runner (section 5), which knows how to build them. The admin token and wallet keys must **never** be in the browser.

---

## 5. The agent runner (the piece that connects your page to the agent)

**Status: ✅ built** (`agent/runner.js`, port 4100). Start it with:

```bash
cd agent && VOUCH_URL=http://localhost:4000 PAYMENTS=on FAKE_APIS_URL=http://localhost:3005 npm run runner
```

Real runs only work on AdHi018's machine (it needs the agent wallet). On yours, use the **mock events below**: the format is exactly what the runner sends.

| Route | What it does |
|---|---|
| `POST /agent/run` `{task, params}` | Runs the agent; the reply is a live stream of the events below. `409 busy` if a run is already going |
| `GET /agent/tasks` | Ready-made demo tasks for the Run buttons (`[{id, label, task, params}]`) |
| `GET /agent/last` | All events of the most recent run (e.g. after a page reload) |
| `GET /agent/modes` | Which APIs are honest or scams right now |
| `POST /agent/scam` `{endpointId, mode}` | "Make this API a scam" (`mode: "sanity"`), or honest again (`"good"`) |
| `POST /agent/reset` | All APIs back to normal |
| `POST /agent/cheat` `{kind}` | Try a cheat: `fake_payment`, `rate_twice`, `steal_payment`, `forged_signature`. Returns `{title, attempt, blocked, status, error, explanation}`; show it as a red BLOCKED card |

It's a small Node service next to the agent that **runs the agent and streams each step** to the website. The agent's wallet key stays on the server.

### Start a run

```
POST /agent/run
{ "task": "crypto-price", "params": { "symbol": "BTC" } }
```

The response is a **stream of events** (Server-Sent Events): one line per step, as it happens. In the browser:

```js
// one run at a time; the runner refuses a second run while one is in progress
const res = await fetch("/api/agent/run", { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ task: "crypto-price", params: { symbol: "BTC" } }) });
// read res.body as a stream of "data: {...}\n\n" lines (or use a small SSE helper library)
```

### The events (the contract to build against)

```jsonc
{ "type": "start",      "task": "crypto-price", "params": { "symbol": "BTC" }, "wallet": "Ft84bf…gQbZ" }
{ "type": "candidates", "list": [ { "endpointId": "crypto-api-1/price", "score": 89, "label": "trusted", "price": 0.01 }, … ] }
{ "type": "skip",       "endpointId": "weather-api-3/current", "reason": "score 46 is below the cutoff of 60" }
{ "type": "buy",        "endpointId": "crypto-api-1/price", "price": 0.01, "score": 89, "label": "trusted" }
{ "type": "paid",       "endpointId": "crypto-api-1/price", "paymentId": "2oeshAVa…", "explorer": "https://explorer.solana.com/tx/2oeshAVa…?cluster=devnet", "ms": 1772 }
{ "type": "checks",     "endpointId": "crypto-api-1/price",
                        "results": [ { "check": "got something", "ok": true }, { "check": "right format", "ok": true },
                                     { "check": "makes sense", "ok": true }, { "check": "fast enough", "ok": true } ],
                        "rating": "good", "reason": null }
{ "type": "verifying",  "paymentId": "2oeshAVa…", "attempt": 1 }      // waiting for QuickNode (may repeat)
{ "type": "verified",   "paymentId": "2oeshAVa…", "source": "quicknode" }
{ "type": "rated",      "endpointId": "crypto-api-1/price", "rating": "good", "score": 89, "label": "trusted",
                        "onchainTx": "2dPJ5zD4…", "explorer": "https://explorer.solana.com/tx/2dPJ5zD4…?cluster=devnet" }
{ "type": "done",       "spent": 0.01, "result": { "symbol": "BTC", "priceUsd": 65266, "source": "coingecko" } }
{ "type": "failed",     "reason": "3 bad results (retry limit 2)", "spent": 0.03 }
```

- Two more events can appear:
  - `{ "type": "not_charged", "endpointId", "status", "error" }`: the API couldn't be paid (show a gray "not charged" step).
  - `{ "type": "rate_failed", "endpointId", "paymentId", "status", "error" }`: usually `payment_not_verified`, meaning QuickNode didn't report the payment in time (Stream paused). Show it red with "QuickNode didn't confirm the payment".
- Every event also has an `"at"` timestamp.
- `buy` → `paid` → `checks` → `verifying`/`verified` → `rated` repeats for each API tried. If the first one is BAD, you'll see a second `buy` for the next-best API.
- A `rated` event for a BAD rating has `"rating": "bad", "reason": "sanity"` (or `empty`, `format`, `slow`).
- `onchainTx`/`explorer` can be `null` if Solana is slow. Show "saving to Solana…" then.
- Every `explorer` link opens the **real transaction on the Solana explorer**. Make these clickable: they're the proof judges can check themselves.

Hardcode the example sequence above as mock data and step through it with timers until the runner exists. Switching to the real stream should then only change the data source.

---

## 6. Data you can also read from the Vouch server

The same routes the Leaderboard uses (see `LEADERBOARD_GUIDE.md` for full field descriptions):

| Route | Use it for on your page |
|---|---|
| `GET /scores` | The before/after score in step ⑨, and a small live score list beside the flow |
| `GET /payments?limit=10` | A "recent payments" ticker; `source: "quicknode"` means the QuickNode Stream confirmed it |
| `GET /chain` | The Solana program ID and link ("Ratings stored on Solana ↗") |
| `GET /grok` | Optional: a "What Grok sees" panel showing the plain-text feed Grok Bot reads |

**CORS:** the server doesn't allow direct browser calls. Use a Next.js rewrite so the browser only talks to the website:

```js
// web/next.config.js
module.exports = {
  async rewrites() {
    return [
      { source: "/api/vouch/:path*", destination: `${process.env.VOUCH_URL || "http://localhost:4000"}/:path*` },
      { source: "/api/agent/:path*", destination: `${process.env.AGENT_RUNNER_URL || "http://localhost:4100"}/agent/:path*` },
    ];
  },
};
```

---

## 7. Design notes

- **One screen tells the whole story.** The flow diagram is the hero, centered and large, readable from the back of a room.
- **Colors:** green = good/passed, red = bad/blocked, gray = waiting, a pulse or glow = happening now. Use the **same colors as the Leaderboard** (🟢 trusted, 🔴 avoid, ⚪ unrated).
- **Name the sponsors at each step**, so judges connect them: "💸 Paid via **x402** on **Solana**", "📡 Confirmed by **QuickNode Stream**", "📜 Stored by the **Vouch Solana program**".
- **Show the money:** "Spent $0.01 of $0.25 budget".
- **Every Solana link opens in a new tab.**
- A shared header across the site: **Leaderboard | Live Flow | On X** (On X comes later: embedded posts from the Vouch X account and Grok's public replies).

---

## 8. Running things locally

The page is in the shared Next.js app in `web/`. Coordinate with the Leaderboard builder so you share the header, colors and `next.config.js`.

```bash
# terminal 1: fake APIs
cd fake-apis && npm install && PAYMENTS=off PORT=3001 node server.js
# terminal 2: Vouch server
cd server && npm install && cp .env.example .env && npm start     # http://localhost:4000
```

- **Real payments only work on AdHi018's machine**, which has the agent wallet, the QuickNode Stream token and the Solana server key. On yours, build with the **mock events** (section 5) and the read-only routes.
- For the real end-to-end test and the demo recording, we run it together on AdHi018's machine.
- **Never commit `.env`, wallet files or `*.db`.** Use `git add web/...`, not `git add .`.

---

## 9. The demo script your page should support (about 2 minutes)

1. **Run agent** ("Bitcoin price"): the flow lights up step by step, ending green. Click the Solana link to show the rating is real.
2. **Make crypto-api-1 a scam** (`sanity` mode), then **Run** again: the data check fails, it's rated BAD, the score drops into the red, and the agent switches to the next API.
3. **Run** once more: the agent **skips** the scam API before paying anything.
4. **Try to cheat**: fake payment, rate twice, stolen payment, all **BLOCKED**.
5. (Later) Switch to **On X**: the Vouch X account posted an alert, and Grok tells users what to switch to.

---

## 10. Who's doing what

| Item | Who | Target |
|---|---|---|
| **Live Flow page** (flow diagram, Run, Make scam, Try to cheat) | **You** | **Wed** |
| Agent runner (`POST /agent/run` event stream, cheat routes) | AdHi018 | ✅ Done |
| Leaderboard + detail page | Leaderboard teammate | Wed |
| `/grok` page tested with Grok on X, Vouch X account and auto-alerts | AdHi018 | Tue–Thu |
| Disputes and moderator page (human oversight) | AdHi018 | Thu |
| Host everything online (permanent addresses) | Team | Thu |
| README, demo video, submission | Team | Thu → Fri 11 AM |

**Branch:** `website-live-flow`, PR into `main`. **Questions or new event fields:** ask AdHi018. Don't change `agent/` or `server/` without checking first.
