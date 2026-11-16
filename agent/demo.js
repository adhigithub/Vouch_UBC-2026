// Runs the same tasks a few rounds in a row, so you can watch the agent
// learn: junk endpoints get rated bad, their scores fall below 60,
// and from then on the agent skips them.
//
//   node demo.js            (keeps scores from earlier runs)
//   node demo.js --reset    (start everyone back at "unrated")
import fs from "node:fs";
import { runTask } from "./agent.js";
import { usingMock } from "./src/vouch.js";

if (process.argv.includes("--reset") && usingMock) {
  fs.rmSync(new URL("./mock-scores.json", import.meta.url), { force: true });
  console.log("Scores reset.");
}

const TASKS = [
  ["weather", { city: "Austin" }],
  ["crypto-price", { symbol: "BTC" }],
];

for (let round = 1; round <= 3; round++) {
  console.log(`\n================ Round ${round} ================`);
  for (const [task, params] of TASKS) await runTask(task, params);
}
