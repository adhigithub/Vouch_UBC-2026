import { useActiveSection } from "../hooks/useScroll";
import { USE_MOCK_DATA } from "../lib/vouchApi";
import { VLogo } from "./VLogo";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "leaderboard", label: "Solana Leaderboard" },
  { id: "sandbox", label: "Agent Sandbox" },
];

export function Nav() {
  const active = useActiveSection(TABS.map((t) => t.id));
  const go = (id: string) => {
    if (id === "overview") window.scrollTo({ top: 0 });
    else document.getElementById(id)?.scrollIntoView();
    history.replaceState(null, "", id === "overview" ? location.pathname : `#${id}`);
  };
  return (
    <header className="nav">
      <a className="brand" href="#overview" onClick={(e) => (e.preventDefault(), go("overview"))}>
        <VLogo animated={false} title="Vouch home" />
        <span>VOUCH</span>
      </a>
      <nav className="tabs" aria-label="Sections">
        {TABS.map((t) => (
          <button key={t.id} className="tab" aria-current={active === t.id} onClick={() => go(t.id)}>
            {t.id === "leaderboard" ? <><span className="hide-sm">Solana </span>Leaderboard</> : t.label}
          </button>
        ))}
      </nav>
      <div className="net-pill" title={USE_MOCK_DATA ? "Mock data: flip USE_MOCK_DATA in src/lib/vouchApi.ts" : "Live: Vouch server + Solana devnet"}>
        <span className={`dot ${USE_MOCK_DATA ? "mock" : ""}`} />
        <span>devnet</span>
        <span className="lbl">· {USE_MOCK_DATA ? "mock data" : "live"}</span>
      </div>
    </header>
  );
}
