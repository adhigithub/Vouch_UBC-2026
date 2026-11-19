// Live Flow: one real purchase by the AI agent, shown step by step on a map of
// the whole system, so you can see where every piece of information goes.
// Data comes from agent/runner.js (real agent, real devnet USDC).
import { useEffect, useMemo, useRef, useState } from "react";
import {
  USE_MOCK_DATA,
  explorerTxUrl,
  fetchAgentTasks,
  fetchApiModes,
  fetchTesterStatus,
  resetApiModes,
  resolveEndpoint,
  setApiMode,
  shortAddr,
  streamAgentRun,
  streamTestRound,
  streamResetDemo,
  tryCheat,
  type TesterEvent,
  type TesterStatus,
  type CheatResult,
  type RunnerEvent,
  type RunnerTask,
} from "../lib/vouchApi";

// ─────────────────────────────── The map ───────────────────────────────

type NodeId = "agent" | "vouch" | "shop" | "solana" | "quicknode" | "grok";

const NODES: Record<NodeId, { x: number; y: number; icon: string; name: string; role: string }> = {
  agent: { x: 150, y: 100, icon: "🤖", name: "AI Agent", role: "Has a wallet. Buys data, checks it, rates it." },
  vouch: { x: 500, y: 100, icon: "🧠", name: "Vouch server", role: "Ranks APIs. Only accepts ratings tied to real payments." },
  grok: { x: 850, y: 100, icon: "✨", name: "Grok on X", role: "Reads Vouch's /grok feed and warns users about changes." },
  shop: { x: 150, y: 420, icon: "🏪", name: "API shop", role: "Sells data for $0.01 (x402). Honest or a scam." },
  solana: { x: 500, y: 420, icon: "◎", name: "Solana devnet", role: "Records the payment and the rating, permanently." },
  quicknode: { x: 850, y: 420, icon: "📡", name: "QuickNode Stream", role: "Watches Solana and reports our payments to Vouch." },
};

type EdgeId = "ask" | "rank" | "request" | "invoice" | "pay" | "data" | "block" | "confirm" | "rate" | "stamp" | "feed";

const EDGES: Record<EdgeId, { from: NodeId; to: NodeId; label: string; n: number }> = {
  ask: { from: "agent", to: "vouch", label: "Which API is best?", n: 1 },
  rank: { from: "vouch", to: "agent", label: "Ranked list + scores", n: 2 },
  request: { from: "agent", to: "shop", label: "Request data", n: 3 },
  invoice: { from: "shop", to: "agent", label: "402: pay $0.01 first", n: 4 },
  pay: { from: "agent", to: "solana", label: "Pay USDC (x402)", n: 5 },
  data: { from: "shop", to: "agent", label: "The data", n: 6 },
  block: { from: "solana", to: "quicknode", label: "New block", n: 7 },
  confirm: { from: "quicknode", to: "vouch", label: "Payment is real (signed)", n: 8 },
  rate: { from: "agent", to: "vouch", label: "Signed rating", n: 9 },
  stamp: { from: "vouch", to: "solana", label: "Rating saved forever", n: 10 },
  feed: { from: "vouch", to: "grok", label: "/grok feed updated", n: 11 },
};

/** One line per pair of boxes; its label card lists every message sent along it. */
const PAIRS: { a: NodeId; b: NodeId; edges: EdgeId[]; at: [number, number] }[] = [
  { a: "agent", b: "vouch", edges: ["ask", "rank", "rate"], at: [325, 100] },
  { a: "vouch", b: "grok", edges: ["feed"], at: [675, 100] },
  { a: "agent", b: "shop", edges: ["request", "invoice", "data"], at: [150, 262] },
  { a: "agent", b: "solana", edges: ["pay"], at: [335, 290] },
  { a: "vouch", b: "solana", edges: ["stamp"], at: [500, 235] },
  { a: "quicknode", b: "vouch", edges: ["confirm"], at: [672, 262] },
  { a: "solana", b: "quicknode", edges: ["block"], at: [675, 420] },
];

/** Arrow glyph pointing the way a message travels on screen. */
function arrowFor(id: EdgeId) {
  const f = NODES[EDGES[id].from], t = NODES[EDGES[id].to];
  const ang = Math.atan2(t.y - f.y, t.x - f.x) * (180 / Math.PI);
  const glyphs = ["→", "↘", "↓", "↙", "←", "↖", "↑", "↗"];
  return glyphs[(Math.round(ang / 45) + 8) % 8];
}

