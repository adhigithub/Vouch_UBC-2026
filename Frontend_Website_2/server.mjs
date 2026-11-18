// Local server for the build: static files, plus /vouch/* proxied to the Vouch
// server (the same path the main website's Vite proxy uses), so the browser
// never calls the backend directly and no CORS setup is needed.
//
//   node server.mjs                      http://localhost:4510
//   VOUCH_URL=http://host:4000 PORT=4510 node server.mjs
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT || 4510);
const VOUCH = new URL(process.env.VOUCH_URL || "http://localhost:4000");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".md": "text/plain; charset=utf-8" };

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname.startsWith("/vouch/")) {
    const up = http.request({ host: VOUCH.hostname, port: VOUCH.port || 80, method: req.method,
      path: url.pathname.slice("/vouch".length) + url.search, headers: { ...req.headers, host: VOUCH.host }, timeout: 4000 },
      (r) => { res.writeHead(r.statusCode || 502, r.headers); r.pipe(res); });
    up.on("timeout", () => up.destroy(new Error("timeout")));
    up.on("error", () => { if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" }); res.end('{"error":"vouch_server_unreachable"}'); });
    req.pipe(up);
    return;
  }
  let p = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
  if (p.includes("..")) { res.writeHead(400); return res.end(); }
  let file = join(ROOT, p || "index.html");
  try { if ((await stat(file)).isDirectory()) file = join(file, "index.html"); } catch { res.writeHead(404); return res.end("not found"); }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch { res.writeHead(404); res.end("not found"); }
}).listen(PORT, "127.0.0.1", () => console.log(`Vouch Shatter on http://localhost:${PORT}  (proxy /vouch -> ${VOUCH.origin})`));
