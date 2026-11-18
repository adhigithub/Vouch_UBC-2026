# Vouch: Shatter (BRIEF)

**Brief status: partly interviewed.** The owner gave the direction below in their own words on 2026-11-17 and asked for the build to be generated. The eight interview topics they did not answer are filled in as **authored decisions**, drawn from the existing Vouch site, `PROJECT_STATUS.md`, and the server, stream and program READMEs. Each one is labelled. No user quotation below is invented.

## The owner's words (verbatim)

> "build a new front end, using scroll craft, but can you make it more seam less on the scroll? and I want vouch to be a very minimalistic logo, and I want it to do things when you scroll, maybe it breaks apart into pieces, and each piece you scroll to is a segment, like you have it divided into 6 parts already, but each part of the v, once it breaks apart, can be zoomed into seamlessly, you know?"

### Revision 2 (2026-11-17, verbatim)

> "I like this way better, but i wanna combine the best of both worlds, take this same split zoom idea, I LOVE IT, and incorporate the leaderboard, once you scroll down, and instead of them clicking to view the program, once again incorporate it into the scroll. for the part of the V, once we're done going through that journey, switch it back to the initial V that it was, don't show all the parts. Also arvindh, the github name that starts with adhigithub, comitted the flow to the main, use that flow to lock in the variables on leaderboard. and clean up parts of the journey on the scroll aspect a little bit, but for the most part this is more like what i wanted"

**What changed in response:**

- **Leaderboard.** It is a waypoint inside the same world, after the journey. Its variables are locked to main at `04a84bc`: the `GET /scores` row shape from `LEADERBOARD_GUIDE.md`, `ENDPOINT_REGISTRY` names and paths, the `TRUST_CUTOFF` of 60, and the `liveTag()` labels. It is read through the same `/vouch` proxy path the main website uses. When the server is down, it shows sample data and says so on the page.
- **The program.** "View the program" is no longer a click. An **On Solana** waypoint reads the program's Config and EndpointRecord accounts live from devnet, while a cobalt line seals the V.
- **The V after the journey.** The cracks close and the drawings fade, and a single solid V covers the six shards. The mark is the clean original again, and the opening V is clean too.
- **Journey cleanup.**
  - The shard legs are shorter (1.4 to 1.25) and still at one even pace.
  - The hero no longer sits still. It drifts and cracks as the headline leaves.
  - Copy windows are computed from leg fractions, so they stay in sync when weights change.
  - Small drawing fixes: the 402 arrow is labelled, the STAMP seal no longer overlaps the receipt, and the CHAIN lock is redrawn.

## The eight topics

1. **Vibe.** *Authored:* "minimal, precise, drawn, inevitable." References: a Swiss transit diagram, an architectural section drawing, the cut lines on a sheet of safety glass.
2. **The journey, section by section.** *From the owner:* the minimal V, then it "breaks apart into pieces", then "each piece you scroll to is a segment", divided into the "6 parts" the current site uses (GET, 402, SCORE, STREAM, STAMP, CHAIN), each "zoomed into seamlessly". *Authored:* the page ends by putting the V back together.
3. **The energy curve.** *Authored:* still at the open, the loudest moment at the break, then a steady, even flight through the six pieces, and calm again at the end.
4. **Feeling and the one moment.** See the feeling curve and the peak below.
5. **The one thing no other site does.** *From the owner:* the logo breaks apart, and you zoom into each piece. This is the signature move.
6. **Distance from premium-minimal.** *From the owner:* "very minimalistic". *Authored:* Swiss and technical-drawing minimal, on a light paper ground. This is deliberately not the dark, prismatic look of the current site, and it avoids the violet-to-blue gradient trap.
7. **One unbroken world, or distinct scenes?** *From the owner:* "more seamless on the scroll", "zoomed into seamlessly". **One unbroken world.**
8. **Existing assets.** The Vouch brand assets zip and the current site's copy. *Authored:* there are no photos or footage, and nothing needs generating. The world is vector, drawn in code, so it stays sharp at any zoom.

## Grammar

**Continuous world (uniqueness.md §2.4), built in worldflight mode.**

- There is one fixed stage and nothing in document flow except the spacer.
- The engine's legs are the waypoints. The world itself is a single SVG, and one camera flies through it, driven by smoothed scroll.
- No video is used, so the seam law is met by construction: a single camera never cuts.

