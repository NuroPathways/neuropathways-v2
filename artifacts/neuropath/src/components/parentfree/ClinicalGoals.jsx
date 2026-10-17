import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetParentGoals, getGetParentGoalsQueryKey, useCreateParentGoal, useUpdateParentGoal, useDeleteParentGoal } from "@workspace/api-client-react";
import { parentRequest } from "@/lib/parentSession";
import { ErrorBox, Skeleton, errMsg } from "./common";

function GoalForm({ initial, busy, onSave, onCancel, idPrefix }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [target, setTarget] = useState(String(initial?.target ?? 10));
  return (
    <form style={{ display: "grid", gap: 8, marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); if (title.trim()) onSave({ title: title.trim(), description: description.trim(), target: Math.max(1, Number(target) || 1) }); }}>
      <label htmlFor={`${idPrefix}-title`}>Goal</label>
      <input id={`${idPrefix}-title`} className="pf-input" maxLength={180} required value={title} onChange={(e) => setTitle(e.target.value)} data-testid={`input-${idPrefix}-title`} />
      <label htmlFor={`${idPrefix}-desc`}>Details (optional)</label>
      <textarea id={`${idPrefix}-desc`} className="pf-input" maxLength={3000} value={description} onChange={(e) => setDescription(e.target.value)} data-testid={`input-${idPrefix}-description`} />
      <label htmlFor={`${idPrefix}-target`}>Times to practice</label>
      <input id={`${idPrefix}-target`} className="pf-input" type="number" min={1} max={10000} value={target} onChange={(e) => setTarget(e.target.value)} data-testid={`input-${idPrefix}-target`} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="submit" className="pf-btn small primary" disabled={busy || !title.trim()} data-testid={`button-${idPrefix}-save`}>{busy ? "Saving..." : "Save goal"}</button>
        <button type="button" className="pf-btn small" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

export default function ClinicalGoals({ childId, childName, dailyActions = [] }) {
  const qc = useQueryClient();
  const req = parentRequest();
  const key = getGetParentGoalsQueryKey(childId);
  const q = useGetParentGoals(childId, { query: { queryKey: key, enabled: !!childId }, request: req });
  const create = useCreateParentGoal({ request: req });
  const update = useUpdateParentGoal({ request: req });
  const remove = useDeleteParentGoal({ request: req });
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [error, setError] = useState("");
  const done = { onSuccess: () => { setAdding(false); setEditId(null); setConfirmId(null); qc.invalidateQueries({ queryKey: key }); }, onError: (e) => setError(errMsg(e)) };
  const goals = q.data || [];
  const clinical = goals.filter((g) => g.createdByClinician);
  const family = goals.filter((g) => !g.createdByClinician);
  const busy = create.isPending || update.isPending || remove.isPending;

  const renderGoal = (g) => {
    const pct = g.target > 0 ? Math.min(100, Math.round((g.progress / g.target) * 100)) : 0;
    const acts = dailyActions.filter((a) => a.goalId ? a.goalId === g.id : (a.behaviorName && a.behaviorName.trim().toLowerCase() === g.title.trim().toLowerCase()));
    return (
      <article key={g.id} className="pf-card" data-testid={`goal-item-${g.id}`}>
        <span className="pf-tag">{g.createdByClinician ? "Set by your care team" : "Family goal"}</span>
        <h4 style={{ marginTop: 6, wordBreak: "break-word" }}>{g.title}</h4>
        {g.description && <p className="pf-hint" style={{ marginTop: 4 }}>{g.description}</p>}
        <div style={{ marginTop: 10 }}>
          <p className="pf-hint" data-testid={`text-goal-progress-${g.id}`}>{g.createdByClinician ? "Clinical progress" : "Practice recorded"}: {g.progress} of {g.target}</p>
          <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${g.title} progress`} style={{ height: 8, borderRadius: 8, background: "var(--pf-line)", overflow: "hidden", marginTop: 4 }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "var(--pf-sage, currentColor)" }} />
          </div>
        </div>
        {acts.length > 0 && <ul className="pf-list" style={{ marginTop: 10 }}>{acts.map((a) => (
          <li key={a.id}><a href={`/ParentHome?tab=practice&activity_id=${encodeURIComponent(a.id)}&child_id=${encodeURIComponent(childId)}`} data-testid={`goal-activity-link-${a.id}`}>Practice: {a.title}</a></li>
        ))}</ul>}
        {editId === g.id ? (
          <GoalForm idPrefix={`edit-goal-${g.id}`} initial={g} busy={busy} onCancel={() => setEditId(null)} onSave={(data) => update.mutate({ childId, goalId: g.id, data }, done)} />
        ) : (g.canEdit || g.canDelete) && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {g.canEdit && !g.createdByClinician && <button type="button" className="pf-btn small" disabled={busy || g.progress >= g.target} onClick={() => update.mutate({ childId, goalId: g.id, data: { progress: g.progress + 1 } }, done)} data-testid={`button-goal-plus-${g.id}`}>Record one practice</button>}
            {g.canEdit && <button type="button" className="pf-btn small" onClick={() => setEditId(g.id)} data-testid={`button-goal-edit-${g.id}`}>Edit</button>}
            {g.canDelete && (confirmId === g.id ? <>
              <button type="button" className="pf-btn small" style={{ color: "#7a2d12" }} disabled={busy} onClick={() => remove.mutate({ childId, goalId: g.id }, done)} data-testid={`button-goal-confirm-delete-${g.id}`}>Confirm remove</button>
              <button type="button" className="pf-btn small" onClick={() => setConfirmId(null)}>Keep</button>
            </> : <button type="button" className="pf-btn small" onClick={() => setConfirmId(g.id)} data-testid={`button-goal-delete-${g.id}`}>Remove</button>)}
          </div>
        )}
      </article>
    );
  };

  return (
    <section style={{ display: "grid", gap: 14 }} aria-labelledby="clinical-goals-heading" data-testid="section-parent-goals">
      <div className="pf-card sage">
        <p className="pf-eyebrow">Goals</p>
        <h3 id="clinical-goals-heading" style={{ marginTop: 4 }}>Goals for {childName || "your child"}</h3>
        <p className="pf-hint" style={{ marginTop: 6 }}>Care team goals show clinical progress recorded by your clinician. Family goals track the practice you observe at home and do not change clinical progress.</p>
      </div>
      <ErrorBox error={error} />
      {q.isLoading ? <Skeleton h={120} /> : q.isError ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : <>
        <div style={{ display: "grid", gap: 10 }} data-testid="group-clinical-goals">
          <h4>Clinical progress</h4>
          {clinical.length ? clinical.map(renderGoal) : <p className="pf-hint" data-testid="empty-clinical-goals">No care team goals have been shared yet.</p>}
        </div>
        <div style={{ display: "grid", gap: 10 }} data-testid="group-family-goals">
          <h4>Observation and participation</h4>
          {family.length ? family.map(renderGoal) : <p className="pf-hint" data-testid="empty-family-goals">No family goals yet. Add one to track practice at home.</p>}
          {adding ? <div className="pf-card"><GoalForm idPrefix="new-goal" busy={busy} onCancel={() => setAdding(false)} onSave={(data) => create.mutate({ childId, data }, done)} /></div>
            : <button type="button" className="pf-btn small ink" style={{ justifySelf: "start" }} onClick={() => { setAdding(true); setError(""); }} data-testid="button-new-family-goal">Add a family goal</button>}
        </div>
      </>}
    </section>
  );
}
