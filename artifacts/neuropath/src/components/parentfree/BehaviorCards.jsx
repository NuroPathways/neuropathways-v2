import { cardIdentity } from "./progress";
import { sourceLabel } from "./SupportView";

export default function BehaviorCards({ cards, selectedId, onSelect }) {
  return (
    <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }} data-testid="list-behaviors">
      {cards.map((c) => {
        const id = cardIdentity(c); const on = id === selectedId; const src = sourceLabel(c);
        return (
          <button key={id} type="button" aria-pressed={on} onClick={() => onSelect(id)} className={`pf-card ${on ? "sage" : ""}`} style={{ textAlign: "left", cursor: "pointer", display: "grid", gap: 6, borderColor: on ? "var(--pf-accent)" : undefined, borderWidth: on ? 2 : 1 }} data-testid={`card-behavior-${c.id}`}>
            <p className="pf-eyebrow">{on ? "Showing now" : "Tap to show"}</p>
            <strong style={{ fontSize: "1.1rem" }}>{c.behaviorName}</strong>
            <span style={{ fontSize: ".9rem" }}>Goal: {c.goal || "Not set"}</span>
            <span className={`pf-tag ${src.kind}`} style={{ justifySelf: "start" }}>{src.text}</span>
          </button>
        );
      })}
    </div>
  );
}
