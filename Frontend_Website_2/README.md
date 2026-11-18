# Vouch: Shatter (frontend v2)

A scroll-driven site for Vouch. The minimal V cracks into six pieces, one per moment of an x402 payment (GET, 402, SCORE, STREAM, STAMP, CHAIN), and the camera flies inside each piece. The V then reassembles. After that come a leaderboard that sorts itself as you scroll, and the Vouch program read live from Solana devnet.

There is no build step and no framework: plain HTML, CSS and JavaScript, run on the [scroll-craft](BRIEF.md) worldflight engine.

## Run

```bash
cd Frontend_Website_2
node server.mjs          # http://localhost:4510
```

`server.mjs` serves the page and forwards `/vouch/*` to the Vouch server, the same path the main website's Vite proxy uses. The default target is `http://localhost:4000`. To point it somewhere else:

```bash
VOUCH_URL=http://host:4000 PORT=4510 node server.mjs
```

## Data

| View | Source | When it is unavailable |
| --- | --- | --- |
| Leaderboard | `GET /vouch/scores`, polled every 3 s | Shows sample data, labelled as such on the page |
| On Solana | `getMultipleAccounts` on devnet: the `Config` account and every endpoint's `EndpointRecord` | Says it could not reach devnet |

The endpoint names, paths, PDAs, 60 trust cutoff and label rules live in `data.js`. They match `website/src/lib/vouchApi.ts` and `LEADERBOARD_GUIDE.md` on `main`.

## Files

| File | What |
| --- | --- |
| `index.html` | Markup, copy and styles |
| `app.js` | The SVG world, camera, shard drawings, leaderboard animation and the on-chain read |
| `data.js` | Data contract: registry, scoring rule, sample fallback |
| `server.mjs` | Static server plus the `/vouch` proxy |
| `scrollcraft.js` / `.css` | The scroll engine (unmodified) |
| `BRIEF.md` | Design brief: journey, feeling curve, decisions |
| `lab/` | Verification scripts (`npm i` first, for `playwright-core`) |
