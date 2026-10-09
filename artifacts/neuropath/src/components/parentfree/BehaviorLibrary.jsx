import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getParentBehaviors, parentBehaviorIdentity, useGetStarterLibrary, useUpdateParentChild, getGetParentDashboardQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/lib/AuthContext";
import { parentRequest } from "@/lib/parentSession";
import { toSelections, toInput } from "./BehaviorFields";
import { Field, ErrorBox, errMsg } from "./common";
import GoalLines from "./GoalLines";

function statusOf(active, card) {
  if (card?.source === "starter") return { text: "Starter support", kind: "sun" };
  if (card?.source === "parent_document") return { text: "Based on your uploaded plan · not clinician-reviewed", kind: "" };
  if (card?.source === "clinician_reviewed") return { text: "Clinician reviewed", kind: "" };
  if (card?.source === "clinician_document") return { text: "Clinician-uploaded plan", kind: "" };
  if (card?.source) return { text: "Needs review", kind: "warn" };
  if (active) return { text: "Active", kind: "" };
  return { text: "Available to Add", kind: "warn" };
}

export default function BehaviorLibrary({ child, allCards, onUpload, onEdit, requestAdd, onAddHandled, onAdded }) {
  const qc = useQueryClient();
  const { refreshParent } = useAuth();
  const lib = useGetStarterLibrary({ request: parentRequest() });
  const update = useUpdateParentChild({ request: parentRequest() });
  const [open, setOpen] = useState(null);
  const [goal, setGoal] = useState("");
  const [custom, setCustom] = useState("");
  const [error, setError] = useState("");
  const mine = getParentBehaviors(child);
  const isMine = (id) => mine.some((b) => parentBehaviorIdentity(b) === id);
  const cardOf = (id) => allCards.find((c) => parentBehaviorIdentity(c) === id);
  const templates = (lib.data || []).filter((t) => t.key !== "custom");

  const entries = templates.map((t) => ({ id: parentBehaviorIdentity({ behaviorKey: t.key }), key: t.key, name: t.name, desc: t.description, goals: t.relatedGoals || [] }));
  const seen = new Set(entries.map((e) => e.id));
  const extra = [];
  mine.filter((b) => !seen.has(parentBehaviorIdentity(b))).forEach((b) => extra.push({ id: parentBehaviorIdentity(b), key: b.behaviorKey, custom: b.customBehavior, name: b.behaviorName, goals: [] }));
  allCards.filter((c) => c.source !== "starter" && !seen.has(parentBehaviorIdentity(c)) && !extra.some((e) => e.id === parentBehaviorIdentity(c))).forEach((c) => extra.push({ id: parentBehaviorIdentity(c), key: c.behaviorKey, custom: c.behaviorKey === "custom" ? c.behaviorName : null, name: c.behaviorName, planGoal: c.planGoal, goals: [] }));

  const start = (e) => {
    setError("");
    setOpen(e.id);
    const card = cardOf(e.id);
    const explicitPlanGoal = [card?.planGoal, e.planGoal]
      .find((value) => typeof value === "string" && value.trim());
    const planDiscovered = !!card && card.source !== "starter";
    setGoal(explicitPlanGoal || (planDiscovered ? "" : card?.goal || e.goals[0] || ""));
  };
  useEffect(() => {
    if (!requestAdd) return;
    const entry = [...entries, ...extra].find((e) => e.id === requestAdd);
    if (!entry) return;
    start(entry);
    document.getElementById(`library-row-${entry.id}`)?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    onAddHandled?.();
  }, [requestAdd, lib.data, allCards]);
  const activate = (e) => {
    const b = { behaviorKey: e.key, goal: goal.trim() };
    if (e.key === "custom") b.customBehavior = (e.custom || e.name || "").trim();
    update.mutate({ childId: child.id, data: { behaviors: [...toInput(toSelections(child)), b] } }, {
      onSuccess: async () => { setOpen(null); setCustom(""); setGoal(""); await refreshParent(); await qc.invalidateQueries({ queryKey: getGetParentDashboardQueryKey(child.id) }); onAdded?.(); },
      onError: (er) => setError(errMsg(er)),
    });
  };
  const form = (e, ok) => (
    <div style={{ display: "grid", gap: 8 }}>
      <Field label="Starting goal">
        <input className="pf-input" value={goal} onChange={(ev) => setGoal(ev.target.value)} data-testid={`input-add-goal-${e.id}`} />
      </Field>
      {e.goals.length > 1 && <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{e.goals.map((g) => <button key={g} type="button" className="pf-chip" aria-pressed={goal === g} onClick={() => setGoal(g)}>{g}</button>)}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="pf-btn small primary" disabled={!goal.trim() || !ok || update.isPending} onClick={() => activate(e)} data-testid={`button-confirm-add-${e.id}`}>{update.isPending ? "Adding..." : "Add to active"}</button>
        <button type="button" className="pf-btn small ghost" onClick={() => setOpen(null)}>Cancel</button>
      </div>
    </div>
  );
  const customEntry = { id: "custom-new", key: "custom", custom: custom, name: custom, goals: [] };

  return (
    <div className="pf-card" data-testid="card-library">
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <div><h2>Behavior Support Library</h2><p className="pf-hint">Add more support areas any time. Nothing here restarts your setup.</p></div>
        <button type="button" className="pf-btn small" onClick={onUpload} data-testid="button-library-upload">Upload a Plan</button>
      </div>
      {lib.isLoading && <p className="pf-hint">Loading the library...</p>}
      {lib.isError && <ErrorBox error={lib.error} onRetry={() => lib.refetch()} />}
      <div className="pf-lib">
        {[...entries, ...extra].map((e) => {
          const active = isMine(e.id); const card = cardOf(e.id); const st = statusOf(active, card);
          return (
             <div key={e.id} id={`library-row-${e.id}`} className={`pf-card pf-lib-item ${active ? "sage" : ""}`} data-testid={`library-${e.id}`}>
              <span className={`pf-tag ${st.kind}`} style={{ justifySelf: "start" }} data-testid={`status-${e.id}`}>{st.text}</span>
              <strong style={{ fontSize: "1.05rem" }}>{e.name}</strong>
              {e.desc && <span style={{ fontSize: ".9rem" }}>{e.desc}</span>}
               {card && (active || card.planGoal) && <GoalLines card={card} active={active} />}
              {active && <button type="button" className="pf-btn small ghost" style={{ justifySelf: "start", padding: 0 }} onClick={() => onEdit("goals")}>Edit goal</button>}
              {!active && open !== e.id && <button type="button" className="pf-btn small" style={{ justifySelf: "start" }} onClick={() => start(e)} data-testid={`button-add-${e.id}`}>Add</button>}
              {!active && open === e.id && form(e, true)}
            </div>
          );
        })}
        <div className="pf-card pf-lib-item" data-testid="library-custom-row">
          <span className="pf-tag warn" style={{ justifySelf: "start" }}>Available to Add</span>
          <strong style={{ fontSize: "1.05rem" }}>Other / Custom Behavior</strong>
          <input className="pf-input" placeholder="Name the behavior" value={custom} onChange={(ev) => { setCustom(ev.target.value); setOpen(null); }} data-testid="input-library-custom" />
          {custom.trim() && (open === "custom-new" ? form(customEntry, !!custom.trim()) : <button type="button" className="pf-btn small" style={{ justifySelf: "start" }} onClick={() => start(customEntry)} data-testid="button-add-custom-row">Add</button>)}
        </div>
      </div>
      <div style={{ marginTop: 12 }}><ErrorBox error={error} /></div>
    </div>
  );
}
