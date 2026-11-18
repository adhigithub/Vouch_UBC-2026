import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
for (const [w, h, pairs] of [[1440, 900, [[0.65, 0.98], [3.10, 3.42], [9.29, 9.62], [12.39, 12.88], [14.18, 14.67], [15.16, 15.49]]]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto("http://localhost:4510", { waitUntil: "networkidle" }); await p.waitForTimeout(600);
  for (const [a, c] of pairs) {
    const shot = async t => { await p.evaluate(t => scrollTo(0, t * innerHeight), t); await p.waitForTimeout(1500); return p.screenshot(); };
    const A = await shot(a), C = await shot(c);
    const diff = await p.evaluate(async ([A, C]) => {
      const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = "data:image/png;base64," + s; });
      const [ia, ic] = await Promise.all([load(A), load(C)]); const cv = new OffscreenCanvas(ia.width, ia.height), x = cv.getContext("2d");
      x.drawImage(ia, 0, 0); const da = x.getImageData(0, 0, ia.width, ia.height).data; x.drawImage(ic, 0, 0); const dc = x.getImageData(0, 0, ia.width, ia.height).data;
      let n = 0; for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - dc[i]) > 24) n++; return (100 * n / (da.length / 4)).toFixed(1);
    }, [A.toString("base64"), C.toString("base64")]);
    console.log(`${w}x${h}  t ${a} -> ${c}: ${diff}% of pixels changed`);
  }
  await p.close();
}
await b.close();
