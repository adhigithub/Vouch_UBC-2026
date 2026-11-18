import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  fetchLeaderboard,
  subscribeLeaderboard,
  type EndpointSummary,
} from "../lib/vouchApi";

/** One rAF-throttled scroll/resize loop shared by every subscriber. */
const subs = new Set<() => void>();
let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    subs.forEach((f) => f());
  });
}
function subscribe(f: () => void) {
  if (subs.size === 0) {
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
  }
  subs.add(f);
  f();
  return () => {
    subs.delete(f);
    if (subs.size === 0) {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    }
  };
}

/**
 * Progress 0→1 through a tall section with a sticky stage:
 * 0 when the section's top hits the viewport top, 1 when its bottom hits the viewport bottom.
 */
export function useSectionProgress(ref: RefObject<HTMLElement | null>): number {
  const [p, setP] = useState(0);
  useEffect(
    () =>
      subscribe(() => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const span = r.height - window.innerHeight;
        const v = span <= 0 ? (r.top <= 0 ? 1 : 0) : Math.min(1, Math.max(0, -r.top / span));
        setP((prev) => (Math.abs(prev - v) > 0.001 ? v : prev));
      }),
    [ref],
  );
  return p;
}

/** Playhead: position across the 6 x402 steps, from [data-step] markers in the page. */
export function usePlayhead(): { pos: number; step: number } {
  const [state, setState] = useState({ pos: 0, step: 0 });
  useEffect(
    () =>
      subscribe(() => {
        const markers = Array.from(document.querySelectorAll<HTMLElement>("[data-step]"))
          .map((el) => ({ step: Number(el.dataset.step), top: el.getBoundingClientRect().top + window.scrollY }))
          .sort((a, b) => a.step - b.step);
        if (markers.length === 0) return;
        const probe = window.scrollY + window.innerHeight * 0.45;
        const docEnd = document.documentElement.scrollHeight - window.innerHeight * 0.55;
        let i = 0;
        for (let k = 0; k < markers.length; k++) if (markers[k].top <= probe) i = k;
        const start = markers[i].top;
        const end = markers[i + 1]?.top ?? docEnd;
        const frac = probe < start ? 0 : Math.min(1, (probe - start) / Math.max(1, end - start));
        const last = markers.length - 1;
        const pos = i === last ? 1 : Math.min(1, (i + frac) / last);
        const step = markers[i].step;
        setState((prev) => (Math.abs(prev.pos - pos) > 0.0015 || prev.step !== step ? { pos, step } : prev));
      }),
    [],
  );
  return state;
}

/** Which nav section is in view. */
export function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState(ids[0]);
  const key = ids.join("|");
  useEffect(
    () =>
      subscribe(() => {
        let cur = ids[0];
        for (const id of ids) {
          const el = document.getElementById(id);
          if (el && el.getBoundingClientRect().top <= window.innerHeight * 0.35) cur = id;
        }
        setActive(cur);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  return active;
}

export function useReducedMotion(): boolean {
  const [r, setR] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setR(m.matches);
    const f = () => setR(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return r;
}

/** Leaderboard data that stays in sync with sandbox runs, reviews and the live stream. */
export function useLeaderboard() {
  const [rows, setRows] = useState<EndpointSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const load = useCallback(() => {
    fetchLeaderboard()
      .then((r) => alive.current && (setRows(r), setError(null)))
      .catch((e: Error) => alive.current && setError(e.message));
  }, []);
  useEffect(() => {
    alive.current = true;
    load();
    const off = subscribeLeaderboard(load);
    return () => {
      alive.current = false;
      off();
    };
  }, [load]);
  return { rows, error, reload: load };
}

/** Map progress p into a local 0→1 for the window [a, b]. */
export const seg = (p: number, a: number, b: number) => Math.min(1, Math.max(0, (p - a) / (b - a)));
