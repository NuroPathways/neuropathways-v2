import React, { useCallback, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getGetParentDashboardQueryKey, getParentDashboard, logParentDailyAction, recordCareTeamPractice,
  saveCareTeamPracticeProgress, updateParentPracticeProgress,
} from "@workspace/api-client-react";
import type { CareActivity, ParentDailyAction, ParentDailyActionLogInput } from "@workspace/api-client-react";
import { Card, Chip, ErrorBox, H, Screen, Skeleton, T, msg } from "@/components/ParentUi";
import { useParent } from "@/context/ParentContext";
import { useColors } from "@/hooks/useColors";
import { FamilyTools } from "@/components/FamilyTools";
import { ActivityGuide as Guided, AssignedBadge, OUTCOMES, type GuideItem as Item } from "@/components/ActivityGuide";
import { CATEGORIES, categoryOf, newRequestId, useCareTeam, usefulWhy } from "@/lib/careTeam";

const SOURCE: Record<string, string> = {
  clinician_reviewed: "Clinician reviewed",
  clinician_uploaded_plan: "From clinician-uploaded plan",
  parent_uploaded_plan: "From your uploaded plan",
  starter_template: "Starter support",
  recent_log_pattern: "Based on your notes",
  selected_behavior: "Based on selected behavior",
};
type Sub = "home" | "routines" | "saved" | "explore";
const isClosed = (s?: string) => s === "done" || s === "logged" || s === "skipped";

