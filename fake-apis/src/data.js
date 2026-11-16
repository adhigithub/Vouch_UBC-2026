// Real-ish data sources for the "good" endpoints.
//
// Good endpoints proxy free public APIs (Open-Meteo for weather, CoinGecko for
// prices) so the agent's "makes sense" check can compare against a second
// source and actually agree. If the upstream is down or rate-limited, we fall
// back to deterministic simulated values so the demo never breaks.

const CITIES = {
  austin: { name: "Austin", lat: 30.2672, lon: -97.7431, baseF: 75 },
  vancouver: { name: "Vancouver", lat: 49.2827, lon: -123.1207, baseF: 50 },
  "new york": { name: "New York", lat: 40.7128, lon: -74.006, baseF: 55 },
  "san francisco": { name: "San Francisco", lat: 37.7749, lon: -122.4194, baseF: 60 },
  chicago: { name: "Chicago", lat: 41.8781, lon: -87.6298, baseF: 50 },
  seattle: { name: "Seattle", lat: 47.6062, lon: -122.3321, baseF: 52 },
  miami: { name: "Miami", lat: 25.7617, lon: -80.1918, baseF: 80 },
  london: { name: "London", lat: 51.5074, lon: -0.1278, baseF: 52 },
  tokyo: { name: "Tokyo", lat: 35.6762, lon: 139.6503, baseF: 62 },
  toronto: { name: "Toronto", lat: 43.6532, lon: -79.3832, baseF: 46 },
};

const ASSETS = {
  BTC: { coingeckoId: "bitcoin", fallbackUsd: 95000 },
  ETH: { coingeckoId: "ethereum", fallbackUsd: 3200 },
  SOL: { coingeckoId: "solana", fallbackUsd: 180 },
  USDC: { coingeckoId: "usd-coin", fallbackUsd: 1 },
};

export const SUPPORTED_CITIES = Object.values(CITIES).map((c) => c.name);
export const SUPPORTED_SYMBOLS = Object.keys(ASSETS);

export class BadRequest extends Error {}

export function lookupCity(raw) {
  const city = CITIES[String(raw || "").trim().toLowerCase()];
  if (!city) {
    throw new BadRequest(`Unknown city "${raw}". Supported: ${SUPPORTED_CITIES.join(", ")}`);
  }
  return city;
}

export function lookupSymbol(raw) {
  const symbol = String(raw || "").trim().toUpperCase();
  if (!ASSETS[symbol]) {
    throw new BadRequest(`Unknown symbol "${raw}". Supported: ${SUPPORTED_SYMBOLS.join(", ")}`);
  }
  return symbol;
}

/** Any city other than the one asked for (used by the "wrong city" junk mode). */
export function otherCity(city) {
  const others = Object.values(CITIES).filter((c) => c.name !== city.name);
  return others[Math.floor(Math.random() * others.length)];
}

// ---------- tiny TTL cache + fetch with timeout ----------

const cache = new Map();

async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

async function getJson(url, timeoutMs = 2000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

// Deterministic pseudo-random in [0,1) from a string, so fallbacks are stable.
function hash01(str) {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

const round1 = (n) => Math.round(n * 10) / 10;

// WMO weather codes -> words (subset; https://open-meteo.com/en/docs)
function conditionFromCode(code) {
  if (code === 0) return "clear";
  if (code <= 3) return "partly cloudy";
  if (code <= 48) return "fog";
  if (code <= 67) return "rain";
  if (code <= 77) return "snow";
  if (code <= 82) return "showers";
  return "thunderstorm";
}
const CONDITIONS = ["clear", "partly cloudy", "cloudy", "rain", "showers"];

// ---------- weather ----------

export async function currentWeather(city) {
  return cached(`wx:${city.name}`, 5 * 60_000, async () => {
    try {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}` +
        `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code` +
        `&temperature_unit=fahrenheit&wind_speed_unit=mph`;
      const j = await getJson(url);
      return {
        city: city.name,
        temperature: round1(j.current.temperature_2m),
        unit: "F",
        humidity: Math.round(j.current.relative_humidity_2m),
        windMph: round1(j.current.wind_speed_10m),
        condition: conditionFromCode(j.current.weather_code),
        observedAt: new Date().toISOString(),
        source: "open-meteo",
      };
    } catch {
      const day = new Date().toISOString().slice(0, 10);
      const r = hash01(city.name + day);
      return {
        city: city.name,
        temperature: round1(city.baseF + (r - 0.5) * 12),
        unit: "F",
        humidity: Math.round(40 + r * 40),
        windMph: round1(3 + r * 12),
        condition: CONDITIONS[Math.floor(r * CONDITIONS.length)],
        observedAt: new Date().toISOString(),
        source: "simulated",
      };
    }
  });
}

export async function forecast(city) {
  return cached(`fc:${city.name}`, 30 * 60_000, async () => {
    try {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}` +
        `&daily=temperature_2m_max,temperature_2m_min,weather_code` +
        `&temperature_unit=fahrenheit&forecast_days=3&timezone=auto`;
      const j = await getJson(url);
      return {
        city: city.name,
        unit: "F",
        days: j.daily.time.map((date, i) => ({
          date,
          high: round1(j.daily.temperature_2m_max[i]),
          low: round1(j.daily.temperature_2m_min[i]),
          condition: conditionFromCode(j.daily.weather_code[i]),
        })),
        source: "open-meteo",
      };
    } catch {
      const days = [0, 1, 2].map((i) => {
        const date = new Date(Date.now() + i * 86_400_000).toISOString().slice(0, 10);
        const r = hash01(city.name + date);
        const high = round1(city.baseF + 5 + (r - 0.5) * 10);
        return { date, high, low: round1(high - 10 - r * 6), condition: CONDITIONS[Math.floor(r * 5)] };
      });
      return { city: city.name, unit: "F", days, source: "simulated" };
    }
  });
}

// ---------- crypto ----------

async function allPrices() {
  return cached("prices", 60_000, async () => {
    try {
      const ids = Object.values(ASSETS).map((a) => a.coingeckoId).join(",");
      const j = await getJson(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
      const out = {};
      for (const [sym, a] of Object.entries(ASSETS)) {
        if (typeof j[a.coingeckoId]?.usd !== "number") throw new Error("missing price");
        out[sym] = { price: j[a.coingeckoId].usd, source: "coingecko" };
      }
      return out;
    } catch {
      const out = {};
      for (const [sym, a] of Object.entries(ASSETS)) out[sym] = { price: a.fallbackUsd, source: "simulated" };
      return out;
    }
  });
}

export async function cryptoPrice(symbol) {
  const p = (await allPrices())[symbol];
  return {
    symbol,
    priceUsd: p.price,
    observedAt: new Date().toISOString(),
    source: p.source,
  };
}
