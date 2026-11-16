// How the agent talks to Vouch.
// Uses the real Vouch server if VOUCH_URL is set, otherwise the stand-in.
import { VOUCH_URL } from "./config.js";
import * as mock from "./mock-vouch.js";

export const usingMock = !VOUCH_URL;

/** Trusted endpoints for a task, best first. Throws if Vouch can't be reached. */
export async function best(task) {
  if (usingMock) return mock.best(task);
  const res = await fetch(`${VOUCH_URL}/best?task=${encodeURIComponent(task)}`, {
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error(`Vouch /best -> HTTP ${res.status}`);
  const body = await res.json();
  return Array.isArray(body) ? body : [body]; // contract may return one endpoint or a ranked list
}

/** Send a rating. Returns { status, body }. */
export async function rate(rating) {
  if (usingMock) return mock.rate(rating);
  const res = await fetch(`${VOUCH_URL}/rate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(rating),
    signal: AbortSignal.timeout(5000),
  });
  return { status: res.status, body: await res.text() };
}