export default function Practice() {
  const c = useColors();
  const { child, opts, parent } = useParent();
  const params = useLocalSearchParams<{ activityId?: string; assignmentId?: string; view?: string }>();
  const cache = useQueryClient();
  const q = useQuery({ queryKey: getGetParentDashboardQueryKey(child?.id ?? ""), queryFn: () => getParentDashboard(child!.id, opts), enabled: !!child });
  const care = useCareTeam();
  useFocusEffect(useCallback(() => { if (child) void q.refetch(); }, [child?.id, q.refetch]));
  // Legacy "Learn Why"/"learn" view links fall back to the main Practice page.
  const initialSub: Sub = params.view === "preferences" || params.view === "routines" ? "routines" : params.view === "saved" ? "saved" : "home";
  const [sub, setSub] = useState<Sub>(initialSub);
  const [toolsTab, setToolsTab] = useState(params.view === "preferences" ? "Preferences" : "Routines");
  const [category, setCategory] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  // Snapshot of the activity at the moment it was opened (content + assignment version). Refetches never relabel it.
  const [frozen, setFrozen] = useState<{ childId: string; key: string; item: Item; version: number | null; requestId: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const name = q.data?.child.name ?? child?.name ?? "your child";

  React.useEffect(() => {
    if (params.view === "preferences") { setOpenKey(null); setFrozen(null); setSub("routines"); setToolsTab("Preferences"); }
  }, [params.view]);
  React.useEffect(() => {
    if (params.activityId && openKey !== `daily:${params.activityId}` && q.data?.dailyActions.some((a) => a.id === params.activityId)) openItem(`daily:${params.activityId}`);
  }, [params.activityId, q.data?.dailyActions]);
  React.useEffect(() => {
    if (params.assignmentId && openKey !== `care:${params.assignmentId}` && care.assignments.some((a) => a.id === params.assignmentId)) openItem(`care:${params.assignmentId}`);
  }, [params.assignmentId, care.assignments.length]);

  const goalFor = (key: string | null) => q.data?.child.behaviors.find((b) => b.behaviorKey === key)?.goal || null;
  const fromDaily = (a: ParentDailyAction): Item => {
    const n = a.steps.length;
    const pos = a.currentStep ?? 0;
    const doc = q.data?.documents.find((d) => d.id === a.sourceDocumentId)?.title;
    return {
      kind: "daily", id: a.id, title: a.title, skill: categoryOf(`${a.title} ${a.behaviorName}`) ?? a.behaviorName, minutes: a.estimatedMinutes,
      description: a.description, materials: "", steps: a.steps, why: usefulWhy(a.whyItMayHelp), ifDifficult: "", notes: "",
      goalTitle: goalFor(a.behaviorKey), assigned: false, source: `${SOURCE[a.sourceType] ?? "Activity"}${doc ? ` · ${doc}` : ""}`,
      step: Math.min(Math.max(0, pos - 2), Math.max(0, n - 1)), finished: pos >= n + 2 && pos > 0, closed: isClosed(a.status),
      bookmarked: Boolean(a.bookmarked || a.status === "saved_for_later"),
    };
  };
  const fromCare = (a: CareActivity): Item => ({
    kind: "care", id: a.id, title: a.title, skill: a.skill, minutes: a.estimatedMinutes ?? null, description: a.description,
    materials: a.materials ?? "", steps: a.steps, why: usefulWhy(a.whyItMayHelp), ifDifficult: a.ifDifficult ?? "", notes: a.notes ?? "",
    goalTitle: a.goalTitle ?? null, assigned: true, source: "Assigned by your care team",
    step: Math.min(a.currentStep ?? 0, Math.max(0, a.steps.length - 1)), finished: (a.currentStep ?? 0) >= a.steps.length && (a.currentStep ?? 0) > 0,
    closed: false, bookmarked: Boolean(a.bookmarked),
  });
  const dailyItems = useMemo(() => (q.data?.dailyActions ?? []).map(fromDaily), [q.data]);
  const careItems = useMemo(() => care.assignments.map(fromCare), [care.query.data]);
  const all = [...careItems, ...dailyItems];
  const openItem = (key: string) => {
    const item = all.find((i) => `${i.kind}:${i.id}` === key);
    if (!item || !child) return;
    const version = item.kind === "care" ? care.assignments.find((a) => a.id === item.id)?.version ?? null : null;
    setFrozen({ childId: child.id, key, item, version, requestId: newRequestId() });
    setOpenKey(key); setError("");
  };
  const open = openKey && frozen && frozen.key === openKey && frozen.childId === child?.id ? frozen.item : null;
  const stillCurrent = open?.kind === "care" ? care.assignments.find((a) => a.id === open.id) : undefined;
  const careNotice = open?.kind === "care" && care.query.isSuccess
    ? !stillCurrent ? "This activity is no longer active (it may have been paused or archived). You can read it, but progress and updates can't be saved."
      : stillCurrent.version !== frozen?.version ? "Your care team updated this activity. You're viewing the version you opened; exit and reopen to see the latest instructions." : ""
    : "";
  const visibilityNote = open?.kind === "care"
    ? parent?.accountType === "legacy_family" ? "Your care team can see this update." : "Your care team sees this update only while observation sharing is on for your clinic connection."
    : undefined;
  const suggested = dailyItems.filter((i) => !i.closed).slice(0, 3);
  const catNames = CATEGORIES.map((x) => x.name).filter((n) => all.some((i) => !i.closed && categoryOf(`${i.title} ${i.skill}`) === n));
  const saved = all.filter((i) => i.bookmarked && !i.closed);

  const invalidate = async () => {
    if (!child) return;
    await Promise.all([
      cache.invalidateQueries({ queryKey: getGetParentDashboardQueryKey(child.id) }),
      cache.invalidateQueries({ queryKey: care.queryKey }),
    ]);
  };
  const assignmentVersion = (id: string) => (frozen && frozen.item.id === id && frozen.version != null ? frozen.version : care.assignments.find((a) => a.id === id)?.version ?? 0);
  const saveProgress = async (item: Item, step: number, finished: boolean, bookmarked: boolean) => {
    if (!child || item.closed) return;
    if (item.kind === "daily") {
      await updateParentPracticeProgress(child.id, item.id, { currentStep: finished ? item.steps.length + 2 : step + 2, bookmarked }, opts);
    } else {
      await saveCareTeamPracticeProgress(child.id, item.id, { version: assignmentVersion(item.id), currentStep: finished ? item.steps.length : step, bookmarked }, opts);
    }
  };
  const toggleSave = async (item: Item) => {
    setBusyId(item.id); setError("");
    try { await saveProgress(item, item.step, item.finished, !item.bookmarked); await invalidate(); }
    catch (e) { setError(msg(e, "Could not update saved activities.")); }
    finally { setBusyId(null); }
  };
  const exit = () => {
    setOpenKey(null); setFrozen(null); setError("");
    if (params.activityId || params.assignmentId || params.view) router.setParams({ activityId: undefined, assignmentId: undefined, view: undefined });
  };

  if (q.isLoading) return <Screen><H>Practice</H><Skeleton lines={5} /></Screen>;
  if (q.isError) return <Screen><H>Practice</H><ErrorBox message={msg(q.error, "Practice activities could not load.")} onRetry={() => q.refetch()} /></Screen>;

  if (open) {
    return <Screen>{careNotice ? <ErrorBox message={careNotice} /> : null}<Guided visibilityNote={visibilityNote} key={`${open.kind}:${open.id}`} item={open} childName={name} onExit={exit}
      onStep={async (step, finished) => { await saveProgress(open, step, finished, open.bookmarked); setFrozen((f) => (f ? { ...f, item: { ...f.item, step, finished } } : f)); }}
      onSaveForLater={async (step) => { await saveProgress(open, step, false, true); setFrozen((f) => (f ? { ...f, item: { ...f.item, step, bookmarked: true } } : f)); await invalidate(); exit(); }}
      onFeedback={async (o, note) => {
        if (!child) return;
        const sel = OUTCOMES.find((x) => x.value === o);
        if (open.kind === "daily") {
          await updateParentPracticeProgress(child.id, open.id, { currentStep: open.steps.length + 2, bookmarked: false }, opts);
          const data: ParentDailyActionLogInput = { eventType: "outcome", ...(sel ? { outcome: sel.daily } : {}), ...(note ? { note } : {}) };
          await logParentDailyAction(child.id, open.id, data, opts);
        } else if (sel) {
          await recordCareTeamPractice(child.id, open.id, { version: assignmentVersion(open.id), outcome: sel.care, ...(note ? { note } : {}), requestId: frozen!.requestId }, opts);
        }
        await invalidate(); exit();
      }} /></Screen>;
  }

  const back = <Pressable accessibilityRole="button" onPress={() => { setSub("home"); setCategory(null); }} style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40 }}>
    <Feather name="chevron-left" size={18} color={c.primary} /><T size={14} weight="semi" color={c.primary}>Practice</T>
  </Pressable>;
  const card = (i: Item) => <ActivityCard key={`${i.kind}:${i.id}`} item={i} busy={busyId === i.id} onStart={() => openItem(`${i.kind}:${i.id}`)} onSave={() => void toggleSave(i)} />;

  if (sub === "routines") return <Screen>{back}<H sub="Create or open familiar routines.">My Routines</H>
    <FamilyTools key={toolsTab} initialTab={toolsTab} actions={(q.data?.dailyActions ?? []).map((a) => ({ id: a.id, title: a.title, status: a.status }))} onActivities={() => setSub("home")} /></Screen>;
  if (sub === "saved") return <Screen>{back}<H sub="Return to activities you saved.">Saved Activities</H>
    {error ? <ErrorBox message={error} /> : null}
    {saved.length ? saved.map(card) : <Card><T weight="semi">Nothing saved yet</T><T size={14} color={c.secondary}>Tap Save on any activity to keep it here.</T></Card>}</Screen>;
  if (sub === "explore") {
    const list = all.filter((i) => !i.closed && (!category || categoryOf(`${i.title} ${i.skill}`) === category));
    return <Screen>{back}<H sub="Pick a category to narrow the list.">Explore Activities</H>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Chip label="All" selected={!category} onPress={() => setCategory(null)} />
        {catNames.map((n) => <Chip key={n} label={n} selected={category === n} onPress={() => setCategory(n)} />)}
      </View>
      {error ? <ErrorBox message={error} /> : null}
      {list.length ? list.map(card) : <Card><T size={14} color={c.secondary}>No activities in this category yet.</T></Card>}</Screen>;
  }

  return (
    <Screen>
      <H sub="Simple activities and routines you can try together.">{`Practice With ${name}`}</H>
      {error ? <ErrorBox message={error} /> : null}
      {care.query.isError ? <ErrorBox message={msg(care.query.error, "Care team activities could not load.")} onRetry={() => void care.query.refetch()} /> : null}
      {careItems.length ? <Section title="Assigned by Your Care Team" sub={`Activities your care team has selected for ${name}.`}>{careItems.map(card)}</Section> : null}
      <Section title={`Activities for ${name}`}>
        {suggested.length ? suggested.map(card) : <Card><T weight="semi">No activities ready yet</T>
          <T size={14} color={c.secondary}>Activities appear once goals or a plan are saved for {name}.</T></Card>}
      </Section>
      {all.some((i) => !i.closed) ? <Section title="Explore More Activities">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {(catNames.length ? catNames : ["All"]).map((n) => <Chip key={n} label={n} onPress={() => { setCategory(n === "All" ? null : n); setSub("explore"); }} />)}
        </View>
      </Section> : null}
      <View style={{ gap: 8 }}>
        <NavRow icon="repeat" title="My Routines" sub="Create or open familiar routines." onPress={() => { setToolsTab("Routines"); setSub("routines"); }} />
        <NavRow icon="bookmark" title="Saved Activities" sub={saved.length ? `${saved.length} saved` : "Return to previously saved activities."} onPress={() => setSub("saved")} />
      </View>
    </Screen>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  const c = useColors();
  return <View style={{ gap: 10, marginTop: 4 }}>
    <View style={{ gap: 2 }}><T size={18} weight="bold">{title}</T>{sub ? <T size={13} color={c.secondary}>{sub}</T> : null}</View>
    {children}
  </View>;
}

