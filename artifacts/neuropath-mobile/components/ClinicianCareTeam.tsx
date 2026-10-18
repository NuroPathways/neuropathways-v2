import React, { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCareTeamAssignment, createCareTeamGoal, getCareTeamActivityLibrary, getClinicianGoalsActivities,
  getGetCareTeamActivityLibraryQueryKey, getGetClinicianGoalsActivitiesQueryKey, updateCareTeamAssignment, updateCareTeamGoal,
} from "@workspace/api-client-react";
import type { CareActivity, CareAssignmentInput, CareGoal, CareGoalInput, CareGoalInputMeasurement, CareStatus } from "@workspace/api-client-react";
import { Btn, Card, Chip, ErrorBox, Field, Skeleton, T, msg } from "@/components/ParentUi";
import { ActivityGuide, type GuideItem } from "@/components/ActivityGuide";
import { CareTeamGoals } from "@/components/CareTeamGoals";
import { useColors } from "@/hooks/useColors";
import { getAuthHeaders } from "@/lib/api";
import { usefulWhy } from "@/lib/careTeam";

// Clinician bearer token is read from the existing mobile auth adapter per request; never stored in component state.
const auth = async () => ({ headers: await getAuthHeaders() });

const SKILLS = ["Communication", "Transitions", "Daily Living", "Emotional Regulation", "Safety", "Other"];
const MEASURES: { value: CareGoalInputMeasurement; label: string }[] = [
  { value: "frequency", label: "Frequency" }, { value: "duration", label: "Duration" },
  { value: "percentage", label: "% of opportunities" }, { value: "completed_steps", label: "Completed steps" },
  { value: "clinician_defined", label: "Clinician-defined" }, { value: "observation", label: "Observation only" },
];
const OUTCOME: Record<string, string> = { tried: "We tried it", needed_support: "We needed support", not_tried: "Didn't get a chance" };
const STATUS_LABEL: Record<string, string> = { draft: "Draft", published: "Published", paused: "Paused", archived: "Archived" };
const dateText = (v: string) => (Number.isNaN(Date.parse(v)) ? "" : new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }));
const dedupe = <T extends { id: string }>(rows: T[]) => [...new Map(rows.map((r) => [r.id, r])).values()];

type GoalForm = { id?: string; version?: number; title: string; description: string; skill: string; measurement: CareGoalInputMeasurement | ""; target: string; milestones: string; notes: string };
type ActForm = {
  id?: string; version?: number; mode: "library" | "custom"; libraryId: string | null; goalId: string | null; title: string; description: string;
  skill: string; minutes: string; materials: string; steps: string[]; why: string; ifDifficult: string; notes: string; schedule: string;
};
type Mode = { kind: "list" } | { kind: "goal"; form: GoalForm } | { kind: "activity"; form: ActForm } | { kind: "previewGoal"; goal: CareGoal; back: Mode } | { kind: "previewActivity"; item: GuideItem; back: Mode };

