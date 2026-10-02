import { useState } from "react";
import { getParentBehaviors, parentBehaviorIdentity } from "@workspace/api-client-react";
import { Field } from "./common";

export const idOf = (s) => parentBehaviorIdentity({ behaviorKey: s.key, customBehavior: s.key === "custom" ? s.custom : null });

export function toSelections(child) {
  return getParentBehaviors(child || {}).map((b) => ({ key: b.behaviorKey, custom: b.behaviorKey === "custom" ? (b.customBehavior || b.behaviorName || "") : "", goal: b.goal || "" }));
}

export function toInput(sels) {
  return sels.map((s) => {
    const o = { behaviorKey: s.key };
    if (s.key === "custom") o.customBehavior = s.custom.trim();
    if (s.goal.trim()) o.goal = s.goal.trim();
    return o;
  });
}

export const selectionsValid = (sels) => sels.length > 0 && sels.every((s) => s.key !== "custom" || s.custom.trim());
export const goalsValid = (sels) => selectionsValid(sels) && sels.every((s) => s.goal.trim());

// Multi-select of starter behaviors plus any number of custom ones. Goals already typed are never cleared.
export function BehaviorChoice({ templates, sels, setSels, loading }) {
  const [draft, setDraft] = useState("");
  const has = (key) => sels.some((s) => s.key === key);
  const toggle = (key) => setSels(has(key) ? sels.filter((s) => s.key !== key) : [...sels, { key, custom: "", goal: "" }]);
  const addCustom = () => {
    const name = draft.trim();
    if (!name) return;
    const next = { key: "custom", custom: name, goal: "" };
    if (sels.some((s) => idOf(s) === idOf(next))) { setDraft(""); return; }
    setSels([...sels, next]); setDraft("");
  };
  const customs = sels.filter((s) => s.key === "custom");
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {templates.map((t) => (
        <button key={t.key} type="button" aria-pressed={has(t.key)} onClick={() => toggle(t.key)} className="pf-card" style={{ textAlign: "left", cursor: "pointer", padding: 16, borderColor: has(t.key) ? "var(--pf-accent)" : undefined, borderWidth: has(t.key) ? 2 : 1 }} data-testid={`button-behavior-${t.key}`}>
          <strong>{has(t.key) ? "Selected: " : ""}{t.name}</strong>
          <p style={{ fontSize: ".88rem", color: "var(--pf-ink-soft)" }}>{t.description}</p>
        </button>
      ))}
      {customs.map((s) => (
        <div key={idOf(s)} className="pf-card" style={{ padding: 16, borderColor: "var(--pf-accent)", borderWidth: 2, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }} data-testid={`row-custom-${idOf(s)}`}>
          <strong>Your own: {s.custom}</strong>
          <button type="button" className="pf-btn small" onClick={() => setSels(sels.filter((x) => x !== s))} data-testid={`button-remove-custom-${idOf(s)}`}>Remove</button>
        </div>
      ))}
      {!loading && (
        <div className="pf-card" style={{ padding: 16, display: "grid", gap: 8 }}>
          <Field label="Something else? Type your own">
            <div style={{ display: "flex", gap: 8 }}>
              <input className="pf-input" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }} data-testid="input-custom-behavior" />
              <button type="button" className="pf-btn" disabled={!draft.trim()} onClick={addCustom} data-testid="button-add-custom">Add</button>
            </div>
          </Field>
        </div>
      )}
    </div>
  );
}

// One independent goal field per selected behavior.
export function GoalFields({ templates, sels, setSels }) {
  const setGoal = (i, goal) => setSels(sels.map((s, j) => (j === i ? { ...s, goal } : s)));
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {sels.map((s, i) => {
        const tpl = templates.find((t) => t.key === s.key);
        const label = s.key === "custom" ? s.custom : tpl?.name || s.key;
        const id = idOf(s);
        return (
          <div key={id} className="pf-card" style={{ display: "grid", gap: 10 }} data-testid={`goal-block-${id}`}>
            <p className="pf-eyebrow">{label}</p>
            {tpl?.relatedGoals?.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {tpl.relatedGoals.map((g) => <button key={g} type="button" className="pf-chip" aria-pressed={s.goal === g} onClick={() => setGoal(i, g)} data-testid={`chip-goal-${id}-${g.slice(0, 16)}`}>{g}</button>)}
              </div>
            )}
            <Field label={`Goal for ${label}`}><textarea className="pf-area" value={s.goal} onChange={(e) => setGoal(i, e.target.value)} data-testid={`input-goal-${id}`} /></Field>
          </div>
        );
      })}
    </div>
  );
}
