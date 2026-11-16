// Turns (task, mode) into an Express handler.
//
// Junk modes still return HTTP 200 on purpose: x402 only settles payment for
// responses with status < 400, so a 200 junk response means the buyer is
// charged for garbage, which is the scam Vouch exists to catch.

import {
  BadRequest,
  cryptoPrice,
  currentWeather,
  forecast,
  lookupCity,
  lookupSymbol,
  otherCity,
} from "./data.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const SLOW_MS = Number(process.env.SLOW_MS || 5000);

// Each task knows how to validate its input, produce good data,
// and produce each flavour of junk.
const TASK_IMPL = {
  weather: {
    parse: (q) => lookupCity(q.city),
    good: (city) => currentWeather(city),
    format: async (city) => {
      const d = await currentWeather(city);
      // temperature as text, unit missing, fields renamed
      return { location: d.city, temperature: `${Math.round(d.temperature)} degrees-ish`, sky: d.condition };
    },
    sanity: async (city) => {
      const d = await currentWeather(city);
      // right shape, wrong city + impossible temperature
      return { ...d, city: otherCity(city).name, temperature: 150 + Math.round(Math.random() * 80), humidity: 140 };
    },
  },

  "weather-forecast": {
    parse: (q) => lookupCity(q.city),
    good: (city) => forecast(city),
    format: async (city) => {
      const d = await forecast(city);
      return { city: d.city, forecast: d.days.map((x) => `${x.date}: ${x.condition}`).join("; ") };
    },
    sanity: async (city) => {
      const d = await forecast(city);
      return { ...d, days: d.days.map((x) => ({ ...x, high: x.low - 40, low: x.high + 90 })) };
    },
  },

  "crypto-price": {
    parse: (q) => lookupSymbol(q.symbol),
    good: (symbol) => cryptoPrice(symbol),
    format: async (symbol) => {
      const d = await cryptoPrice(symbol);
      return { ticker: symbol, price: `about $${Math.round(d.priceUsd).toLocaleString("en-US")}` };
    },
    sanity: async (symbol) => {
      const d = await cryptoPrice(symbol);
      return { ...d, priceUsd: pick([-d.priceUsd, d.priceUsd * 1000, 0]) };
    },
  },
};

/**
 * @param {string} task
 * @param {() => string} getMode - read at request time so modes can be flipped live
 */
export function makeHandler(task, getMode) {
  const impl = TASK_IMPL[task];
  if (!impl) throw new Error(`No implementation for task "${task}"`);

  return async (req, res) => {
    let input;
    try {
      input = impl.parse(req.query);
    } catch (err) {
      // 400 => x402 does not settle, so bad input never costs the buyer.
      if (err instanceof BadRequest) return res.status(400).json({ error: err.message });
      throw err;
    }

    let mode = getMode();
    if (mode === "flaky") mode = Math.random() < 0.5 ? "good" : pick(["format", "sanity", "empty"]);

    switch (mode) {
      case "good":
        return res.json(await impl.good(input));
      case "slow":
        await sleep(SLOW_MS);
        return res.json(await impl.good(input));
      case "format":
        return res.json(await impl.format(input));
      case "sanity":
        return res.json(await impl.sanity(input));
      case "empty":
        return res.status(200).type("application/json").send("");
      case "error":
        return res.status(500).json({ error: "Internal server error" });
      default:
        return res.status(500).json({ error: `Unknown mode ${mode}` });
    }
  };
}
