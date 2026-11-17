import { useEffect, useRef, useState, type ReactNode } from "react";
import { seg, useSectionProgress } from "../hooks/useScroll";
import { AGENT_WALLET, VOUCH_PROGRAM_ID, shortAddr } from "../lib/vouchApi";
import { VLogo } from "./VLogo";

const SIG = "4fZqH8m2tC9xRk7vWb3nLp1sDy6eJ5aQ0uGiNo2cXw9wLm";
const X = [110, 370, 630, 890];
const PATH = `M ${X[0]} 80 C 200 20, 280 20, ${X[1]} 80 S 540 140, ${X[2]} 80 S 800 20, ${X[3]} 80`;
const EDGE_LABELS = ["USDC transfer · 0.01", "webhook · X-QN-Signature", "submit_rating ix"];

const NODES: { title: string; sub: string; icon: ReactNode; body: string }[] = [
  {
    title: "Solana devnet",
    sub: "agent pays the endpoint",
    icon: <img src="/assets/solana-coin.jpg" alt="" style={{ objectPosition: "52% 30%" }} />,
    body: `spl-token transfer 10000\nfrom ${shortAddr(AGENT_WALLET)}\nto   GTtY…NXTL (ATA)\nsig  ${shortAddr(SIG, 6)}`,
  },
  {
    title: "QuickNode Stream",
    sub: "detects the transfer",
    icon: <img src="/assets/quicknode.jpg" alt="" style={{ objectPosition: "18% 50%" }} />,
    body: "filter: USDC → endpoint ATAs\nPOST /webhook/quicknode\nhmac(X-QN-Signature) ✓\ndedupe by paymentId ✓",
  },
  {
    title: "Vouch Server",
    sub: "verifies + stamps",
    icon: <span className="ico"><VLogo animated={false} className="" /></span>,
    body: "payment seen by QuickNode ✓\npaid ≥ price, right endpoint ✓\nrater = payer (ed25519) ✓\nfirst use of paymentId ✓\n→ 200 stamped",
  },
  {
    title: "Vouch Program",
    sub: "locks the score on-chain",
    icon: <span className="ico mono" style={{ fontSize: 13, color: "#d8b4fe" }}>◎</span>,
    body: `program ${shortAddr(VOUCH_PROGRAM_ID)}\nPDA ["endpoint", id]\ngood 4096 → 4097\nPaymentUsed PDA: replay ✗`,
  },
];

export function ActPipeline() {
  const ref = useRef<HTMLElement>(null);
  const p = useSectionProgress(ref);
  const pathRef = useRef<SVGPathElement>(null);
  const [len, setLen] = useState(1);
  useEffect(() => setLen(pathRef.current?.getTotalLength() ?? 1), []);

  const t = seg(p, 0.06, 0.88);
  const cur = Math.min(3, Math.floor(t * 3.999));
  const pt = pathRef.current?.getPointAtLength(t * len) ?? { x: X[0], y: 80 };

  return (
    <section ref={ref} className="act" style={{ height: "380vh" }} aria-labelledby="pipe-title">
      <div data-step="4" style={{ position: "absolute", top: 0 }} />
      <div data-step="5" style={{ position: "absolute", top: "40%" }} />
      <div data-step="6" style={{ position: "absolute", top: "72%" }} />
      <div className="stage">
        <div className="stage-head">
          <div className="eyebrow"><b>Act IV</b> Tamper-proof pipeline</div>
          <h2 id="pipe-title" className="act-title">No payment, no rating.<br /><span className="prism-text">No rating that isn't on-chain.</span></h2>
          <p className="act-lede">A rating is only stamped when QuickNode independently sees the USDC transfer, the rater is the wallet that paid, and that payment has never been used before.</p>
        </div>
        <div className="pipe">
          <svg className="flow" viewBox="0 0 1000 160" aria-hidden="true">
            <defs>
              <linearGradient id="pipeG" x1="0" x2="1">
                <stop offset="0" stopColor="#38BDF8" />
                <stop offset="0.6" stopColor="#A855F7" />
                <stop offset="1" stopColor="#EC4899" />
              </linearGradient>
              <filter id="pipeGlow"><feGaussianBlur stdDeviation="4" /></filter>
            </defs>
            <path d={PATH} fill="none" stroke="rgba(160,190,240,0.18)" strokeWidth="2" strokeDasharray="4 6" />
            <path ref={pathRef} d={PATH} fill="none" stroke="url(#pipeG)" strokeWidth="2.5" strokeDasharray={`${t * len} ${len}`} />
            {EDGE_LABELS.map((l, i) => (
              <text key={l} x={(X[i] + X[i + 1]) / 2} y={i === 1 ? 148 : 18} textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="12"
                fill={t * 3 > i ? "#e8eefb" : "#6c7893"}>{l}</text>
            ))}
            {X.map((x, i) => (
              <g key={x}>
                <circle cx={x} cy="80" r="15" fill="#060911" stroke={i <= cur && t > 0 ? "url(#pipeG)" : "rgba(160,190,240,0.3)"} strokeWidth="2" />
                <text x={x} y="85" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="13" fill={i <= cur ? "#e8eefb" : "#6c7893"}>{i + 1}</text>
              </g>
            ))}
            <circle cx={pt.x} cy={pt.y} r="12" fill="#A855F7" filter="url(#pipeGlow)" opacity="0.9" />
            <circle cx={pt.x} cy={pt.y} r="5" fill="#fff" />
          </svg>
          <div className="pipe-nodes">
            {NODES.map((n, i) => (
              <div key={n.title} className={`pnode glass ${i <= cur ? "on" : ""} ${i === cur ? "cur" : ""}`}>
                <div className="ph">
                  {n.icon}
                  <div>
                    <h4>{n.title}</h4>
                    <div className="sub">{n.sub}</div>
                  </div>
                </div>
                <pre>{n.body}</pre>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
