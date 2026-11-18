# Chat 4: Grok sets up an hourly Vouch monitor

**Date:** 2026-11-18, ~04:21 UTC
**Setup:** the Vouch `/grok` page includes instructions written for AI assistants that check it on a schedule. Here Grok is asked to do exactly that, and it creates a recurring automation.

## Prompt

> Every hour, check https://pacifier-unpicked-appraisal.ngrok-free.dev/grok and alert me if any API newly becomes AVOID. Tell me which one, why, the Solana proof link, and what to switch to.

## Grok's answer

**Automation created: "VOUCH API AVOID Monitor"** (task ID `3886b06f-d6ce-45d9-9287-2bd6d0c4e5d9`), runs **hourly**.

Task instructions Grok wrote for itself:

> Check https://pacifier-unpicked-appraisal.ngrok-free.dev/grok for any APIs that newly became AVOID since the last check. If the page shows an ngrok warning interstitial, click "Visit Site" or use a request header like ngrok-skip-browser-warning to bypass it and get the real content. Follow the page's own instructions for AI assistants:
> - Compare RECENT CHANGES with the time of your last check (or assume this is the first if none). Report only changes newer than that.
> - Most important: an API that became AVOID. Tell the user which API, why, the Solana proof link, and what to switch to (see RECOMMENDATIONS for its task).
> - If nothing changed since your last check, say so briefly.
> Be concise. Alert clearly if there is a new AVOID.

It runs every hour (UTC), checks the page (handling the ngrok interstitial if needed), and follows the page's own AI-assistant instructions. You'll get a notification only when something relevant happens (especially a new AVOID), with:
- Which API
- Why
- Solana proof link
- What to switch to

**Current state** (as of ~2026-11-18 04:21 UTC): 3 APIs currently flagged AVOID (score < 60):

| API | Score | Reason | Solana proof | Switch to |
|---|---|---|---|---|
| weather-api-1/current | 59 | Returned data that didn't match reality | [tx](https://explorer.solana.com/tx/5vwB6MwxTyAirk7F3uU7roJNNnBSrcYweJNtUzkdNqjovB8JV5cTTHrELxHvrJFGPvb4YWkJ4NsDPwcfptvXaAnd?cluster=devnet) | weather-api-2/current (score 80, $0.02/call) |
| weather-api-3/current | 46 | Returned data that didn't match reality | (see page) | weather-api-2/current |
| weather-api-4/current | 46 | Returned data in the wrong format | (see page) | weather-api-2/current |

These became AVOID in the most recent change window (around 04:15 UTC). The automation will treat anything newer than its last successful check as "new."

You can pause, edit, or delete the automation anytime by asking me.