type Tone = "ok" | "fail" | "wait" | "info";

/** What each agent step lights up on the map. */
function stageFor(e: RunnerEvent): { edges: EdgeId[]; nodes: NodeId[]; tone: Tone } {
  switch (e.type) {
    case "start": return { edges: [], nodes: ["agent"], tone: "info" };
    case "candidates": return { edges: ["ask", "rank"], nodes: ["agent", "vouch"], tone: "info" };
    case "skip": return { edges: ["rank"], nodes: ["agent"], tone: "fail" };
    case "buy": return { edges: ["request", "invoice"], nodes: ["agent", "shop"], tone: "info" };
    case "paid": return { edges: ["pay", "data"], nodes: ["agent", "solana", "shop"], tone: "ok" };
    case "not_charged": return { edges: ["request"], nodes: ["shop"], tone: "fail" };
    case "checks": return { edges: [], nodes: ["agent"], tone: e.rating === "good" ? "ok" : "fail" };
    case "verifying": return { edges: ["block", "confirm"], nodes: ["solana", "quicknode", "vouch"], tone: "wait" };
    case "verified": return { edges: ["confirm"], nodes: ["quicknode", "vouch"], tone: "ok" };
    case "rated": return { edges: ["rate", "stamp", "feed"], nodes: ["agent", "vouch", "solana", "grok"], tone: e.rating === "good" ? "ok" : "fail" };
    case "rate_failed": return { edges: ["rate"], nodes: ["vouch"], tone: "fail" };
    case "done": return { edges: [], nodes: ["agent"], tone: "ok" };
    case "failed": return { edges: [], nodes: ["agent"], tone: "fail" };
  }
}

const nice = (id?: string) => (id ? (resolveEndpoint(id)?.displayName ? `${resolveEndpoint(id)!.displayName} (${id})` : id) : "");
const money = (n: unknown) => `$${Number(n ?? 0).toFixed(2)}`;
const REASON: Record<string, string> = { empty: "it sent nothing", format: "the data was in the wrong format", sanity: "the data didn't match reality", slow: "it was too slow" };

/** Plain-English explanation of a step, plus the technical detail and any proof link. */
function explain(e: RunnerEvent): { title: string; detail: string; link?: { href: string; text: string } } {
  switch (e.type) {
    case "start":
      return { title: `The agent gets a task: ${e.task} ${Object.values(e.params ?? {}).join(" ")}`, detail: `Wallet ${shortAddr(e.wallet, 6)} · ${e.payments ? "pays real USDC on Solana devnet" : "free mode"}` };
    case "candidates":
      return {
        title: "It asks Vouch which API to trust, and gets a ranked list",
        detail: (e.list ?? []).map((c: any) => `${c.endpointId}: ${c.score ?? "-"} ${c.label} · ${money(c.price)}`).join("\n") || "no APIs for this task",
      };
    case "skip":
      return { title: `It refuses ${nice(e.endpointId)} without paying`, detail: `Reason: ${e.reason}` };
    case "buy":
      return { title: `It picks ${nice(e.endpointId)} and asks for the data`, detail: `Score ${e.score ?? "-"} (${e.label}) · the API answers "402 Payment Required: ${money(e.price)}"` };
    case "paid":
      return { title: "It pays with USDC on Solana, and the data comes back", detail: `x402 payment settled in ${e.ms} ms · spent ${money(e.spent)} so far`, link: { href: e.explorer, text: "View payment on Solana ↗" } };
    case "not_charged":
      return { title: `Couldn't buy from ${nice(e.endpointId)}`, detail: `HTTP ${e.status}${e.error ? ` · ${e.error}` : ""}` };
    case "checks": {
      const lines = (e.results ?? []).map((r: any) => `${r.skipped ? "·" : r.ok ? "✓" : "✗"} ${r.check}${r.problem ? `: ${r.problem}` : ""}`);
      return {
        title: e.rating === "good" ? "It checks the data: all 4 checks pass → GOOD" : `It checks the data: ${REASON[e.reason] ?? "a check failed"} → BAD`,
        detail: lines.join("\n"),
      };
    }
    case "verifying":
      return { title: "Vouch waits for QuickNode to confirm the payment is real", detail: "QuickNode watches each new Solana block; the agent's word alone isn't enough" };
    case "verified":
      return { title: `Payment confirmed${e.source === "quicknode" ? " by the QuickNode Stream" : ""}`, detail: `Payment ${shortAddr(e.paymentId, 8)} is now verified, so it can be rated (once)` };
    case "rated":
      return {
        title: `Rating accepted: ${String(e.rating).toUpperCase()} → ${nice(e.endpointId)} is now ${e.score} (${e.label})`,
        detail: "Signed by the wallet that paid · written to the Vouch Solana program · Grok's next check will see it",
        link: e.explorer ? { href: e.explorer, text: "View rating on Solana ↗" } : undefined,
      };
    case "rate_failed":
      return {
        title: "Rating not accepted",
        detail: e.error === "payment_not_verified" ? "QuickNode didn't confirm the payment in time. Is the Stream running?" : String(e.error),
      };
    case "done":
      return { title: `Done. Spent ${money(e.spent)}, got trusted data`, detail: JSON.stringify(e.result) };
    case "failed":
      return { title: "Stopped without buying good data", detail: `${e.reason}${e.spent != null ? ` · spent ${money(e.spent)}` : ""}` };
  }
}

