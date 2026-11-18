import { ActEngine } from "./components/ActEngine";
import { ActPipeline } from "./components/ActPipeline";
import { ActTrap } from "./components/ActTrap";
import { Close } from "./components/Close";
import { Hero } from "./components/Hero";
import { Leaderboard } from "./components/Leaderboard";
import { Nav } from "./components/Nav";
import { PlayheadRail } from "./components/PlayheadRail";
import { Sandbox } from "./components/Sandbox";
import { FlowPage } from "./components/FlowPage";
import { useIsFlowPage } from "./hooks/useRoute";

export default function App() {
  const flow = useIsFlowPage();
  if (flow)
    return (
      <>
        <div className="ambient" aria-hidden="true" />
        <Nav />
        <main className="flow-main">
          <FlowPage />
        </main>
      </>
    );
  return (
    <>
      <div className="ambient" aria-hidden="true" />
      <Nav />
      <PlayheadRail />
      <main>
        <Hero />
        <ActTrap />
        <ActEngine />
        <ActPipeline />
        <Leaderboard />
        <Sandbox />
        <Close />
      </main>
    </>
  );
}
