import { useEffect, useState } from "react";

// Tiny hash router: "#/flow" is the Live Flow page; anything else is the main page.
export const FLOW_HASH = "#/flow";
export const isFlowHash = () => location.hash.startsWith(FLOW_HASH);

export function useIsFlowPage() {
  const [flow, setFlow] = useState(isFlowHash());
  useEffect(() => {
    const onChange = () => setFlow(isFlowHash());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return flow;
}

/** Go to the Live Flow page, or back to a section of the main page. */
export function navigate(target: "flow" | "overview" | string) {
  if (target === "flow") {
    location.hash = FLOW_HASH;
    window.scrollTo({ top: 0 });
    return;
  }
  const scroll = () => (target === "overview" ? window.scrollTo({ top: 0 }) : document.getElementById(target)?.scrollIntoView());
  if (isFlowHash()) {
    // Leave the flow page first, then scroll once the main page has rendered.
    history.pushState(null, "", target === "overview" ? location.pathname : `#${target}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    setTimeout(scroll, 60);
    return;
  }
  scroll();
  history.replaceState(null, "", target === "overview" ? location.pathname : `#${target}`);
}
