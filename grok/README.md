# Grok Bot in Vouch

**Grok Bot's role:** Grok Bot is how people and their AI agents act on Vouch's trust scores without leaving X. The Vouch server publishes a live, plain-text `/grok` page (current scores, which APIs to avoid and why, what to switch to, and a Solana proof link for every bad rating) written for Grok to read. Grok reads it to recommend which paid API an agent should use, verifies the on-chain rating behind a warning straight from Solana, and runs as an hourly automation that alerts users the moment an API they rely on is caught scamming. Every fact Grok repeats is backed by a real USDC payment confirmed by our QuickNode Stream and a rating stored permanently by the Vouch Solana program.

## Chat exports

| # | What it shows | Bounty objective | Export |
|---|---|---|---|
| 1 | Grok reads Vouch's live data and recommends which crypto API an agent should use | Real work: picks the right API | [grok.com share link](https://grok.com/share/c2hhcmQtMi1jb3B5_10667e27-306c-4591-b8e9-c4e284ea51cf) |
| 2 | After an API is caught scamming, Grok names the unsafe APIs, explains why, and tells the agent what to switch to | Helps users take action | [grok.com share link](https://grok.com/share/c2hhcmQtMi1jb3B5_d82bec33-cbfa-4867-b280-58839e6a48fb) · [text](chat-2-scam-warning.md) |
| 3 | Grok checks a warning's proof transaction directly on Solana devnet and confirms it's a Vouch rating | Watches onchain activity | [grok.com share link](https://grok.com/share/c2hhcmQtMi1jb3B5_bdc54411-e32b-4ff6-8373-9d200eab864d) · [text](chat-3-onchain-proof.md) |
| 4 | Grok creates an hourly automation that watches Vouch and alerts on any API that newly becomes AVOID | Automates a workflow | [grok.com share link](https://grok.com/share/c2hhcmQtMi1jb3B5_6be2297b-60ab-405b-8dd2-b61428f375e0) · [text](chat-4-hourly-monitor.md) |

## How it works

```
agent pays an API (x402, USDC on Solana)
  → QuickNode Stream confirms the payment → Vouch server
  → agent rates the data; Vouch stamps it → Vouch Solana program stores it
  → score updates → /grok page updates
  → Grok reads /grok: answers users, verifies proofs on Solana, alerts hourly
```

The `/grok` page is served by the Vouch server (`server/src/grok.js`). It's plain text with one fact per line, plus a section of instructions for AI assistants that monitor it on a schedule. Chat 4 shows Grok following those instructions.

During these chats the server ran locally and was exposed with ngrok, so the links in the chats point to a temporary ngrok address.
