import { usePlayhead } from "../hooks/useScroll";

/** The x402 Playhead: one transaction, scrubbed by the scroll position. */
export const STEPS = [
  { code: "GET", name: "Request", line: "GET /weather/current", desc: "Agent asks for data" },
  { code: "402", name: "Payment Required", line: "402 · pay 0.01 USDC", desc: "Server demands payment" },
  { code: "SCORE", name: "Vouch check", line: "score ≥ 60 ? buy : skip", desc: "Trust before transfer" },
  { code: "STREAM", name: "QuickNode sees it", line: "USDC transfer detected", desc: "Real payment on devnet" },
  { code: "STAMP", name: "Receipt stamped", line: "verify payer · stamp", desc: "1 payment = 1 rating" },
  { code: "CHAIN", name: "Locked on Solana", line: "submit_rating → PDA", desc: "Tamper-proof score" },
];

export function PlayheadRail() {
  const { pos, step } = usePlayhead();
  const cur = STEPS[step - 1] ?? STEPS[0];
  const pct = `${(pos * 100).toFixed(2)}%`;
  const horizontal = typeof window !== "undefined" && window.matchMedia("(max-width: 1100px)").matches;
  const place = (v: string) => (horizontal ? { left: v } : { top: v });
  return (
    <aside className="rail" aria-label="x402 transaction playhead">
      <div className="rail-head">x402 · tx playhead</div>
      <div className="rail-track">
        <div className="rail-line" />
        <div className="rail-fill" style={horizontal ? { width: pct } : { height: pct }} />
        {STEPS.map((s, i) => {
          const at = `${(i / (STEPS.length - 1)) * 100}%`;
          const n = i + 1;
          return (
            <button
              key={s.code}
              className={`rail-node ${n < step ? "done" : ""} ${n === step ? "on" : ""}`}
              style={place(at)}
              aria-label={`Step ${n}: ${s.name}`}
              aria-current={n === step ? "step" : undefined}
              onClick={() => document.querySelector(`[data-step="${n}"]`)?.scrollIntoView({ block: "start" })}
            >
              <span className="pip" />
              <span className="lbl"><b>{String(n).padStart(2, "0")} {s.code}</b>{s.name}</span>
            </button>
          );
        })}
        <div className="rail-head-marker" style={place(pct)} />
      </div>
      <div className="rail-readout glass" aria-live="polite">
        <div className="code prism-text">{cur.line}</div>
        <div className="desc">{cur.desc}</div>
      </div>
    </aside>
  );
}