// ───────────────────────────── The diagram ─────────────────────────────

function Diagram({ active, visited, tone }: { active: Set<EdgeId>; visited: Set<EdgeId>; tone: Tone }) {
  const activeNodes = useMemo(() => {
    const s = new Set<NodeId>();
    active.forEach((id) => (s.add(EDGES[id].from), s.add(EDGES[id].to)));
    return s;
  }, [active]);
  const W = 1000, H = 520, pad = { x: 108, y: 48 };

  // Start/end a line at the edge of each box, not its center.
  const trim = (from: NodeId, to: NodeId) => {
    const a = NODES[from], b = NODES[to];
    const dx = b.x - a.x, dy = b.y - a.y;
    const k = (p: typeof a, sign: number) => {
      const sx = dx ? pad.x / Math.abs(dx) : Infinity, sy = dy ? pad.y / Math.abs(dy) : Infinity;
      const s = Math.min(sx, sy);
      return { x: p.x + sign * dx * s, y: p.y + sign * dy * s };
    };
    return [k(a, 1), k(b, -1)];
  };

  return (
    <div className="fl-map" role="img" aria-label="Map of the Vouch system: agent, Vouch server, Grok, API shop, Solana and QuickNode">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {PAIRS.map((p) => {
          const [s1, s2] = trim(p.a, p.b);
          const on = p.edges.filter((id) => active.has(id));
          const state = on.length ? tone : p.edges.some((id) => visited.has(id)) ? "visited" : "idle";
          return (
            <g key={`${p.a}-${p.b}`} className={`fl-edge ${state} ${on.length ? "active" : ""}`}>
              <line x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y} vectorEffect="non-scaling-stroke" />
              {on.map((id) => {
                const [f, t] = trim(EDGES[id].from, EDGES[id].to);
                return (
                  <circle key={id} r="7" className="fl-packet">
                    <animateMotion dur="1.2s" repeatCount="indefinite" path={`M${f.x},${f.y} L${t.x},${t.y}`} />
                  </circle>
                );
              })}
            </g>
          );
        })}
      </svg>

      {PAIRS.map((p) => (
        <ul key={`l-${p.a}-${p.b}`} className="fl-label" style={{ left: `${(p.at[0] / W) * 100}%`, top: `${(p.at[1] / H) * 100}%` }}>
          {p.edges.map((id) => (
            <li key={id} className={`${active.has(id) ? `on ${tone}` : visited.has(id) ? "seen" : ""}`}>
              <span className="fl-n">{EDGES[id].n}</span>
              <span className="fl-dir">{arrowFor(id)}</span>
              {EDGES[id].label}
            </li>
          ))}
        </ul>
      ))}

      {(Object.entries(NODES) as [NodeId, (typeof NODES)[NodeId]][]).map(([id, n]) => (
        <div key={id} className={`fl-node glass ${activeNodes.has(id) ? `on ${tone}` : ""}`} style={{ left: `${(n.x / W) * 100}%`, top: `${(n.y / H) * 100}%` }}>
          <div className="fl-node-head"><span className="fl-icon">{n.icon}</span>{n.name}</div>
          <div className="fl-role">{n.role}</div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────── The page ───────────────────────────────

const MODES = [
  { mode: "good", label: "Honest" },
  { mode: "sanity", label: "Wrong data" },
  { mode: "format", label: "Broken format" },
  { mode: "empty", label: "Sends nothing" },
  { mode: "slow", label: "Too slow" },
];
const CHEATS = [
  { kind: "fake_payment", label: "Rate with a fake payment" },
  { kind: "rate_twice", label: "Rate the same payment twice" },
  { kind: "steal_payment", label: "Use someone else's payment" },
  { kind: "forged_signature", label: "Pretend to be the agent" },
];

export function FlowPage() {
  const [tasks, setTasks] = useState<RunnerTask[]>([]);
  const [taskId, setTaskId] = useState("");
  const [events, setEvents] = useState<RunnerEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modes, setModes] = useState<Record<string, string>>({});
  const [scamTarget, setScamTarget] = useState("weather-api-1/forecast");
  const [modeMsg, setModeMsg] = useState<string | null>(null);
  const [cheats, setCheats] = useState<CheatResult[]>([]);
  const [tests, setTests] = useState<TesterEvent[]>([]);
  const [testing, setTesting] = useState(false);
  const [tester, setTester] = useState<TesterStatus | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [, tick] = useState(0);

  // The tester bot runs on its own in the background; show when, and what it found.
  useEffect(() => {
    if (USE_MOCK_DATA) return;
    const load = () => fetchTesterStatus().then(setTester).catch(() => {});
    load();
    const poll = setInterval(load, 5000);
    const clock = setInterval(() => tick((n) => n + 1), 1000);
    return () => (clearInterval(poll), clearInterval(clock));
  }, []);
  const nextIn = tester?.nextRoundAt ? Math.max(0, Math.round((Date.parse(tester.nextRoundAt) - Date.now()) / 1000)) : null;
  const shownTests: TesterEvent[] = tests.length
    ? tests
    : (tester?.lastResults ?? []).map((r) => ({ type: "test", at: tester?.lastRoundAt ?? "", ...r }) as TesterEvent);
  const logEnd = useRef<HTMLDivElement>(null);

  const loadModes = () => fetchApiModes().then(setModes).catch(() => {});
  useEffect(() => {
    if (USE_MOCK_DATA) return;
    fetchAgentTasks().then((t) => (setTasks(t), setTaskId((id) => id || t[0]?.id || ""))).catch((e: Error) => setError(e.message));
    loadModes();
  }, []);
  useEffect(() => {
    // Scroll only inside the step list, never the whole page.
    const box = logEnd.current?.parentElement;
    if (events.length && box) box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
  }, [events.length]);

  const last = events[events.length - 1];
  const stage = last ? stageFor(last) : { edges: [] as EdgeId[], nodes: [] as NodeId[], tone: "info" as Tone };
  const visited = useMemo(() => new Set(events.flatMap((e) => stageFor(e).edges)), [events]);
  const spent = [...events].reverse().find((e) => typeof e.spent === "number")?.spent ?? 0;

  async function run() {
    const t = tasks.find((x) => x.id === taskId);
    if (!t || running) return;
    setEvents([]);
    setError(null);
    setRunning(true);
    try {
      for await (const ev of streamAgentRun(t.task, t.params)) {
        setEvents((xs) => [...xs, ev]);
        // The scam box follows the API the agent just bought from, so "make it a scam" hits that one.
        if (ev.type === "buy" && ev.endpointId) setScamTarget(ev.endpointId);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
      loadModes();
    }
  }

  async function applyMode(mode: string) {
    try {
      await setApiMode(scamTarget, mode);
      await loadModes();
      const label = MODES.find((m) => m.mode === mode)?.label.toLowerCase() ?? mode;
      setModeMsg(`✓ ${scamTarget} is now: ${label}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function runTester() {
    if (testing) return;
    setTests([]);
    setError(null);
    setTesting(true);
    try {
      for await (const ev of streamTestRound()) setTests((xs) => [...xs, ev]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTesting(false);
    }
  }

  // One click before each demo take: every take then starts from the same state.
  async function resetDemo() {
    if (running || testing || resetting) return;
    if (!window.confirm("Reset the demo?\n\nAll APIs go back to normal, and every rating, payment and score is cleared (the server backs up the database first). Then the tester bot checks every API once (about $0.10 of test USDC).")) return;
    setResetting(true);
    setError(null);
    setEvents([]);
    setCheats([]);
    setTests([]);
    setModeMsg(null);
    setResetMsg("Resetting: putting every API back to normal…");
    try {
      for await (const ev of streamResetDemo()) {
        if (ev.type === "reset_modes") setResetMsg("✓ APIs back to normal · clearing scores…");
        else if (ev.type === "reset_scores") setResetMsg("✓ APIs back to normal · ✓ scores cleared (backed up) · tester bot checking every API…");
        else if (ev.type === "reset_done") setResetMsg("✓ Demo reset: scams are flagged, honest APIs are trusted. Ready to run.");
        else if (ev.type === "reset_failed") setResetMsg(null), setError(`Reset failed: ${ev.reason}`);
        else setTests((xs) => [...xs, ev]);
      }
    } catch (e) {
      setError((e as Error).message);
      setResetMsg(null);
    } finally {
      setResetting(false);
      loadModes();
    }
  }

  async function cheat(kind: string) {
    try {
      const r = await tryCheat(kind);
      setCheats((xs) => [r, ...xs.filter((x) => x.kind !== kind)]);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const now = last ? explain(last) : null;

  return (
    <section className="flow-page" aria-labelledby="flow-title">
      <div className="eyebrow"><b>Live Flow</b> one real purchase, end to end</div>
      <h1 id="flow-title" className="act-title">Watch where the <span className="prism-text">information goes.</span></h1>
      <p className="act-lede">
        Press Run and a real AI agent buys data with real (devnet) USDC. Each arrow lights up as that message is actually sent:
        the payment on Solana, QuickNode confirming it, the signed rating, and the permanent record Grok reads.
      </p>

      {USE_MOCK_DATA && <div className="fl-note">This page needs live mode (the agent runner). Start the site without VITE_USE_MOCK.</div>}

      <div className="fl-controls glass">
        <label className="mono">
          Task{" "}
          <select value={taskId} onChange={(e) => setTaskId(e.target.value)} disabled={running}>
            {tasks.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        <button className="fl-run" onClick={run} disabled={running || resetting || !taskId}>{running ? "Running…" : "▶ Run agent"}</button>
        <button className="fl-chip" onClick={resetDemo} disabled={running || testing || resetting} title="Start a fresh demo take">
          {resetting ? "Resetting…" : "↺ Reset demo"}
        </button>
        <span className="mono t-dim">spent <b className="t-ink">{money(spent)}</b> of $0.25 budget</span>
        <span className={`fl-status ${running ? "wait" : last?.type === "done" ? "ok" : last?.type === "failed" ? "fail" : ""}`}>
          {running ? "live" : last ? (last.type === "done" ? "finished" : last.type === "failed" ? "stopped" : "idle") : "ready"}
        </span>
      </div>

      {error && <div className="fl-note bad">{error}</div>}
      {resetMsg && <div className="fl-note ok">{resetMsg}</div>}

      <div className={`fl-now ${stage.tone}`} aria-live="polite">
        <span className="fl-now-tag">{now ? "Now" : "How it works"}</span>
        <span>{now ? now.title : "Pick a task and press Run. The numbers show the order messages travel in; arrows show which way."}</span>
      </div>

      <Diagram active={new Set(stage.edges)} visited={visited} tone={stage.tone} />

      <div className="fl-grid">
        <div className="glass fl-panel">
          <div className="pane-bar">Step by step</div>
          <ol className="fl-log">
            {events.length === 0 && <li className="t-dim">No run yet.</li>}
            {events.map((ev, i) => {
              const x = explain(ev);
              const t = stageFor(ev).tone;
              if (ev.type === "verifying" && ev.attempt > 0) return null;
              return (
                <li key={i} className={`fl-step ${t}`}>
                  <div className="fl-step-title">{x.title}</div>
                  <pre className="fl-step-detail">{x.detail}</pre>
                  {x.link && <a href={x.link.href} target="_blank" rel="noreferrer">{x.link.text}</a>}
                  <time className="t-dim">{new Date(ev.at).toLocaleTimeString()}</time>
                </li>
              );
            })}
            <div ref={logEnd} />
          </ol>
        </div>

        <div className="fl-side">
          <div className="glass fl-panel">
            <div className="pane-bar">Data in flight (latest step)</div>
            <pre className="fl-raw">{last ? JSON.stringify(last, null, 2) : "—"}</pre>
          </div>

          <div className="glass fl-panel">
            <div className="pane-bar">Make an API a scam</div>
            <div className="fl-box">
              <select value={scamTarget} onChange={(e) => setScamTarget(e.target.value)}>
                {Object.keys(modes).map((id) => <option key={id} value={id}>{id} · now {modes[id]}</option>)}
              </select>
              <div className="fl-btns">
                {MODES.map((m) => (
                  <button key={m.mode} className={`fl-chip ${m.mode === "good" ? "ok" : "fail"} ${modes[scamTarget] === m.mode ? "sel" : ""}`} onClick={() => applyMode(m.mode)}>
                    {m.label}
                  </button>
                ))}
                <button className="fl-chip" onClick={() => resetApiModes().then(loadModes).then(() => setModeMsg("✓ every API back to its normal mode"))}>Reset all</button>
              </div>
              {modeMsg && <div className="fl-small t-green mono">{modeMsg}</div>}
              <p className="t-dim fl-small">Then run the agent: it catches the bad data, rates it BAD, and the score drops on the leaderboard.</p>
            </div>
          </div>

          <div className="glass fl-panel">
            <div className="pane-bar">Vouch's tester bot (inspector)</div>
            <div className="fl-box">
              <p className="t-dim fl-small">
                Vouch's own wallet buys once from every API and runs the same 4 checks. Passing raises its test score (T), failing lowers it.
                Scams get caught before customers pay them, and fixed APIs earn their way back.
              </p>
              {tester?.enabled && (
                <div className="fl-small mono">
                  {tester.running || testing ? (
                    <span className="t-amber">● testing every API now…</span>
                  ) : (
                    <span className="t-green">● runs on its own every {tester.intervalSec >= 60 ? `${Math.round(tester.intervalSec / 60)} min` : `${tester.intervalSec}s`}
                      {nextIn !== null && <span className="t-dim"> · next round in {nextIn}s</span>}</span>
                  )}
                  {tester.lastRoundAt && <span className="t-dim"> · last round {new Date(tester.lastRoundAt).toLocaleTimeString()}</span>}
                </div>
              )}
              <div className="fl-btns">
                <button className="fl-chip" onClick={runTester} disabled={testing}>
                  {!testing ? "🔍 Run tester bot now" : tests.some((t) => t.type === "test_start") ? "Testing every API…" : "⏳ Queued: starts when the current round ends"}
                </button>
              </div>
              {shownTests.length > 0 && (
                <ul className="fl-tests">
                  {shownTests.map((t, i) =>
                    t.type === "test" ? (
                      <li key={i} className={t.passed ? "ok" : "fail"}>
                        <b>{t.passed ? "✓" : "✗"}</b> {t.endpointId}
                        <span className="t-dim"> {t.passed ? "passed" : `failed (${t.reason})`} · T {t.from} → {t.to}</span>
                      </li>
                    ) : t.type === "test_skipped" ? (
                      <li key={i} className="t-dim">? {t.endpointId} couldn't be tested</li>
                    ) : t.type === "test_done" ? (
                      <li key={i} className="t-dim">Done: {t.tested} tested, {t.failed} failed. Check the leaderboard.</li>
                    ) : t.type === "test_failed" ? (
                      <li key={i} className="t-red">Round failed: {t.reason}</li>
                    ) : null,
                  )}
                </ul>
              )}
            </div>
          </div>

          <div className="glass fl-panel">
            <div className="pane-bar">Try to cheat Vouch</div>
            <div className="fl-box">
              <div className="fl-btns">
                {CHEATS.map((c) => <button key={c.kind} className="fl-chip" onClick={() => cheat(c.kind)}>{c.label}</button>)}
              </div>
              {cheats.map((c) => (
                <div key={c.kind} className={`fl-cheat ${c.blocked ? "fail" : "ok"}`}>
                  <b>{c.blocked ? "BLOCKED" : "ALLOWED?!"}</b> {c.title}
                  <div className="t-dim fl-small">{c.attempt}</div>
                  <div className="fl-small">HTTP {c.status} {c.error}: {c.explanation}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <p className="t-dim fl-small" style={{ marginTop: 24 }}>
        Proof links open the real transactions on Solana Explorer (devnet).{" "}
        {last?.paymentId && <a href={explorerTxUrl(last.paymentId)} target="_blank" rel="noreferrer">Latest payment ↗</a>}
      </p>
    </section>
  );
}
