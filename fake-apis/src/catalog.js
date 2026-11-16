// The list of every fake endpoint we sell.
//
// Endpoint IDs follow the "<api>/<endpoint>" format from the API contract
// (e.g. "weather-api-1/current"). Each endpoint has its own receiving wallet
// (see wallets.json) so payments can be attributed to it on-chain.
//
// `defaultMode` is SECRET: it decides whether the endpoint is good or junk.
// It is never exposed on the public /catalog route, so the agent and the
// tester bot have to find out the hard way (by checking the data).

export const TASKS = {
  weather: {
    description: "Current weather for a city",
    params: { city: "City name, e.g. Austin" },
    schema: {
      city: "string",
      temperature: "number",
      unit: "string",
      humidity: "number",
      windMph: "number",
      condition: "string",
      observedAt: "string",
    },
  },
  "weather-forecast": {
    description: "3-day forecast for a city",
    params: { city: "City name, e.g. Austin" },
    schema: {
      city: "string",
      unit: "string",
      days: "array<{date:string, high:number, low:number, condition:string}>",
    },
  },
  "crypto-price": {
    description: "Current USD price of a crypto asset",
    params: { symbol: "Asset symbol, e.g. BTC" },
    schema: {
      symbol: "string",
      priceUsd: "number",
      observedAt: "string",
    },
  },
};

// Modes:
//   good    - correct data, fast
//   slow    - correct data, but takes ~5s (fails "fast enough")
//   format  - wrong shape / wrong types (fails "right format")
//   sanity  - right shape, unbelievable values (fails "makes sense")
//   empty   - 200 with an empty body (fails "got something")
//   flaky   - good half the time, random junk otherwise
//   error   - HTTP 500 (x402 does NOT settle on errors, so the buyer isn't charged)
export const MODES = ["good", "slow", "format", "sanity", "empty", "flaky", "error"];

export const ENDPOINTS = [
  {
    id: "weather-api-1/current",
    task: "weather",
    price: "$0.01",
    description: "Live current weather (reliable)",
    defaultMode: "good",
  },
  {
    id: "weather-api-1/forecast",
    task: "weather-forecast",
    price: "$0.01",
    description: "3-day forecast (reliable)",
    defaultMode: "good",
  },
  {
    id: "weather-api-2/current",
    task: "weather",
    price: "$0.02",
    description: "Premium current weather (reliable, pricier)",
    defaultMode: "good",
  },
  {
    id: "weather-api-3/current",
    task: "weather",
    price: "$0.01",
    description: "Current weather (returns wrong city / absurd temps)",
    defaultMode: "sanity",
  },
  {
    id: "weather-api-4/current",
    task: "weather",
    price: "$0.01",
    description: "Current weather (broken response format)",
    defaultMode: "format",
  },
  {
    id: "crypto-api-1/price",
    task: "crypto-price",
    price: "$0.01",
    description: "Live crypto prices (reliable)",
    defaultMode: "good",
  },
  {
    id: "crypto-api-2/price",
    task: "crypto-price",
    price: "$0.01",
    description: "Crypto prices (very slow)",
    defaultMode: "slow",
  },
  {
    id: "crypto-api-3/price",
    task: "crypto-price",
    price: "$0.01",
    description: "Crypto prices (takes payment, returns nothing)",
    defaultMode: "empty",
  },
  {
    id: "crypto-api-4/price",
    task: "crypto-price",
    price: "$0.01",
    description: "Crypto prices (unreliable)",
    defaultMode: "flaky",
  },
];

/** "weather-api-1/current" -> "/weather-api-1/current" */
export const pathFor = (endpointId) => `/${endpointId}`;
