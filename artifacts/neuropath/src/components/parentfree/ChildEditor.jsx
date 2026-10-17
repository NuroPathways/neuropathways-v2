import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetStarterLibrary, useUpdateParentChild, getGetParentDashboardQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/lib/AuthContext";
import { parentRequest } from "@/lib/parentSession";
import { BehaviorChoice, GoalFields, toSelections, toInput, goalsValid } from "./BehaviorFields";
import { Field, ErrorBox, errMsg } from "./common";

export default function ChildEditor({ child, section, onUpload, lockDemographics = false }) {
  const bRef = useRef(null); const gRef = useRef(null);
  useEffect(() => { (section === "goals" ? gRef : bRef).current?.scrollIntoView?.({ behavior: "smooth", block: "start" }); }, [section]);
  const qc = useQueryClient();
  const { refreshParent } = useAuth();
  const lib = useGetStarterLibrary({ request: parentRequest() });
  const update = useUpdateParentChild({ request: parentRequest() });
  const init = () => ({ name: child.name || "", age: child.age ?? "", notes: child.notes || "", sels: toSelections(child) });
  const [f, setF] = useState(init);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => { setF(init()); setSaved(false); }, [child.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = (e) => {
    e.preventDefault();
    setError(""); setSaved(false);
    const data = { ...(lockDemographics ? {} : { name: f.name.trim(), age: f.age === "" ? undefined : Number(f.age) }), notes: f.notes.trim(), behaviors: toInput(f.sels) };
    update.mutate({ childId: child.id, data }, {
      onSuccess: async () => { setSaved(true); await refreshParent(); qc.invalidateQueries({ queryKey: getGetParentDashboardQueryKey(child.id) }); },
      onError: (er) => setError(errMsg(er)),
    });
  };

  return (
    <form onSubmit={save} className="pf-card" style={{ display: "grid", gap: 14, maxWidth: 720 }}>
      <h2>Edit Behaviors / Goals</h2>
      <p className="pf-hint">Change the behavior, goal, nickname or notes without starting over. Your uploaded documents and guidance are kept.</p>
      {onUpload && <div><button type="button" className="pf-btn small" onClick={onUpload} data-testid="button-profile-upload">Upload a Plan</button></div>}
      {lockDemographics ? <p className="pf-hint" data-testid="text-demographics-managed">Name and age are managed by your clinic.</p> : <>
      <Field label="Name or nickname"><input className="pf-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="input-edit-name" /></Field>
      <Field label="Age"><input className="pf-input" type="number" min="0" max="25" value={f.age} onChange={(e) => setF({ ...f, age: e.target.value })} data-testid="input-edit-age" /></Field></>}
      <Field label="Notes"><textarea className="pf-area" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} data-testid="input-edit-notes" /></Field>
      <h3 ref={bRef}>Behaviors</h3>
      <p className="pf-hint">Add or remove behaviors. Each one keeps its own goal.</p>
      <BehaviorChoice templates={lib.data || []} sels={f.sels} setSels={(sels) => setF((p) => ({ ...p, sels }))} loading={lib.isLoading} />
      <h3 ref={gRef}>Goals</h3>
      <GoalFields templates={lib.data || []} sels={f.sels} setSels={(sels) => setF((p) => ({ ...p, sels }))} />
      <ErrorBox error={error} />
      {saved && <p className="pf-tag" style={{ justifySelf: "start" }} data-testid="text-edit-saved">Saved</p>}
      <button className="pf-btn primary" disabled={!f.name.trim() || !goalsValid(f.sels) || update.isPending} data-testid="button-save-child">{update.isPending ? "Saving..." : "Save changes"}</button>
    </form>
  );
}
