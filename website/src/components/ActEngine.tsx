import { useRef, useState } from "react";
import { seg, useLeaderboard, useSectionProgress } from "../hooks/useScroll";
import { SCORE_WEIGHTS, TEST_CAP_MARGIN, type ScoreBreakdown, type ScorePillar } from "../lib/vouchApi";

const PILLARS: { key: ScorePillar; sym: string; title: string; body: string; color: string }[] = [
  { key: "canary", sym: "T", color: "#38BDF8", title: "Synthetic canary bots",
    body: "Vouch's own tester bots buy from every endpoint on a schedule and grade the answer against ground truth. Ratings can never lift a score more than 10 above this." },
  { key: "agentChecks", sym: "A", color: "#7C8CF8", title: "Agent post-flight checks",
    body: "After each paid call the agent runs 4 checks: got something, right schema, makes sense vs. Open-Meteo / CoinGecko, fast enough. Newer ratings outweigh old ones (×0.8 decay)." },
  { key: "humanReviews", sym: "H", color: "#A855F7", title: "Human reviews",
    body: "People who actually paid an endpoint leave a 1-5 star review on the web, signed with the wallet that paid. Every review needs the tx signature of a real x402 payment to that endpoint: no payment, no review." },
  { key: "retention", sym: "R", color: "#EC4899", title: "Repeat wallet retention",
    body: "The share of paying wallets that came back to buy again. Agents don't return to junk. Only counted once 3+ distinct wallets have paid." },
];

const FALLBACK: Record<string, ScoreBreakdown> = {
  "/weather/current": { canary: 97, agentChecks: 98, humanReviews: 92, retention: 94 },
  "/weather-api-3/current": { canary: 12, agentChecks: 8, humanReviews: 30, retention: 10 },
};

function Viz({ k, bad }: { k: ScorePillar; bad: boolean }) {
  if (k === "canary")
    return (
      <div className="viz">
        {["canary-03", "canary-07", "canary-11"].map((c, i) => (
          <div key={c}>
            <span className="t-dim">{c} →</span> {bad ? <span className="t-red">200 · Reykjavik, 187°F, 140% humidity ✗</span> : <span className="t-green">200 · {180 + i * 23}ms · Δ0.{i + 1}°F vs Open-Meteo ✓</span>}
          </div>
        ))}
      </div>
    );
  if (k === "agentChecks")
    return (
      <div className="viz">
        {[["got something", true], ["right format", !bad], ["makes sense", !bad], ["fast enough", true]].map(([l, ok]) => (
          <span key={l as string} className={`check ${ok ? "ok" : "no"}`} style={{ marginRight: 6, display: "inline-block", marginBottom: 6 }}>
            {ok ? "✓" : "✗"} {l}
          </span>
        ))}
      </div>
    );
  if (k === "humanReviews")
    return (
      <div className="grok-card">
        <div className="viz" style={{ marginTop: 0 }}>
          <div><b>CFzG…BC88</b> <span className="t-dim">· wallet-signed review</span></div>
          <div>{bad ? "★☆☆☆☆ /weather-api-3/current \"asked for Austin, got 187°F Reykjavik\"" : "★★★★★ /weather/current \"spot on\""} · tx 4fZq…9wLm</div>
          <div className="t-green">↳ signed by the wallet that paid · verified payment · counted</div>
        </div>
      </div>
    );
  return (
    <div className="wallet-grid" aria-label="Paying wallets; highlighted ones returned">
      {Array.from({ length: 48 }, (_, i) => <i key={i} className={(bad ? i % 9 === 0 : i % 17 !== 3) ? "r" : ""} />)}
    </div>
  );
}

