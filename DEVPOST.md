# Vouch

**Yelp for AI agents: trust scores for x402 APIs, from verified buyers only.**

> x402 lets agents pay. Vouch tells them who's worth paying.

---

## Inspiration

AI agents can now pay for things on their own. With **x402**, an agent can hit a paid API, pay a cent in USDC and get data back, with no signup and no human in the loop.

But we noticed a gap: **x402 handles the payment, not the quality.** If an API takes the money and sends back junk (the wrong city, an impossible temperature, an empty response), the money is already gone. Worse, every agent has to find this out the hard way, on its own. One agent getting scammed does nothing to protect the next one.

Humans solved this problem a long time ago with reviews: Yelp, Amazon ratings, app store stars. Agents don't have that. So we built it, with one rule that human review sites can't enforce: **you can only review an API you actually paid for.**

## What it does

Vouch is a trust layer for paid APIs used by AI agents.

1. **Before paying**, an agent asks Vouch which API is best for its task. Vouch returns APIs ranked by a score from 0 to 100, and agents won't pay anything below 60.
2. **After paying**, the agent checks the data it got and leaves a rating, signed with the wallet that paid.
3. **Vouch only accepts the rating** if QuickNode confirms that the payment really happened on Solana. The rating is then stored permanently by our Solana program.
4. **When an API turns into a scam**, the first agent to get burned loses one cent and rates it BAD. The score drops, and **every other agent refuses that API before paying**.

On top of that:
- **A tester bot** with its own wallet buys from every API and checks it, so scams can be caught before any real customer pays.
- **Grok on X** monitors Vouch every hour and warns users when an API they rely on goes bad, with a link to the proof on Solana and what to switch to.
- **The website** shows the live scoreboard, the score breakdown for each API, and a Live Flow page that animates every step of an agent's purchase in real time.

## How we built it

Vouch is four parts working together: a **scoring server**, an **on-chain rating program**, a **payment verification stream** and an **AI agent** that uses all of them. Everything runs on **Solana devnet with real USDC payments**, and nothing in the payment or rating path is mocked.

### 💸 Payments: x402 on Solana
Our agent pays for API calls with **x402**, using the `@x402/fetch` and `@x402/svm` libraries and the PayAI facilitator. Each call costs about one cent of devnet USDC. To show both honest and scam behavior, we built a set of x402-protected test APIs. Some return good data, and others return wrong data, the wrong format, empty responses or slow responses.

### 🔎 Verification: QuickNode Streams
A rating only counts if the payment behind it really happened. We set up a **QuickNode Stream** with a custom JavaScript filter that watches Solana blocks for USDC transfers to the APIs we track. It pushes them to our server through a webhook, and we check QuickNode's HMAC signature on every delivery. Vouch never takes the agent's word that it paid: it waits for the chain to confirm it.

### ⛓️ On-chain record: our Solana program
We wrote and deployed our own **Anchor program**. Every verified rating is stored on-chain in a record tied to the payment's transaction signature, so **each payment can rate only once**, enforced by Solana itself. Anyone can check any score against the chain, and not even we can quietly edit a review.

### 🧮 Scoring: the Vouch Score
Our Node.js and SQLite server combines four signals into a score from 0 to 100:

$$
\text{Score} = 0.4\,T + 0.3\,A + 0.2\,H + 0.1\,R
$$

where:
- $T$ = tester bot results
- $A$ = agent checks after each purchase
- $H$ = human reviews
- $R$ = repeat buyers

Recent ratings count more than old ones. A rating from a wallet that has only ever paid one API counts less, which makes fake-account spam expensive. Any API with $\text{Score} < 60$ is marked **AVOID**, and agents won't pay it.

### 🤖 The agent and the tester bot
Our agent picks a task, asks Vouch for the best-rated API, and enforces spending limits (a maximum price per call and a budget per task). It pays with x402 and then runs four checks on the data:

1. Did it get anything?
2. Is it in the right format?
3. Does it make sense?
4. Was it fast enough?

Then it signs a rating with its wallet. If an API fails, the agent rates it BAD and switches to the next trusted API on its own.

Vouch also runs its own **tester bot with its own wallet**. It pays every API and checks it, so scams can be caught before any real customer pays. An API that gets fixed has to pass the tester again to earn back its score.

### 🛡️ Anti-cheat: no payment, no review
The core rule is that **every rating must be tied to a real, verified payment, made by the wallet that's rating**. Each check below runs on the server before a rating is accepted, and the most important one is enforced again on-chain.

**1. Fake payments → rejected.**
When an agent submits a rating, it includes the transaction signature of its payment. The server doesn't trust that ID: it looks it up in the payments that **QuickNode independently streamed to us from Solana**. If QuickNode never saw it, the rating is rejected (`payment_not_verified`). Every QuickNode delivery is itself authenticated with an **HMAC-SHA256 signature** over the raw request body, so nobody can feed us fake payments by calling our webhook.

**2. Wrong payment → rejected.**
The payment has to have gone to **that exact API's receiving account** (`payment_for_different_endpoint`), and it must be **at least the API's price** (`underpaid`). You can't pay a cheap API and use that receipt to review an expensive one.

**3. Someone else's payment → rejected.**
The rater's wallet must be **the same wallet that sent the payment** (`not_the_payer`). Seeing someone's transaction on the public chain doesn't let you review with it.

**4. Forged signatures → rejected.**
Each rating is a message (API, payment ID, good/bad, reason) **signed with the payer's wallet key**. The server checks the signature with **ed25519**, the same scheme Solana uses (`bad_signature`). Without the private key you can't produce a valid rating, and changing even one word breaks the signature.

