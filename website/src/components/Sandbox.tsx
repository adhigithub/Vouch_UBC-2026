import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useLeaderboard } from "../hooks/useScroll";
import {
  USE_MOCK_DATA,
  VOUCH_API_BASE_URL,
  buildReviewChallenge,
  createDemoSigner,
  explorerTxUrl,
  fetchRecentPayments,
  isValidTxSig,
  randomSig,
  resolveEndpoint,
  runAgentLoop,
  shortAddr,
  submitReview,
  type AgentTraceStep,
  type ReviewResult,
  type WalletSigner,
} from "../lib/vouchApi";
import { Gauge } from "./Leaderboard";

const GLYPH: Record<AgentTraceStep["status"], string> = { ok: "✓", fail: "✗", warn: "!", info: "›" };

function AgentLoop() {
  const [steps, setSteps] = useState<AgentTraceStep[]>([]);
  const [running, setRunning] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const { rows } = useLeaderboard();
  const weather = rows?.filter((r) => r.category === "weather") ?? [];

  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" });
  }, [steps]);

  const run = async () => {
    setRunning(true);
    setSteps([]);
    try {
      for await (const s of runAgentLoop("weather")) {
        setSteps((xs) => [...xs, s]);
        if (s.delayMs) await new Promise((r) => setTimeout(r, s.delayMs));
      }
    } catch (e) {
      setSteps((xs) => [...xs, { kind: "done", status: "fail", text: `Agent loop failed: ${(e as Error).message}`, delayMs: 0 }]);
    }
    setRunning(false);
  };

  return (
    <div className="run-pane glass">
      <div className="run-bar">
        <div>
          <div style={{ fontWeight: 600 }}>Simulate agent purchase</div>
          <div className="mono t-dim" style={{ fontSize: 11.5 }}>
            {USE_MOCK_DATA ? "mock agent · " : `live agent · SSE ${VOUCH_API_BASE_URL}/api/agent/run-demo · `}min score 60 · max 0.05 USDC/call
          </div>
        </div>
        <button className="btn" onClick={run} disabled={running}>{running ? "Running…" : steps.length ? "Run again" : "Run Agent Loop"}</button>
      </div>
      <div className="trace" ref={box} aria-live="polite">
        {steps.length === 0 && (
          <div className="empty">
            <div>$ node agent.js weather city=Austin</div>
            <div style={{ marginTop: 8 }}>Press <b style={{ color: "var(--ink)" }}>Run Agent Loop</b>. The agent asks Vouch first, refuses every endpoint under 60,
              pays the trusted one, runs its 4 checks, and stamps a rating on Solana. The leaderboard updates live.</div>
            <div style={{ marginTop: 18 }}>
              {weather.map((w) => (
                <div key={w.endpointUrl} style={{ display: "grid", gridTemplateColumns: "1fr 170px", gap: 10, alignItems: "center", marginBottom: 6 }}>
                  <span>{w.endpointUrl} <span className="t-dim">· {w.name}</span></span><Gauge score={w.vouchScore} />
                </div>
              ))}
            </div>
          </div>
        )}
        {steps.map((s, i) => (
          <div key={i} className={`st ${s.status}`}>
            <span className="g">{GLYPH[s.status]}</span>
            <span className="tx">{s.text}</span>
            {s.detail && <pre>{s.detail}</pre>}
          </div>
        ))}
        {running && <span className="caret" />}
      </div>
    </div>
  );
}

