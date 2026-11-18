# Chat 3: Grok checks a rating on Solana

**Date:** 2026-11-18, ~04:21 UTC
**Setup:** the Vouch `/grok` page links every warning to the Solana transaction that recorded the rating. Here Grok is asked to verify one of those proofs itself.

## Prompt

> Vouch says weather-api-1 was caught returning wrong data, with this proof: https://explorer.solana.com/tx/5vwB6MwxTyAirk7F3uU7roJNNnBSrcYweJNtUzkdNqjovB8JV5cTTHrELxHvrJFGPvb4YWkJ4NsDPwcfptvXaAnd?cluster=devnet — can you check that transaction on Solana devnet and tell me what it shows?

## Grok's answer

Yes — the transaction exists and succeeded on Solana devnet.

**Transaction summary**
- Signature: 5vwB6MwxTyAirk7F3uU7roJNNnBSrcYweJNtUzkdNqjovB8JV5cTTHrELxHvrJFGPvb4YWkJ4NsDPwcfptvXaAnd
- Cluster: Devnet
- Status: Success (Ok)
- Slot: 523,506,531
- Block time: 2026-11-18 04:15:52 UTC
- Fee: 5,000 lamports
- Compute units: 19,033

**What the transaction actually does**

It invokes the program GyYPjRNghiX96xFtP98eNMiYjKfrF5ktKLf1Mm2YBgni with the instruction SubmitRating. The on-chain program log / data contains:
- Target: weather-api-1/current
- Rating category: sanity
- Values: 3 and 5 (i.e. a 3/5 sanity rating)

This matches Vouch Protocol's on-chain reputation / rating system for AI agents and services on Solana. Someone submitted a low "sanity" score against the weather-api-1 endpoint (specifically its /current path), which is the on-chain "proof" being referenced.

The explorer link itself is currently hard to load in automated browsers (Vercel bot check), but the raw RPC data confirms the above details cleanly.

## Note from the team

Grok read the transaction straight from Solana's RPC and got the key facts right: it succeeded, it called the Vouch program's `SubmitRating`, and it targets `weather-api-1/current` with reason `sanity`. One detail is Grok's own misreading: Vouch ratings are GOOD/BAD, not out of 5. This rating is **BAD** (reason: returned data that didn't match reality). There is no "3/5" value in the transaction.
