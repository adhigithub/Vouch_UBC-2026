# Fingerprints

Every site you build with **scroll-craft** gets one row here, appended after it
ships. The registry exists so your next build can prove it is a different page
rather than a re-skin of one you already made.

This file is **yours**. It starts empty on purpose: the gate is about not
repeating *yourself*, so it has nothing to say until you have built something.

The rules and the gate live in the skill's
`references/uniqueness.md`. Short version:

**A new build must differ from EVERY row below on at least 4 of the 6
dimensions.** Four against each row individually, not four on average across the
table. If a planned build fails, change the plan. Never edit a row to make room
for it.

The six dimensions are: **grammar**, **nav treatment**, **hero device**,
**act-sequence shape**, **close pattern**, **signature move**.

Dimension 6 is free, because a signature move is unique by definition. So the
gate really asks for three more out of the remaining five, and a build that
changes only grammar and world will fail it.

---

## The registry

| Build | Grammar | Nav treatment | Hero device | Act-sequence shape | Close pattern | Signature move | World | Port |
|---|---|---|---|---|---|---|---|---|
| vouch | Live Surface + Split-Stage hybrid | Frosted top tab bar (Overview / Leaderboard / Sandbox) + fixed left telemetry rail, bottom bar on mobile | Pinned cold open: SVG faceted V with refractive sweep, typed HTTP request line | 5 acts: pin-split → pin-scrubbed dial → pin-SVG flow → 2 unpinned working surfaces | Working surface (agent runner + signed review form), then a resolving "200 OK" statement | x402 Playhead: one 6-step x402 purchase scrubbed by page scroll | Obsidian + prismatic glass, no generated media | 5173 |
| vouch-shatter | Continuous world (worldflight, code-rendered SVG world, no video) | Wordmark + one CTA, and a clickable mini-V map (one link per shard, visited shards fill) in a bottom-left plate | Establishing position inside the world: flat ink V on paper with static headline, cracks start as the headline leaves | 9 worldflight legs, no acts, 13.1vh: hero 1.2 → fracture 1.9 (peak) → 6 shard legs at 1.4 → finale 1.6 | Arrival: camera pulls out, shards fly home into the V, centred statement + CTA pill under it | Shatter flight: the logo cracks into six shards along the payment path and the camera flies inside each, which draws itself | Paper + ink + cobalt, technical-drawing vector, no generated media | 4510 |
| vouch-shatter r2 (supersedes the row above, same folder) | Continuous world (worldflight, code-rendered SVG world) with data waypoints in the copy layer | Wordmark + jump pill (Leaderboard / On Solana) + mini-V shard map that hides on data waypoints | Clean flat V on paper, static headline; drifts and cracks as the headline leaves | 12 legs, no acts, 16.3vh: hero 1.0 → fracture 2.0 (peak) → 6 shards at 1.25 → rejoin 1.2 → leaderboard 1.9 → on-chain 1.5 → finale 1.2 | Bookend: clean V centred, opening line repeated, one CTA pill | Shatter flight, plus a leaderboard that sorts itself into rank as you scroll and a cobalt seal traced round the V while devnet is read live | Paper + ink + cobalt, technical-drawing vector, live server + devnet data | 4510 |


---

## What is taken

Add a bullet here whenever a build claims something a later build should avoid
reusing: a grammar, a nav treatment, a close pattern, a signature move, an
act-count-and-length band. The shared columns are what the next build inherits
as a constraint, so writing them down is the whole point.

- **vouch**: Live Surface + Split-Stage hybrid; transaction-playhead rail as a signature move; working-surface close.
- **vouch-shatter**: Continuous world on a code-rendered SVG camera; the logo-as-map nav; logo-shatter-and-fly-inside as a signature move; reassembly close. Shares the six x402 steps as content with `vouch` (owner's request). r2 adds: the scroll-sorted leaderboard, a seal-while-reading-chain waypoint, and a bookend close.

---

## Appending a row

After shipping, add one line to the table and one bullet to **What is taken** if
the build claimed something new. Fill every column. Say what the build shares
with existing rows.

Rows are append-only. A build that has been superseded stays in the table,
because the space it occupies is still occupied.

---

## Worked example

The skill's author kept a registry of twelve builds across eight page grammars.
If you want to see what a filled-in table looks like, and which shapes tend to
collide, read `EXAMPLES.md` in the scroll-craft repository. Treat it as
illustration only: those rows are somebody else's builds and they do **not**
constrain yours.
