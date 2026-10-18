import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetClinicianGoalsActivities, getGetClinicianGoalsActivitiesQueryKey,
  useGetCareTeamActivityLibrary, getGetCareTeamActivityLibraryQueryKey,
  createCareTeamGoal, updateCareTeamGoal, createCareTeamAssignment, updateCareTeamAssignment,
} from "@workspace/api-client-react";
import { Plus, MoreHorizontal, Trash2, ArrowUp, ArrowDown, Target, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ActivityGuide } from "@/components/parentfree/PracticePage";
import { CareTeamGoalCard } from "@/components/parentfree/ClinicalGoals";
import { CARE_SKILLS, CARE_MEASUREMENTS, CARE_STATUS_LABELS, CARE_OUTCOME_LABELS, formatDay } from "@/lib/careTeam";
import { readableGoalTitle } from "@/lib/goalTitle";

const STATUS_TONE = {
  draft: "bg-muted text-foreground",
  published: "bg-primary/15 text-primary",
  paused: "bg-amber-100 text-amber-900",
  archived: "bg-muted text-muted-foreground",
};
const SOURCE_LABEL = (source) => source === "care_team" ? "Care team goal" : source === "document" ? "From documents" : source === "manual" ? "Clinician goal" : null;
// Original clinician progress presentation (steps + bar) for goals that track a numeric target.
export function GoalProgress({ goal }) {
  if (goal.progress == null || !(goal.target > 0)) return null;
  const pct = Math.min(100, Math.round((goal.progress / goal.target) * 100));
  const achieved = goal.progress >= goal.target;
  return (
    <div className="mt-2" data-testid={`progress-goal-${goal.id}`}>
      <div className="flex justify-between text-xs text-muted-foreground mb-1"><span>{goal.progress}/{goal.target} steps</span><span>{pct}%</span></div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden"><div className={`h-full rounded-full ${achieved ? "bg-green-600" : "bg-primary"}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export function StatusBadge({ status }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[status] || STATUS_TONE.draft}`} data-testid={`badge-status-${status}`}>{CARE_STATUS_LABELS[status] || status}</span>;
}

// Prefer the server's own message (409 can mean validation, not only concurrency).
export const friendlyError = (e) => {
  const raw = String(e?.message || e || "");
  const data = e?.data || e?.response?.data;
  let serverMsg = typeof data?.error === "string" ? data.error : data?.error?.message || data?.message || "";
  const jsonStart = raw.indexOf("{");
  if (!serverMsg && jsonStart !== -1) { try { const body = JSON.parse(raw.slice(jsonStart)); serverMsg = typeof body?.error === "string" ? body.error : body?.error?.message || body?.message || ""; } catch { /* plain text */ } }
  if (serverMsg) return serverMsg;
  if (/\b409\b/.test(raw)) return "This could not be saved because it changed or conflicts with its current state. Close and reopen to see the latest version.";
  if (/\b403\b/.test(raw)) return "You are not authorized to manage this client.";
  return raw.replace(/^(API error|HTTP) \d+:?\s*/i, "").trim() || "Something went wrong. Please try again.";
};

const Field = ({ label, children, hint }) => (
  <label className="block space-y-1">
    <span className="text-xs font-semibold text-foreground">{label}</span>
    {children}
    {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
  </label>
);
const selectCls = "w-full h-9 rounded-xl border border-input bg-background px-3 text-sm text-foreground";

const emptyGoal = { title: "", description: "", skill: "Communication", measurement: "observation", target: "", milestones: [""], notes: "" };
// Legacy reward_token rows may lack skill/measurement; keep them unset rather than inventing values.
const goalToForm = (g) => ({
  title: g.title || "", description: g.description || "", skill: g.skill || "", measurement: g.measurement || "",
  target: g.target ?? "", milestones: g.milestones?.length ? [...g.milestones] : [""], notes: g.notes || "",
});
export const goalPayload = (form, status, version) => ({
  title: form.title.trim(), description: form.description.trim(),
  ...(form.skill ? { skill: form.skill } : {}), ...(form.measurement ? { measurement: form.measurement } : {}),
  target: form.target === "" || form.target == null ? null : Number(form.target),
  milestones: form.milestones.map((m) => m.trim()).filter(Boolean), notes: form.notes.trim(), ...(status ? { status } : {}),
  ...(version != null ? { expectedVersion: version } : {}),
});
const needsTarget = (m) => ["frequency", "duration", "percentage", "completed_steps"].includes(m);

const emptyActivity = { mode: "library", libraryId: "", goalId: "", schedule: "", title: "", description: "", skill: "Communication", estimatedMinutes: "", materials: "", steps: [""], whyItMayHelp: "", ifDifficult: "", notes: "" };
const activityToForm = (a) => ({
  mode: a.libraryId ? "library" : "custom", libraryId: a.libraryId || "", goalId: a.goalId || "", schedule: a.schedule || "",
  title: a.title || "", description: a.description || "", skill: a.skill || "Other", estimatedMinutes: a.estimatedMinutes ?? "",
  materials: a.materials || "", steps: a.steps?.length ? [...a.steps] : [""], whyItMayHelp: a.whyItMayHelp || "", ifDifficult: a.ifDifficult || "", notes: a.notes || "",
});
// Library assignments reference the definition: steps/instructions are never copied into the save.
const activityPayload = (form, status, version) => ({
  goalId: form.goalId || null, schedule: form.schedule.trim(), status,
  ...(version != null ? { expectedVersion: version } : {}),
  ...(form.mode === "library" ? { libraryId: form.libraryId } : {
    libraryId: null, title: form.title.trim(), description: form.description.trim(), skill: form.skill,
    estimatedMinutes: form.estimatedMinutes === "" ? null : Number(form.estimatedMinutes),
    materials: form.materials.trim(), steps: form.steps.map((s) => s.trim()).filter(Boolean),
    whyItMayHelp: form.whyItMayHelp.trim(), ifDifficult: form.ifDifficult.trim(), notes: form.notes.trim(),
  }),
});

function LinesEditor({ label, items, onChange, placeholder, testid }) {
  const set = (i, v) => onChange(items.map((x, j) => j === i ? v : x));
  const move = (i, d) => { const next = [...items]; [next[i], next[i + d]] = [next[i + d], next[i]]; onChange(next); };
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-semibold text-foreground">{label}</span>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="w-6 text-xs text-muted-foreground text-right">{i + 1}.</span>
          <Input value={item} onChange={(e) => set(i, e.target.value)} placeholder={placeholder} className="rounded-xl h-9" data-testid={`${testid}-${i}`} aria-label={`${label} ${i + 1}`} />
          <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="p-1 text-muted-foreground disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
          <button type="button" aria-label="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)} className="p-1 text-muted-foreground disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
          <button type="button" aria-label="Remove" disabled={items.length === 1} onClick={() => onChange(items.filter((_, j) => j !== i))} className="p-1 text-muted-foreground hover:text-destructive disabled:opacity-30"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      ))}
      <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onChange([...items, ""])} data-testid={`${testid}-add`}><Plus className="w-3 h-3 mr-1" /> Add</Button>
    </div>
  );
}

