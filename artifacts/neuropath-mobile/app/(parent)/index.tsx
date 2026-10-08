import React, { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { useFocusEffect, router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getParentBehaviors, getParentDashboard, parentBehaviorIdentity, useLogParentDailyAction } from "@workspace/api-client-react";
import type { ParentDailyAction, ParentDocument, SupportCard } from "@workspace/api-client-react";
import { BehaviorLibrary } from "@/components/BehaviorLibrary";
import { ChildSwitch } from "@/components/ChildSwitch";
import { Btn, Card, Chip, ErrorBox, H, Row, Screen, Skeleton, T, msg } from "@/components/ParentUi";
import { useParent } from "@/context/ParentContext";
import { useColors } from "@/hooks/useColors";
import { progressFor } from "@/lib/parentProgress";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "never");

const SOURCE: Record<SupportCard["source"], string> = {
  starter: "Starter support based on common behavior patterns. Upload your child's plan later for more personalized guidance.",
  parent_document: "Based on your child's uploaded plan. Not yet reviewed by a clinician.",
  clinician_document: "Document-Based Support from a plan shared by your clinician.",
  clinician_reviewed: "Reviewed by your clinician.",
};

const planGoal = (card: SupportCard) => card.planGoal;
const hasPlanGoal = (card: SupportCard) =>
  typeof card.planGoal === "string" && card.planGoal.trim().length > 0;

const DAILY_ACTION_SOURCE: Record<string, string> = {
  clinician_reviewed: "Source: Reviewed by your clinician",
  clinician_uploaded_plan: "Source: Clinician-uploaded document",
  parent_uploaded_plan: "Source: Uploaded plan · not yet reviewed by a clinician",
  starter_template: "Source: General starter support",
};

const DAILY_FEEDBACK = [
  ["helped", "Worked well"],
  ["somewhat_helped", "Helped somewhat"],
  ["not_helped", "Didn't work"],
  ["behavior_escalated", "Behavior escalated"],
] as const;

const DAILY_OUTCOMES = [
  ["used_skill", "Completed", "check-circle"],
  ["not_yet", "Didn't get a chance", "clock"],
  ["partially", "This was difficult", "alert-triangle"],
] as const;

