import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetParentFamilyToolsQueryKey, saveParentFamilyTools, useGetParentFamilyTools } from "@workspace/api-client-react";
import { parentRequest } from "@/lib/parentSession";
import { ErrorBox, Skeleton, errMsg } from "./common";

const EMPTY = { routines: [], routineRuns: [], preferences: { favoriteActivities: [], favoriteThings: [], communicationMethods: [], comfortSensoryPreferences: [], dislikes: [] }, reminders: [] };
const CATEGORIES = [
  ["favoriteActivities", "Favorite activities"],
  ["favoriteThings", "Favorite things"],
  ["communicationMethods", "Communication methods"],
  ["comfortSensoryPreferences", "Comfort and sensory preferences"],
  ["dislikes", "Dislikes (optional)"],
];
const LESSONS = [
  { title: "Predictability can make transitions easier", example: "A short heads-up before leaving the park can make the next step clearer. It may help; every child and moment is different.", activity: "Try a simple before-and-after routine." },
  { title: "A pause can support communication", example: "Waiting quietly after offering a choice gives time to respond in a preferred way.", activity: "Notice which communication method feels easiest today." },
  { title: "Comfort is information, not a reward", example: "A familiar texture or quieter space can help a child feel more settled. Comfort is never something to earn.", activity: "Add one useful comfort preference to the family notes." },
];
const id = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const arrText = (items) => (items || []).join("\n");
const parseLines = (text) => text.split("\n").map((v) => v.trim()).filter(Boolean);