**Why the other seven lost:**

- **Filmic one-shot:** acts would put seams back in, which the owner asked to remove.
- **Chaptered editorial:** hard cuts, the opposite of the brief.
- **Live surface:** that is the current site, and the gate forbids repeating it.
- **Typographic poster:** the logo, not type, is the image.
- **Gallery:** six steps of one transaction are a sequence, not a range of options.
- **Split stage:** there is no two-sided argument here.
- **Rhythmic cutlist:** cuts, the opposite of the brief.

## Signature move

**The shatter flight.** The flat V cracks along six hairlines, comes apart, and the camera flies *into* each shard in transaction order: down the left arm, round the point of the V, up the right arm. Each shard is a whole drawing inside. It shows as a faint ghost from far away and draws itself in once you arrive. At the end the six shards fly back together into the V.

## Tell-someone sentence

> It's the site where the Vouch logo cracks into six pieces, you fly inside each one to follow a single payment, and they snap back into the V when it clears.

## Journey and feeling curve (written before the legs)

| Leg | Feeling | What on screen causes it |
|---|---|---|
| Hero | Calm curiosity | The flat ink V, alone on paper, one line of type. Nothing moves until you do |
| Fracture | **Awe (peak)** | Hairline cracks open along six cuts, then the V comes apart and the pieces turn slightly as they drift |
| GET | Recognition | You fly into the first shard. An agent asking for data, drawn as two nodes and one line |
| 402 | Unease | The price, and the word "final". There is no way back from a bad payment |
| SCORE | Relief | The gauge sweeps to its number. The agent has something to check before paying |
| STREAM | Trust | A row of Solana blocks, and one of them is caught by the filter. Someone else is watching too |
| STAMP | Resolve | A receipt fills with four checks and gets stamped |
| CHAIN | Weight | Linked blocks and a lock. This record is permanent |
| Rejoin | Closure | The camera pulls out, the shards fly home, the cracks close, and the V is the clean original again |
| Leaderboard | Judgement | The V steps aside. As you scroll, the table fills, sorts itself into rank, the 60 line drops in, and everything below it turns red |
| On Solana | Certainty | The V comes back and a cobalt line seals it, while the real on-chain count ticks up beside it |
| Finale | Calm resolve | The clean V, centred, with the opening line as a bookend and one action |

No two adjacent legs share a feeling. *(Revision 2: the old Finale row became Rejoin, and Leaderboard and On Solana were added.)*

## The peak

> "The logo cracked along these hairlines, and then it just came apart in front of me."

The peak lives in the **Fracture** leg. It is the longest leg on the page: 1.9 viewport-heights, against 1.4 for each shard leg. The silence before it is the hero, which stays still with one line of type.

## Authored silence

- **Between shard legs**, the copy layer is empty for about 0.35 viewport-heights while the camera travels from one shard to the next. This is deliberate: the travel is the content there.
- **The world never stops moving.** Every hold has a slow push-in, so this is not dead scroll.

## Pace

Shard legs all weigh the same, so the flight keeps one speed.

- **Revision 2 track:** hero 1.0, fracture **2.0** (still the largest span, because it is still the peak), six shards at 1.25, rejoin 1.2, leaderboard 1.9, On Solana 1.5, finale 1.2.
- **Total:** 16.3 viewport-heights, plus one landing screen.

## Fingerprint gate

Checked against the one existing row, `vouch`:

| Dimension | `vouch` | `vouch-shatter` | Differs |
|---|---|---|---|
| Grammar | Live Surface + Split-Stage | Continuous world (worldflight) | yes |
| Nav | Frosted tab bar + left telemetry rail | Wordmark + a clickable V-shaped map of the six shards | yes |
| Hero | Pinned cold open, prismatic V, typed request | An establishing position inside the world: a flat V on paper, static type | yes |
| Sequence | 5 acts, pinned + working surfaces | 9 worldflight legs, no acts, 13.1vh | yes |
| Close | Working surface, then a 200 OK statement | The shards reassemble into the V, and the call to action sits under it | yes |
| Signature | Playhead rail scrubbing one x402 purchase | The shatter flight | yes |

**Result: 6 of 6. Passes.** Shared deliberately: the six x402 steps as content, because the owner asked for them.
