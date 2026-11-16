use anchor_lang::prelude::*;

#[error_code]
pub enum VouchError {
    #[msg("Only the Vouch server can submit ratings")]
    Unauthorized,
    #[msg("Endpoint ID must be 1-32 bytes")]
    BadEndpointId,
    #[msg("Reason must be at most 16 bytes")]
    ReasonTooLong,
    #[msg("Endpoint record does not match this endpoint ID")]
    EndpointMismatch,
    #[msg("Counter overflow")]
    Overflow,
}