const emptyGoal = (): GoalForm => ({ title: "", description: "", skill: "", measurement: "", target: "", milestones: "", notes: "" });
const emptyAct = (): ActForm => ({ mode: "library", libraryId: null, goalId: null, title: "", description: "", skill: "", minutes: "", materials: "", steps: [""], why: "", ifDifficult: "", notes: "", schedule: "" });
const goalToForm = (g: CareGoal): GoalForm => ({
  id: g.id, version: g.version, title: g.title, description: g.description, skill: g.skill ?? "", measurement: g.measurement ?? "",
  target: g.target == null ? "" : String(g.target), milestones: (g.milestones ?? []).join("\n"), notes: g.notes ?? "",
});
const actToForm = (a: CareActivity): ActForm => ({
  id: a.id, version: a.version, mode: a.libraryId ? "library" : "custom", libraryId: a.libraryId ?? null, goalId: a.goalId ?? null,
  title: a.title, description: a.description, skill: a.skill, minutes: a.estimatedMinutes ? String(a.estimatedMinutes) : "", materials: a.materials ?? "",
  steps: a.steps.length ? a.steps : [""], why: a.whyItMayHelp ?? "", ifDifficult: a.ifDifficult ?? "", notes: a.notes ?? "", schedule: a.schedule ?? "",
});
function goalInput(f: GoalForm, status: CareStatus): CareGoalInput | string {
  if (!f.title.trim()) return "Goal title is required.";
  if (!f.description.trim()) return "Goal description is required.";
  const target = f.target.trim() === "" ? null : Number(f.target);
  if (target != null && (!Number.isFinite(target) || target < 0)) return "Target must be a number of 0 or more.";
  if (f.measurement === "completed_steps" && !(target != null && target > 0)) return "Completed steps needs a target greater than 0.";
  return {
    title: f.title.trim(), description: f.description.trim(), skill: f.skill || undefined, ...(f.measurement ? { measurement: f.measurement } : {}),
    target, milestones: f.milestones.split("\n").map((m) => m.trim()).filter(Boolean), notes: f.notes.trim(), status,
    ...(f.version != null ? { expectedVersion: f.version } : {}),
  };
}
function actInput(f: ActForm, status: CareStatus): CareAssignmentInput | string {
  const base = { goalId: f.goalId, schedule: f.schedule.trim(), status, ...(f.version != null ? { expectedVersion: f.version } : {}) };
  if (f.mode === "library") return f.libraryId ? { ...base, libraryId: f.libraryId } : "Choose an activity from the library.";
  const steps = f.steps.map((s) => s.trim()).filter(Boolean);
  if (!f.title.trim()) return "Activity title is required.";
  if (!f.skill) return "Choose a related skill.";
  if (!steps.length) return "Add at least one parent instruction step.";
  const minutes = f.minutes.trim() ? Number(f.minutes) : null;
  if (minutes != null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 180)) return "Duration must be 1 to 180 minutes.";
  return {
    ...base, libraryId: null, title: f.title.trim(), description: f.description.trim(), skill: f.skill, estimatedMinutes: minutes,
    materials: f.materials.trim(), steps, whyItMayHelp: f.why.trim(), ifDifficult: f.ifDifficult.trim(), notes: f.notes.trim(),
  };
}
const toGuide = (a: Pick<CareActivity, "id" | "title" | "skill" | "description" | "steps"> & Partial<CareActivity>, goalTitle: string | null): GuideItem => ({
  kind: "care", id: a.id, title: a.title, skill: a.skill, minutes: a.estimatedMinutes ?? null, description: a.description, materials: a.materials ?? "",
  steps: a.steps, why: usefulWhy(a.whyItMayHelp), ifDifficult: a.ifDifficult ?? "", notes: a.notes ?? "", goalTitle, assigned: true,
  source: "Assigned by your care team", step: 0, finished: false, closed: false, bookmarked: false,
});

