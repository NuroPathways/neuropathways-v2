import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAddParentLog, getGetParentDashboardQueryKey } from "@workspace/api-client-react";
import { parentRequest } from "@/lib/parentSession";
import { Field, ErrorBox, errMsg } from "./common";

const blank = { happened: true, intensity: "medium", duration: "5", trigger: "", whatHelped: "", notes: "" };

export default function LogPanel({ childId, childName, logs }) {
  const qc = useQueryClient();
  const [f, setF] = useState(blank);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const add = useAddParentLog({ request: parentRequest() });

  const submit = (e) => {
    e.preventDefault();
    setError(""); setSaved(false);
    add.mutate(
      { childId, data: { happened: f.happened, intensity: f.intensity, duration: Math.max(0, Number(f.duration) || 0), trigger: f.trigger.trim() || undefined, whatHelped: f.whatHelped.trim() || undefined, notes: f.notes.trim() || undefined } },
      { onSuccess: () => { setF(blank); setSaved(true); qc.invalidateQueries({ queryKey: getGetParentDashboardQueryKey(childId) }); }, onError: (er) => setError(errMsg(er)) }
    );
  };

  return (
    <div className="pf-grid2">
      <form onSubmit={submit} className="pf-card" style={{ display: "grid", gap: 14 }}>
        <h2>Log a moment for {childName}</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="pf-chip" aria-pressed={f.happened} onClick={() => setF({ ...f, happened: true })} data-testid="button-log-happened">It happened</button>
          <button type="button" className="pf-chip" aria-pressed={!f.happened} onClick={() => setF({ ...f, happened: false })} data-testid="button-log-win">It did not happen today</button>
        </div>
        {f.happened && (
          <>
            <Field label="How intense">
              <div style={{ display: "flex", gap: 8 }}>
                {["low", "medium", "high"].map((i) => <button key={i} type="button" className="pf-chip" aria-pressed={f.intensity === i} onClick={() => setF({ ...f, intensity: i })} data-testid={`button-intensity-${i}`}>{i[0].toUpperCase() + i.slice(1)}</button>)}
              </div>
            </Field>
            <Field label="Minutes it lasted"><input className="pf-input" type="number" min="0" value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })} data-testid="input-log-duration" /></Field>
            <Field label="What came before (optional)"><input className="pf-input" value={f.trigger} onChange={(e) => setF({ ...f, trigger: e.target.value })} data-testid="input-log-trigger" /></Field>
          </>
        )}
        <Field label="What helped (optional)"><input className="pf-input" value={f.whatHelped} onChange={(e) => setF({ ...f, whatHelped: e.target.value })} data-testid="input-log-helped" /></Field>
        <Field label="Notes (optional)"><textarea className="pf-area" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} data-testid="input-log-notes" /></Field>
        <ErrorBox error={error} />
        {saved && <p className="pf-tag" style={{ justifySelf: "start" }} data-testid="text-log-saved">Saved</p>}
        <button className="pf-btn primary" disabled={add.isPending} data-testid="button-save-log">{add.isPending ? "Saving..." : "Save log"}</button>
      </form>
      <div className="pf-card">
        <h3>Recent</h3>
        {(logs || []).length === 0 ? (
          <p style={{ color: "var(--pf-ink-soft)", marginTop: 8 }}>Nothing logged yet. After a hard moment, a quick note here helps you spot what works.</p>
        ) : (
          <ul className="pf-list" style={{ marginTop: 12 }}>
            {logs.slice(0, 8).map((l) => (
              <li key={l.id} style={{ display: "block", borderBottom: "1px solid var(--pf-line)", paddingBottom: 8 }} data-testid={`row-log-${l.id}`}>
                <strong>{l.happened ? `${l.intensity}, ${l.duration} min` : "Did not happen"}</strong>
                <span className="pf-hint"> {new Date(l.createdAt).toLocaleString()}</span>
                {l.whatHelped && <p style={{ fontSize: ".88rem" }}>Helped: {l.whatHelped}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