function ReviewForm() {
  const { rows } = useLeaderboard();
  const wallet = useWallet();
  const [demo, setDemo] = useState<WalletSigner | null>(null);
  const [endpointUrl, setEndpointUrl] = useState("/weather/current");
  const [txSig, setTxSig] = useState("");
  const [rating, setRating] = useState(90);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [lastUsed, setLastUsed] = useState<string | null>(null);

  const signer: WalletSigner | null = useMemo(() => {
    if (wallet.publicKey && wallet.signMessage) return { publicKey: wallet.publicKey.toBase58(), signMessage: wallet.signMessage };
    return demo;
  }, [wallet.publicKey, wallet.signMessage, demo]);
  const noSignSupport = wallet.connected && !wallet.signMessage;

  // The challenge names the real fake-apis route, not the display alias.
  const route = resolveEndpoint(endpointUrl)?.route ?? endpointUrl;
  const challenge = buildReviewChallenge(txSig || "<txSig>", route, rating);

  const useVerified = async () => {
    const ps = await fetchRecentPayments(40);
    const p = ps.find((x) => !x.rated && x.endpointUrl === endpointUrl) ?? ps.find((x) => !x.rated);
    if (p) {
      setEndpointUrl(p.endpointUrl);
      setTxSig(p.paymentId);
      setResult(null);
    } else {
      setResult({ ok: false, code: "payment_not_verified", message: "No unrated payments in the feed right now. Run the agent loop or wait for the stream." });
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await submitReview({ txSig, endpointUrl: route, rating, comment }, signer);
    setResult(r);
    if (r.ok) setLastUsed(txSig);
    setBusy(false);
  };

  const sigOk = txSig === "" || isValidTxSig(txSig);
  const httpCode = (r: Extract<ReviewResult, { ok: false }>) =>
    r.code === "payment_already_used" ? "409" : r.code === "bad_signature" ? "401" : /^http_/.test(r.code) ? r.code.slice(5) : r.code.startsWith("wallet") || r.code.startsWith("signature") ? "wallet" : "400";

  return (
    <form className="form glass" onSubmit={submit} aria-labelledby="rv-title">
      <div className="run-bar" style={{ padding: 0, border: 0 }}>
        <div>
          <div id="rv-title" style={{ fontWeight: 600 }}>Wallet-signed review</div>
          <div className="mono t-dim" style={{ fontSize: 11.5 }}>POST {VOUCH_API_BASE_URL}/review</div>
        </div>
        <WalletMultiButton />
      </div>
      <div className="rule"><b>1 verified x402 payment = 1 rating.</b> Your wallet signs the review, and the tx must be a real payment to that endpoint, used once. Faking 5-stars means paying for every one.</div>

      {!signer && (
        <div className="hint-row mono" style={{ fontSize: 12, color: "var(--ink-2)", alignItems: "center" }}>
          <span>Connect Phantom or Solflare (devnet) to sign.</span>
          {USE_MOCK_DATA && <button type="button" className="icon-btn" onClick={() => setDemo(createDemoSigner())}>no wallet? use a demo keypair</button>}
        </div>
      )}
      {signer && (
        <div className="mono" style={{ fontSize: 12, color: "var(--ink-2)" }}>
          signing as <span className="t-cyan">{shortAddr(signer.publicKey, 6)}</span>
          {!wallet.publicKey && demo && <> · demo keypair <button type="button" className="copy-btn" onClick={() => setDemo(null)}>clear</button></>}
        </div>
      )}
      {noSignSupport && <div className="result err">This wallet doesn't support message signing. Try Phantom or Solflare.</div>}

      <div className="field">
        <label htmlFor="rv-ep">Endpoint</label>
        <select id="rv-ep" className="select" value={endpointUrl} onChange={(e) => setEndpointUrl(e.target.value)}>
          {(rows ?? []).map((r) => <option key={r.endpointUrl} value={r.endpointUrl}>{r.name} · {r.endpointUrl} · {Math.round(r.vouchScore)}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="rv-tx">Solana transaction signature (txSig)</label>
        <input id="rv-tx" className="input" value={txSig} onChange={(e) => (setTxSig(e.target.value), setResult(null))}
          placeholder="the x402 payment you made" spellCheck={false} autoComplete="off" aria-invalid={!sigOk} />
        <div className="hint-row">
          <button type="button" className="icon-btn" onClick={useVerified}>use a verified payment</button>
          <button type="button" className="icon-btn" onClick={() => (setTxSig(randomSig()), setResult(null))}>try a made-up tx</button>
          {lastUsed && <button type="button" className="icon-btn" onClick={() => (setTxSig(lastUsed), setResult(null))}>reuse last tx</button>}
        </div>
      </div>
      <div className="field">
        <label htmlFor="rv-rating">Rating <span>{rating}/100</span></label>
        <input id="rv-rating" type="range" min={0} max={100} value={rating} onChange={(e) => setRating(Number(e.target.value))} />
      </div>
      <div className="field">
        <label htmlFor="rv-c">Comment</label>
        <textarea id="rv-c" className="textarea" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What did you get for your 0.01 USDC?" maxLength={280} />
      </div>
      <div className="field">
        <label>Message your wallet signs</label>
        <pre className="json-block">{challenge}</pre>
      </div>
      <div className="field">
        <label>Same review from X</label>
      </div>
      <button className="btn" type="submit" disabled={busy || !txSig || !signer}>
        {busy ? "Signing + verifying…" : signer ? "Sign & submit review" : "Connect a wallet to submit"}
      </button>
      {result && (
        <div className={`result ${result.ok ? "ok" : "err"}`} role="status">
          {result.ok ? (
            <>
              200 stamped · {result.endpointUrl}{result.newScore !== null && <> → {result.newScore.toFixed(1)} ({result.label})</>}<br />
              on-chain: {result.onchainTx ? <a href={explorerTxUrl(result.onchainTx)} target="_blank" rel="noreferrer">{shortAddr(result.onchainTx, 6)} ↗</a> : "pending"}
              {result.note && <><br /><span style={{ color: "var(--ink-3)" }}>{result.note}</span></>}
            </>
          ) : (
            <>{httpCode(result)} {result.code}<br /><span style={{ color: "var(--ink-2)" }}>{result.message}</span></>
          )}
          {result.payload && (
            <details style={{ marginTop: 8, color: "var(--ink-2)" }}>
              <summary>signed request body</summary>
              <pre style={{ margin: "6px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{JSON.stringify(result.payload, null, 2)}</pre>
            </details>
          )}
        </div>
      )}
    </form>
  );
}

export function Sandbox() {
  return (
    <section id="sandbox" className="live" aria-labelledby="sb-title">
      <h2 id="sb-title" className="act-title">Run the loop. <span className="prism-text">Try to cheat it.</span></h2>
      <p className="act-lede">Watch an agent spend a cent only where Vouch says it's safe. Then try posting a review without a real payment.</p>
      <div className="sandbox-grid">
        <AgentLoop />
        <ReviewForm />
      </div>
    </section>
  );
}