export function ClinicianCareTeam({ childId, childName }: { childId: string; childName: string }) {
  const c = useColors();
  const qc = useQueryClient();
  const key = getGetClinicianGoalsActivitiesQueryKey(childId);
  const q = useQuery({ queryKey: key, queryFn: async () => getClinicianGoalsActivities(childId, await auth()), enabled: !!childId });
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const goals = useMemo(() => dedupe(q.data?.goals ?? []).filter((g) => g.childId === childId), [q.data, childId]);
  const assignments = useMemo(() => dedupe(q.data?.assignments ?? []).filter((a) => a.childId === childId), [q.data, childId]);
  const practice = useMemo(() => dedupe(q.data?.recentPractice ?? []).filter((p) => p.childId === childId), [q.data, childId]);
  const goalTitle = (id?: string | null) => goals.find((g) => g.id === id)?.title ?? null;

  const run = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true); setError("");
    try { await fn(); await qc.invalidateQueries({ queryKey: key }); after?.(); }
    catch (e) { setError(msg(e, "Could not save. Please try again.")); }
    finally { setBusy(false); }
  };
  const saveGoal = (f: GoalForm, status: CareStatus) => {
    const input = goalInput(f, status);
    if (typeof input === "string") { setError(input); return; }
    void run(async () => (f.id ? updateCareTeamGoal(childId, f.id, input, await auth()) : createCareTeamGoal(childId, input, await auth())), () => setMode({ kind: "list" }));
  };
  const setGoalStatus = (g: CareGoal, status: CareStatus) => saveGoal(goalToForm(g), status);
  const saveAct = (f: ActForm, status: CareStatus) => {
    const input = actInput(f, status);
    if (typeof input === "string") { setError(input); return; }
    void run(async () => (f.id ? updateCareTeamAssignment(childId, f.id, input, await auth()) : createCareTeamAssignment(childId, input, await auth())), () => setMode({ kind: "list" }));
  };
  const setActStatus = (a: CareActivity, status: CareStatus) => { setMenu(null); saveAct(actToForm(a), status); };

  if (q.isLoading) return <Skeleton lines={5} />;
  if (q.isError) return <ErrorBox message={msg(q.error, "Goals & Activities could not load.")} onRetry={() => void q.refetch()} />;

  if (mode.kind === "previewGoal") return <View style={{ gap: 12 }}>
    <BackLink label="Back to editing" onPress={() => setMode(mode.back)} />
    <View style={{ padding: 10, borderRadius: 10, backgroundColor: c.muted }}><T size={12} weight="semi">Parent preview · nothing is saved</T></View>
    <CareTeamGoals preview goals={[mode.goal]} assignments={assignments.filter((a) => a.goalId === mode.goal.id)} />
  </View>;
  if (mode.kind === "previewActivity") return <ActivityGuide preview item={mode.item} childName={childName} onExit={() => setMode(mode.back)}
    onStep={async () => undefined} onSaveForLater={async () => undefined} onFeedback={async () => setMode(mode.back)} />;

  if (mode.kind === "goal") {
    const f = mode.form; const set = (p: Partial<GoalForm>) => setMode({ kind: "goal", form: { ...f, ...p } });
    const draftGoal = (): CareGoal | null => {
      const input = goalInput(f, "published");
      if (typeof input === "string") { setError(input); return null; }
      return { ...input, id: f.id ?? "preview", childId, version: f.version ?? 0, status: "published", source: "care_team" };
    };
    return <View style={{ gap: 12 }}>
      <BackLink label="Goals & Activities" onPress={() => { setError(""); setMode({ kind: "list" }); }} />
      <T size={20} weight="bold">{f.id ? "Edit goal" : "Add goal"}</T>
      <T size={13} color={c.secondary}>For {childName}. New goals start as drafts and stay hidden from parents until published.</T>
      <Field label="Goal title *" value={f.title} onChangeText={(v) => set({ title: v })} maxLength={180} placeholder="Ask for a Break" />
      <Field label="Goal description *" value={f.description} onChangeText={(v) => set({ description: v })} multiline maxLength={4000} />
      <Picker label="Related skill" options={SKILLS.map((s) => ({ value: s, label: s }))} value={f.skill} onChange={(v) => set({ skill: v === f.skill ? "" : v })} />
      <Picker label="Measurement method" options={MEASURES} value={f.measurement} onChange={(v) => set({ measurement: v === f.measurement ? "" : v as CareGoalInputMeasurement })} />
      <Field label={f.measurement === "completed_steps" ? "Target *" : "Target"} value={f.target} onChangeText={(v) => set({ target: v })} keyboardType="numeric" />
      <Field label="Milestones" hint="One per line" value={f.milestones} onChangeText={(v) => set({ milestones: v })} multiline />
      <Field label="Additional notes" value={f.notes} onChangeText={(v) => set({ notes: v })} multiline maxLength={4000} />
      {error ? <ErrorBox message={error} /> : null}
      <Btn kind="ghost" icon="eye" label="Preview as Parent" onPress={() => { const g = draftGoal(); if (g) { setError(""); setMode({ kind: "previewGoal", goal: g, back: mode }); } }} />
      <Btn kind="ghost" icon="save" label="Save Draft" loading={busy} onPress={() => saveGoal(f, "draft")} />
      <Btn icon="send" label="Publish to Parent" loading={busy} onPress={() => saveGoal(f, "published")} />
    </View>;
  }

  if (mode.kind === "activity") return <ActivityEditor form={mode.form} goals={goals} childName={childName} busy={busy} error={error}
    onChange={(form) => setMode({ kind: "activity", form })} onCancel={() => { setError(""); setMode({ kind: "list" }); }} onError={setError}
    onPreview={(item) => { setError(""); setMode({ kind: "previewActivity", item, back: mode }); }} onSave={saveAct} />;

  return <View style={{ gap: 14 }}>
    <View style={{ gap: 4 }}>
      <T size={20} weight="bold">Goals & Activities</T>
      <T size={13} color={c.secondary}>Published items appear in {childName}'s family Practice and Goals pages.</T>
    </View>
    <View style={{ flexDirection: "row", gap: 10 }}>
      <View style={{ flex: 1 }}><Btn icon="plus" label="Add Goal" onPress={() => { setError(""); setMode({ kind: "goal", form: emptyGoal() }); }} /></View>
      <View style={{ flex: 1 }}><Btn icon="plus" label="Assign Activity" onPress={() => { setError(""); setMode({ kind: "activity", form: emptyAct() }); }} /></View>
    </View>
    {error ? <ErrorBox message={error} /> : null}

    <T size={16} weight="bold">Goals</T>
    {goals.length ? goals.map((g) => <Card key={g.id}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <T size={15} weight="bold" style={{ flex: 1 }}>{g.title}</T><StatusBadge status={g.status} />
      </View>
      {g.skill ? <T size={12} color={c.secondary}>{g.skill}</T> : null}
      <T size={13} color={c.secondary}>{g.description.length > 140 ? `${g.description.slice(0, 137)}...` : g.description}</T>
      <ActionRow open={menu === `g:${g.id}`} onToggle={() => setMenu(menu === `g:${g.id}` ? null : `g:${g.id}`)} busy={busy}
        actions={[
          ...(g.canEdit !== false ? [{ label: "Edit", onPress: () => { setMenu(null); setMode({ kind: "goal", form: goalToForm(g) }); } }] : []),
          { label: "Preview", onPress: () => { setMenu(null); setMode({ kind: "previewGoal", goal: g, back: { kind: "list" } }); } },
          ...(g.canEdit !== false ? statusActions(g.status).map((s) => ({ label: s.label, onPress: () => { setMenu(null); setGoalStatus(g, s.status); } })) : []),
        ]} />
      {g.canEdit === false ? <T size={11} color={c.secondary}>Read only · managed by another clinician</T> : null}
    </Card>) : <Card><T size={14} color={c.secondary}>No goals yet. Add one to share it with the family once published.</T></Card>}

    <T size={16} weight="bold">Assigned Activities</T>
    {assignments.length ? assignments.map((a) => <Card key={a.id}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <T size={15} weight="bold" style={{ flex: 1 }}>{a.title}</T><StatusBadge status={a.status} />
      </View>
      <T size={12} color={c.secondary}>{[a.goalTitle ?? goalTitle(a.goalId) ?? "No linked goal", a.skill, a.libraryId ? "Library activity" : "Custom", `v${a.version}`].join(" · ")}</T>
      <ActionRow open={menu === `a:${a.id}`} onToggle={() => setMenu(menu === `a:${a.id}` ? null : `a:${a.id}`)} busy={busy}
        actions={[
          { label: "View", onPress: () => { setMenu(null); setMode({ kind: "previewActivity", item: toGuide(a, a.goalTitle ?? goalTitle(a.goalId)), back: { kind: "list" } }); } },
          { label: "Edit", onPress: () => { setMenu(null); setMode({ kind: "activity", form: actToForm(a) }); } },
          ...statusActions(a.status).map((s) => ({ label: s.label, onPress: () => setActStatus(a, s.status) })),
        ]} />
    </Card>) : <Card><T size={14} color={c.secondary}>No activities assigned yet.</T></Card>}

    <T size={16} weight="bold">Recent Practice</T>
    <T size={12} color={c.secondary}>Descriptive parent updates. They do not change goal progress.</T>
    {practice.length ? practice.map((p) => <Card key={p.id}>
      <T size={15} weight="bold">{p.title}</T>
      <T size={12} color={c.secondary}>{[dateText(p.createdAt), `instructions v${p.version}`, p.goalTitle ? `Goal: ${p.goalTitle}` : null].filter(Boolean).join(" · ")}</T>
      <T size={14}>Status: {OUTCOME[p.outcome] ?? p.outcome}</T>
      {p.note ? <T size={14} color={c.secondary}>Parent note: "{p.note}"</T> : null}
    </Card>) : <Card><T size={14} color={c.secondary}>No practice updates recorded yet.</T></Card>}

    {(q.data?.observations ?? []).length ? <>
      <T size={16} weight="bold">Shared Observations</T>
      <T size={12} color={c.secondary}>Only observations the family has chosen to share.</T>
      {dedupe(q.data?.observations ?? []).map((o) => <Card key={o.id}>
        <T size={14} weight="semi">{o.behavior || "Observation"}</T>
        <T size={12} color={c.secondary}>{[dateText(o.createdAt), o.intensity ? `${o.intensity} intensity` : null].filter(Boolean).join(" · ")}</T>
        {o.notes ? <T size={13}>{o.notes}</T> : null}
      </Card>)}
    </> : null}
  </View>;
}

