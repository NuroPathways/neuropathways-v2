import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpdateParentChild, getGetParentDashboardQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/lib/AuthContext";
import { parentRequest } from "@/lib/parentSession";
import { BehaviorChoice, GoalFields, toInput, goalsValid, idOf } from "./BehaviorFields";
import { ErrorBox, errMsg } from "./common";

// Optional step after the first goals: add more support areas now. Existing selections and goals are preserved.
export default function SetupExtras({ childId, templates, initial, loading, onDone }) {
  const qc = useQueryClient();
  const { refreshParent } = useAuth();
  const update = useUpdateParentChild({ request: parentRequest() });
  const [extra, setExtra] = useState([]);
  const [error, setError] = useState("");
  const taken = new Set(initial.map(idOf));
  const remaining = templates.filter((t) => !taken.has(idOf({ key: t.key })));
  const setSels = (next) => setExtra(next.filter((s) => !taken.has(idOf(s))));
  const add = () => {
    setError("");
    update.mutate({ childId, data: { behaviors: toInput([...initial, ...extra]) } }, {
      onSuccess: async () => { await refreshParent(); qc.invalidateQueries({ queryKey: getGetParentDashboardQueryKey(childId) }); onDone([...initial, ...extra]); },
      onError: (er) => setError(errMsg(er)),
    });
  };
  return (
    <section style={{ marginTop: 28, display: "grid", gap: 16 }} data-testid="setup-extras">
      <h1 style={{ fontSize: "clamp(1.9rem,6vw,2.6rem)" }}>Want to add more support areas?</h1>
      <p style={{ color: "var(--pf-ink-soft)" }}>You can add more behaviors now or come back later.</p>
      <BehaviorChoice templates={remaining} sels={extra} setSels={setSels} loading={loading} />
      {extra.length > 0 && <GoalFields templates={templates} sels={extra} setSels={setSels} />}
      <ErrorBox error={error} />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="pf-btn primary" disabled={extra.length === 0 || !goalsValid(extra) || update.isPending} onClick={add} data-testid="button-add-selected">{update.isPending ? "Adding..." : "Add Selected Behaviors"}</button>
        <button className="pf-btn" onClick={() => onDone(initial)} data-testid="button-skip-extras">Skip for Now</button>
      </div>
    </section>
  );
}
