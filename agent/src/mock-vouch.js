// A stand-in for the Vouch server, used until the real one exists.
//
// It answers the same two questions the real server will (see VOUCH.md section 11):
//   best(task)  -> trusted endpoints for a task, best first
//   rate(...)   -> record a good/bad rating
//
// Scoring here is deliberately simple: every endpoint starts "unrated" at 70,
// each good rating adds 5 and each bad rating subtracts 20 (bad news counts more).
// Scores are kept in mock-scores.json so they persist between runs, the way
// real ratings would.
import fs from "node:fs";
import { FAKE_APIS_URL } from "./config.js";

const STATE_FILE = new URL("../mock-scores.json", import.meta.url);
const START_SCORE = 70;

function load() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { scores: {}, usedPayments: [] };
  }
}
const save = (s) => fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2) + "\n");

let catalogCache = null;
async function catalog() {
  if (!catalogCache) {
    const res = await fetch(`${FAKE_APIS_URL}/catalog`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`catalog -> HTTP ${res.status}`);
    catalogCache = await res.json();
  }
  return catalogCache;
}

export async function best(task) {
  const state = load();
  return (await catalog())
    .filter((e) => e.task === task)
    .map((e) => {
      const s = state.scores[e.endpointId];
      const score = s ? s.score : START_SCORE;
      return {
        endpointId: e.endpointId,
        url: e.url,
        price: e.price,
        schema: e.schema,
        score,
        label: !s ? "unrated" : score >= 60 ? "trusted" : "avoid",
      };
    })
    .sort((a, b) => b.score - a.score || a.price - b.price); // price breaks ties
}

export async function rate({ endpointId, paymentId, rating }) {
  const state = load();
  if (state.usedPayments.includes(paymentId)) return { status: 409, body: "payment already used" };
  state.usedPayments.push(paymentId);
  const s = (state.scores[endpointId] ??= { score: START_SCORE, good: 0, bad: 0 });
  if (rating === "good") {
    s.good++;
    s.score = Math.min(100, s.score + 5);
  } else {
    s.bad++;
    s.score = Math.max(0, s.score - 20);
  }
  save(state);
  return { status: 200, body: "stamped" };
}
