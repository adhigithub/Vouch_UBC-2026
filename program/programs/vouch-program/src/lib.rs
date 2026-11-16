// Vouch on-chain program: a public, tamper-proof record of agent ratings.
//
// The Vouch server checks each rating off-chain (QuickNode saw the payment, the
// payer signed the rating) and then writes it here. On-chain, the program enforces:
//   - only the Vouch server's key can write ratings      (Config.authority)
//   - one rating per payment, forever                    (PaymentUsed account per tx signature)
//   - ratings can never be edited or deleted             (no instruction does that)
//   - per-endpoint good/bad counts anyone can read       (EndpointRecord)
pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("GyYPjRNghiX96xFtP98eNMiYjKfrF5ktKLf1Mm2YBgni");

#[program]
pub mod vouch_program {
    use super::*;

    /// One-time setup: the signer becomes the only key allowed to submit ratings.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        crate::instructions::initialize::handle_initialize(ctx)
    }

    /// Record one rating for one verified payment. Fails if the payment was already used.
    pub fn submit_rating(
        ctx: Context<SubmitRating>,
        endpoint_id: String,
        payment_sig: [u8; 64],
        rater: Pubkey,
        good: bool,
        reason: String,
        amount_raw: u64,
    ) -> Result<()> {
        crate::instructions::submit_rating::handle_submit_rating(
            ctx, endpoint_id, payment_sig, rater, good, reason, amount_raw,
        )
    }
}