export default function FamilyTools({ childId, childName = "your child", actions = [], onActivities, initialTab = "Routines" }) {
  const cache = useQueryClient();
  const [tab, setTab] = useState(initialTab);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const q = useGetParentFamilyTools(String(childId), {
    query: { queryKey: getGetParentFamilyToolsQueryKey(String(childId)), staleTime: 0, refetchOnMount: "always", enabled: Boolean(childId) },
    request: parentRequest(),
  });
  const data = q.data || EMPTY;
  const save = async (next) => {
    setSaving(true); setError("");
    try {
      const result = await saveParentFamilyTools(String(childId), {
        routines: next.routines, routineRuns: next.routineRuns, preferences: next.preferences, reminders: next.reminders,
      }, parentRequest());
      cache.setQueryData(getGetParentFamilyToolsQueryKey(String(childId)), result);
      return true;
    } catch (e) { setError(errMsg(e)); }
    finally { setSaving(false); }
  };
  const patch = (key, value) => save({ ...data, [key]: value });
  const [routineName, setRoutineName] = useState("");
  const [stepText, setStepText] = useState("");
  const [stepMeta, setStepMeta] = useState([]);
  const [metaIndex, setMetaIndex] = useState(0);
  const [editing, setEditing] = useState(null);
  const [player, setPlayer] = useState(null);
  const [preferenceDraft, setPreferenceDraft] = useState(EMPTY.preferences);
  const [reminderTarget, setReminderTarget] = useState("");
  const [editingReminder, setEditingReminder] = useState(null);
  const [reminderTime, setReminderTime] = useState("18:00");
  const [reminderDays, setReminderDays] = useState([1, 2, 3, 4, 5]);
  const [snoozeMinutes, setSnoozeMinutes] = useState("10");
  const [quietStart, setQuietStart] = useState("21:00");
  const [quietEnd, setQuietEnd] = useState("07:00");
  const targets = useMemo(() => [
    ...actions.filter((a) => a.status !== "needs_review").map((a) => ({ id: a.id, type: "activity", title: a.title })),
    ...(data.routines || []).map((r) => ({ id: r.id, type: "routine", title: r.name })),
  ], [actions, data.routines]);
  useEffect(() => {
    if (q.data?.preferences) setPreferenceDraft({ ...EMPTY.preferences, ...q.data.preferences });
  }, [childId, q.dataUpdatedAt]);

  if (q.isLoading) return <div className="np-family-tools"><Skeleton h={220} /><Skeleton h={180} /></div>;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;

  const saveRoutine = async () => {
    const name = routineName.trim();
    const steps = parseLines(stepText);
    if (!name || !steps.length) { setError("Add a routine name and at least one step."); return; }
    const routine = { id: editing?.id || id(), name, steps: steps.map((text, i) => ({ id: editing?.steps?.[i]?.id || id(), text, ...(stepMeta[i]?.icon?.trim() ? { icon: stepMeta[i].icon.trim() } : {}), ...(stepMeta[i]?.time ? { time: stepMeta[i].time } : {}) })), updatedAt: new Date().toISOString() };
    const routines = editing ? data.routines.map((r) => r.id === editing.id ? routine : r) : [...data.routines, routine];
    if (await patch("routines", routines)) {
      setEditing(null); setRoutineName(""); setStepText(""); setStepMeta([]); setTab("Routines");
    }
  };
  const editRoutine = (routine) => { setEditing(routine); setRoutineName(routine.name); setStepText(routine.steps.map((s) => s.text).join("\n")); setStepMeta(routine.steps.map((s) => ({ icon: s.icon || "", time: s.time || "" }))); setMetaIndex(0); };
  const moveRoutineStep = (routine, index, delta) => {
    const steps = [...routine.steps]; const dest = index + delta;
    if (dest < 0 || dest >= steps.length) return;
    [steps[index], steps[dest]] = [steps[dest], steps[index]];
    void patch("routines", data.routines.map((r) => r.id === routine.id ? { ...r, steps, updatedAt: new Date().toISOString() } : r));
  };
  const startRoutine = async (routine) => {
    const paused = [...data.routineRuns].reverse().find((item) => item.routineId === routine.id && item.status === "paused");
    if (paused) {
      const run = { ...paused, status: "active", updatedAt: new Date().toISOString() };
      if (await save({ ...data, routineRuns: data.routineRuns.map((item) => item.id === run.id ? run : item) })) setPlayer({ ...routine, run });
      return;
    }
    const run = { id: id(), routineId: routine.id, currentStep: 0, status: "active", updatedAt: new Date().toISOString() };
    if (await save({ ...data, routineRuns: [...data.routineRuns, run] })) setPlayer({ ...routine, run });
  };
  const updateRun = async (status, currentStep = player.run.currentStep) => {
    const run = { ...player.run, status, currentStep, updatedAt: new Date().toISOString() };
    if (await save({ ...data, routineRuns: data.routineRuns.map((item) => item.id === run.id ? run : item) })) {
      if (status === "completed") setPlayer(null);
      else setPlayer({ ...player, run });
    }
  };
  const exitRoutine = async () => {
    if (!player) return;
    const run = { ...player.run, status: "paused", updatedAt: new Date().toISOString() };
    if (await save({ ...data, routineRuns: data.routineRuns.map((item) => item.id === run.id ? run : item) })) setPlayer(null);
  };
  const addReminder = async () => {
    const target = targets.find((item) => `${item.type}:${item.id}` === reminderTarget);
    if (!target) { setError("Choose an activity or routine first."); return; }
    if (!reminderDays.length) { setError("Choose at least one day."); return; }
    const reminder = { ...(editingReminder || {}), id: editingReminder?.id || id(), targetType: target.type, targetId: target.id, time: reminderTime, days: reminderDays, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", snoozeMinutes: Math.max(1, Number(snoozeMinutes) || 10), paused: editingReminder?.paused || false, quietHours: { start: quietStart, end: quietEnd }, enabled: editingReminder?.enabled ?? false };
    const reminders = editingReminder ? data.reminders.map((item) => item.id === reminder.id ? reminder : item) : [...data.reminders, reminder];
    if (await patch("reminders", reminders)) { setReminderTarget(""); setEditingReminder(null); }
  };
  const updateReminder = (reminder, updates) => patch("reminders", data.reminders.map((r) => r.id === reminder.id ? { ...r, ...updates } : r));

  return (
    <section className="np-family-tools" aria-label={`Family tools for ${childName}`}>
      <header className="np-tools-heading"><p className="pf-eyebrow">Parent-owned · private to your family</p><h2>Family tools</h2><p className="pf-hint">Your notes and routines are separate from scanned clinical information. Saving here does not change a care plan.</p></header>
      <nav className="np-tools-tabs" aria-label="Family tools">
        {["Routines", "Preferences", "Learn Why", "Reminders"].map((name) => <button type="button" key={name} aria-pressed={tab === name} onClick={() => { setTab(name); setError(""); }}>{name}</button>)}
      </nav>
      {error && <p className="np-tools-error" role="alert">{error}</p>}
      {saving && <p className="pf-hint" role="status">Saving your changes…</p>}
      {player ? <article className="np-routine-player">
        <button type="button" className="pf-btn small" onClick={exitRoutine}>Exit routine</button>
        <p className="pf-eyebrow">Routine · {player.name}</p><h3>Now</h3>
        <p className="np-now-step">{player.steps[player.run.currentStep]?.icon && <span className="np-icon-name">{player.steps[player.run.currentStep].icon} · </span>}{player.steps[player.run.currentStep]?.text || "Routine finished."}{player.steps[player.run.currentStep]?.time && <span className="np-step-time"> · {player.steps[player.run.currentStep].time}</span>}</p>
        {player.steps[player.run.currentStep + 1] && <p className="pf-hint"><strong>Next:</strong> {player.steps[player.run.currentStep + 1].text}</p>}
        <p className="pf-hint">Finishing a routine is not a measure of mastery.</p>
        <div className="np-tools-actions">
          <button type="button" className="pf-btn" onClick={() => updateRun("paused")}>Pause</button>
          {player.run.status === "paused" && <button type="button" className="pf-btn primary" onClick={() => updateRun("active")}>Resume</button>}
          {player.run.currentStep > 0 && <button type="button" className="pf-btn" onClick={() => updateRun("active", player.run.currentStep - 1)}>Back</button>}
          {player.run.currentStep < player.steps.length - 1
            ? <button type="button" className="pf-btn primary" onClick={() => updateRun("active", player.run.currentStep + 1)}>Next</button>
            : <button type="button" className="pf-btn primary" onClick={() => updateRun("completed")}>Finished</button>}
        </div>
      </article> : tab === "Routines" ? <>
        <div className="np-tools-form">
          <h3>{editing ? "Edit routine" : "Create a visual routine"}</h3>
          <label>Routine name<input value={routineName} onChange={(e) => setRoutineName(e.target.value)} maxLength={100} placeholder="Getting ready to leave" /></label>
          <label>Steps, one per line<textarea value={stepText} onChange={(e) => setStepText(e.target.value)} rows={4} placeholder={"Put on shoes\nPick up bag\nWalk to the door"} /></label>
          {parseLines(stepText).length > 0 && <div className="np-step-meta"><label>Optional details for step<select value={Math.min(metaIndex, parseLines(stepText).length - 1)} onChange={(e) => setMetaIndex(Number(e.target.value))}>{parseLines(stepText).map((step, index) => <option key={`${index}:${step}`} value={index}>{index + 1}. {step}</option>)}</select></label><label>Icon name<input value={stepMeta[metaIndex]?.icon || ""} onChange={(e) => setStepMeta((items) => items.map((item, index) => index === metaIndex ? { ...item, icon: e.target.value } : item))} placeholder="shoe, book, bag" /></label><label>Time (optional)<input type="time" value={stepMeta[metaIndex]?.time || ""} onChange={(e) => setStepMeta((items) => items.map((item, index) => index === metaIndex ? { ...item, time: e.target.value } : item))} /></label></div>}
          <p className="pf-hint">Use a short icon name, not an image. Private images are not available here.</p>
          <div className="np-tools-actions"><button type="button" className="pf-btn primary" onClick={saveRoutine}>{editing ? "Save changes" : "Add routine"}</button>{editing && <button type="button" className="pf-btn" onClick={() => { setEditing(null); setRoutineName(""); setStepText(""); setStepMeta([]); }}>Cancel edit</button>}</div>
        </div>
        {!data.routines.length ? <div className="np-tools-empty"><h3>No routines saved</h3><p>Create a routine using steps that already feel familiar to your family.</p></div> : data.routines.map((routine) => <article className="np-routine-card" key={routine.id}>
          <div className="np-routine-title"><h3>{routine.name}</h3><button type="button" className="pf-btn small primary" onClick={() => startRoutine(routine)}>Start</button></div>
          <ol>{routine.steps.map((step, i) => <li key={step.id || i}><span>{step.text}</span><div className="np-inline-actions"><button type="button" aria-label={`Move ${step.text} up`} disabled={i === 0} onClick={() => moveRoutineStep(routine, i, -1)}>↑</button><button type="button" aria-label={`Move ${step.text} down`} disabled={i === routine.steps.length - 1} onClick={() => moveRoutineStep(routine, i, 1)}>↓</button><button type="button" aria-label={`Remove ${step.text}`} onClick={() => void patch("routines", data.routines.map((r) => r.id === routine.id ? { ...r, steps: r.steps.filter((s) => s.id !== step.id), updatedAt: new Date().toISOString() } : r))}>Remove</button></div></li>)}</ol>
          <div className="np-tools-actions"><button type="button" className="pf-btn small" onClick={() => editRoutine(routine)}>Edit</button><button type="button" className="pf-btn small" onClick={() => window.confirm(`Remove “${routine.name}”?`) && void patch("routines", data.routines.filter((r) => r.id !== routine.id))}>Remove routine</button></div>
        </article>)}
      </> : tab === "Preferences" ? <div className="np-preferences">
        <h3>{childName}'s preferences</h3><p className="pf-hint">Editable family notes. These do not come from a scan and are not rewards to earn.</p>
        {CATEGORIES.map(([key, label]) => <label key={key}>{label}<textarea rows={key === "comfortSensoryPreferences" ? 3 : 2} value={arrText(preferenceDraft?.[key])} onChange={(e) => setPreferenceDraft((current) => ({ ...current, [key]: parseLines(e.target.value) }))} placeholder="One item per line" /></label>)}
        <button type="button" className="pf-btn primary" onClick={() => patch("preferences", preferenceDraft)}>Save preferences</button>
      </div> : tab === "Learn Why" ? <div className="np-lessons">
        {LESSONS.map((lesson) => <Lesson key={lesson.title} lesson={lesson} onActivity={() => onActivities?.()} />)}
      </div> : <div className="np-reminders">
        <h3>Recurring reminders</h3><p className="np-delivery-note"><strong>Delivery unavailable.</strong> Reminders can be saved, but no notifications will be sent. Lock-screen copy is kept generic.</p>
        <div className="np-tools-form"><h4>{editingReminder ? "Edit reminder" : "New reminder"}</h4><label>Activity or routine<select value={reminderTarget} onChange={(e) => setReminderTarget(e.target.value)}><option value="">Choose one</option>{targets.map((target) => <option key={`${target.type}:${target.id}`} value={`${target.type}:${target.id}`}>{target.title} · {target.type}</option>)}</select></label><label>Time<input type="time" value={reminderTime} onChange={(e) => setReminderTime(e.target.value)} /></label>
          <div><strong>Days</strong><div className="np-tools-days">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((day, index) => <label key={day}><input type="checkbox" checked={reminderDays.includes(index)} onChange={(e) => setReminderDays((items) => e.target.checked ? [...items, index].sort() : items.filter((item) => item !== index))} />{day}</label>)}</div></div>
          <label>Snooze minutes<input type="number" min="1" max="180" value={snoozeMinutes} onChange={(e) => setSnoozeMinutes(e.target.value)} /></label>
          <label>Quiet hours start<input type="time" value={quietStart} onChange={(e) => setQuietStart(e.target.value)} /></label>
          <label>Quiet hours end<input type="time" value={quietEnd} onChange={(e) => setQuietEnd(e.target.value)} /></label>
          <p className="pf-hint">Timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"}</p>
          <button type="button" className="pf-btn primary" onClick={addReminder} disabled={!targets.length}>{editingReminder ? "Save reminder changes" : "Save reminder"}</button></div>
        {!data.reminders.length ? <p className="np-tools-empty">No reminders saved. You can add one for an exact activity or routine.</p> : data.reminders.map((r) => {
          const target = targets.find((t) => t.id === r.targetId && t.type === r.targetType);
          return <article className="np-routine-card" key={r.id}><h4>{target?.title || "Saved activity"} · {r.time}</h4><p className="pf-hint">{(r.days || []).map((d) => ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d] || d).join(", ")} · {r.timezone}</p><p className="pf-hint">Snooze {r.snoozeMinutes} min · quiet hours {r.quietHours?.start}–{r.quietHours?.end}</p><div className="np-tools-actions"><button type="button" className="pf-btn small" onClick={() => { setEditingReminder(r); setReminderTarget(`${r.targetType}:${r.targetId}`); setReminderTime(r.time); setReminderDays(r.days || []); setSnoozeMinutes(String(r.snoozeMinutes)); setQuietStart(r.quietHours?.start || "21:00"); setQuietEnd(r.quietHours?.end || "07:00"); }}>Edit</button><button type="button" className="pf-btn small" onClick={() => updateReminder(r, { paused: !r.paused })}>{r.paused ? "Resume" : "Pause"}</button><button type="button" className="pf-btn small" onClick={() => updateReminder(r, { enabled: !r.enabled })}>{r.enabled ? "Cancel" : "Enable"}</button><button type="button" className="pf-btn small" onClick={() => patch("reminders", data.reminders.filter((item) => item.id !== r.id))}>Remove</button></div></article>;
        })}
      </div>}
      <p className="pf-hint np-private-footnote">Private family tools. Opening this area or saving a routine never creates an incident or behavior log.</p>
    </section>
  );
}

function Lesson({ lesson, onActivity }) {
  const [answer, setAnswer] = useState("");
  const [expanded, setExpanded] = useState(false);
  return <article className="np-lesson-card"><p className="pf-eyebrow">Learn Why · 2 minute read</p><h3>{lesson.title}</h3><p>{lesson.example}</p><button type="button" className="pf-btn small" onClick={() => setExpanded((v) => !v)}>{expanded ? "Hide optional reflection" : "Try an optional reflection"}</button>{expanded && <label>What might feel useful to your family?<textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="You can leave this blank." rows={2} /></label>}<div className="np-tools-actions"><button type="button" className="pf-btn small primary" onClick={onActivity}>Related activity: {lesson.activity}</button><button type="button" className="pf-btn small" onClick={() => setExpanded(false)}>Skip</button></div></article>;
}
