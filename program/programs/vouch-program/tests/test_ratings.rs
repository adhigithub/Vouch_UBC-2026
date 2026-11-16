// Runs the program on a simulated Solana (LiteSVM) and checks the rules it enforces.
use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{instruction::Instruction, system_program},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    litesvm::LiteSVM,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
    vouch_program::{constants::*, state::*},
};

fn pda(seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, &vouch_program::id()).0
}
fn config_pda() -> Pubkey {
    pda(&[CONFIG_SEED])
}
fn endpoint_pda(id: &str) -> Pubkey {
    pda(&[ENDPOINT_SEED, id.as_bytes()])
}
fn payment_pda(sig: &[u8; 64]) -> Pubkey {
    pda(&[PAYMENT_SEED, &sig[..32], &sig[32..]])
}

fn setup() -> (LiteSVM, Keypair) {
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!(concat!(env!("CARGO_TARGET_TMPDIR"), "/../deploy/vouch_program.so"));
    svm.add_program(vouch_program::id(), bytes).unwrap();
    let server = Keypair::new();
    svm.airdrop(&server.pubkey(), 10_000_000_000).unwrap();
    (svm, server)
}

fn send(svm: &mut LiteSVM, ix: Instruction, signer: &Keypair) -> bool {
    svm.expire_blockhash(); // so identical transactions aren't rejected as duplicates
    let msg = Message::new_with_blockhash(&[ix], Some(&signer.pubkey()), &svm.latest_blockhash());
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[signer]).unwrap();
    svm.send_transaction(tx).is_ok()
}

fn initialize(svm: &mut LiteSVM, authority: &Keypair) -> bool {
    let ix = Instruction::new_with_bytes(
        vouch_program::id(),
        &vouch_program::instruction::Initialize {}.data(),
        vouch_program::accounts::Initialize {
            authority: authority.pubkey(),
            config: config_pda(),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    send(svm, ix, authority)
}

fn rate(svm: &mut LiteSVM, signer: &Keypair, endpoint_id: &str, sig: [u8; 64], good: bool, reason: &str) -> bool {
    let ix = Instruction::new_with_bytes(
        vouch_program::id(),
        &vouch_program::instruction::SubmitRating {
            endpoint_id: endpoint_id.to_string(),
            payment_sig: sig,
            rater: Pubkey::new_unique(),
            good,
            reason: reason.to_string(),
            amount_raw: 10_000,
        }
        .data(),
        vouch_program::accounts::SubmitRating {
            authority: signer.pubkey(),
            config: config_pda(),
            endpoint: endpoint_pda(endpoint_id),
            payment: payment_pda(&sig),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    send(svm, ix, signer)
}

fn read<T: AccountDeserialize>(svm: &LiteSVM, key: Pubkey) -> T {
    let acc = svm.get_account(&key).expect("account exists");
    T::try_deserialize(&mut acc.data.as_slice()).unwrap()
}

#[test]
fn server_can_rate_and_counts_update() {
    let (mut svm, server) = setup();
    assert!(initialize(&mut svm, &server));

    assert!(rate(&mut svm, &server, "weather-api-1/current", [1; 64], true, ""));
    assert!(rate(&mut svm, &server, "weather-api-1/current", [2; 64], false, "sanity"));

    let ep: EndpointRecord = read(&svm, endpoint_pda("weather-api-1/current"));
    assert_eq!((ep.good, ep.bad), (1, 1));
    assert_eq!(ep.endpoint_id, "weather-api-1/current");

    let p: PaymentUsed = read(&svm, payment_pda(&[2; 64]));
    assert!(!p.good);
    assert_eq!(p.reason, "sanity");
    assert_eq!(p.endpoint, endpoint_pda("weather-api-1/current"));

    let cfg: Config = read(&svm, config_pda());
    assert_eq!(cfg.authority, server.pubkey());
    assert_eq!(cfg.total_ratings, 2);
}

#[test]
fn one_payment_can_only_be_rated_once() {
    let (mut svm, server) = setup();
    assert!(initialize(&mut svm, &server));
    assert!(rate(&mut svm, &server, "crypto-api-1/price", [7; 64], true, ""));
    // Same payment again: rejected, even with a different rating or endpoint.
    assert!(!rate(&mut svm, &server, "crypto-api-1/price", [7; 64], false, "slow"));
    assert!(!rate(&mut svm, &server, "crypto-api-2/price", [7; 64], true, ""));

    let ep: EndpointRecord = read(&svm, endpoint_pda("crypto-api-1/price"));
    assert_eq!((ep.good, ep.bad), (1, 0));
}

#[test]
fn only_the_server_key_can_rate() {
    let (mut svm, server) = setup();
    assert!(initialize(&mut svm, &server));
    let attacker = Keypair::new();
    svm.airdrop(&attacker.pubkey(), 1_000_000_000).unwrap();
    assert!(!rate(&mut svm, &attacker, "weather-api-1/current", [9; 64], false, "sanity"));
    assert!(svm.get_account(&payment_pda(&[9; 64])).is_none());
}

#[test]
fn initialize_only_once() {
    let (mut svm, server) = setup();
    assert!(initialize(&mut svm, &server));
    let attacker = Keypair::new();
    svm.airdrop(&attacker.pubkey(), 1_000_000_000).unwrap();
    assert!(!initialize(&mut svm, &attacker)); // can't take over the config
    let cfg: Config = read(&svm, config_pda());
    assert_eq!(cfg.authority, server.pubkey());
}

#[test]
fn rejects_bad_inputs() {
    let (mut svm, server) = setup();
    assert!(initialize(&mut svm, &server));
    assert!(!rate(&mut svm, &server, "", [3; 64], true, ""));
    assert!(!rate(&mut svm, &server, "weather-api-1/current", [4; 64], false, "this-reason-is-way-too-long"));
}
