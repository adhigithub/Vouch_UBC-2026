// Loads the list of endpoints from the fake APIs' GET /catalog.
import { upsertEndpoints } from "./db.js";

export async function syncCatalog(db, fakeApisUrl) {
  const res = await fetch(`${fakeApisUrl.replace(/\/+$/, "")}/catalog`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`catalog -> HTTP ${res.status}`);
  const list = (await res.json()).map((e) => ({
    id: e.endpointId,
    api: e.api,
    task: e.task,
    url: e.url,
    price: e.price,
    payTo: e.payTo,
    payToTokenAccount: e.payToTokenAccount,
    schema: e.schema,
  }));
  upsertEndpoints(db, list);
  return list.length;
}
