use anchor_lang::prelude::*;

/// Who is allowed to write ratings (the Vouch server's key). Address: ["config"].
#[account]
#[derive(InitSpace)]
pub struct Config {
    pub authority: Pubkey,
    pub total_ratings: u64,
    pub bump: u8,
}

/// Running totals for one endpoint. Address: ["endpoint", endpoint_id].
#[account]
#[derive(InitSpace)]
pub struct EndpointRecord {
    #[max_len(32)]
    pub endpoint_id: String,
    pub good: u32,
    pub bad: u32,
    pub last_rated_at: i64,
    pub bump: u8,
}

/// One rating, tied to one payment. Its address is derived from the payment's
/// transaction signature, so a second rating for the same payment can't be created.
/// Address: ["payment", sig[0..32], sig[32..64]].
#[account]
#[derive(InitSpace)]
pub struct PaymentUsed {
    pub payment_sig: [u8; 64],
    pub endpoint: Pubkey,
    pub rater: Pubkey,
    pub good: bool,
    #[max_len(16)]
    pub reason: String,
    pub amount_raw: u64,
    pub rated_at: i64,
    pub bump: u8,
}

#[event]
pub struct RatingSubmitted {
    pub endpoint_id: String,
    pub payment_sig: [u8; 64],
    pub rater: Pubkey,
    pub good: bool,
    pub reason: String,
    pub good_total: u32,
    pub bad_total: u32,
}