function statusActions(status: string): { label: string; status: CareStatus }[] {
  return [
    ...(status !== "published" ? [{ label: "Publish", status: "published" as const }] : []),
    ...(status === "published" ? [{ label: "Pause", status: "paused" as const }] : []),
    ...(status !== "archived" ? [{ label: "Archive", status: "archived" as const }] : []),
  ];
}

function ActivityEditor({ form: f, goals, childName, busy, error, onChange, onCancel, onPreview, onSave, onError }: {
  form: ActForm; goals: CareGoal[]; childName: string; busy: boolean; error: string; onChange: (f: ActForm) => void; onCancel: () => void;
  onPreview: (item: GuideItem) => void; onSave: (f: ActForm, s: CareStatus) => void; onError: (m: string) => void;
}) {
  const c = useColors();
  const set = (p: Partial<ActForm>) => onChange({ ...f, ...p });
  const lib = useQuery({ queryKey: getGetCareTeamActivityLibraryQueryKey(), queryFn: async () => getCareTeamActivityLibrary(await auth()), enabled: f.mode === "library", staleTime: 300_000 });
  const goalName = goals.find((g) => g.id === f.goalId)?.title ?? null;
  const selected = lib.data?.find((a) => a.id === f.libraryId);
  const preview = () => {
    if (f.mode === "library") {
      if (!selected) { onError("Choose an activity from the library."); return; }
      onPreview(toGuide(selected, goalName)); return;
    }
    const input = actInput(f, "draft");
    if (typeof input === "string") { onError(input); return; }
    onPreview(toGuide({ id: f.id ?? "preview", title: input.title ?? "", skill: input.skill ?? "", description: input.description ?? "", steps: input.steps ?? [],
      estimatedMinutes: input.estimatedMinutes, materials: input.materials, whyItMayHelp: input.whyItMayHelp, ifDifficult: input.ifDifficult, notes: input.notes }, goalName));
  };
  const editingExisting = !!f.id;
  return <View style={{ gap: 12 }}>
    <BackLink label="Goals & Activities" onPress={onCancel} />
    <T size={20} weight="bold">{editingExisting ? "Edit activity" : "Assign activity"}</T>
    <T size={13} color={c.secondary}>For {childName}. Saved as a draft until you publish.</T>
    {!editingExisting ? <View style={{ flexDirection: "row", gap: 8 }}>
      <Chip label="From library" selected={f.mode === "library"} onPress={() => set({ mode: "library" })} />
      <Chip label="Create custom" selected={f.mode === "custom"} onPress={() => set({ mode: "custom" })} />
    </View> : null}
    {f.mode === "library" ? (lib.isLoading ? <Skeleton lines={3} /> : lib.isError ? <ErrorBox message={msg(lib.error, "Activity library could not load.")} onRetry={() => void lib.refetch()} />
      : editingExisting ? <Card><T size={14} weight="semi">{f.title}</T><T size={12} color={c.secondary}>Library activity · instructions come from the library and are not copied.</T></Card>
      : (lib.data ?? []).map((a) => <Pressable key={a.id} accessibilityRole="radio" accessibilityState={{ selected: f.libraryId === a.id }} onPress={() => set({ libraryId: a.id })}
        style={{ padding: 12, borderRadius: 12, borderWidth: f.libraryId === a.id ? 2 : 1, borderColor: f.libraryId === a.id ? c.primary : c.border, backgroundColor: c.card, gap: 3 }}>
        <T size={15} weight="semi">{a.title}</T>
        <T size={12} color={c.secondary}>{[a.skill, a.estimatedMinutes ? `${a.estimatedMinutes} min` : null, a.source].filter(Boolean).join(" · ")}</T>
        <T size={13} color={c.secondary}>{a.description}</T>
      </Pressable>)) : <>
      <Field label="Activity title *" value={f.title} onChangeText={(v) => set({ title: v })} maxLength={180} />
      <Field label="Short description" value={f.description} onChangeText={(v) => set({ description: v })} multiline maxLength={2000} />
      <Picker label="Related skill *" options={SKILLS.map((s) => ({ value: s, label: s }))} value={f.skill} onChange={(v) => set({ skill: v })} />
      <Field label="Estimated duration (minutes)" value={f.minutes} onChangeText={(v) => set({ minutes: v })} keyboardType="number-pad" />
      <Field label="What you'll need" value={f.materials} onChangeText={(v) => set({ materials: v })} multiline maxLength={2000} />
      <T size={14} weight="semi">Parent instructions *</T>
      {f.steps.map((s, i) => <View key={i} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}><Field label={`Step ${i + 1}`} value={s} onChangeText={(v) => set({ steps: f.steps.map((x, j) => (j === i ? v : x)) })} multiline maxLength={2000} /></View>
        {f.steps.length > 1 ? <Pressable accessibilityRole="button" accessibilityLabel={`Remove step ${i + 1}`} onPress={() => set({ steps: f.steps.filter((_, j) => j !== i) })} style={{ padding: 10, marginTop: 26 }}>
          <Feather name="trash-2" size={16} color={c.destructive} /></Pressable> : null}
      </View>)}
      {f.steps.length < 40 ? <Btn kind="ghost" icon="plus" label="Add step" onPress={() => set({ steps: [...f.steps, ""] })} /> : null}
      <Field label="What to do if it becomes difficult" value={f.ifDifficult} onChangeText={(v) => set({ ifDifficult: v })} multiline maxLength={2000} hint="Use only your existing plan's guidance." />
      <Field label="Why this helps (optional)" value={f.why} onChangeText={(v) => set({ why: v })} multiline maxLength={2000} />
      <Field label="Additional notes" value={f.notes} onChangeText={(v) => set({ notes: v })} multiline maxLength={4000} />
    </>}
    <Picker label="Related goal" options={[{ value: "", label: "No goal" }, ...goals.filter((g) => g.status !== "archived").map((g) => ({ value: g.id, label: g.title }))]}
      value={f.goalId ?? ""} onChange={(v) => set({ goalId: v || null })} />
    <Field label="Suggested schedule (optional)" value={f.schedule} onChangeText={(v) => set({ schedule: v })} maxLength={300} placeholder="e.g. After school, 3 times a week" />
    {error ? <ErrorBox message={error} /> : null}
    <Btn kind="ghost" icon="eye" label="Preview as Parent" onPress={preview} />
    <Btn kind="ghost" icon="save" label="Save Draft" loading={busy} onPress={() => onSave(f, "draft")} />
    <Btn icon="send" label="Publish to Parent" loading={busy} onPress={() => onSave(f, "published")} />
  </View>;
}

