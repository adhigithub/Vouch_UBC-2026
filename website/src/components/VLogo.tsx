import { useId } from "react";

/**
 * The faceted Prismatic V from public/assets/vouch-logo.png, redrawn as SVG so it
 * sits cleanly on obsidian and can carry a refractive light sweep.
 */
type P = [number, number];
const A: P = [0, 0], B: P = [62, 9], N: P = [105, 87], T: P = [105, 172], M: P = [55, 40], Q: P = [70, 105], E: P = [52, 86];
const mirror = ([x, y]: P): P => [210 - x, y];
const left: [P, P, P, number][] = [
  [A, B, M, 0.34], [B, N, M, 0.16], [A, M, E, 0.22], [M, N, Q, 0.3], [M, Q, E, 0.12], [E, Q, T, 0.26], [Q, N, T, 0.1],
];
const facets = [...left, ...left.map(([a, b, c, o]) => [mirror(a), mirror(b), mirror(c), o * 0.9] as [P, P, P, number])];
const pts = (...p: P[]) => p.map((q) => q.join(",")).join(" ");
const outline = pts(A, B, N, mirror(B), mirror(A), T);

export function VLogo({ className, animated = true, title = "Vouch" }: { className?: string; animated?: boolean; title?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className={className} viewBox="-6 -6 222 186" role="img" aria-label={title}>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#38BDF8" />
          <stop offset="0.6" stopColor="#A855F7" />
          <stop offset="1" stopColor="#EC4899" />
        </linearGradient>
        <linearGradient id={`s${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`c${id}`}><polygon points={outline} /></clipPath>
        <filter id={`f${id}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.4" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g clipPath={`url(#c${id})`}>
        <polygon points={outline} fill={`url(#g${id})`} opacity="0.16" />
        {facets.map(([a, b, c, o], i) => (
          <polygon key={i} className={animated ? "facet" : undefined} style={animated ? { animationDelay: `${(i % 7) * 0.6}s` } : undefined}
            points={pts(a, b, c)} fill={i % 2 ? "#dbeafe" : `url(#g${id})`} opacity={o} stroke="rgba(226,236,255,0.55)" strokeWidth="0.8" strokeLinejoin="round" />
        ))}
        {animated && <rect className="shine" x="-60" y="-20" width="70" height="220" fill={`url(#s${id})`} transform="skewX(-18)" />}
      </g>
      <polygon points={outline} fill="none" stroke={`url(#g${id})`} strokeWidth="2.6" strokeLinejoin="round" filter={`url(#f${id})`} />
    </svg>
  );
}
