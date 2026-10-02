import { useEffect, useRef } from "react";
import { cardIdentity } from "./progress";
import { HelpNowView } from "./SupportView";
import GoalLines from "./GoalLines";

export default function HelpNowPanel({ cards, activeIds, selectedId, onPick, onAdd, onUpload, onLog, onClose }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const selected = cards.find((c) => cardIdentity(c) === selectedId);
  const isActive = (c) => activeIds.has(cardIdentity(c));
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.querySelector("button")?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key !== "Tab") return;
      const buttons = [...(ref.current?.querySelectorAll("button:not([disabled])") || [])];
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; previous?.focus?.(); };
  }, []);
  return (
    <div className="pf-overlay" role="dialog" aria-modal="true" aria-labelledby="help-select-title" ref={ref} data-testid="selector-help">
      <div className="pf-wrap pf-modal-card" style={{ display: "grid", gap: 18, maxWidth: 1000 }}>
        <h2 id="help-select-title">What do you need help with right now?</h2>
        <p className="pf-hint">Choose a behavior below. These blocks stay available so you can switch. Scanned plans automatically update the support and show their goals alongside yours.</p>
        <div className="pf-lib" data-testid="help-behavior-blocks">
          {cards.map((c) => <button key={cardIdentity(c)} type="button" aria-pressed={selectedId === cardIdentity(c)} className={`pf-card ${selectedId === cardIdentity(c) ? "sage" : ""}`} style={{ textAlign: "left", cursor: "pointer", display: "grid", gap: 6 }} onClick={() => onPick(c)} data-testid={`select-help-${c.id}`}>
            <strong style={{ fontSize: "1.1rem" }}>{c.behaviorName}</strong>
            <span className="pf-tag" style={{ justifySelf: "start" }}>{isActive(c) ? "Active" : "Found in Uploaded Plan"}</span>
            <GoalLines card={c} active={isActive(c)} />
          </button>)}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="pf-btn" onClick={() => onAdd()} data-testid="button-help-add-behavior">Add Another Behavior</button>
          <button className="pf-btn" onClick={onUpload} data-testid="button-help-upload">Upload a Plan</button>
          <button className="pf-btn ghost" onClick={onClose} data-testid="button-help-close">Close</button>
        </div>
        {selected && <HelpNowView card={selected} embedded active={isActive(selected)} onLog={isActive(selected) ? onLog : undefined} onAdd={!isActive(selected) ? () => onAdd(selected) : undefined} />}
      </div>
    </div>
  );
}