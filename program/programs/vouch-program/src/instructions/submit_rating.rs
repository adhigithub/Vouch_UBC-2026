use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::VouchError,
    state::{Config, EndpointRecord, PaymentUsed, RatingSubmitted},
};

#[derive(Accounts)]
#[instruction(endpoint_id: String, payment_sig: [u8; 64])]
pub struct SubmitRating<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    // Only the key saved at initialize may write.
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ VouchError::Unauthorized
    )]
    pub config: Account<'info, Config>,

    // Created the first time an endpoint is rated.
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + EndpointRecord::INIT_SPACE,
        seeds = [ENDPOINT_SEED, endpoint_id.as_bytes()],
        bump
    )]
    pub endpoint: Account<'info, EndpointRecord>,

    // `init` (not init_if_needed): if this payment already has a rating, the
    // account exists and the whole transaction fails. One payment, one rating.
    #[account(
        init,
        payer = authority,
        space = 8 + PaymentUsed::INIT_SPACE,
        seeds = [PAYMENT_SEED, &payment_sig[..32], &payment_sig[32..]],
        bump
    )]
    pub payment: Account<'info, PaymentUsed>,

    pub system_program: Program<'info, System>,
}

pub fn handle_submit_rating(
    ctx: Context<SubmitRating>,
    endpoint_id: String,
    payment_sig: [u8; 64],
    rater: Pubkey,
    good: bool,
    reason: String,
    amount_raw: u64,
) -> Result<()> {
    require!(
        !endpoint_id.is_empty() && endpoint_id.len() <= MAX_ENDPOINT_ID_LEN,
        VouchError::BadEndpointId
    );
    require!(reason.len() <= MAX_REASON_LEN, VouchError::ReasonTooLong);
    let now = Clock::get()?.unix_timestamp;

    let endpoint = &mut ctx.accounts.endpoint;
    if endpoint.endpoint_id.is_empty() {
        endpoint.endpoint_id = endpoint_id.clone();
        endpoint.bump = ctx.bumps.endpoint;
    }
    require!(endpoint.endpoint_id == endpoint_id, VouchError::EndpointMismatch);
    if good {
        endpoint.good = endpoint.good.checked_add(1).ok_or(VouchError::Overflow)?;
    } else {
        endpoint.bad = endpoint.bad.checked_add(1).ok_or(VouchError::Overflow)?;
    }
    endpoint.last_rated_at = now;
    let (good_total, bad_total, endpoint_key) = (endpoint.good, endpoint.bad, endpoint.key());

    let payment = &mut ctx.accounts.payment;
    payment.payment_sig = payment_sig;
    payment.endpoint = endpoint_key;
    payment.rater = rater;
    payment.good = good;
    payment.reason = reason.clone();
    payment.amount_raw = amount_raw;
    payment.rated_at = now;
    payment.bump = ctx.bumps.payment;

    let config = &mut ctx.accounts.config;
    config.total_ratings = config.total_ratings.checked_add(1).ok_or(VouchError::Overflow)?;

    emit!(RatingSubmitted {
        endpoint_id,
        payment_sig,
        rater,
        good,
        reason,
        good_total,
        bad_total,
    });
    Ok(())
}