function DailyActivityCard({ action, documents, childName, onOutcome, isSaving, error }: {
  action: ParentDailyAction;
  documents: ParentDocument[];
  childName: string;
  onOutcome: (action: ParentDailyAction, outcome: "used_skill" | "not_yet" | "partially") => void;
  isSaving: boolean;
  error?: string;
}) {
  const c = useColors();
  const document = action.sourceDocumentId
    ? documents.find((item) => item.id === action.sourceDocumentId)
    : null;
  const feedback = action.logs?.[0];
  const outcomeLabel = DAILY_OUTCOMES.find(([value]) => value === feedback?.outcome)?.[1];
  const ratingLabel = DAILY_FEEDBACK.find(([value]) => value === feedback?.rating)?.[1];
  return (
    <Card>
      <T size={12} weight="semi" color={c.secondary}>Practice this today · {action.behaviorName} · {action.estimatedMinutes} min</T>
      <T size={18} weight="bold">{action.title}</T>
      <T size={14}>{action.description}</T>
      {action.whyItMayHelp ? (
        <View style={{ backgroundColor: c.muted, borderLeftWidth: 4, borderLeftColor: c.accent, borderRadius: 12, padding: 12, gap: 4 }}>
          <T size={13} weight="bold">Why you're doing this</T>
          <T size={13}>{action.whyItMayHelp}</T>
        </View>
      ) : null}
      {action.steps.map((step, index) => (
        <View key={`${action.id}-${index}`} style={{ flexDirection: "row", gap: 9, alignItems: "flex-start" }}>
          <T size={13} weight="bold" color={c.primary}>{index + 1}.</T>
          <View style={{ flex: 1 }}><T size={14}>{step}</T></View>
        </View>
      ))}
      <T size={12} weight="semi" color={c.secondary}>{DAILY_ACTION_SOURCE[action.sourceType] || "Source: Not available"}</T>
      {document ? <T size={12} color={c.secondary}>Plan: {document.title || document.fileName}</T> : null}
      {action.status === "needs_review"
        ? <T size={13} weight="semi" color={c.destructive}>Ask your clinician which plan step to use before trying this.</T>
        : action.status === "done" || action.status === "logged"
          ? <T size={13} color={c.secondary}>{outcomeLabel ? `Your update: ${outcomeLabel}` : ratingLabel ? `Your feedback: ${ratingLabel}` : "Your update is saved for today."}{feedback?.note ? ` · ${feedback.note}` : ""}</T>
          : action.status === "skipped"
            ? <T size={13} color={c.secondary}>You can revisit this support step from the library.</T>
            : (
              <View style={{ gap: 8 }}>
                <T size={13} weight="semi">Did you work on it today?</T>
                {DAILY_OUTCOMES.map(([value, label, icon]) => {
                  const primary = value === "used_skill";
                  return (
                    <Pressable
                      key={value}
                      testID={`activity-outcome-${action.id}-${value}`}
                      accessibilityRole="button"
                      accessibilityLabel={`For ${childName}: ${label}`}
                      disabled={isSaving}
                      onPress={() => onOutcome(action, value)}
                      style={({ pressed }) => ({
                        minHeight: 50,
                        paddingHorizontal: 14,
                        paddingVertical: 11,
                        borderRadius: 14,
                        borderWidth: 1.5,
                        borderColor: primary ? c.primary : c.border,
                        backgroundColor: primary ? c.primary : c.card,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                        opacity: isSaving ? 0.55 : pressed ? 0.86 : 1,
                      })}
                    >
                      <Feather name={icon} size={18} color={primary ? c.primaryForeground : c.primary} />
                      <T weight="semi" color={primary ? c.primaryForeground : c.foreground}>{isSaving ? "Saving..." : label}</T>
                    </Pressable>
                  );
                })}
                {error ? <T size={13} color={c.destructive}>{error}</T> : null}
              </View>
            )}
    </Card>
  );
}

type SupportTone = "now" | "avoid" | "context" | "prevention" | "skill" | "track" | "help";

function SupportSection({ title, items, body, detail, tone }: {
  title: string;
  items?: string[];
  body?: string;
  detail?: string;
  tone: SupportTone;
}) {
  const c = useColors();
  const accent = tone === "avoid" || tone === "help"
    ? c.destructive
    : tone === "prevention"
      ? c.accent
      : tone === "context" || tone === "track"
        ? c.secondary
        : c.primary;
  const readableAccent = tone === "prevention" ? c.secondary : accent;
  if (!items?.length && !body) return null;
  return (
    <View style={{ backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderLeftWidth: 5, borderLeftColor: accent, borderRadius: 16, padding: 16, gap: 10 }}>
      <T weight="bold" size={16} color={readableAccent}>{title}</T>
      {body ? <T>{body}</T> : null}
      {detail ? <T size={14} color={c.secondary}>{detail}</T> : null}
      {(items ?? []).map((it, i) => (
        <View key={i} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
          <View style={{ width: 23, height: 23, borderRadius: 12, backgroundColor: c.muted, alignItems: "center", justifyContent: "center" }}>
            <T weight="bold" size={12} color={readableAccent}>{i + 1}</T>
          </View>
          <View style={{ flex: 1 }}><T size={14} style={{ lineHeight: 21 }}>{it}</T></View>
        </View>
      ))}
    </View>
  );
}

