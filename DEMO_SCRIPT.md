# Vouch: demo video script

About **3 minutes**, 9 short scenes. Record each scene separately and stitch them together.
Everything shown is real: real agent, real (devnet) USDC, real QuickNode Stream, real Solana records.

---

## 1. Before recording (about 15 minutes)

### Connection and laptop
- Use a connection that **doesn't block Solana** (a charged phone hotspot works; some campus Wi-Fi blocks it).
- Laptop **plugged in**, **sleep turned off** (Settings → System → Power → "When plugged in, sleep after: Never").

### Start everything (one terminal each)

```bash
# 1. Fake APIs (the shops)
cd fake-apis && PORT=3005 PAYMENTS=on node server.js

# 2. Vouch server
cd server && npm start

# 3. Agent runner (+ tester bot every 10 min, so it doesn't change scores mid-scene)
cd agent && VOUCH_URL=http://localhost:4000 PAYMENTS=on FAKE_APIS_URL=http://localhost:3005 TEST_INTERVAL_SEC=600 npm run runner

# 4. Website  →  http://localhost:5173
cd website && npm run dev

# 5. Tunnel (public address for QuickNode and Grok). Keep this window open!
& "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:4000
```

### Connect QuickNode
1. Copy the tunnel address (`https://something.trycloudflare.com`).
2. QuickNode → Stream → **Pause** → webhook URL = `https://<tunnel>/webhook/quicknode`
   (⚠️ it must end with **`/webhook/quicknode`**, or every delivery fails with 404 and the Stream terminates).
3. **Save** → re-activate → **"Start from the latest slot"** → check it says **Active**.

### Connect Grok
In your Grok chat on X:
> Update the Vouch monitor to use this link from now on: https://&lt;tunnel&gt;/grok

### Set the starting state
- Website → **Live Flow** → **Reset all** (every API back to normal).
- **Leaderboard** check: crypto-api-1 **trusted**, weather-api-2 **about 100**, weather-api-1/current **trusted**.
- ⚠️ **Don't run "Weather in Austin" before recording.** Scene 4 needs weather-api-2 to have **no ratings yet**, so one bad rating drops it straight to AVOID.

### Rehearsal
- Live Flow → **Bitcoin price** → **Run agent**. It should end green, with **"Payment confirmed by the QuickNode Stream"** and a **"View rating on Solana ↗"** link.
- Grab a screenshot of a Grok **automatic** hourly alert (for scene 7).

---

## 2. The script

| # | Scene | Screen + actions | Say |
|---|---|---|---|
| 1 | **The problem** (15 s) | Website homepage (hero). | *"AI agents now pay for data on their own. But some APIs are scams: they take the money and send junk. How does an agent know who to trust before it pays?"* |
| 2 | **The scoreboard** (20 s) | **Leaderboard** → click the **Weather** and **Crypto prices** tabs → **Verify On-Chain** on one row. | *"Vouch scores every API from 0 to 100, based on real buyers' experience. Every rating is stored on Solana, and anyone can verify it."* |
| 3 | **A normal purchase** (35 s) | **Live Flow** → task **Bitcoin price** → **▶ Run agent**. Point at the arrows as they light up. Click **"View rating on Solana ↗"**. | *"The agent asks Vouch which API to trust, pays one cent with x402 on Solana, checks the data, and rates it. The rating only counts because QuickNode confirmed the payment really happened."* |
| 4 | **An API turns into a scam** (45 s) ⭐ | "Make an API a scam" → pick **weather-api-2/current** → **Wrong data**. Task **Weather in Austin** → **Run**. Watch: it buys weather-api-2 → **✗ makes sense** → **BAD** → drops to **AVOID** → switches to weather-api-1 → **GOOD**. | *"This API just went bad. The agent pays one cent, catches the wrong data, and rates it BAD. That warning is backed by a real payment and saved on Solana. Then it switches to a trusted API on its own."* |
| 5 | **Nobody else gets fooled** (25 s) | Run **Weather in Austin** again → **"refuses weather-api-2 without paying"**. Then **🔍 Run tester bot now** → **✗ weather-api-2 failed twice**. | *"Now every agent refuses it before paying. And Vouch's own tester bot, with its own wallet, re-checks every API on a schedule, so scams often get caught before any customer pays."* |
| 6 | **Try to cheat** (20 s) | Click all 4 **Try to cheat** buttons → 4 red **BLOCKED** cards. | *"Fake payments, reusing a payment, stealing someone else's payment, forging a signature: all blocked. No payment, no review."* |
| 7 | **Grok on X** (25 s) | Grok on X: *"Run the Vouch monitor now"* → it reports weather-api-2 became AVOID, why, the Solana proof, and what to switch to. Then show the saved **automatic** alert. | *"Grok watches Vouch for you. Every hour it checks for changes and tells you what to do, with on-chain proof. It even notices when a warning rests on only one buyer."* |
| 8 | **Recovery** (15 s, optional) | **Reset all** → **Run tester bot now** twice → weather-api-2 climbs back on the leaderboard. | *"APIs that get fixed earn their way back: the tester has to see them working again. Flipping a switch isn't enough."* |
| 9 | **Close** (15 s) | The Live Flow map. | *"x402 payments on Solana. QuickNode confirms every payment. Our Solana program stores every rating. Grok watches it all. One agent loses a cent, and no other agent loses anything."* |

---

## 3. One-liners for questions

- **What is Vouch?** Yelp for AI agents: trust scores for paid APIs, from verified buyers only.
- **Why can't reviews be faked?** A rating needs a real payment (confirmed by QuickNode), signed by the wallet that paid, and each payment rates once. Solana enforces that too.
- **Why did the agent pay a scam once?** Nobody can know data is bad until someone buys it. Vouch makes that "someone" one agent risking one cent, or Vouch's own tester bot, and then warns everyone.
- **What does the score mean?** 40% Vouch's tests + 30% agent checks + 20% human reviews + 10% repeat buyers. Under 60 = agents won't pay.
- **What does each sponsor do?**
  - **Solana:** payments and the permanent rating record (program `GyYPjRNghiX96xFtP98eNMiYjKfrF5ktKLf1Mm2YBgni`).
  - **QuickNode:** the Stream confirms every payment independently.
  - **Grok:** the user's watchdog on X.

---

## 4. If something goes wrong

| Problem | Fix |
|---|---|
| Rating says **"payment not verified"** | The QuickNode Stream stopped. Check its logs; re-activate with **"Start from the latest slot"**. Check the webhook URL ends with `/webhook/quicknode`. |
| **"fetch failed"** when paying | No connection to Solana (network blocks it, or the hotspot dropped). Switch networks. |
| Grok **can't open the page** | The tunnel restarted and has a new address. Update the Grok monitor link (and QuickNode). |
| Agent **refuses every API** | They're all below 60. Press **Reset all**, then **Run tester bot now** once or twice to let honest APIs recover. |
| **Run tester bot now** shows "Queued" | A round is already running; yours starts as soon as it ends. |
| Need to **redo scene 4** | weather-api-2 now has a rating, so the instant drop won't repeat. Use another API with no ratings (e.g. weather-api-1/forecast after it recovers), or reset the demo data first. |

**Cost:** about $0.10–0.20 of devnet USDC from the agent for the whole video, plus about $0.12 per tester round.
