import { Fragment, useEffect, useRef, useState } from "react";
import { useLeaderboard } from "../hooks/useScroll";
import {
  SCORE_WEIGHTS,
  SOLANA_RPC_URL,
  USE_MOCK_DATA,
  VOUCH_PROGRAM_ID,
  explorerAddressUrl,
  shortAddr,
  verifyOnChain,
  type EndpointSummary,
  type EndpointTag,
  type OnChainEndpointState,
} from "../lib/vouchApi";
import { DetailDrawer } from "./DetailDrawer";
import { LiveFeed } from "./LiveFeed";

export function Gauge({ score }: { score: number }) {
  const bad = score < 60;
  return (
    <div className={`gauge ${bad ? "bad" : ""}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(score)} aria-label="Vouch score">
      <div className="bar"><i style={{ width: `${score}%` }} /></div>
      <b>{Math.round(score)}</b>
    </div>
  );
}

export function TagChip({ tag }: { tag: EndpointTag }) {
  const tone = tag === "Verified Good" ? "good" : tag === "Slow" || tag === "Flaky" || tag === "Unrated" ? "warn" : "bad";
  return <span className={`tag ${tone}`}>{tag}</span>;
}

/** Real devnet read, in both modes: getAccountInfo on the endpoint's PDA. */
function Inspector({ row }: { row: EndpointSummary }) {
  const [s, setS] = useState<OnChainEndpointState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    setS(null);
    setErr(null);
    verifyOnChain(row).then(setS).catch((e: Error) => setErr(e.message));
  }, [row.pdaAddress, row.endpointId, n]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err)
    return (
      <div className="inspector">
        <div className="t-red" style={{ gridColumn: "1 / -1" }}>RPC error: {err} <button className="icon-btn" onClick={() => setN(n + 1)}>retry</button></div>
      </div>
    );
  if (!s) return <div className="inspector t-dim">getAccountInfo("{shortAddr(row.pdaAddress, 6)}") → {new URL(SOLANA_RPC_URL).host} …</div>;
  return (
    <div className="inspector">
      <div><span className="k">rpc        </span>{new URL(s.rpcUrl).host} · slot {s.slot?.toLocaleString()}</div>
      <div><span className="k">pda        </span><a href={explorerAddressUrl(s.pdaAddress)} target="_blank" rel="noreferrer">{shortAddr(s.pdaAddress, 6)} ↗</a></div>
      <div><span className="k">seeds      </span>["endpoint", "{s.endpointId}"]</div>
      <div><span className="k">program    </span>{shortAddr(VOUCH_PROGRAM_ID, 6)}</div>
      {s.exists ? (
        <>
          <div><span className="k">owner      </span><span className={s.ownedByVouch ? "t-green" : "t-red"}>{shortAddr(s.owner ?? "", 6)} {s.ownedByVouch ? "✓ Vouch" : "✗ not Vouch"}</span></div>
          <div><span className="k">size       </span>{s.dataLength} bytes · {((s.lamports ?? 0) / 1e9).toFixed(5)} SOL rent</div>
          {s.good !== null && <div><span className="k">good       </span><span className="t-green">{s.good.toLocaleString()}</span></div>}
          {s.bad !== null && <div><span className="k">bad        </span><span className="t-red">{s.bad.toLocaleString()}</span></div>}
          {s.lastRatedAt && <div><span className="k">last_rated </span>{new Date(s.lastRatedAt).toISOString().replace(/\.\d{3}Z$/, "Z")}</div>}
          <div className="src">EndpointRecord read from Solana devnet and decoded in your browser.</div>
        </>
      ) : (
        <div className="src" style={{ color: "var(--amber)" }}>
          Account not initialized on devnet yet: no rating for this endpoint has been written on-chain. It is created by the first submit_rating.
        </div>
      )}
    </div>
  );
}

export function Leaderboard() {
  const { rows, error } = useLeaderboard();
  const [open, setOpen] = useState<string | null>(null);
  const [inspect, setInspect] = useState<string | null>(null);
  const prev = useRef<Record<string, number>>({});
  const [flash, setFlash] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!rows) return;
    const changed: Record<string, number> = {};
    for (const r of rows) {
      const before = prev.current[r.endpointUrl];
      if (before !== undefined && Math.abs(before - r.vouchScore) > 0.001) changed[r.endpointUrl] = Date.now();
      prev.current[r.endpointUrl] = r.vouchScore;
    }
    if (Object.keys(changed).length) setFlash((f) => ({ ...f, ...changed }));
  }, [rows]);

  return (
    <section id="leaderboard" className="live" aria-labelledby="lb-title">
      <div className="eyebrow"><b>Act V</b> Solana leaderboard</div>
      <h2 id="lb-title" className="act-title">Every endpoint, <span className="prism-text">scored in public.</span></h2>
      <p className="act-lede">
        Scores come from verified x402 payments only. Click a row for the 4-source breakdown. Hit Verify On-Chain to read its PDA straight from Solana devnet.
      </p>
      <div className="lb-grid">
        <div className="lb glass">
          <div className="lb-scroll">
            <table>
              <caption className="sr-only">Endpoints ranked by Vouch score</caption>
              <thead>
                <tr>
                  <th>#</th><th>Endpoint</th><th>Vouch score</th><th className="num">Verified x402 calls</th><th className="num">Avg latency</th><th>Solana PDA</th>
                </tr>
              </thead>
              <tbody>
                {error && <tr><td colSpan={6} className="t-red mono">Couldn't reach the Vouch server: {error}</td></tr>}
                {!rows && !error && <tr><td colSpan={6} className="t-dim mono">{USE_MOCK_DATA ? "loading…" : "GET /scores …"}</td></tr>}
                {rows?.map((r, i) => (
                  <Fragment key={r.endpointUrl}>
                    <tr
                      key={`${r.endpointUrl}-${flash[r.endpointUrl] ?? 0}`}
                      className={`row ${r.label === "avoid" ? "avoid" : ""} ${flash[r.endpointUrl] ? "flash" : ""}`}
                      tabIndex={0}
                      onClick={() => setOpen(r.endpointUrl)}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setOpen(r.endpointUrl))}
                      aria-label={`${r.name}, ${r.endpointUrl}, score ${Math.round(r.vouchScore)}. Open details`}
                    >
                      <td className="rank">{String(i + 1).padStart(2, "0")}</td>
                      <td className="ep">
                        <span className="ep-name">{r.name}</span> <TagChip tag={r.tag} />
                        <small>{r.endpointUrl}{r.route !== r.endpointUrl && <> → {r.route}</>} · {r.priceUsdc} USDC</small>
                      </td>
                      <td><Gauge score={r.vouchScore} /></td>
                      <td className="num">{r.verifiedCalls.toLocaleString()}</td>
                      <td className={`num ${r.avgLatencyMs > 2000 ? "lat-bad" : ""}`}>{r.avgLatencyMs ? `${r.avgLatencyMs.toLocaleString()} ms` : "—"}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <span className="pda-wrap">
                          <a className="pda" href={explorerAddressUrl(r.pdaAddress)} target="_blank" rel="noreferrer" title="View PDA on Solana Explorer (devnet)">
                            ◎ {shortAddr(r.pdaAddress)} ↗
                          </a>
                          <button className="icon-btn" aria-expanded={inspect === r.endpointUrl}
                            onClick={() => setInspect((x) => (x === r.endpointUrl ? null : r.endpointUrl))}>
                            {inspect === r.endpointUrl ? "Hide" : "Verify On-Chain"}
                          </button>
                        </span>
                      </td>
                    </tr>
                    {inspect === r.endpointUrl && (
                      <tr className="inspect"><td colSpan={6}><Inspector row={r} /></td></tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mono t-dim" style={{ fontSize: 11, padding: "10px 14px" }}>
            weights: T {SCORE_WEIGHTS.canary} · A {SCORE_WEIGHTS.agentChecks} · H {SCORE_WEIGHTS.humanReviews} · R {SCORE_WEIGHTS.retention}
            {USE_MOCK_DATA ? " · mock scores, real routes, wallets and PDAs" : " · live from the Vouch server (verified payments + on-chain ratings)"}
          </div>
        </div>
        <LiveFeed />
      </div>
      {open && <DetailDrawer endpointUrl={open} onClose={() => setOpen(null)} />}
    </section>
  );
}
