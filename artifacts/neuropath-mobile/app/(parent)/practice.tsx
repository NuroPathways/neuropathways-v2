import React, { useCallback, useMemo, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getGetParentDashboardQueryKey, getParentDashboard, logParentDailyAction, updateParentPracticeProgress } from "@workspace/api-client-react";
import type { ParentDailyActionLogInput } from "@workspace/api-client-react";
import { Card, ErrorBox, H, Screen, Skeleton, T, msg } from "@/components/ParentUi";
import { useParent } from "@/context/ParentContext";
import { useColors } from "@/hooks/useColors";
import { FamilyTools } from "@/components/FamilyTools";

const VIEWS = ["Activities", "Learn Why", "My Routines", "Saved for Later"] as const;
type PracticeView = typeof VIEWS[number];
const SOURCE: Record<string, string> = {
  clinician_reviewed: "Clinician reviewed",
  clinician_uploaded_plan: "Clinician-uploaded plan",
  parent_uploaded_plan: "Based on uploaded plan · not clinician-reviewed",
  starter_template: "Starter support",
  recent_log_pattern: "Based on parent notes",
  selected_behavior: "Based on selected behavior",
};
const OUTCOMES = [
  { value: "used_skill", label: "We tried it" },
  { value: "partially", label: "We needed more support" },
  { value: "not_yet", label: "We didn't get a chance" },
] as const;
const phases = ["Understand", "See", "Try", "Reflect"] as const;

