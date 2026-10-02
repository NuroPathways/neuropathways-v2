import { cardIdentity, logIdentity, summarize } from "./progress";

function Stats({ s }) {
  if (s.entries === 0) return <p className="pf-hint">Nothing logged in the last 7 days.</p>;
  return (
    <ul className="pf-list" style={{ gap: 4 }}>
      <li style={{ display: "block" }}>Moments logged: <strong>{s.happened}</strong>{s.prevEntries > 0 ? ` (${s.prevHappened} the 7 days before)` : ""}</li>
      <li style={{ display: "block" }}>Entries marked "did not happen": <strong>{s.notHappened}</strong></li>
      {s.avgMinutes !== null && <li style={{ display: "block" }}>Average length: <strong>{s.avgMinutes} min</strong></li>}
      {s.high > 0 && <li style={{ display: "block" }}>High intensity: <strong>{s.high}</strong></li>}
    </ul>
  );
}

export default function ProgressView({ cards, logs, selectedId, onLog }) {
  const all = summarize(logs);
  const card = cards.find((c) => cardIdentity(c) === selectedId) || cards[0];
  const mine = (logs || []).filter((l) => card && logIdentity(l) === cardIdentity(card));
  const s = summarize(mine);
  return (
    <div className="pf-card" data-testid="card-progress">
      <h3 style={{ marginBottom: 4 }}>Progress and goals</h3>
      <p className="pf-hint" style={{ marginBottom: 12 }}>Counts come only from what you have logged. Not logging a moment does not mean a goal was met.</p>
      {card && (
        <div className="pf-card sage" style={{ display: "grid", gap: 8, marginBottom: 12 }} data-testid="progress-selected">
          <p className="pf-eyebrow">{card.behaviorName}</p>
          <p><strong>Goal:</strong> {card.goal || "No goal set yet"}</p>
          <Stats s={s} />
          {s.last && <p className="pf-hint">Last logged {new Date(s.last).toLocaleDateString()}</p>}
        </div>
      )}
      <p style={{ fontSize: ".9rem" }}>All behaviors, last 7 days: <strong data-testid="text-week-entries">{all.entries}</strong> {all.entries === 1 ? "entry" : "entries"}, {all.happened} marked as happened.</p>
      {onLog && <button className="pf-btn small" style={{ marginTop: 12 }} onClick={onLog} data-testid="button-progress-log">Log what happened</button>}
    </div>
  );
}