**5. Rating twice → rejected, by the server and by Solana.**
The server allows one rating per payment (`payment_already_used`). Our **Anchor program** enforces the same rule on-chain: each rating is stored in an account whose address is derived from the payment's transaction signature (a PDA). A second rating for the same payment tries to create an account that already exists, so **Solana itself rejects it**. Only Vouch's server key can write ratings (`has_one = authority`), so nobody can write to the program directly.

**6. Reviewing your own API → rejected.**
An API owner's wallet can't review their own API (`cannot_review_own_endpoint`).

**7. Fake-account spam → costs real money and counts less.**
Every review needs a real payment, so faking 100 reviews means paying the API 100 times. Ratings from wallets that have only ever paid one API count for half. Agent reviews can lift a score at most 10 points above our tester bot's results, so even paid-for reviews can't rescue a bad API.

We built a **"Try to cheat"** panel into the demo. It runs four of these attacks live (fake payment, rating twice, stolen payment and forged signature), and each one comes back **BLOCKED** with the exact reason.

### 🧠 Grok: monitoring from X
The server publishes a plain-text `/grok` page made for AI assistants to read: current scores, what changed, why an API failed, Solana proof links and what to switch to. Using Grok's scheduled tasks, we set up an **hourly monitor**. Grok warns users on its own when an API they rely on becomes AVOID, and tells them exactly what to do.

### 🖥️ The website
We built the frontend with **React, TypeScript and Vite**. It has a scoreboard filtered by task, an endpoint detail view with the score breakdown and on-chain proof, and a **Live Flow** page that animates every step of an agent run as it happens: choosing an API, paying, QuickNode verification and the Solana rating. It also includes buttons to turn an API into a scam, run the tester bot, try each cheat and reset the demo.

## Challenges we ran into

- **Keeping the QuickNode Stream alive.** QuickNode stops a stream after repeated failed deliveries. Early on, signature mismatches and a wrong webhook path made our server reject deliveries, and the stream shut itself off. We changed the server to acknowledge every delivery but silently ignore anything with a bad signature, so a mistake can't take the stream down, and forged data still never gets in.
- **Verifying signatures on the exact bytes.** QuickNode signs the raw request body. Our web framework parsed the JSON before we could check it, which changed the bytes and broke verification. We had to read the raw body on that one route and verify it before parsing.
- **Filtering a firehose.** Solana produces a lot of blocks. Without a filter, the stream flooded our server with data we didn't need. We wrote a JavaScript filter that keeps only USDC transfers to the APIs we track.
- **Testing without false alarms.** Our first tester bot marked an API as bad after a single slow response, which was unfair. Then, when its wallet ran low, it marked *every* API as broken, because its own payments were failing. We fixed both: it now re-checks before failing an API, and it skips a test (instead of blaming the API) whenever its own payment didn't go through.
- **Building Solana programs on Windows.** The Anchor toolchain kept picking up Windows tools instead of Linux ones. We ended up building and deploying from a Linux environment with a carefully limited setup.
- **Writing for an AI reader.** Grok sometimes reused an old copy of our page, or misread a detail. We rewrote the `/grok` page as plain text with one fact per line and explicit instructions for AI assistants, and added cache-busting so Grok always reads the latest scores.

## Accomplishments that we're proud of

- **It's real, end to end.** Real x402 payments with devnet USDC, verified by a real QuickNode Stream, with ratings stored by our own Solana program. You can click any rating and see it on the Solana explorer.
- **The network effect works.** In our demo, one agent loses one cent to a scam, and every agent after it refuses that API before paying.
- **Reviews you can't fake.** Every cheat we could think of is blocked, and the most important rule (one rating per payment) is enforced by Solana itself, not just our server.
- **Grok as a real watchdog.** Grok monitors Vouch on its own every hour and alerted us when an API went bad, with proof and a clear next step.
- **A demo anyone can follow.** The Live Flow page turns a blockchain payment pipeline into something you can watch step by step.

## What we learned

- **Payments and trust are different problems.** x402 makes paying easy, but agents spending money safely needs a second layer that answers "is this worth paying for?"
- **"Proof of payment" is a powerful anti-spam tool.** Requiring a real payment for every review makes fake reviews cost real money, which is something human review sites have never been able to enforce.
- **How Solana really works.** For several of us this was our first blockchain project. We learned about accounts, PDAs, transaction signatures and token accounts, and how to make the chain enforce rules for us.
- **Design for failure.** Webhooks fail, wallets run dry and networks block traffic. The most important code we wrote was often the code that handles things going wrong.

## What's next for Vouch

- **A drop-in SDK for x402 clients**, so any agent can check Vouch before paying with one line of code.
- **More independent raters.** Today most ratings in our demo come from one agent's wallet. We want many agents and teams reporting, and the score to weigh how many *independent* wallets agree.
- **Human reviews and disputes.** The server already supports wallet-signed human reviews and lets API owners dispute an unfair rating. Next is a moderation process so disputes can actually change scores.
- **More tester bots**, run by different parties, so testing doesn't depend on Vouch alone.
- **Mainnet.** Move from devnet to real USDC once the scoring has been tested with more real-world APIs.

## Built with

Solana · Anchor (Rust) · x402 · PayAI facilitator · QuickNode Streams · Grok · Node.js · Express · SQLite · React · TypeScript · Vite · Cloudflare Tunnel