export default function Practice() {
  const c = useColors();
  const { child, opts } = useParent();
  const params = useLocalSearchParams<{ activityId?: string }>();
  const cache = useQueryClient();
  const q = useQuery({
    queryKey: getGetParentDashboardQueryKey(child?.id ?? ""),
    queryFn: () => getParentDashboard(child!.id, opts),
    enabled: !!child,
  });
  useFocusEffect(useCallback(() => { if (child) void q.refetch(); }, [child?.id, q.refetch]));
  const [view, setView] = useState<PracticeView>("Activities");
  const [actionId, setActionId] = useState<string | null>(null);
  const [phase, setPhase] = useState(0);
  const [tryStep, setTryStep] = useState(0);
  const [outcome, setOutcome] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const action = q.data?.dailyActions.find((item) => item.id === actionId);
  React.useEffect(() => {
    if (!action) return;
    const position = action.currentStep ?? 0;
    const count = action.steps.length;
    if (position < 2) { setPhase(position); setTryStep(0); }
    else if (position >= count + 2) { setPhase(3); setTryStep(Math.max(0, count - 1)); }
    else { setPhase(2); setTryStep(position - 2); }
  }, [actionId, action?.currentStep]);
  React.useEffect(() => {
    if (params.activityId && q.data?.dailyActions.some((item) => item.id === params.activityId)) {
      setActionId(params.activityId);
    }
  }, [params.activityId, q.data?.dailyActions]);
  const goalFor = useCallback((behaviorKey: string | null) =>
    q.data?.child.behaviors.find((behavior) => behavior.behaviorKey === behaviorKey)?.goal || null,
  [q.data?.child.behaviors]);
  const sourceFor = (sourceType: string, documentId: string | null) => {
    const title = q.data?.documents.find((document) => document.id === documentId)?.title;
    return `${SOURCE[sourceType] || "Source not available"}${title ? ` · ${title}` : ""}`;
  };
  const actions = useMemo(() => (q.data?.dailyActions ?? []).filter((item) =>
    view === "Saved for Later" ? item.bookmarked || item.status === "saved_for_later" : view === "Activities" || view === "Learn Why"),
  [q.data?.dailyActions, view]);

  const open = (id: string) => {
    setActionId(id);
    const item = q.data?.dailyActions.find((row) => row.id === id);
    const position = item?.currentStep ?? 0;
    const count = item?.steps.length ?? 0;
    if (position < 2) { setPhase(position); setTryStep(0); }
    else if (position >= count + 2) { setPhase(3); setTryStep(Math.max(0, count - 1)); }
    else { setPhase(2); setTryStep(position - 2); }
    setOutcome("");
    setNote("");
    setError("");
  };
  const currentPosition = (nextPhase = phase, nextTryStep = tryStep) => nextPhase === 0 ? 0
    : nextPhase === 1 ? 1
      : nextPhase === 2 ? nextTryStep + 2
        : (action?.steps.length ?? 0) + 2;
  const movePhase = (nextPhase: number) => {
    setPhase(nextPhase);
    const nextTryStep = nextPhase === 2 ? 0 : tryStep;
    setTryStep(nextTryStep);
    if (!child || !action) return;
    void updateParentPracticeProgress(child.id, action.id, {
      currentStep: currentPosition(nextPhase, nextTryStep),
      bookmarked: Boolean(action.bookmarked || action.status === "saved_for_later"),
    }, opts).catch((e) => setError(msg(e, "Your place could not be saved.")));
  };
  const moveTryStep = (nextTryStep: number) => {
    setPhase(2);
    setTryStep(nextTryStep);
    if (!child || !action) return;
    void updateParentPracticeProgress(child.id, action.id, {
      currentStep: currentPosition(2, nextTryStep),
      bookmarked: Boolean(action.bookmarked || action.status === "saved_for_later"),
    }, opts).catch((e) => setError(msg(e, "Your place could not be saved.")));
  };
  const exit = () => { setActionId(null); setError(""); if (params.activityId) router.setParams({ activityId: undefined }); };
  const invalidate = async () => {
    if (child) await cache.invalidateQueries({ queryKey: getGetParentDashboardQueryKey(child.id) });
  };
  const pause = async () => {
    if (!child || !action) return;
    setBusy(true); setError("");
    try {
      await updateParentPracticeProgress(child.id, action.id, { currentStep: currentPosition(), bookmarked: true }, opts);
      await invalidate(); exit();
    } catch (e) { setError(msg(e, "Could not save this activity for later.")); }
    finally { setBusy(false); }
  };
  const reflect = async () => {
    if (!child || !action || (!outcome && !note.trim())) return;
    setBusy(true); setError("");
    try {
      const selected = OUTCOMES.find((item) => item.value === outcome);
      const data: ParentDailyActionLogInput = {
        eventType: "outcome",
        ...(selected ? { outcome: selected.value } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      };
      await updateParentPracticeProgress(child.id, action.id, { currentStep: currentPosition(3), bookmarked: false }, opts);
      await logParentDailyAction(child.id, action.id, data, opts);
      await invalidate(); exit();
    } catch (e) { setError(msg(e, "Your reflection could not be saved.")); }
    finally { setBusy(false); }
  };

  if (q.isLoading) return <Screen><H>Practice</H><Skeleton lines={5} /></Screen>;
  if (q.isError) return <Screen><H>Practice</H><ErrorBox message={msg(q.error, "Practice activities could not load.")} onRetry={() => q.refetch()} /></Screen>;

  return (
    <Screen>
      <H sub={`A calm, low-pressure space for ${q.data?.child.name ?? child?.name ?? "your child"}`}>Practice</H>
      <T size={14} color={c.secondary}>Use only the saved activity steps. Pause or leave whenever you need.</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
        {VIEWS.map((name) => <Pressable key={name} accessibilityRole="tab" accessibilityState={{ selected: view === name }}
          onPress={() => { setView(name); exit(); }} style={{ paddingVertical: 9, paddingHorizontal: 12, borderRadius: 18, backgroundColor: view === name ? c.accent : c.muted }}>
          <T size={12} weight="semi" color={view === name ? c.primary : c.secondary}>{name}</T>
        </Pressable>)}
      </View>
      {error ? <ErrorBox message={error} /> : null}
      {action ? (
        <Card>
          <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
            <TextAction label="Exit activity" color={c.secondary} onPress={exit} />
            <TextAction label={busy ? "Saving…" : "Pause · Save for later"} color={c.primary} onPress={() => void pause()} disabled={busy} />
          </View>
          <T size={12} weight="semi" color={c.primary}>{action.estimatedMinutes} min · {sourceFor(action.sourceType, action.sourceDocumentId)}</T>
          <T size={20} weight="bold">{action.title}</T>
          <T size={14} color={c.secondary}>{action.description}</T>
          <T size={12} color={c.secondary}>Behavior: {action.behaviorName} · Goal: {goalFor(action.behaviorKey) || "No linked goal"}</T>
          {action.currentStep > 0 ? <T size={12} color={c.secondary}>Your place in this activity is saved.</T> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {phases.map((label, index) => <Pressable key={label} accessibilityRole="tab" accessibilityState={{ selected: phase === index }} onPress={() => movePhase(index)}
              style={{ padding: 8, borderRadius: 9, backgroundColor: phase === index ? c.accent : c.muted }}><T size={11} weight="semi">{label}</T></Pressable>)}
          </View>
          {phase === 0 ? <View style={{ gap: 7 }}><T size={17} weight="bold">Why it may help</T><T size={14}>{action.whyItMayHelp || "No additional explanation was included with this activity."}</T></View> : null}
          {phase === 1 ? <View style={{ gap: 7 }}><T size={17} weight="bold">See the activity</T><T size={14}>{action.description}</T>{action.steps[0] ? <T size={13} color={c.secondary}>First saved step: {action.steps[0]}</T> : null}</View> : null}
          {phase === 2 ? <View style={{ gap: 9 }}><T size={17} weight="bold">Try the saved steps</T>
            {action.steps.length ? <><T size={12} color={c.secondary}>Step {tryStep + 1} of {action.steps.length}</T><T size={14}>{action.steps[tryStep]}</T></> : <T size={14} color={c.secondary}>No steps were included with this activity. You can pause or exit.</T>}
            <T size={12} color={c.secondary}>Keep it familiar and low-risk. Stop if it does not feel right for your family.</T></View> : null}
          {phase === 3 ? <View style={{ gap: 9 }}>
            <T size={17} weight="bold">Reflect, if you want</T>
            <T size={12} color={c.secondary}>A caregiver note only; not a measure of mastery or clinical progress.</T>
            {OUTCOMES.map((item) => <Pressable key={item.value} accessibilityRole="radio" accessibilityState={{ selected: outcome === item.value }}
              onPress={() => setOutcome(item.value)} style={{ padding: 11, borderRadius: 10, borderWidth: 1, borderColor: outcome === item.value ? c.primary : c.border }}>
              <T size={13} weight={outcome === item.value ? "semi" : "regular"}>{item.label}</T>
            </Pressable>)}
            <TextInput value={note} onChangeText={setNote} maxLength={2000} multiline placeholder="Optional note to remember" placeholderTextColor={c.mutedForeground}
              style={{ minHeight: 86, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 12, color: c.foreground, textAlignVertical: "top" }} />
            <Pressable accessibilityRole="button" disabled={busy || (!outcome && !note.trim())} onPress={() => void reflect()} style={{ padding: 12, borderRadius: 12, backgroundColor: c.primary, opacity: busy || (!outcome && !note.trim()) ? 0.5 : 1 }}>
              <T weight="semi" color={c.primaryForeground}>{busy ? "Saving…" : "Save reflection"}</T>
            </Pressable>
            <TextAction label="Skip reflection" color={c.secondary} onPress={exit} />
          </View> : null}
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            {phase > 0 ? <TextAction label="Back" color={c.secondary} onPress={() => phase === 2 && tryStep > 0 ? moveTryStep(tryStep - 1) : phase === 3 && action.steps.length ? moveTryStep(action.steps.length - 1) : movePhase(phase - 1)} /> : <View />}
            {phase < 3 ? <TextAction label={phase === 2 ? tryStep < action.steps.length - 1 ? "Next step" : "Reflect" : "Continue"} color={c.primary} onPress={() => phase === 0 ? movePhase(1) : phase === 1 ? movePhase(action.steps.length ? 2 : 3) : phase === 2 && tryStep < action.steps.length - 1 ? moveTryStep(tryStep + 1) : movePhase(3)} /> : null}
          </View>
          <View style={{ flexDirection: "row", gap: 16 }}>
            <TextAction label="Goals" color={c.primary} onPress={() => router.push("/(parent)/family-goals" as never)} />
            <TextAction label="History" color={c.primary} onPress={() => router.push("/(parent)/history" as never)} />
          </View>
        </Card>
      ) : view === "My Routines" ? (
        <FamilyTools actions={(q.data?.dailyActions ?? []).map((item) => ({ id: item.id, title: item.title, status: item.status }))} onActivities={() => setView("Activities")} />
      ) : actions.length ? actions.map((item) => <Pressable key={item.id} accessibilityRole="button" testID={`practice-activity-${item.id}`} onPress={() => open(item.id)}>
        <Card>
          <T size={12} weight="semi" color={c.primary}>{item.estimatedMinutes} min · {sourceFor(item.sourceType, item.sourceDocumentId)}</T>
          <T size={17} weight="bold">{item.title}</T>
          <T size={14} color={c.secondary}>{view === "Learn Why" ? item.whyItMayHelp || item.description : item.description}</T>
          <T size={12} color={c.secondary}>Behavior: {item.behaviorName} · Goal: {goalFor(item.behaviorKey) || "No linked goal"}</T>
        </Card>
      </Pressable>) : (
        <Card><T weight="semi">{view === "Saved for Later" ? "Nothing saved for later." : "No activities are ready yet."}</T>
          <T size={14} color={c.secondary}>{view === "Saved for Later" ? "Pause an activity to add it to this list." : "Activities appear when they are included in your child's saved daily actions."}</T></Card>
      )}
    </Screen>
  );
}

function TextAction({ label, color, onPress, disabled = false }: { label: string; color: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={{ minHeight: 40, justifyContent: "center", opacity: disabled ? 0.55 : 1 }}>
    <T size={13} weight="semi" color={color}>{label}</T>
  </Pressable>;
}