export default function SupportNow() {
  const c = useColors();
  const { child, opts } = useParent();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showHelpBlocks, setShowHelpBlocks] = useState(false);
  const [dailyActionError, setDailyActionError] = useState<{ actionId: string; message: string } | null>(null);
  const logAction = useLogParentDailyAction({ request: opts });
  const q = useQuery({ queryKey: ["parent-dashboard", child?.id], queryFn: () => getParentDashboard(child!.id, opts), enabled: !!child });
  const refetch = q.refetch;
  // Re-sync behavior, goal and source text from the server whenever this tab regains focus (e.g. after a scan).
  useFocusEffect(useCallback(() => { if (child) refetch(); }, [child, refetch]));
  const savedCards = q.data?.supportCards ?? [];
  const behaviors = getParentBehaviors(q.data?.child ?? child ?? {});
  const activeIds = new Set(behaviors.map(parentBehaviorIdentity));
  const foundCards = savedCards.filter((k) => !activeIds.has(parentBehaviorIdentity(k)) && k.source !== "starter");
  const logs = q.data?.logs ?? [];
  const cardFor = (id: string) => savedCards.find((k) => parentBehaviorIdentity(k) === id);
  const selectedBehavior = selectedId ? behaviors.find((b) => parentBehaviorIdentity(b) === selectedId) : undefined;
  const card = selectedId ? cardFor(selectedId) : undefined;
  const isFoundCard = !!card && !activeIds.has(parentBehaviorIdentity(card));
  const activeGoal = selectedBehavior?.goal ?? null;
  const childName = q.data?.child.name ?? child?.name ?? "your child";

  const saveOutcome = (action: ParentDailyAction, outcome: "used_skill" | "not_yet" | "partially") => {
    if (!child || logAction.isPending) return;
    setDailyActionError(null);
    logAction.mutate({
      childId: action.childId,
      actionId: action.id,
      data: {
        eventType: "outcome",
        outcome,
      },
    }, {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: ["parent-dashboard", child.id] });
      },
      onError: (error) => setDailyActionError({ actionId: action.id, message: msg(error, "Your update could not be saved.") }),
    });
  };

  return (
    <Screen>
      <H>{`Support for ${childName}`}</H>
      <ChildSwitch />
      <T weight="bold" size={17}>Need help right now?</T>
      <Pressable testID="help-now" accessibilityRole="button" onPress={() => setShowHelpBlocks(true)} style={({ pressed }) => ({ backgroundColor: c.destructive, borderRadius: 20, padding: 22, flexDirection: "row", alignItems: "center", gap: 14, opacity: pressed ? 0.9 : 1 })}>
        <Feather name="life-buoy" size={30} color={c.destructiveForeground} />
        <View style={{ flex: 1 }}>
          <T weight="bold" size={22} color={c.destructiveForeground}>I Need Help Now</T>
          <T size={13} color={c.destructiveForeground}>Tap to choose a behavior and see support steps</T>
        </View>
      </Pressable>

      {q.isLoading ? <Skeleton lines={4} /> : q.isError ? <ErrorBox message={msg(q.error, "Your support could not load.")} onRetry={() => q.refetch()} /> : (
        <>
          <T weight="bold" size={19}>{`Today for ${childName}`}</T>
          <T size={14} color={c.secondary}>Daily practice activities are based on the routines and skills described in the available plan.</T>
          {(q.data?.dailyActions ?? []).length ? (
            (q.data?.dailyActions ?? []).map((action) => (
              <DailyActivityCard
                key={action.id}
                action={action}
                documents={q.data?.documents ?? []}
                childName={childName}
                onOutcome={saveOutcome}
                isSaving={logAction.isPending && logAction.variables?.actionId === action.id}
                error={dailyActionError?.actionId === action.id ? dailyActionError.message : undefined}
              />
            ))
          ) : (
            <Card>
              <T weight="semi">Build today's practice list</T>
              <T size={14}>Choose a goal or upload a plan. Activities will be based on the goals and support guidance available for {childName}.</T>
              <Btn kind="ghost" icon="target" label="Choose a Goal" onPress={() => router.push({ pathname: "/parent-edit", params: { add: "pick" } } as never)} />
              <Btn kind="ghost" icon="upload" label="Upload a Plan" onPress={() => router.push("/(parent)/documents" as never)} />
            </Card>
          )}
          {(q.data?.planGoals ?? []).length > 0 ? (
            <Card>
              <T weight="bold" size={17}>Goals and milestones from plans and reports</T>
              <T size={13} color={c.secondary}>These were added from uploaded documents and do not replace your saved goals.</T>
              {(q.data?.planGoals ?? []).map((goal) => (
                <View key={goal.id} style={{ borderTopWidth: 1, borderTopColor: c.border, paddingTop: 12, gap: 6 }}>
                  <T weight="semi" size={15}>{goal.title}</T>
                  {goal.sourceType === "clinician_uploaded_plan"
                    ? <T size={12} color={c.secondary}>From a clinician-uploaded document</T>
                    : <T size={12} color={c.secondary}>From an uploaded plan</T>}
                  {goal.description ? <T size={13}>{goal.description}</T> : null}
                  {goal.milestones.map((milestone, index) => (
                    <View key={`${goal.id}-milestone-${index}`} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                      <T size={13} weight="bold" color={c.primary}>{index + 1}.</T>
                      <View style={{ flex: 1 }}><T size={13}>{milestone}</T></View>
                    </View>
                  ))}
                  {!goal.milestones.length ? <T size={13} color={c.secondary}>Practice activities based on this goal appear in Today.</T> : null}
                </View>
              ))}
            </Card>
          ) : null}
          {showHelpBlocks ? (
            <Card>
              <T weight="bold" size={18}>What do you need help with right now?</T>
              {behaviors.map((b) => {
                const id = parentBehaviorIdentity(b);
                const k = cardFor(id);
                return (
                  <Pressable key={id} accessibilityRole="button" onPress={() => setSelectedId(id)} style={{ borderWidth: 1.5, borderColor: selectedId === id ? c.primary : c.border, backgroundColor: c.card, borderRadius: 14, padding: 14, gap: 4 }}>
                    <T weight="bold" size={16}>{b.behaviorName}</T>
                    <T size={13} weight="semi" color={c.primary}>Active</T>
                    <T size={13}>Saved goal: {b.goal ?? "No goal chosen yet"}</T>
                    {k && hasPlanGoal(k) ? <T size={13}>Plan goal: {planGoal(k)}</T> : k?.goal ? <T size={13}>Saved guidance goal: {k.goal}</T> : null}
                    {!k ? <T size={13} color={c.secondary}>Support steps are not ready yet.</T> : null}
                  </Pressable>
                );
              })}
              {foundCards.map((k) => (
                <Pressable key={k.id} accessibilityRole="button" onPress={() => setSelectedId(parentBehaviorIdentity(k))} style={{ borderWidth: 1.5, borderColor: selectedId === parentBehaviorIdentity(k) ? c.primary : c.border, backgroundColor: c.card, borderRadius: 14, padding: 14, gap: 4 }}>
                  <T weight="bold" size={16}>{k.behaviorName}</T>
                  <T size={13} weight="semi" color={c.primary}>Found in uploaded plan · not active</T>
                  {hasPlanGoal(k) ? <T size={13}>Plan goal: {planGoal(k)}</T> : <T size={13}>No plan goal identified in the uploaded plan.</T>}
                  {!hasPlanGoal(k) && k.goal ? <T size={13}>Saved guidance goal: {k.goal}</T> : null}
                </Pressable>
              ))}
              {!behaviors.length && !foundCards.length ? <T size={14}>No behavior support is available yet.</T> : null}
              <Btn kind="ghost" icon="upload" label="Upload a Plan" onPress={() => router.push("/(parent)/documents" as never)} />
              <Btn kind="ghost" icon="plus" label="Add Another Behavior" onPress={() => router.push({ pathname: "/parent-edit", params: { add: "pick" } } as never)} />
            </Card>
          ) : null}
          {selectedId ? (
            !card && selectedBehavior ? <Card><T weight="semi">{selectedBehavior.behaviorName} support steps are not ready yet.</T><T>Saved goal: {selectedBehavior.goal ?? "No goal chosen yet"}</T><Btn kind="ghost" label="Close steps" onPress={() => setSelectedId(null)} /></Card> :
            !card ? <Card><T weight="semi">Your support card is not ready yet.</T><Btn label="Finish setup" onPress={() => router.push("/parent-quickstart" as never)} /></Card> : (
              <>
                <H>{`${card.behaviorName} Support`}</H>
                {showHelpBlocks ? <Btn kind="ghost" label="Close steps" onPress={() => setSelectedId(null)} /> : null}
                <T size={13} weight="semi" color={c.primary}>{isFoundCard ? "Found in uploaded plan · not active" : "Active behavior"}</T>
                <T size={13} weight="semi" color={card.source === "clinician_reviewed" ? c.primary : c.secondary}>{SOURCE[card.source]}</T>
                {selectedBehavior ? <Card><T weight="bold" size={16}>Saved goal</T><T>{activeGoal ?? "No goal chosen yet"}</T></Card> : null}
                {hasPlanGoal(card) ? <Card><T weight="bold" size={16}>Plan goal</T><T>{planGoal(card)}</T></Card> : <>{isFoundCard ? <Card><T weight="bold" size={16}>Plan goal</T><T>No plan goal identified in the uploaded plan.</T></Card> : null}{card.goal ? <Card><T weight="bold" size={16}>Saved guidance goal</T><T>{card.goal}</T></Card> : null}</>}
                {activeGoal && hasPlanGoal(card) && activeGoal !== planGoal(card) ? <Card tone="warn"><T size={14}>The plan goal is different from the saved goal. Saved goal: {activeGoal}. Plan goal: {planGoal(card)}.</T></Card> : null}
                <SupportSection title="Try these steps first" items={card.rightNow} tone="now" />
                <SupportSection title="What to avoid" items={card.avoid} tone="avoid" />
                <SupportSection title="Prevent it next time" items={card.prevention} tone="prevention" />
                <SupportSection title="Why this may be happening" body={card.whatMayBeHappening} tone="context" />
                <SupportSection title="Practice a helpful skill" body={card.replacementSkill} detail={`Reinforce: ${card.reinforcementIdea}`} tone="skill" />
                {selectedBehavior ? <Card><T weight="bold" size={16}>Current focus</T><T>{activeGoal ?? "No goal chosen yet"}</T></Card> : null}
                <SupportSection title="When to get help" body={card.seekHelp} tone="help" />
                <SupportSection title="What to notice" items={card.track} tone="track" />
                {isFoundCard ? <Btn kind="ghost" icon="plus" label="Add Behavior to your setup" onPress={() => router.push({ pathname: "/parent-edit", params: { card: card.id } } as never)} /> : <Btn icon="edit-3" label="Log what happened" onPress={() => router.push({ pathname: "/(parent)/log", params: { b: parentBehaviorIdentity(card) } } as never)} />}
                {card.source === "starter" ? <T size={13} weight="semi" color={c.secondary}>This is starter support. Upload your child's plan for personalized guidance.</T> : null}
              </>
            )
          ) : null}

          <Card>
            <T weight="bold" size={17}>Progress from your logs</T>
            <T>{logs.filter((entry) => +new Date(entry.createdAt) >= Date.now() - 7 * 86400000).length} entries in the last 7 days</T>
            <T size={13} color={c.secondary}>These counts describe what you recorded, not whether a goal was met.</T>
          </Card>
          <Card>
            <T weight="bold" size={17}>Your goals</T>
            {behaviors.map((b) => {
              const k = cardFor(parentBehaviorIdentity(b));
              return <View key={parentBehaviorIdentity(b)}><T weight="semi" size={14}>{b.behaviorName}</T><T size={14}>Saved goal: {b.goal ?? "Choose a goal"}</T>{k && hasPlanGoal(k) ? <T size={14}>Plan goal: {planGoal(k)}</T> : k?.goal ? <T size={14}>Saved guidance goal: {k.goal}</T> : null}</View>;
            })}
            {foundCards.length ? (
              <>
                <T weight="semi" size={15}>Goals found in uploaded plans</T>
                {foundCards.map((k) => (
                  <View key={k.id}>
                    <T weight="semi" size={14}>{k.behaviorName}</T>
                    <T size={14}>{hasPlanGoal(k) ? `Plan goal: ${planGoal(k)}` : "No plan goal identified in the uploaded plan."}</T>
                    {!hasPlanGoal(k) && k.goal ? <T size={14}>Saved guidance goal: {k.goal}</T> : null}
                  </View>
                ))}
              </>
            ) : null}
          </Card>
          <T weight="bold" size={17}>{behaviors.length > 1 ? "Your behaviors and goals" : "Your behavior and goal"}</T>
          {!behaviors.length ? <Card><T weight="semi">No behavior chosen yet.</T><Btn label="Finish setup" onPress={() => router.push("/parent-quickstart" as never)} /></Card> : null}
          {behaviors.map((b) => {
            const id = parentBehaviorIdentity(b);
            const k = cardFor(id);
            const p = progressFor(logs, id);
            return (
              <Card key={id}>
                <T size={12} weight="semi" color={c.mutedForeground}>Behavior</T>
                <T weight="bold" size={18}>{b.behaviorName}</T>
                {k ? <T size={13} weight="semi" color={k.source === "clinician_reviewed" ? c.primary : c.secondary}>{SOURCE[k.source]}</T> : <T size={13} color={c.secondary}>Support card is not ready yet.</T>}
                {k?.conflict ? <T size={13} weight="semi" color={c.destructive}>Conflict detected. Clinician review recommended.</T> : null}
                <T size={12} weight="semi" color={c.mutedForeground}>Saved goal</T>
                <T weight="semi">{b.goal ?? "No goal chosen yet"}</T>
                {k && hasPlanGoal(k) ? <><T size={12} weight="semi" color={c.mutedForeground}>Plan goal</T><T weight="semi">{planGoal(k)}</T></> : k?.goal ? <><T size={12} weight="semi" color={c.mutedForeground}>Saved guidance goal</T><T weight="semi">{k.goal}</T></> : null}
                <T size={12} weight="semi" color={c.mutedForeground}>Your log</T>
                {p.entries ? (
                  <T size={14}>{`${p.entries} ${p.entries === 1 ? "entry" : "entries"} logged: ${p.episodes} with an episode, ${p.notHappened} without. ${p.episodesWeek} ${p.episodesWeek === 1 ? "episode" : "episodes"} in the last 7 days. Last entry ${when(p.last)}.`}</T>
                ) : <T size={14} color={c.secondary}>Nothing logged yet. Entries you record will be summarized here.</T>}
                <Row wrap>
                  <Chip label="Support steps" selected={selectedId === id} onPress={() => { setShowHelpBlocks(true); setSelectedId(id); }} />
                  <Chip label="Log it" onPress={() => router.push({ pathname: "/(parent)/log", params: { b: id } } as never)} />
                </Row>
              </Card>
            );
          })}
          <T weight="bold" size={17}>Behavior Support Library</T>
          <BehaviorLibrary behaviors={behaviors} cards={savedCards} onOpen={(id) => { setShowHelpBlocks(true); setSelectedId(id); }} />
          <Card>
            <T weight="bold" size={17}>Quick actions</T>
            <Btn icon="edit-3" label="Log What Happened" onPress={() => router.push("/(parent)/log" as never)} />
            <Btn kind="ghost" icon="upload" label="Upload a Plan" onPress={() => router.push("/(parent)/documents" as never)} />
            <Btn kind="ghost" icon="plus" label="Add Behavior" onPress={() => router.push({ pathname: "/parent-edit", params: { add: "pick" } } as never)} />
            <Btn kind="ghost" icon="target" label="Add Goal" onPress={() => router.push({ pathname: "/parent-edit", params: { focus: behaviors.find((b) => !b.goal)?.behaviorKey ? parentBehaviorIdentity(behaviors.find((b) => !b.goal)!) : "goal" } } as never)} />
            <Btn kind="ghost" icon="edit-2" label="Edit Child Profile" onPress={() => router.push("/parent-edit" as never)} />
          </Card>
          <Card>
            <T weight="bold" size={17}>Make this more personalized</T>
            <T size={14}>Upload a behavior plan, school support plan, or treatment plan when you are ready.</T>
            <Btn testID="upload-plan" icon="upload" label="Upload a Plan" onPress={() => router.push("/(parent)/documents" as never)} />
          </Card>
        </>
      )}
    </Screen>
  );
}
