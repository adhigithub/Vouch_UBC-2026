use anchor_lang::prelude::*;

#[constant]
pub const CONFIG_SEED: &[u8] = b"config";

#[constant]
pub const ENDPOINT_SEED: &[u8] = b"endpoint";

#[constant]
pub const PAYMENT_SEED: &[u8] = b"payment";

/// Endpoint IDs are used as an address seed, and seeds are at most 32 bytes.
pub const MAX_ENDPOINT_ID_LEN: usize = 32;

/// "empty", "format", "sanity", "slow", ...
pub const MAX_REASON_LEN: usize = 16;
