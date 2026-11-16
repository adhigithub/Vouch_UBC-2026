// Buys once from every endpoint in the fake APIs' catalog and runs the 4 checks,
// without rating anything. Useful to confirm the checks catch each kind of junk.
//
//   node check-all.js
import { FAKE_APIS_URL } from "./src/config.js";
import { buy } from "./src/wallet.js";
import { runChecks } from "./src/checks.js";

const PARAMS = { weather: { city: "Austin" }, "weather-forecast": { city: "Austin" }, "crypto-price": { symbol: "BTC" } };

const catalog = await (await fetch(`${FAKE_APIS_URL}/catalog`)).json();
const rows = await Promise.all(
  catalog.map(async (e) => {
    const params = PARAMS[e.task];
    const result = await buy(`${e.url}?${new URLSearchParams(params)}`);
    const v = await runChecks(result, { task: e.task, schema: e.schema, params });
    return `${e.endpointId.padEnd(24)} ${v.rating.toUpperCase().padEnd(5)} ${v.reason ? `${v.reason}: ${v.detail}` : ""}`;
  }),
);
console.log(rows.join("\n"));
