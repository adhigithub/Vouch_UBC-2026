import { useEffect, useState } from "react";
import {
  explorerTxUrl,
  fetchRecentPayments,
  shortAddr,
  subscribePayments,
  subscribeStreamStatus,
  type PaymentEvent,
  type StreamStatus,
} from "../lib/vouchApi";

const STATUS_LABEL: Record<StreamStatus, string> = { mock: "mock stream", connecting: "connecting", open: "live sse", reconnecting: "reconnecting" };

/** Verified USDC payments: QuickNode Stream → Vouch server → /api/stream (SSE). */
export function LiveFeed() {
  const [items, setItems] = useState<PaymentEvent[]>([]);
  const [status, setStatus] = useState<StreamStatus>("connecting");
  useEffect(() => {
    fetchRecentPayments(12).then(setItems).catch(() => {});
    const offStatus = subscribeStreamStatus(setStatus);
    const offPay = subscribePayments((p) => setItems((xs) => [p, ...xs.filter((x) => x.paymentId !== p.paymentId)].slice(0, 14)));
    return () => (offStatus(), offPay());
  }, []);
  const healthy = status === "open" || status === "mock";
  return (
    <div className="feed glass">
      <div className="feed-head">
        <span>QuickNode firehose</span>
        <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span className={`dot ${healthy ? "" : "mock"}`} /> {STATUS_LABEL[status]}
        </span>
      </div>
      <ul aria-live="polite" aria-label="Recent verified payments">
        {items.length === 0 && <li className="t-dim">waiting for USDC transfers…</li>}
        {items.map((p) => (
          <li key={p.paymentId}>
            <div><span className="amt">+{p.amountUsdc.toFixed(2)} USDC</span> → <span className="ep">{p.endpointUrl}</span></div>
            <div>
              <a href={explorerTxUrl(p.paymentId)} target="_blank" rel="noreferrer">tx {shortAddr(p.paymentId, 5)} ↗</a>
              <span className="t-dim"> · {shortAddr(p.from)}</span>
              {p.rated ? <span className="t-dim"> · rated</span> : <span className="t-cyan"> · unrated</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
