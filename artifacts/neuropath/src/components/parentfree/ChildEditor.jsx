import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetStarterLibrary, useUpdateParentChild, getGetParentDashboardQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/lib/AuthContext";
import { parentRequest } from "@/lib/parentSession";
import { Field, ErrorBox, errMsg } from "./common";

const CUSTOM = "__custom";

export default function ChildEditor({ child }) {
  const qc = useQueryClient();
  const { refreshParent } = useAuth();
  const lib = useGetStarterLibrary({ request: parentRequest() });
  const update = useUpdateParentChild({ request: parentRequest() });
  const init = () => ({ name: child.name || "", age: child.age ?? "", notes: child.notes || "", behavior: child.behaviorKey === "custom" || (!child.behaviorKey && child.behaviorName) ? CUSTOM : (child.behaviorKey || ""), custom: child.behaviorKey === "custom" || (!child.behaviorKey && child.behaviorName) ? child.behaviorName || "" : "", goal: child.goal || "" });
  const [f, setF] = useState(init);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => { setF(init()); setSaved(false); }, [child.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = (e) => {
    e.preventDefault();
    setError(""); setSaved(false);
    const data = { name: f.name.trim(), age: f.age === "" ? undefined : Number(f.age), notes: f.notes.trim(), goal: f.goal.trim() || undefined };
    if (f.behavior === CUSTOM) { if (f.custom.trim()) { data.behaviorKey = "custom"; data.customBehavior = f.custom.trim(); } }
    else if (f.behavior && f.behavior !== child.behaviorKey) data.behaviorKey = f.behavior;
    update.mutate({ childId: child.id, data }, {
      onSuccess: async () => { setSaved(true); await refreshParent(); qc.invalidateQueries({ queryKey: getGetParentDashboardQueryKey(child.id) }); },
      onError: (er) => setError(errMsg(er)),
    });
  };

  return (
    <form onSubmit={save} className="pf-card" style={{ display: "grid", gap: 14, maxWidth: 560 }}>
      <h2>Edit Behavior / Goal</h2>
      <p className="pf-hint">Change the behavior, goal, nickname or notes without starting over. Your uploaded documents and guidance are kept.</p>
      <Field label="Name or nickname"><input className="pf-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="input-edit-name" /></Field>
      <Field label="Age"><input className="pf-input" type="number" min="0" max="25" value={f.age} onChange={(e) => setF({ ...f, age: e.target.value })} data-testid="input-edit-age" /></Field>
      <Field label="Notes"><textarea className="pf-area" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} data-testid="input-edit-notes" /></Field>
      <Field label="Behavior to focus on">
        <select className="pf-select" value={f.behavior} onChange={(e) => setF({ ...f, behavior: e.target.value })} data-testid="select-edit-behavior">
          <option value="" disabled>Choose one</option>
          {(lib.data || []).map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
          <option value={CUSTOM}>Other / I'll type my own</option>
        </select>
      </Field>
      {f.behavior === CUSTOM && <Field label="Describe it"><input className="pf-input" value={f.custom} onChange={(e) => setF({ ...f, custom: e.target.value })} data-testid="input-edit-custom" /></Field>}
      <Field label="Goal"><textarea className="pf-area" value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value })} data-testid="input-edit-goal" /></Field>
      <ErrorBox error={error} />
      {saved && <p className="pf-tag" style={{ justifySelf: "start" }} data-testid="text-edit-saved">Saved</p>}
      <button className="pf-btn primary" disabled={!f.name.trim() || update.isPending} data-testid="button-save-child">{update.isPending ? "Saving..." : "Save changes"}</button>
    </form>
  );
}