export function ActEngine() {
  const ref = useRef<HTMLElement>(null);
  const p = useSectionProgress(ref);
  const { rows } = useLeaderboard();
  const [ep, setEp] = useState<"/weather/current" | "/weather-api-3/current">("/weather/current");
  const bd = rows?.find((r) => r.endpointUrl === ep)?.scoreBreakdown ?? FALLBACK[ep];
  const bad = ep !== "/weather/current";

  const fills = PILLARS.map((_, i) => seg(p, 0.06 + i * 0.2, 0.06 + (i + 1) * 0.2));
  const cur = Math.min(3, Math.floor(seg(p, 0.06, 0.86) * 4));
  const contrib = PILLARS.map((pl, i) => SCORE_WEIGHTS[pl.key] * (bd[pl.key] ?? 0) * fills[i]);
  const raw = contrib.reduce((a, b) => a + b, 0);
  const total = Math.min(raw, (bd.canary ?? 100) + TEST_CAP_MARGIN);

  const R = 86, C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <section ref={ref} className="act" style={{ height: "420vh" }} data-step="3" aria-labelledby="engine-title">
      <div className="stage">
        <div className="stage-head">
          <div className="eyebrow"><b>Act III</b> The 4-pillar Vouch engine</div>
          <h2 id="engine-title" className="act-title">Ask Vouch before you pay.<br /><span className="prism-text">Four sources, one score.</span></h2>
          <div className="hint-row" role="group" aria-label="Endpoint to score">
            {(["/weather/current", "/weather-api-3/current"] as const).map((u) => (
              <button key={u} className="icon-btn" aria-pressed={ep === u} onClick={() => setEp(u)}
                style={ep === u ? { color: "var(--ink)", borderColor: u === "/weather/current" ? "var(--cyan)" : "var(--crimson)" } : undefined}>
                {u}
              </button>
            ))}
          </div>
        </div>
        <div className="engine">
          <div className="dial-wrap">
            <svg viewBox="0 0 200 200" aria-hidden="true">
              <circle cx="100" cy="100" r={R} fill="none" stroke="rgba(160,190,240,0.1)" strokeWidth="12" />
              {PILLARS.map((pl, i) => {
                const len = (contrib[i] / 100) * C;
                const el = (
                  <circle key={pl.key} cx="100" cy="100" r={R} fill="none" stroke={bad ? (i % 2 ? "#be123c" : "#F43F5E") : pl.color} strokeWidth="12"
                    strokeDasharray={`${Math.max(0, len - 1.5)} ${C}`} strokeDashoffset={-offset} transform="rotate(-90 100 100)"
                    style={{ filter: `drop-shadow(0 0 6px ${bad ? "#F43F5E" : pl.color})` }} />
                );
                offset += len;
                return el;
              })}
              {Array.from({ length: 60 }, (_, i) => (
                <line key={i} x1="100" y1="6" x2="100" y2={i % 5 ? 9 : 12} stroke="rgba(160,190,240,0.25)" transform={`rotate(${i * 6} 100 100)`} />
              ))}
            </svg>
            <div className="dial-center">
              <div>
                <div className={`num ${bad ? "" : "prism-text"}`} style={bad ? { color: "var(--crimson)" } : undefined}>{Math.round(total)}</div>
                <div className="cap">{ep}</div>
                <div className="cap" style={{ color: total >= 60 && p > 0.85 ? "var(--cyan)" : p > 0.85 ? "var(--crimson)" : undefined }}>
                  {p > 0.85 ? (total >= 60 ? "TRUSTED · BUY" : "AVOID · SKIP") : "VOUCH SCORE"}
                </div>
              </div>
            </div>
          </div>
          <div>
            <div className="pillars">
              {PILLARS.map((pl, i) => (
                <div key={pl.key} className={`pillar glass ${fills[i] > 0 ? "on" : ""} ${i === cur ? "cur" : ""}`}>
                  <span className="idx">0{i + 1}</span>
                  <h3>{pl.title}</h3>
                  <span className="w">{pl.sym} · {SCORE_WEIGHTS[pl.key] * 100}% · {bd[pl.key] ?? "n/a"}</span>
                  <div className="body">{pl.body}<Viz k={pl.key} bad={bad} /></div>
                </div>
              ))}
            </div>
            <div className="formula glass">
              Score ={" "}
              {PILLARS.map((pl, i) => (
                <span key={pl.key} className={`t ${fills[i] > 0 ? "on" : ""}`}>
                  {SCORE_WEIGHTS[pl.key]}·{pl.sym}{i < 3 ? " + " : ""}
                </span>
              ))}
              <span className="t-dim">  · capped at T+{TEST_CAP_MARGIN} · &lt;60 = avoid</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
