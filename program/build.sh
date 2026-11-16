#!/usr/bin/env bash
# Build and test the program inside WSL (Ubuntu).
#
# The source lives here in the repo, but builds run in ~/vouch-program on the Linux
# side: builds create GBs of files (target/) that OneDrive shouldn't sync, and the
# program's deploy keypair lives in ~/vouch-program/target/deploy (never committed).
#
#   wsl -d Ubuntu -- bash program/build.sh           build + test
#   wsl -d Ubuntu -- bash program/build.sh deploy    build + test + deploy to devnet
set -euo pipefail
# Linux tools only: WSL also sees Windows programs, which break anchor.
export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$HOME/.avm/bin:/usr/local/bin:/usr/bin:/bin"

SRC="$(cd "$(dirname "$0")" && pwd)"
WORK="$HOME/vouch-program"
mkdir -p "$WORK"

# Copy source over (keep target/, which holds the build and the program keypair).
rm -rf "$WORK/programs"
cp -r "$SRC/programs" "$WORK/"
cp "$SRC/Anchor.toml" "$SRC/Cargo.toml" "$SRC/rust-toolchain.toml" "$WORK/"

cd "$WORK"
anchor build
cargo test -- --test-threads=1

# Bring the IDL (the program's public interface) back into the repo for the server.
mkdir -p "$SRC/idl"
cp target/idl/vouch_program.json "$SRC/idl/"

if [ "${1:-}" = "deploy" ]; then
  anchor deploy --provider.cluster devnet
fi