function NavRow({ icon, title, sub, onPress }: { icon: keyof typeof Feather.glyphMap; title: string; sub: string; onPress: () => void }) {
  const c = useColors();
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: pressed ? c.muted : c.card })}>
    <Feather name={icon} size={18} color={c.primary} />
    <View style={{ flex: 1 }}><T size={15} weight="semi">{title}</T><T size={12} color={c.secondary}>{sub}</T></View>
    <Feather name="chevron-right" size={18} color={c.secondary} />
  </Pressable>;
}

function ActivityCard({ item, busy, onStart, onSave }: { item: Item; busy: boolean; onStart: () => void; onSave: () => void }) {
  const c = useColors();
  return <Card>
    {item.assigned ? <AssignedBadge /> : null}
    <T size={16} weight="bold">{item.title}</T>
    <T size={12} weight="semi" color={c.secondary}>{[item.skill, item.minutes ? `${item.minutes} minutes` : null].filter(Boolean).join(" · ")}</T>
    {item.goalTitle ? <T size={12} color={c.secondary}>Related goal: {item.goalTitle}</T> : null}
    <T size={14} color={c.secondary} style={{}}>{item.description.length > 150 ? `${item.description.slice(0, 147)}...` : item.description}</T>
    <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
      <Pressable accessibilityRole="button" testID={`practice-start-${item.id}`} onPress={onStart} style={{ paddingHorizontal: 16, minHeight: 40, justifyContent: "center", borderRadius: 10, backgroundColor: c.primary }}>
        <T size={13} weight="semi" color={c.primaryForeground}>{item.closed ? "Review" : item.step > 0 ? "Continue" : "Start Activity"}</T>
      </Pressable>
      {!item.closed ? <Pressable accessibilityRole="button" accessibilityState={{ selected: item.bookmarked }} disabled={busy} onPress={onSave} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, minHeight: 40, borderRadius: 10, borderWidth: 1, borderColor: c.border, opacity: busy ? 0.6 : 1 }}>
        <Feather name="bookmark" size={14} color={c.primary} /><T size={13} weight="semi" color={c.primary}>{busy ? "Saving..." : item.bookmarked ? "Saved" : "Save"}</T>
      </Pressable> : null}
    </View>
  </Card>;
}