function Picker({ label, options, value, onChange }: { label: string; options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return <View style={{ gap: 6 }}>
    <T size={14} weight="semi">{label}</T>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>{options.map((o) => <Chip key={o.value || "none"} label={o.label} selected={value === o.value} onPress={() => onChange(o.value)} />)}</View>
  </View>;
}

function StatusBadge({ status }: { status: string }) {
  const c = useColors();
  const color = status === "published" ? c.primary : status === "archived" ? c.secondary : c.foreground;
  return <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1, borderColor: color, alignSelf: "flex-start" }}>
    <T size={11} weight="semi" color={color}>{STATUS_LABEL[status] ?? status}</T>
  </View>;
}

function ActionRow({ actions, open, onToggle, busy }: { actions: { label: string; onPress: () => void }[]; open: boolean; onToggle: () => void; busy: boolean }) {
  const c = useColors();
  const [first, ...rest] = actions;
  return <View style={{ gap: 4 }}>
    <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
      {first ? <Pressable accessibilityRole="button" disabled={busy} onPress={first.onPress} style={{ minHeight: 40, justifyContent: "center" }}><T size={13} weight="semi" color={c.primary}>{first.label}</T></Pressable> : null}
      {rest.length ? <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={onToggle} style={{ minHeight: 40, flexDirection: "row", alignItems: "center", gap: 4 }}>
        <T size={13} weight="semi" color={c.secondary}>More</T><Feather name={open ? "chevron-up" : "chevron-down"} size={14} color={c.secondary} /></Pressable> : null}
    </View>
    {open ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>{rest.map((a) => <Pressable key={a.label} accessibilityRole="button" disabled={busy} onPress={a.onPress} style={{ minHeight: 40, justifyContent: "center" }}>
      <T size={13} weight="semi" color={a.label === "Archive" ? c.destructive : c.primary}>{a.label}</T></Pressable>)}</View> : null}
  </View>;
}

function BackLink({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useColors();
  return <Pressable accessibilityRole="button" onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40 }}>
    <Feather name="chevron-left" size={18} color={c.primary} /><T size={14} weight="semi" color={c.primary}>{label}</T>
  </Pressable>;
}
