import { useRef } from "react";
import { seg, useSectionProgress } from "../hooks/useScroll";
import { VLogo } from "./VLogo";

const REQ = "GET /weather/current?city=Austin  HTTP/1.1";

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const p = useSectionProgress(ref);
  const typed = Math.round(seg(p, 0.05, 0.55) * REQ.length);
  const fade = 1 - seg(p, 0.7, 1);
  return (
    <section id="overview" ref={ref} className="hero" data-step="1" aria-label="Vouch: Trust before the transaction">
      <div className="hero-stage">
        <div className="hero-inner" style={{ opacity: fade, transform: `translateY(${-seg(p, 0.6, 1) * 60}px)` }}>
          <div style={{ transform: `scale(${1 - p * 0.18})` }}>
            <VLogo className="logo-v" title="Vouch prismatic V" />
          </div>
          <h1>Trust before the <span className="prism-text">transaction.</span></h1>
          <p className="sub">The on-chain reputation layer for x402 AI agent payments.</p>
          <div className="hero-req glass" aria-label={REQ}>
            <span className="t-dim">agent ›</span>
            <span aria-hidden="true">
              <span className="verb">{REQ.slice(0, Math.min(3, typed))}</span>
              {REQ.slice(3, typed)}
              <span className="caret" />
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
