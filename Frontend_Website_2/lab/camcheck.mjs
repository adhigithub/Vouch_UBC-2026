import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
for (const reduced of [false, true]) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: reduced ? "reduce" : "no-preference" });
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto("http://localhost:4510", { waitUntil: "networkidle" }); await p.waitForTimeout(600);
  // jump 2.4vh forward, trace the smoothed playhead
  const tr = await p.evaluate(() => new Promise(res => { const s = []; scrollTo({ top: 4.0 * innerHeight, behavior: "instant" });
    let n = 0; (function f() { s.push(window.__vouchShatter.shown); if (++n < 90) requestAnimationFrame(f); else res(s); })(); }));
  const mono = tr.every((v, i) => i === 0 || v >= tr[i - 1] - 1e-9), over = Math.max(...tr) <= 4.0 + 1e-6;
  const settle = tr.findIndex(v => Math.abs(v - 4.0) < 0.01);
  // copy transforms under reduced motion
  const copyT = await p.evaluate(() => [...document.querySelectorAll("[data-sc-copy]")].map(e => getComputedStyle(e).transform).filter(t => t !== "none").length);
  // world transform at a mid-flight scroll: reduced should be identical across two nearby positions inside one leg
  const w = async y => { await p.evaluate(y => scrollTo(0, y * innerHeight), y); await p.waitForTimeout(900); return p.evaluate(() => document.querySelector("#world > g:nth-of-type(2)").getAttribute("transform")); };
  const a = await w(4.6), c = await w(5.2);
  console.log(`${reduced ? "REDUCED" : "MOTION "}  monotonic=${mono} noOvershoot=${over} settleFrames=${settle} copyTransforms=${copyT} sameCompositionInLeg=${a === c} errors=${errs.length}`);
  await ctx.close();
}
await b.close();
