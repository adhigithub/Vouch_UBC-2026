import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  SCORE_WEIGHTS,
  explorerAddressUrl,
  fetchEndpointDetails,
  shortAddr,
  subscribeLeaderboard,
  type EndpointDetails,
  type ScorePillar,
} from "../lib/vouchApi";
import { TagChip } from "./Leaderboard";

const NAMES: Record<ScorePillar, [string, string]> = {
  canary: ["Synthetic canary bots", "T"],
  agentChecks: ["Agent post-flight checks", "A"],
  humanReviews: ["Human reviews (wallet-signed)", "H"],
  retention: ["Repeat wallet retention", "R"],
};

const ago = (t: number) => {
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;
};

export function DetailDrawer({ endpointUrl, onClose }: { endpointUrl: string; onClose: () => void }) {
  const [d, setD] = useState<EndpointDetails | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const load = () => fetchEndpointDetails(endpointUrl).then(setD).catch((e: Error) => setErr(e.message));
    load();
    return subscribeLeaderboard(load);
  }, [endpointUrl]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", key);
      document.body.style.overflow = "";
      opener?.focus();
    };
  }, [onClose]);

  return createPortal(
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={`${endpointUrl} details`}>
        <div className="drawer-top">
          <div className="eyebrow">Endpoint detail</div>
          <button ref={closeRef} className="icon-btn" onClick={onClose} aria-label="Close details">esc ✕</button>
        </div>
        <h2>{d?.name ?? endpointUrl}</h2>
        {err && <p className="t-red mono">{err}</p>}
        {!d && !err && <p className="t-dim mono">GET /endpoints/… </p>}
        {d && (
          <>
            <div className="mono t-dim" style={{ fontSize: 12 }}><TagChip tag={d.tag} /> {d.endpointUrl} → {d.route} · {d.priceUsdc} USDC/call</div>
            <div className="big-score">
              <span className={`n ${d.label === "avoid" ? "" : "prism-text"}`} style={d.label === "avoid" ? { color: "var(--crimson)" } : undefined}>
                {d.vouchScore.toFixed(1)}
              </span>
              <span className={`label-chip ${d.label}`}>{d.label}</span>
            </div>

            <h3>Score breakdown</h3>
            {(Object.keys(SCORE_WEIGHTS) as ScorePillar[]).map((k) => {
              const v = d.scoreBreakdown[k];
              return (
                <div key={k} className={`bd-row ${v !== null && v < 60 ? "bad" : ""}`}>
                  <span className="nm">{NAMES[k][0]}<small>{NAMES[k][1]} · {SCORE_WEIGHTS[k] * 100}%</small></span>
                  <span className="v">{v === null ? "n/a" : v.toFixed(1)}</span>
                  <span className="bar"><i style={{ width: `${v ?? 0}%` }} /></span>
                </div>
              );
            })}

            <div className="stat-row" style={{ marginTop: 18 }}>
              <div className="stat glass"><div className="n">{d.verifiedCalls.toLocaleString()}</div><div className="l">verified x402 calls</div></div>
              <div className="stat glass sybil"><div className="n">{d.blockedSybilReviews}</div><div className="l">Sybil self-reviews blocked</div></div>
              <div className="stat glass"><div className="n">{d.avgLatencyMs}<small style={{ fontSize: 12 }}>ms</small></div><div className="l">avg latency</div></div>
            </div>

            <h3>Last post-flight checks</h3>
            <div className="checks">
              {([["non-empty", d.lastChecks.nonEmpty], ["schema", d.lastChecks.schema], ["sanity", d.lastChecks.sanity], [`${d.lastChecks.latencyMs}ms`, d.lastChecks.latencyMs < 2000]] as const).map(([l, ok]) => (
                <span key={l} className={`check ${ok ? "ok" : "no"}`}>{ok ? "✓" : "✗"} {l}</span>
              ))}
            </div>
            {d.sampleResponse !== null && (
              <>
                <h3>Sample paid response</h3>
                <pre className="json-block">{d.sampleResponse === "" ? "(empty body, 0 bytes)" : JSON.stringify(d.sampleResponse, null, 2)}</pre>
              </>
            )}

            <h3>Recent verified reviews</h3>
            {d.recentReviews.map((r) => (
              <div key={r.id} className="review">
                <div className="meta">
                  <span className="src">{r.source === "grok" ? "@GrokBot" : r.source}</span>
                  <span>{r.rater}</span>
                  <span>{ago(r.createdAt)}</span>
                  <span className="r" style={{ color: r.rating < 60 ? "var(--crimson)" : "var(--ink)" }}>{r.rating}/100</span>
                </div>
                <div>{r.comment || <span className="t-dim">no comment</span>}</div>
                <div className="meta">tx {shortAddr(r.txSig, 6)} · payment verified</div>
              </div>
            ))}

            <h3>On-chain</h3>
            <div className="mono" style={{ fontSize: 12, lineHeight: 1.8 }}>
              <div><span className="t-dim">pda     </span><a href={explorerAddressUrl(d.pdaAddress)} target="_blank" rel="noreferrer">{d.pdaAddress} ↗</a></div>
              <div><span className="t-dim">pay_to  </span><a href={explorerAddressUrl(d.receivingWallet)} target="_blank" rel="noreferrer">{d.receivingWallet} ↗</a></div>
            </div>
          </>
        )}
      </aside>
    </>,
    document.body,
  );
}
