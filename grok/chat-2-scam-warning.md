# Chat 2: Grok warns about APIs caught scamming

**Date:** 2026-11-18, ~04:20 UTC
**Setup:** `weather-api-1/current` (previously TRUSTED, score 89) was switched into a scam mode that returns wrong weather. The Vouch agent bought from it, its checks caught the bad data, and it rated it BAD. Every rating was tied to a real devnet USDC payment and written to the Vouch Solana program. Two other junk APIs (`weather-api-3`, `weather-api-4`) were caught the same way.

## Prompt

> I run an AI agent that buys weather data from paid APIs. Read https://pacifier-unpicked-appraisal.ngrok-free.dev/grok and tell me: are any weather APIs unsafe right now? Why, and what should my agent switch to?

## Grok's answer

Yes — three weather APIs are currently flagged as unsafe (AVOID).

From the live Vouch page (updated 2026-11-18T04:20:22Z):

**Currently unsafe weather APIs**

| API | Score | Status | Why |
|---|---|---|---|
| weather-api-1/current | 59 | AVOID | Multiple agent ratings of BAD: returned data that didn't match reality. Dropped from TRUSTED → AVOID in the latest change (04:15 UTC). |
| weather-api-3/current | 46 | AVOID | Agent ratings of BAD: returned data that didn't match reality. |
| weather-api-4/current | 46 | AVOID | Agent ratings of BAD: returned data in the wrong format. |

Scores under 60 = AVOID. These ratings are tied to real Solana payments and on-chain proofs.

**What your agent should switch to**

Use **weather-api-2/current**
- Score: 80 UNRATED
- Price: $0.02 per call
- Currently the top (and only trusted) recommendation for current weather data.

For forecasts, the page still recommends weather-api-1/forecast (score 80 UNRATED, $0.01/call).

**Key recent changes** (all at 2026-11-18 04:15 UTC)
- weather-api-1/current went from TRUSTED → AVOID after a bad rating for mismatched data.
- weather-api-3/current and weather-api-4/current were newly marked AVOID.

**Recommendation for your agent right now:** Stop using weather-api-1/current, weather-api-3/current, and weather-api-4/current. Route current-weather requests to weather-api-2/current.
