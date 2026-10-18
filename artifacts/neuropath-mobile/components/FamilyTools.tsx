import React, { useEffect, useMemo, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { getGetParentFamilyToolsQueryKey, saveParentFamilyTools, useGetParentFamilyTools } from "@workspace/api-client-react";
import type { ParentFamilyToolsInput } from "@workspace/api-client-react";
import { Card, ErrorBox, Field, T } from "@/components/ParentUi";
import { useParent } from "@/context/ParentContext";
import { useColors } from "@/hooks/useColors";

type RoutineStep = { id: string; text: string; icon?: string; time?: string };
type Routine = { id: string; name: string; steps: RoutineStep[]; updatedAt: string };
type Run = { id: string; routineId: string; currentStep: number; status: "active" | "paused" | "completed"; updatedAt: string };
type Reminder = { id: string; targetType: "activity" | "routine"; targetId: string; time: string; days: number[]; timezone: string; snoozeMinutes: number; paused: boolean; quietHours: { start: string; end: string }; enabled: boolean };
type Prefs = { favoriteActivities: string[]; favoriteThings: string[]; communicationMethods: string[]; comfortSensoryPreferences: string[]; dislikes: string[] };
type Tools = { routines: Routine[]; routineRuns: Run[]; preferences: Prefs; reminders: Reminder[]; reminderDelivery?: string };
type Target = { id: string; type: "activity" | "routine"; title: string };
type StepMeta = { icon: string; time: string };

const EMPTY_PREFS: Prefs = { favoriteActivities: [], favoriteThings: [], communicationMethods: [], comfortSensoryPreferences: [], dislikes: [] };
const CATEGORIES: { key: keyof Prefs; label: string }[] = [
  { key: "favoriteActivities", label: "Favorite activities" },
  { key: "favoriteThings", label: "Favorite things" },
  { key: "communicationMethods", label: "Communication methods" },
  { key: "comfortSensoryPreferences", label: "Comfort and sensory preferences" },
  { key: "dislikes", label: "Dislikes (optional)" },
];
const LESSONS = [
  { title: "Predictability can make transitions easier", example: "A short heads-up before leaving the park can make the next step clearer. It may help; every child and moment is different.", activity: "Try a familiar before-and-after routine." },
  { title: "A pause can support communication", example: "Waiting quietly after offering a choice gives time to respond in a preferred way.", activity: "Notice which communication method feels easiest." },
  { title: "Comfort is information, not a reward", example: "A familiar texture or quieter space can help a child feel more settled. Comfort is never something to earn.", activity: "Add one useful comfort preference." },
];
const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const lines = (value: string) => value.split("\n").map((item) => item.trim()).filter(Boolean);
const textLines = (value?: string[]) => (value ?? []).join("\n");
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function FamilyTools({ actions, onActivities, initialTab = "Routines" }: { actions: { id: string; title: string; status: string }[]; onActivities?: () => void; initialTab?: string }) {
  const c = useColors();
  const { child, opts } = useParent();
  const cache = useQueryClient();
  const childId = child?.id ?? "";
  const q = useGetParentFamilyTools(childId, {
    query: { queryKey: getGetParentFamilyToolsQueryKey(childId), enabled: Boolean(childId), staleTime: 0, refetchOnMount: "always" },
    request: opts,
  });
  const [tab, setTab] = useState(initialTab === "Learn Why" ? "Routines" : initialTab);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [stepText, setStepText] = useState("");
  const [stepMeta, setStepMeta] = useState<StepMeta[]>([]);
  const [metaIndex, setMetaIndex] = useState(0);
  const [editing, setEditing] = useState<Routine | null>(null);
  const [player, setPlayer] = useState<{ routine: Routine; run: Run } | null>(null);
  const [targetId, setTargetId] = useState("");
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [time, setTime] = useState("18:00");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [snooze, setSnooze] = useState("10");
  const [quietStart, setQuietStart] = useState("21:00");
  const [quietEnd, setQuietEnd] = useState("07:00");
  const [reflection, setReflection] = useState("");
  const [lessonOpen, setLessonOpen] = useState<number | null>(null);
  const [preferenceDraft, setPreferenceDraft] = useState<Prefs>(EMPTY_PREFS);
  const tools = (q.data ?? { routines: [], routineRuns: [], preferences: EMPTY_PREFS, reminders: [], reminderDelivery: "unavailable" }) as unknown as Tools;
  useEffect(() => {
    if (q.data?.preferences) setPreferenceDraft({ ...EMPTY_PREFS, ...(q.data.preferences as unknown as Prefs) });
  }, [q.data]);
  const targets = useMemo<Target[]>(() => [
    ...actions.filter((item) => item.status !== "needs_review").map((item) => ({ id: item.id, type: "activity" as const, title: item.title })),
    ...tools.routines.map((item) => ({ id: item.id, type: "routine" as const, title: item.name })),
  ], [actions, tools.routines]);

  const save = async (next: Tools): Promise<boolean> => {
    if (!childId) return false;
    setBusy(true); setError("");
    try {
      const saved = await saveParentFamilyTools(childId, {
        routines: next.routines,
        routineRuns: next.routineRuns,
        preferences: next.preferences,
        reminders: next.reminders,
      } as ParentFamilyToolsInput, opts);
      cache.setQueryData(getGetParentFamilyToolsQueryKey(childId), saved);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your changes could not be saved. Try again.");
      return false;
    } finally { setBusy(false); }
  };
  const saveRoutine = async () => {
    const cleanName = name.trim();
    const steps = lines(stepText);
    if (!cleanName || !steps.length) { setError("Add a routine name and at least one step."); return; }
    const routine: Routine = {
      id: editing?.id ?? makeId(),
      name: cleanName,
      steps: steps.map((text, index) => ({ id: editing?.steps[index]?.id ?? makeId(), text, ...(stepMeta[index]?.icon.trim() ? { icon: stepMeta[index].icon.trim() } : {}), ...(stepMeta[index]?.time ? { time: stepMeta[index].time } : {}) })),
      updatedAt: new Date().toISOString(),
    };
    const next = { ...tools, routines: editing ? tools.routines.map((item) => item.id === routine.id ? routine : item) : [...tools.routines, routine] };
    if (await save(next)) { setName(""); setStepText(""); setStepMeta([]); setEditing(null); }
  };
  const updateRoutine = async (routine: Routine, nextSteps: RoutineStep[]) => {
    await save({ ...tools, routines: tools.routines.map((item) => item.id === routine.id ? { ...item, steps: nextSteps, updatedAt: new Date().toISOString() } : item) });
  };
  const begin = async (routine: Routine) => {
    const paused = [...tools.routineRuns].reverse().find((item) => item.routineId === routine.id && item.status === "paused");
    if (paused) {
      const run: Run = { ...paused, status: "active", updatedAt: new Date().toISOString() };
      if (await save({ ...tools, routineRuns: tools.routineRuns.map((item) => item.id === run.id ? run : item) })) setPlayer({ routine, run });
      return;
    }
    const run: Run = { id: makeId(), routineId: routine.id, currentStep: 0, status: "active", updatedAt: new Date().toISOString() };
    if (await save({ ...tools, routineRuns: [...tools.routineRuns, run] })) setPlayer({ routine, run });
  };
  const moveRun = async (status: Run["status"], currentStep = player?.run.currentStep ?? 0) => {
    if (!player) return;
    const run: Run = { ...player.run, status, currentStep, updatedAt: new Date().toISOString() };
    if (await save({ ...tools, routineRuns: tools.routineRuns.map((item) => item.id === run.id ? run : item) })) {
      if (status === "completed") setPlayer(null);
      else setPlayer({ ...player, run });
    }
  };
  const exitRoutine = async () => {
    if (!player) return;
    const run: Run = { ...player.run, status: "paused", updatedAt: new Date().toISOString() };
    if (await save({ ...tools, routineRuns: tools.routineRuns.map((item) => item.id === run.id ? run : item) })) setPlayer(null);
  };

  if (q.isLoading) return <Card><T weight="semi">Loading private family tools…</T><T size={13} color={c.secondary}>Your saved routines and preferences are being retrieved.</T></Card>;
  if (q.isError) return <ErrorBox message={q.error instanceof Error ? q.error.message : "Family tools could not load."} onRetry={() => void q.refetch()} />;
  const buttonStyle = (selected: boolean) => ({ minHeight: 42, justifyContent: "center" as const, paddingHorizontal: 12, borderRadius: 11, borderWidth: 1, borderColor: selected ? c.primary : c.border, backgroundColor: selected ? c.primary : c.card });
  const actionTextColor = (selected: boolean) => selected ? c.primaryForeground : c.primary;

  return <View style={{ gap: 12, minWidth: 0 }}>
    <Card><T size={12} weight="semi" color={c.primary}>PARENT-OWNED · PRIVATE TO YOUR FAMILY</T><T size={21} weight="bold">Family tools</T><T size={13} color={c.secondary}>Separate from scanned clinical information. Saving here does not change a care plan.</T></Card>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
      {["Routines", "Preferences", "Reminders"].map((item) => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }} onPress={() => { setTab(item); setError(""); }} style={buttonStyle(tab === item)}><T size={12} weight="semi" color={actionTextColor(tab === item)}>{item}</T></Pressable>)}
    </View>
    {busy ? <T size={12} color={c.secondary}>Saving changes…</T> : null}
    {error ? <ErrorBox message={error} /> : null}
    {player ? <Card>
      <Pressable accessibilityRole="button" onPress={() => void exitRoutine()}><T size={13} weight="semi" color={c.primary}>Exit routine</T></Pressable>
      <T size={12} weight="semi" color={c.primary}>ROUTINE · {player.routine.name}</T>
      <T size={18} weight="bold">Now</T>
      <T size={18}>{player.routine.steps[player.run.currentStep]?.icon ? `${player.routine.steps[player.run.currentStep].icon} · ` : ""}{player.routine.steps[player.run.currentStep]?.text ?? "Routine finished."}{player.routine.steps[player.run.currentStep]?.time ? ` · ${player.routine.steps[player.run.currentStep].time}` : ""}</T>
      {player.routine.steps[player.run.currentStep + 1] ? <T size={13} color={c.secondary}>Next: {player.routine.steps[player.run.currentStep + 1].text}</T> : null}
      <T size={12} color={c.secondary}>Finishing a routine is not a measure of mastery.</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        <Pressable accessibilityRole="button" onPress={() => void moveRun("paused")}><T size={13} weight="semi" color={c.primary}>Pause</T></Pressable>
        {player.run.status === "paused" ? <Pressable accessibilityRole="button" onPress={() => void moveRun("active")}><T size={13} weight="semi" color={c.primary}>Resume</T></Pressable> : null}
        {player.run.currentStep > 0 ? <Pressable accessibilityRole="button" onPress={() => void moveRun("active", player.run.currentStep - 1)}><T size={13} weight="semi" color={c.primary}>Back</T></Pressable> : null}
        {player.run.currentStep < player.routine.steps.length - 1
          ? <Pressable accessibilityRole="button" onPress={() => void moveRun("active", player.run.currentStep + 1)}><T size={13} weight="semi" color={c.primary}>Next</T></Pressable>
          : <Pressable accessibilityRole="button" onPress={() => void moveRun("completed")}><T size={13} weight="semi" color={c.primary}>Finished</T></Pressable>}
      </View>
    </Card> : tab === "Routines" ? <>
      <Card>
        <T size={18} weight="bold">{editing ? "Edit routine" : "Create a visual routine"}</T>
        <Field label="Routine name" value={name} onChangeText={setName} maxLength={100} placeholder="Getting ready to leave" />
        <Field label="Steps, one per line" value={stepText} onChangeText={setStepText} multiline placeholder={"Put on shoes\nPick up bag\nWalk to the door"} />
        {lines(stepText).length ? <>
          <T size={13} weight="semi">Optional details for a step</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{lines(stepText).map((step, index) => <Pressable key={`${index}:${step}`} accessibilityRole="button" accessibilityState={{ selected: metaIndex === index }} onPress={() => setMetaIndex(index)} style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: metaIndex === index ? c.primary : c.border, backgroundColor: metaIndex === index ? c.accent : c.card }}><T size={11} color={c.primary}>{index + 1}</T></Pressable>)}</View>
          <Field label={`Icon name for step ${metaIndex + 1}`} value={stepMeta[metaIndex]?.icon ?? ""} onChangeText={(value) => setStepMeta((current) => { const next = [...current]; next[metaIndex] = { icon: value, time: next[metaIndex]?.time ?? "" }; return next; })} placeholder="shoe, book, bag" />
          <Field label={`Optional time for step ${metaIndex + 1}`} value={stepMeta[metaIndex]?.time ?? ""} onChangeText={(value) => setStepMeta((current) => { const next = [...current]; next[metaIndex] = { icon: next[metaIndex]?.icon ?? "", time: value }; return next; })} placeholder="08:30" />
        </> : null}
        <T size={12} color={c.secondary}>Use a short icon name, not an image. Private images are not available here.</T>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void saveRoutine()} style={{ minHeight: 46, justifyContent: "center", alignItems: "center", borderRadius: 12, backgroundColor: c.primary, opacity: busy ? 0.5 : 1 }}><T weight="semi" color={c.primaryForeground}>{editing ? "Save changes" : "Add routine"}</T></Pressable>
        {editing ? <Pressable accessibilityRole="button" onPress={() => { setEditing(null); setName(""); setStepText(""); setStepMeta([]); }}><T size={13} color={c.secondary}>Cancel edit</T></Pressable> : null}
      </Card>
      {!tools.routines.length ? <Card><T size={17} weight="bold">No routines saved</T><T size={13} color={c.secondary}>Create a routine using steps that already feel familiar to your family.</T></Card> : tools.routines.map((routine) => <Card key={routine.id}>
        <T size={18} weight="bold">{routine.name}</T>
        {routine.steps.map((step, index) => <View key={step.id} style={{ gap: 6, paddingVertical: 5, borderBottomWidth: index === routine.steps.length - 1 ? 0 : 1, borderBottomColor: c.border }}>
          <T size={14}>{index + 1}. {step.text}</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Move ${step.text} up`} disabled={index === 0} onPress={() => { const next = [...routine.steps]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; void updateRoutine(routine, next); }}><T size={12} color={index === 0 ? c.mutedForeground : c.primary}>Move up</T></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Move ${step.text} down`} disabled={index === routine.steps.length - 1} onPress={() => { const next = [...routine.steps]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; void updateRoutine(routine, next); }}><T size={12} color={index === routine.steps.length - 1 ? c.mutedForeground : c.primary}>Move down</T></Pressable>
            <Pressable accessibilityRole="button" onPress={() => void updateRoutine(routine, routine.steps.filter((item) => item.id !== step.id))}><T size={12} color={c.destructive}>Remove</T></Pressable>
          </View>
        </View>)}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
          <Pressable accessibilityRole="button" onPress={() => { setEditing(routine); setName(routine.name); setStepText(routine.steps.map((item) => item.text).join("\n")); setStepMeta(routine.steps.map((item) => ({ icon: item.icon ?? "", time: item.time ?? "" }))); setMetaIndex(0); }}><T size={13} weight="semi" color={c.primary}>Edit</T></Pressable>
          <Pressable accessibilityRole="button" onPress={() => void begin(routine)}><T size={13} weight="semi" color={c.primary}>Start routine</T></Pressable>
          <Pressable accessibilityRole="button" onPress={() => void save({ ...tools, routines: tools.routines.filter((item) => item.id !== routine.id) })}><T size={13} color={c.destructive}>Remove routine</T></Pressable>
        </View>
      </Card>)}
    </> : tab === "Preferences" ? <Card>
      <T size={18} weight="bold">{child?.name ?? "Child"}'s preferences</T>
      <T size={13} color={c.secondary}>Editable parent notes. These are not scanned clinical data, and comfort is never an earned reward.</T>
      {CATEGORIES.map((category) => <Field key={category.key} label={category.label} value={textLines(preferenceDraft[category.key])} onChangeText={(value) => setPreferenceDraft((current) => ({ ...current, [category.key]: lines(value) }))} multiline placeholder="One item per line" />)}
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void save({ ...tools, preferences: preferenceDraft })} style={{ minHeight: 46, justifyContent: "center", alignItems: "center", borderRadius: 12, backgroundColor: c.primary, opacity: busy ? 0.5 : 1 }}><T weight="semi" color={c.primaryForeground}>Save preferences</T></Pressable>
    </Card> : tab === "Learn Why" ? <>
      {LESSONS.map((lesson, index) => <Card key={lesson.title}>
        <T size={11} weight="semi" color={c.primary}>LEARN WHY · SHORT LESSON</T><T size={17} weight="bold">{lesson.title}</T><T size={14} color={c.secondary}>{lesson.example}</T>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: lessonOpen === index }} onPress={() => setLessonOpen(lessonOpen === index ? null : index)}><T size={13} weight="semi" color={c.primary}>{lessonOpen === index ? "Hide optional reflection" : "Optional reflection"}</T></Pressable>
        {lessonOpen === index ? <><TextInput value={reflection} onChangeText={setReflection} placeholder="You can leave this blank." placeholderTextColor={c.mutedForeground} multiline style={{ minHeight: 74, borderWidth: 1, borderColor: c.border, borderRadius: 11, padding: 10, color: c.foreground, textAlignVertical: "top" }} /><T size={12} color={c.secondary}>Not saved. Skip or leave this blank.</T></> : null}
        <Pressable accessibilityRole="button" onPress={() => onActivities?.()}><T size={13} weight="semi" color={c.primary}>Related activity: {lesson.activity}</T></Pressable>
        <Pressable accessibilityRole="button" onPress={() => { setLessonOpen(null); setReflection(""); }}><T size={12} color={c.secondary}>Skip lesson</T></Pressable>
      </Card>)}
    </> : <>
      <Card><T size={18} weight="bold">Recurring reminders</T><T size={13} color={c.secondary}>Delivery unavailable. Reminders can be saved, but no notifications will be sent. Lock-screen copy stays generic.</T></Card>
      <Card>
        <T size={15} weight="semi">{editingReminder ? "Edit reminder" : "New reminder"}</T>
        <View style={{ gap: 6 }}><T size={13} weight="semi">Exact activity or routine</T><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
          {targets.map((target) => <Pressable key={`${target.type}:${target.id}`} accessibilityRole="button" accessibilityState={{ selected: targetId === `${target.type}:${target.id}` }} onPress={() => setTargetId(`${target.type}:${target.id}`)} style={buttonStyle(targetId === `${target.type}:${target.id}`)}><T size={12} color={actionTextColor(targetId === `${target.type}:${target.id}`)}>{target.title}</T></Pressable>)}
        </View></View>
        <Field label="Time (24-hour)" value={time} onChangeText={setTime} placeholder="18:00" />
        <Field label="Timezone" value={Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"} editable={false} />
        <View><T size={13} weight="semi">Days</T><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 7 }}>{DAYS.map((day, index) => <Pressable key={day} accessibilityRole="checkbox" accessibilityState={{ checked: days.includes(index) }} onPress={() => setDays(days.includes(index) ? days.filter((item) => item !== index) : [...days, index].sort())} style={buttonStyle(days.includes(index))}><T size={11} color={actionTextColor(days.includes(index))}>{day}</T></Pressable>)}</View></View>
        <Field label="Snooze (minutes)" value={snooze} onChangeText={setSnooze} keyboardType="number-pad" />
        <View style={{ flexDirection: "row", gap: 8 }}><View style={{ flex: 1 }}><Field label="Quiet hours start" value={quietStart} onChangeText={setQuietStart} /></View><View style={{ flex: 1 }}><Field label="Quiet hours end" value={quietEnd} onChangeText={setQuietEnd} /></View></View>
        <Pressable accessibilityRole="button" disabled={!targetId || busy} onPress={() => {
          const selected = targets.find((item) => `${item.type}:${item.id}` === targetId);
          if (!selected || !days.length) { setError("Choose an exact target and at least one day."); return; }
          const reminder: Reminder = { ...(editingReminder ?? {} as Reminder), id: editingReminder?.id ?? makeId(), targetType: selected.type, targetId: selected.id, time, days, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", snoozeMinutes: Math.max(1, Number(snooze) || 10), paused: editingReminder?.paused ?? false, quietHours: { start: quietStart, end: quietEnd }, enabled: editingReminder?.enabled ?? false };
          const nextReminders = editingReminder ? tools.reminders.map((item) => item.id === reminder.id ? reminder : item) : [...tools.reminders, reminder];
          void save({ ...tools, reminders: nextReminders }).then((ok) => { if (ok) { setTargetId(""); setEditingReminder(null); } });
        }} style={{ minHeight: 46, justifyContent: "center", alignItems: "center", borderRadius: 12, backgroundColor: c.primary, opacity: !targetId || busy ? 0.5 : 1 }}><T weight="semi" color={c.primaryForeground}>{editingReminder ? "Save reminder changes" : "Save reminder"}</T></Pressable>
      </Card>
      {!tools.reminders.length ? <Card><T size={13} color={c.secondary}>No reminders saved yet.</T></Card> : tools.reminders.map((reminder) => {
        const target = targets.find((item) => item.id === reminder.targetId && item.type === reminder.targetType);
        return <Card key={reminder.id}><T size={16} weight="bold">{target?.title ?? "Saved target"} · {reminder.time}</T><T size={12} color={c.secondary}>{reminder.days.map((day) => DAYS[day]).join(", ")} · {reminder.timezone}</T><T size={12} color={c.secondary}>Snooze {reminder.snoozeMinutes} min · quiet hours {reminder.quietHours.start}–{reminder.quietHours.end}</T><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
          <Pressable accessibilityRole="button" onPress={() => { setEditingReminder(reminder); setTargetId(`${reminder.targetType}:${reminder.targetId}`); setTime(reminder.time); setDays(reminder.days); setSnooze(String(reminder.snoozeMinutes)); setQuietStart(reminder.quietHours.start); setQuietEnd(reminder.quietHours.end); }}><T size={13} color={c.primary}>Edit</T></Pressable>
          <Pressable accessibilityRole="button" onPress={() => void save({ ...tools, reminders: tools.reminders.map((item) => item.id === reminder.id ? { ...item, paused: !item.paused } : item) })}><T size={13} color={c.primary}>{reminder.paused ? "Resume" : "Pause"}</T></Pressable>
          <Pressable accessibilityRole="button" onPress={() => void save({ ...tools, reminders: tools.reminders.map((item) => item.id === reminder.id ? { ...item, enabled: !item.enabled } : item) })}><T size={13} color={c.primary}>{reminder.enabled ? "Cancel" : "Enable"}</T></Pressable>
          <Pressable accessibilityRole="button" onPress={() => void save({ ...tools, reminders: tools.reminders.filter((item) => item.id !== reminder.id) })}><T size={13} color={c.destructive}>Remove</T></Pressable>
        </View></Card>;
      })}
    </>}
    <T size={12} color={c.secondary}>Opening family tools or completing a routine never creates an incident or behavior log.</T>
  </View>;
}