function FormActions({ busy, canSave, onDraft, onPreview, onPublish, published }) {
  return (
    <div className="flex flex-wrap gap-2 pt-2">
      {!published && <Button type="button" variant="outline" className="rounded-xl" disabled={busy || !canSave} onClick={onDraft} data-testid="button-save-draft">Save Draft</Button>}
      <Button type="button" variant="outline" className="rounded-xl" disabled={!canSave} onClick={onPreview} data-testid="button-preview-parent">Preview as Parent</Button>
      <Button type="button" className="rounded-xl" disabled={busy || !canSave} onClick={onPublish} data-testid="button-publish-parent">{busy ? "Saving..." : published ? "Save Published Changes" : "Publish to Parent"}</Button>
    </div>
  );
}

export function GoalForm({ initial, busy, error, onSubmit, onPreview }) {
  const [form, setForm] = useState(initial ? goalToForm(initial) : emptyGoal);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const targetMissing = needsTarget(form.measurement) && (form.target === "" || form.target == null);
  const canSave = form.title.trim() && form.description.trim() && !targetMissing;
  return (
    <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
      <Field label="Goal Title (required)"><Input value={form.title} onChange={set("title")} maxLength={180} placeholder="Ask for a Break" className="rounded-xl" data-testid="input-care-goal-title" /></Field>
      <Field label="Goal Description (required)"><Textarea value={form.description} onChange={set("description")} rows={3} className="rounded-xl" placeholder="Describe the goal in the words you would use with the family." data-testid="input-care-goal-description" /></Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Related Skill"><select className={selectCls} value={form.skill} onChange={set("skill")} data-testid="select-care-goal-skill"><option value="">Not set</option>{CARE_SKILLS.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Measurement Method"><select className={selectCls} value={form.measurement} onChange={set("measurement")} data-testid="select-care-goal-measurement"><option value="">Not set</option>{CARE_MEASUREMENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
      </div>
      <Field label={needsTarget(form.measurement) ? "Target (required for this method)" : "Target (optional)"}>
        <Input type="number" min={0} value={form.target} onChange={set("target")} className="rounded-xl" data-testid="input-care-goal-target" />
      </Field>
      <LinesEditor label="Milestones" items={form.milestones} onChange={(milestones) => setForm((f) => ({ ...f, milestones }))} placeholder="Optional milestone" testid="input-care-goal-milestone" />
      <Field label="Additional Notes"><Textarea value={form.notes} onChange={set("notes")} rows={2} className="rounded-xl" placeholder="Optional" /></Field>
      {initial && initial.progress != null && <p className="text-[11px] text-muted-foreground">Recorded clinical progress ({initial.progress}{initial.target ? ` of ${initial.target}` : ""}) is kept as is when you save.</p>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <FormActions busy={busy} canSave={canSave} published={initial?.status === "published"}
        onDraft={() => onSubmit(goalPayload(form, initial ? initial.status : "draft", initial?.version))}
        onPreview={() => onPreview({ ...form, id: initial?.id || "preview", milestones: form.milestones.filter((m) => m.trim()), target: form.target === "" ? null : Number(form.target), status: "published" })}
        onPublish={() => onSubmit(goalPayload(form, "published", initial?.version))} />
    </form>
  );
}

export function AssignActivityForm({ initial, library = [], libraryLoading, goals = [], busy, error, onSubmit, onPreview }) {
  const [form, setForm] = useState(initial ? activityToForm(initial) : emptyActivity);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const chosen = library.find((item) => item.id === form.libraryId);
  const canSave = form.mode === "library" ? Boolean(form.libraryId) : Boolean(form.title.trim() && form.steps.some((s) => s.trim()));
  const selectable = goals.filter((g) => g.status !== "archived");
  const previewActivity = () => form.mode === "library" && chosen
    ? { ...chosen, goalId: form.goalId || null }
    : { id: "preview", title: form.title, description: form.description, skill: form.skill, estimatedMinutes: form.estimatedMinutes === "" ? null : Number(form.estimatedMinutes), materials: form.materials, steps: form.steps.filter((s) => s.trim()), whyItMayHelp: form.whyItMayHelp, ifDifficult: form.ifDifficult };
  return (
    <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
      {!initial && <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Activity source">
        {[["library", "Assign an existing activity"], ["custom", "Create a custom activity"]].map(([mode, label]) => (
          <button type="button" key={mode} role="radio" aria-checked={form.mode === mode} onClick={() => setForm((f) => ({ ...f, mode }))}
            className={`rounded-xl border px-3 py-2 text-sm font-medium text-left transition-colors ${form.mode === mode ? "border-primary bg-primary/10 text-foreground" : "border-border text-foreground hover:border-primary/50"}`}
            data-testid={`button-mode-${mode}`}>{label}</button>
        ))}
      </div>}
      {form.mode === "library" ? (
        libraryLoading ? <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />)}</div>
          : library.length === 0 ? <p className="text-sm text-muted-foreground">The activity library is empty. Create a custom activity instead.</p>
            : <div className="max-h-72 overflow-y-auto space-y-2 pr-1" role="radiogroup" aria-label="Activity library">
              {library.map((item) => (
                <button type="button" key={item.id} role="radio" aria-checked={form.libraryId === item.id} onClick={() => setForm((f) => ({ ...f, libraryId: item.id }))}
                  className={`w-full text-left rounded-xl border p-3 transition-colors ${form.libraryId === item.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}
                  data-testid={`library-activity-${item.id}`}>
                  <p className="text-sm font-semibold text-foreground">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{[item.skill, item.estimatedMinutes ? `${item.estimatedMinutes} min` : null, item.source].filter(Boolean).join(" · ")}</p>
                  {item.description && <p className="text-xs text-foreground/80 mt-1 line-clamp-2">{item.description}</p>}
                </button>
              ))}
            </div>
      ) : <>
        <Field label="Activity Title (required)"><Input value={form.title} onChange={set("title")} maxLength={180} placeholder="AAC Break Request Practice" className="rounded-xl" data-testid="input-activity-title" /></Field>
        <Field label="Short Description"><Textarea value={form.description} onChange={set("description")} rows={2} className="rounded-xl" data-testid="input-activity-description" /></Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Related Skill"><select className={selectCls} value={form.skill} onChange={set("skill")} data-testid="select-activity-skill">{CARE_SKILLS.map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Estimated Duration (minutes)"><Input type="number" min={1} max={240} value={form.estimatedMinutes} onChange={set("estimatedMinutes")} className="rounded-xl" data-testid="input-activity-minutes" /></Field>
        </div>
        <Field label="What You'll Need"><Input value={form.materials} onChange={set("materials")} className="rounded-xl" data-testid="input-activity-materials" /></Field>
        <LinesEditor label="Parent Instructions (one step per line)" items={form.steps} onChange={(steps) => setForm((f) => ({ ...f, steps }))} placeholder="Describe one step" testid="input-activity-step" />
        <details className="rounded-xl border border-border p-3">
          <summary className="text-xs font-semibold text-foreground cursor-pointer">More options</summary>
          <div className="space-y-3 mt-3">
            <Field label="Why this helps" hint="Shown to parents as an optional, expandable note. Leave blank if there is nothing specific to add."><Textarea value={form.whyItMayHelp} onChange={set("whyItMayHelp")} rows={2} className="rounded-xl" /></Field>
            <Field label="What to Do if It Becomes Difficult" hint="Must match your existing plan. Do not add crisis procedures here."><Textarea value={form.ifDifficult} onChange={set("ifDifficult")} rows={2} className="rounded-xl" /></Field>
            <Field label="Additional Notes"><Textarea value={form.notes} onChange={set("notes")} rows={2} className="rounded-xl" /></Field>
          </div>
        </details>
      </>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Related Goal"><select className={selectCls} value={form.goalId} onChange={set("goalId")} data-testid="select-activity-goal">
          <option value="">No related goal</option>
          {selectable.map((g) => <option key={g.id} value={g.id}>{readableGoalTitle({ goal_title: g.title, goal_description: g.description })}{g.status !== "published" ? ` (${CARE_STATUS_LABELS[g.status]})` : ""}</option>)}
        </select></Field>
        <Field label="Suggested Schedule (optional)"><Input value={form.schedule} onChange={set("schedule")} maxLength={300} placeholder="A few times this week" className="rounded-xl" data-testid="input-activity-schedule" /></Field>
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <FormActions busy={busy} canSave={canSave} published={initial?.status === "published"}
        onDraft={() => onSubmit(activityPayload(form, initial?.status && initial.status !== "draft" ? initial.status : "draft", initial?.version))}
        onPreview={() => onPreview({ ...previewActivity(), goalTitle: goals.find((g) => g.id === form.goalId)?.title || null })}
        onPublish={() => onSubmit(activityPayload(form, "published", initial?.version))} />
    </form>
  );
}

export default function CareTeamWorkspace({ childId, childName = "your client" }) {
  const qc = useQueryClient();
  const key = getGetClinicianGoalsActivitiesQueryKey(childId);
  const q = useGetClinicianGoalsActivities(childId, { query: { queryKey: key, enabled: !!childId, staleTime: 20_000, refetchInterval: 60_000 } });
  const [panel, setPanel] = useState(null); // {type:"goal"|"activity", record?}
  const [preview, setPreview] = useState(null); // {type, data}
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rowError, setRowError] = useState("");
  const libraryQ = useGetCareTeamActivityLibrary({ query: { queryKey: getGetCareTeamActivityLibraryQueryKey(), enabled: panel?.type === "activity", staleTime: 300_000 } });
  const ws = q.data || { goals: [], assignments: [], recentPractice: [], observations: [] };
  const goals = useMemo(() => ws.goals || [], [ws.goals]);
  const goalTitle = (id) => { const g = goals.find((x) => x.id === id); return g ? readableGoalTitle({ goal_title: g.title, goal_description: g.description }) : null; };

  const save = async (fn) => {
    setBusy(true); setError("");
    try { await fn(); await qc.invalidateQueries({ queryKey: key }); setPanel(null); }
    catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  };
  const submitGoal = (body) => save(() => panel?.record ? updateCareTeamGoal(childId, panel.record.id, body) : createCareTeamGoal(childId, body));
  const submitActivity = (body) => save(() => panel?.record ? updateCareTeamAssignment(childId, panel.record.id, body) : createCareTeamAssignment(childId, body));
  const setGoalStatus = async (g, status) => {
    setRowError("");
    if (!String(g.title || "").trim() || !String(g.description || "").trim()) {
      setError("Add a title and description before changing this goal's status.");
      setPanel({ type: "goal", record: g });
      return;
    }
    try { await updateCareTeamGoal(childId, g.id, goalPayload(goalToForm(g), status, g.version)); await qc.invalidateQueries({ queryKey: key }); }
    catch (e) { setRowError(friendlyError(e)); }
  };
  const setActivityStatus = async (a, status) => {
    setRowError("");
    try { await updateCareTeamAssignment(childId, a.id, activityPayload(activityToForm(a), status, a.version)); await qc.invalidateQueries({ queryKey: key }); }
    catch (e) { setRowError(friendlyError(e)); }
  };
  const statusItems = (status, apply) => [["published", "Publish"], ["paused", "Pause"], ["archived", "Archive"], ["draft", "Move to Draft"]]
    .filter(([s]) => s !== status && !(s === "draft" && status === "archived"))
    .map(([s, label]) => <DropdownMenuItem key={s} onClick={() => apply(s)} data-testid={`menu-${s}`}>{label}</DropdownMenuItem>);
  const open = (type, record) => { setError(""); setPanel({ type, record }); };

  return (
    <section className="space-y-5" aria-labelledby="care-workspace-heading" data-testid="section-care-workspace">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <h2 id="care-workspace-heading" className="font-semibold text-foreground text-sm flex items-center gap-2"><Target className="w-4 h-4 text-primary" /> Goals & Activities</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="rounded-xl h-8 text-xs gap-1.5" onClick={() => open("goal")} data-testid="button-add-care-goal"><Plus className="w-3 h-3" /> Add Goal</Button>
          <Button size="sm" className="rounded-xl h-8 text-xs gap-1.5" onClick={() => open("activity")} data-testid="button-assign-activity"><Plus className="w-3 h-3" /> Assign Activity</Button>
        </div>
      </div>
      {rowError && <p role="alert" className="text-xs text-destructive px-1">{rowError}</p>}

      {q.isLoading ? <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-14 bg-muted rounded-xl animate-pulse" />)}</div>
        : q.isError ? <div className="rounded-xl border border-border p-4 text-sm text-foreground" role="alert">
          Goals & activities could not load. <Button size="sm" variant="outline" className="ml-2 h-7 rounded-lg text-xs" onClick={() => q.refetch()}>Try again</Button></div>
          : <>
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">Goals ({goals.length})</h4>
              {goals.length === 0 ? <div className="text-center py-6 border-2 border-dashed border-border rounded-2xl"><p className="text-xs text-muted-foreground">No goals yet. Add one here, or upload documents and goals are extracted automatically.</p></div>
                : goals.map((g) => (
                  <div key={g.id} className="flex items-start gap-2 bg-card border border-border rounded-xl p-3" data-testid={`row-care-goal-${g.id}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{readableGoalTitle({ goal_title: g.title, goal_description: g.description })}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">{g.source === "document" && <FileText className="w-3 h-3" aria-label="From documents" />}{[SOURCE_LABEL(g.source), g.skill, (g.linkedActivityIds || []).length ? `${g.linkedActivityIds.length} linked ${g.linkedActivityIds.length === 1 ? "activity" : "activities"}` : null].filter(Boolean).join(" · ")}</p>
                      {g.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{g.description}</p>}
                      <GoalProgress goal={g} />
                    </div>
                    {g.status ? <StatusBadge status={g.status} /> : null}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><button type="button" aria-label={`Actions for ${g.title}`} className="p-1 rounded-lg text-muted-foreground hover:text-foreground" data-testid={`menu-care-goal-${g.id}`}><MoreHorizontal className="w-4 h-4" /></button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {g.canEdit && <DropdownMenuItem onClick={() => open("goal", g)}>Edit</DropdownMenuItem>}
                        <DropdownMenuItem onClick={() => setPreview({ type: "goal", data: g })}>Preview</DropdownMenuItem>
                        {g.canEdit && statusItems(g.status, (s) => setGoalStatus(g, s))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">Assigned Activities</h4>
              {ws.assignments.length === 0 ? <p className="text-xs text-muted-foreground px-1">No activities assigned yet.</p> : (
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="hidden sm:grid grid-cols-[1fr_1fr_auto_auto] gap-3 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border">
                    <span>Activity</span><span>Related Goal</span><span>Status</span><span className="w-6" />
                  </div>
                  {ws.assignments.map((a) => (
                    <div key={a.id} className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_1fr_auto_auto] gap-3 items-center px-3 py-2.5 border-b border-border last:border-0" data-testid={`row-assignment-${a.id}`}>
                      <div className="min-w-0"><p className="text-sm font-medium text-foreground truncate">{a.title}</p><p className="text-xs text-muted-foreground sm:hidden">{a.goalTitle || goalTitle(a.goalId) || "No related goal"}</p></div>
                      <p className="hidden sm:block text-sm text-foreground truncate">{a.goalTitle || goalTitle(a.goalId) || "No related goal"}</p>
                      <StatusBadge status={a.status} />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><button type="button" aria-label={`Actions for ${a.title}`} className="p-1 rounded-lg text-muted-foreground hover:text-foreground" data-testid={`menu-assignment-${a.id}`}><MoreHorizontal className="w-4 h-4" /></button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setPreview({ type: "activity", data: a })}>View</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => open("activity", a)}>Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setPreview({ type: "activity", data: a })}>Preview</DropdownMenuItem>
                          {statusItems(a.status, (s) => setActivityStatus(a, s))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">Recent Practice</h4>
              {ws.recentPractice.length === 0 ? <p className="text-xs text-muted-foreground px-1">No practice updates from the family yet.</p>
                : ws.recentPractice.map((p) => (
                  <article key={p.id} className="bg-card border border-border rounded-xl p-3" data-testid={`row-practice-${p.id}`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">{p.title}</p>
                      <time className="text-xs text-muted-foreground">{formatDay(p.createdAt)}</time>
                    </div>
                    <p className="text-xs text-foreground mt-1"><span className="font-semibold">Status:</span> {CARE_OUTCOME_LABELS[p.outcome] || p.outcome}</p>
                    {p.note && <p className="text-xs text-foreground mt-0.5"><span className="font-semibold">Parent note:</span> {p.note}</p>}
                    {(p.goalTitle || goalTitle(p.goalId)) && <p className="text-xs text-muted-foreground mt-0.5">Related goal: {p.goalTitle || goalTitle(p.goalId)}</p>}
                    <p className="text-[11px] text-muted-foreground mt-0.5">Instructions version {p.version}</p>
                  </article>
                ))}
              <p className="text-[11px] text-muted-foreground px-1">Practice updates are descriptive caregiver reports and do not change goal progress. Updates from independent parent accounts appear only while the family is sharing observations with your clinic.</p>
            </div>

            {ws.observations?.length > 0 && <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">Shared Parent Observations</h4>
              {ws.observations.map((o) => (
                <article key={o.id} className="bg-card border border-border rounded-xl p-3" data-testid={`row-observation-${o.id}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">{o.behavior || "Observation"}</p>
                    <time className="text-xs text-muted-foreground">{formatDay(o.createdAt)}</time>
                  </div>
                  {o.intensity && <p className="text-xs text-muted-foreground">Intensity: {o.intensity}</p>}
                  {o.notes && <p className="text-xs text-foreground mt-0.5">{o.notes}</p>}
                </article>
              ))}
            </div>}
          </>}

      <Dialog open={Boolean(panel)} onOpenChange={(v) => { if (!v) setPanel(null); }}>
        <DialogContent className="max-w-xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{panel?.type === "goal" ? (panel.record ? "Edit Goal" : "Add Goal") : (panel?.record ? "Edit Activity" : "Assign Activity")}</DialogTitle>
            <DialogDescription>For {childName}. Drafts stay hidden from the family until published.</DialogDescription>
          </DialogHeader>
          {panel?.type === "goal" && <GoalForm key={panel.record?.id || "new"} initial={panel.record} busy={busy} error={error} onSubmit={submitGoal} onPreview={(data) => setPreview({ type: "goal", data })} />}
          {panel?.type === "activity" && <AssignActivityForm key={panel.record?.id || "new"} initial={panel.record} library={libraryQ.data || []} libraryLoading={libraryQ.isLoading}
            goals={goals} busy={busy} error={error} onSubmit={submitActivity} onPreview={(data) => setPreview({ type: "activity", data })} />}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(preview)} onOpenChange={(v) => { if (!v) setPreview(null); }}>
        <DialogContent className="max-w-xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview as Parent</DialogTitle>
            <DialogDescription>This is what the family will see. Nothing is saved from this preview.</DialogDescription>
          </DialogHeader>
          <div className="pf">
            {preview?.type === "goal" && <CareTeamGoalCard goal={preview.data} childId={childId} assignments={ws.assignments.filter((a) => a.goalId === preview.data.id)} practice={[]} />}
            {preview?.type === "activity" && <div className="np-practice"><ActivityGuide preview assigned requireOutcome activity={preview.data} childName={childName}
              relatedGoal={preview.data.goalTitle || goalTitle(preview.data.goalId)} onExit={() => setPreview(null)} onSkip={() => setPreview(null)} /></div>}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
