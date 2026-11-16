# Vouch Solana program

A public, tamper-proof record of every agent rating, on Solana devnet.

**Program ID:** [`GyYPjRNghiX96xFtP98eNMiYjKfrF5ktKLf1Mm2YBgni`](https://explorer.solana.com/address/GyYPjRNghiX96xFtP98eNMiYjKfrF5ktKLf1Mm2YBgni?cluster=devnet)

The Vouch server checks each rating first (QuickNode saw the payment, the payer signed the rating), then writes it here. The program enforces:

| Rule | How |
| --- | --- |
| Only the Vouch server can write ratings | `Config.authority`, set once by `initialize` |
| One rating per payment, forever | A `PaymentUsed` account whose address comes from the payment's tx signature; `init` fails if it exists |
| Ratings can't be edited or deleted | No instruction does that |
| Anyone can read an endpoint's record | `EndpointRecord` with good/bad totals |

## Accounts

| Account | Address seeds | Holds |
| --- | --- | --- |
| `Config` | `["config"]` | authority (server key), total ratings |
| `EndpointRecord` | `["endpoint", endpoint_id]` | endpoint ID, good count, bad count, last rated time |
| `PaymentUsed` | `["payment", sig[0..32], sig[32..64]]` | payment signature, endpoint, rater, good/bad, reason, amount, time |

Instructions: `initialize()` and `submit_rating(endpoint_id, payment_sig, rater, good, reason, amount_raw)`. Each rating also emits a `RatingSubmitted` event.

## Build, test, deploy (WSL / Ubuntu)

Needs Rust, the Solana CLI and Anchor 1.x (`curl --proto '=https' --tlsv1.2 -sSfL https://solana-install.solana.workers.dev | bash`).

```bash
wsl -d Ubuntu -- bash program/build.sh           # build + 5 tests on a simulated chain (LiteSVM)
wsl -d Ubuntu -- bash program/build.sh deploy    # ...and deploy to devnet
```

Builds run in `~/vouch-program` on the Linux side (OneDrive shouldn't sync `target/`, and the program keypair stays out of git). `idl/vouch_program.json` is copied back here after each build.

## Server side

`server/src/solana.js` sends `submit_rating`, and `server/src/stamp.js` calls it for every accepted rating. First-time setup: `cd server && npm run chain:setup` (creates the server key and runs `initialize`).
