import React, { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { useFocusEffect, router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { getParentBehaviors, getParentDashboard, parentBehaviorIdentity } from "@workspace/api-client-react";
import type { SupportCard } from "@workspace/api-client-react";
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

function List({ title, items, tone }: { title: string; items: string[]; tone?: "warn" }) {
  const c = useColors();
  if (!items?.length) return null;
  return (
    <Card tone={tone}>
      <T weight="bold" size={16}>{title}</T>
      {items.map((it, i) => (
        <View key={i} style={{ flexDirection: "row", gap: 10 }}>
          <T weight="bold" color={c.primary}>{i + 1}.</T>
          <View style={{ flex: 1 }}><T>{it}</T></View>
        </View>
      ))}
    </Card>
  );
}

export default function SupportNow() {
  const c = useColors();
  const { child, opts } = useParent();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showHelpBlocks, setShowHelpBlocks] = useState(false);
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

  return (
    <Screen>
      <H sub={`For ${q.data?.child.name ?? child?.name ?? ""}`}>Today's Support</H>
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
                {card.conflict ? <Card tone="warn"><T weight="semi">Conflict detected. Clinician review recommended.</T>{card.conflictMessage ? <T size={14}>{card.conflictMessage}</T> : null}</Card> : null}
                {selectedBehavior ? <Card><T weight="bold" size={16}>Saved goal</T><T>{activeGoal ?? "No goal chosen yet"}</T></Card> : null}
                {hasPlanGoal(card) ? <Card><T weight="bold" size={16}>Plan goal</T><T>{planGoal(card)}</T></Card> : <>{isFoundCard ? <Card><T weight="bold" size={16}>Plan goal</T><T>No plan goal identified in the uploaded plan.</T></Card> : null}{card.goal ? <Card><T weight="bold" size={16}>Saved guidance goal</T><T>{card.goal}</T></Card> : null}</>}
                {activeGoal && hasPlanGoal(card) && activeGoal !== planGoal(card) ? <Card tone="warn"><T size={14}>The plan goal is different from the saved goal. Saved goal: {activeGoal}. Plan goal: {planGoal(card)}.</T></Card> : null}
                <List title="What to do right now" items={card.rightNow} />
                <Card><T weight="bold" size={16}>What may be happening</T><T>{card.whatMayBeHappening}</T></Card>
                <List title="What to avoid" items={card.avoid} tone="warn" />
                <List title="Prevent it next time" items={card.prevention} />
                <Card><T weight="bold" size={16}>Try this replacement skill</T><T>{card.replacementSkill}</T><T size={14} color={c.secondary}>{card.reinforcementIdea}</T></Card>
                {selectedBehavior ? <Card><T weight="bold" size={16}>Current focus</T><T>{activeGoal ?? "No goal chosen yet"}</T></Card> : null}
                <Card><T weight="bold" size={16}>When to get help</T><T>{card.seekHelp}</T></Card>
                <List title="What to track" items={card.track} />
                {isFoundCard ? <Btn kind="ghost" icon="plus" label="Add Behavior to your setup" onPress={() => router.push({ pathname: "/parent-edit", params: { card: card.id } } as never)} /> : <Btn icon="edit-3" label="Log what happened" onPress={() => router.push({ pathname: "/(parent)/log", params: { b: parentBehaviorIdentity(card) } } as never)} />}
                {card.source === "starter" ? <T size={13} weight="semi" color={c.secondary}>This is starter support. Upload your child's plan for personalized guidance.</T> : null}
                {card.sourceReferences?.length ? (
                  <Card>
                    <T weight="bold" size={16}>Sources</T>
                    {card.sourceReferences.map((r, i) => (<View key={i}><T weight="semi" size={14}>{r.title}</T>{r.excerpt ? <T size={13} color={c.secondary}>{r.excerpt}</T> : null}</View>))}
                  </Card>
                ) : null}
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
