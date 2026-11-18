import { useRef } from "react";
import { seg, useSectionProgress } from "../hooks/useScroll";

export function ActTrap() {
  const ref = useRef<HTMLElement>(null);
  const p = useSectionProgress(ref);
  const at = (t: number) => (p >= t ? "ln" : "ln hidden");
  const resp = p >= 0.5;
  const loss = seg(p, 0.62, 0.72);
  const scale = seg(p, 0.78, 0.92);
  return (
    <section ref={ref} className="act" style={{ height: "300vh" }} data-step="2" aria-labelledby="trap-title">
      <div className="stage">
        <div className="stage-head">
          <div className="eyebrow"><b>Act II</b> The 402 trap</div>
          <h2 id="trap-title" className="act-title">The agent paid. <span style={{ color: "var(--crimson)" }}>The data was junk.</span></h2>
          <p className="act-lede">x402 lets agents pay a cent per call in USDC on Solana. Payments are final, and nothing stops a scammer from taking the cent and serving garbage.</p>
        </div>
        <div className="split">
          <div className="pane glass">
            <div className="pane-bar"><span className="lights"><i /><i /><i /></span> agent.log · solana-devnet</div>
            <div className="term">
              <div className={at(0.04)}><span className="t-dim">→</span> <span className="t-cyan">GET</span> /weather-api-3/current?city=Austin</div>
              <div className={at(0.14)}><span className="t-dim">←</span> <span className="t-amber">402 Payment Required</span></div>
              <div className={at(0.2)}><span className="t-dim">{"   "}{'{ "scheme": "exact", "asset": "USDC",'}</span></div>
              <div className={at(0.2)}><span className="t-dim">{'     "maxAmountRequired": "10000", "payTo": "ALfn…C6D" }'}</span></div>
              <div className={at(0.3)}><span className="t-dim">→</span> <span className="t-violet">X-PAYMENT</span> sign transfer <b>0.01 USDC</b></div>
              <div className={at(0.4)}><span className="t-green">✓</span> tx 4fZq…9wLm confirmed · <span className="t-dim">finality ~400ms</span></div>
              <div className={at(0.48)}><span className="t-dim">←</span> <span className="t-green">200 OK</span> <span className="t-dim">content-type: application/json</span></div>
            </div>
          </div>
          <div className={`pane glass danger ${resp ? "lit" : ""}`}>
            <div className="pane-bar"><span className="lights"><i /><i /><i /></span> response body {resp && <span className="status-chip t-red" style={{ marginLeft: "auto" }}>JUNK</span>}</div>
            <div className="junk-json" style={{ opacity: resp ? 1 : 0.15, transition: "opacity .4s" }}>
              {"{"}<br />&nbsp;&nbsp;<span className="k">"city"</span>: <span className="s">"Reykjavik"</span>,<span className="t-dim">  // asked for Austin</span>
              <br />&nbsp;&nbsp;<span className="k">"temperature"</span>: <span className="s">187</span>, <span className="k">"unit"</span>: "F",
              <br />&nbsp;&nbsp;<span className="k">"humidity"</span>: <span className="s">140</span><br />{"}"}
            </div>
            <div className="loss" style={{ opacity: loss, transform: `translateY(${(1 - loss) * 12}px)` }}>
              <div className="big">−0.01 USDC · final</div>
              <p>No chargeback, no refund, no dispute button. The endpoint keeps the cent and can do it again on the next call.</p>
              <p className="mono" style={{ marginTop: 10, opacity: scale, color: "var(--ink)" }}>
                × 10,000 agent calls / day = <span className="t-red">$100 / day</span> paid for nothing
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
