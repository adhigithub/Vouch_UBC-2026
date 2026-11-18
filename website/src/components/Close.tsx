import { VOUCH_PROGRAM_ID, explorerAddressUrl, shortAddr } from "../lib/vouchApi";

export function Close() {
  return (
    <section className="close" aria-labelledby="close-title">
      <div className="eyebrow" style={{ justifyContent: "center" }}><b>200 OK</b> transaction complete</div>
      <h2 id="close-title" style={{ marginTop: 18 }}>Agents check <span className="prism-text">before</span> they spend a cent.</h2>
      <p>Every Vouch score is built from payments that really happened on Solana, rated by the wallets that made them, and written to a program nobody can quietly edit.</p>
      <div className="cta">
        <a className="btn" href="#sandbox">Run the agent loop</a>
        <a className="btn ghost" href={explorerAddressUrl(VOUCH_PROGRAM_ID)} target="_blank" rel="noreferrer">View program on devnet ↗</a>
      </div>
      <footer className="foot">
        <div className="brand-plate"><img src="/assets/vouch-logo.webp" alt="Vouch logo" /></div>
        <div className="stack">
          <span>built on</span>
          <img src="/assets/solana-coin.jpg" alt="Solana" style={{ objectPosition: "52% 30%" }} />
          <img src="/assets/quicknode.jpg" alt="QuickNode" style={{ objectPosition: "18% 50%" }} />
          <img src="/assets/grok.jpg" alt="Grok Bot" style={{ objectPosition: "35% 50%" }} />
          <span>· x402 · USDC</span>
        </div>
        <div>program {shortAddr(VOUCH_PROGRAM_ID, 6)} · devnet</div>
      </footer>
    </section>
  );
}
