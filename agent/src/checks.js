// The 4 checks the agent runs on every purchase (VOUCH.md section 6):
//   1. got something   2. right format   3. makes sense   4. fast enough
// Passes all 4 -> "good". Fails any -> "bad" with the first failing reason.
import { SAFETY } from "./config.js";

// ---------- check 2 helper: does the data match the advertised schema? ----------

// Schema values look like "string", "number", or "array<{date:string, high:number}>".
function matchesType(value, type) {
  const arr = /^array<\{(.*)\}>$/.exec(type);
  if (arr) {
    if (!Array.isArray(value) || value.length === 0) return false;
    const fields = Object.fromEntries(arr[1].split(",").map((f) => f.split(":").map((s) => s.trim())));
    return value.every((item) => item && typeof item === "object" && formatProblem(item, fields) === null);
  }
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === type;
}

function formatProblem(data, schema) {
  for (const [field, type] of Object.entries(schema)) {
    if (!(field in data)) return `missing field "${field}"`;
    if (!matchesType(data[field], type)) return `"${field}" should be ${type}`;
  }
  return null;
}

// ---------- check 3 helpers: second sources ----------

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Returns null if the second source is unreachable; the check then relies on range rules only.
async function referenceWeather(city) {
  try {
    const geo = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`);
    const place = geo.results?.[0];
    if (!place) return null;
    const wx = await getJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
        `&current=temperature_2m&daily=temperature_2m_max&forecast_days=1&temperature_unit=fahrenheit&timezone=auto`,
    );
    return { tempF: wx.current.temperature_2m, highF: wx.daily.temperature_2m_max[0] };
  } catch {
    return null;
  }
}

const COINGECKO_IDS = { BTC: "bitcoin", ETH: "ethereum", SOL: "solana", USDC: "usd-coin" };
async function referencePrice(symbol) {
  const id = COINGECKO_IDS[symbol.toUpperCase()];
  if (!id) return null;
  try {
    const j = await getJson(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`);
    return j[id]?.usd ?? null;
  } catch {
    return null;
  }
}

const toF = (t, unit) => (String(unit).toUpperCase() === "C" ? (t * 9) / 5 + 32 : t);
const believableF = (t) => t >= -60 && t <= 135;
const sameText = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

// ---------- check 3: per-task "makes sense" rules ----------

const SANITY = {
  async weather(d, params) {
    if (params.city && !sameText(d.city, params.city)) return `asked for ${params.city}, got ${d.city}`;
    const t = toF(d.temperature, d.unit);
    if (!believableF(t)) return `temperature ${t}°F is impossible`;
    if (d.humidity < 0 || d.humidity > 100) return `humidity ${d.humidity}% is impossible`;
    if (d.windMph < 0 || d.windMph > 250) return `wind ${d.windMph} mph is impossible`;
    const ref = params.city ? await referenceWeather(params.city) : null;
    if (ref && Math.abs(t - ref.tempF) > 10) return `${t}°F is more than 10°F off the second source (${ref.tempF}°F)`;
    return null;
  },

  async "weather-forecast"(d, params) {
    if (params.city && !sameText(d.city, params.city)) return `asked for ${params.city}, got ${d.city}`;
    for (const day of d.days) {
      const hi = toF(day.high, d.unit);
      const lo = toF(day.low, d.unit);
      if (!believableF(hi) || !believableF(lo)) return `${day.date}: impossible temperatures`;
      if (lo > hi) return `${day.date}: low ${lo} is above high ${hi}`;
    }
    const ref = params.city ? await referenceWeather(params.city) : null;
    const hi0 = toF(d.days[0].high, d.unit);
    if (ref && Math.abs(hi0 - ref.highF) > 10) return `today's high ${hi0}°F is more than 10°F off the second source (${ref.highF}°F)`;
    return null;
  },

  async "crypto-price"(d, params) {
    if (params.symbol && !sameText(d.symbol, params.symbol)) return `asked for ${params.symbol}, got ${d.symbol}`;
    if (!(d.priceUsd > 0)) return `price ${d.priceUsd} is impossible`;
    const ref = await referencePrice(d.symbol);
    if (ref && Math.abs(d.priceUsd - ref) / ref > 0.1) return `$${d.priceUsd} is more than 10% off the second source ($${ref})`;
    return null;
  },
};

// ---------- run all 4 ----------

/**
 * @param {{status:number, body:string, ms:number}} result  what came back from the endpoint
 * @param {{task:string, schema:object, params:object}} expected
 * @returns {Promise<{rating:"good"|"bad", reason:string|null, detail:string|null, results:object[]}>}
 */
export async function runChecks(result, { task, schema, params }) {
  const results = [];
  let data = null;

  // 1. Got something
  let problem = null;
  if (result.status >= 400) problem = `HTTP ${result.status}`;
  else if (!result.body.trim()) problem = "empty response";
  else {
    try {
      data = JSON.parse(result.body);
      if (!data || typeof data !== "object" || Object.keys(data).length === 0) problem = "no data in response";
    } catch {
      problem = "response is not JSON";
    }
  }
  results.push({ check: "got something", reason: "empty", problem });

  // 2. Right format (only meaningful if we got something)
  problem = results[0].problem ? "skipped" : formatProblem(data, schema);
  results.push({ check: "right format", reason: "format", problem });

  // 3. Makes sense (only meaningful if the format is right)
  problem = results[1].problem ? "skipped" : await SANITY[task](data, params);
  results.push({ check: "makes sense", reason: "sanity", problem });

  // 4. Fast enough. A paid answer also includes payment settlement, so it gets an allowance.
  const limit = SAFETY.maxResponseMs + (result.paid ? SAFETY.paymentAllowanceMs : 0);
  const limitText = result.paid ? `${SAFETY.maxResponseMs}ms + ${SAFETY.paymentAllowanceMs}ms for payment` : `${SAFETY.maxResponseMs}ms`;
  problem = result.ms > limit ? `took ${result.ms}ms (limit ${limitText})` : null;
  results.push({ check: "fast enough", reason: "slow", problem });

  const firstFail = results.find((r) => r.problem && r.problem !== "skipped");
  return {
    rating: firstFail ? "bad" : "good",
    reason: firstFail ? firstFail.reason : null,
    detail: firstFail ? firstFail.problem : null,
    results,
  };
}
