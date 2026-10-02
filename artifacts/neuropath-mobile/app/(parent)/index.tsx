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
  const [pickId, setPickId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const q = useQuery({ queryKey: ["parent-dashboard", child?.id], queryFn: () => getParentDashboard(child!.id, opts), enabled: !!child });
  const refetch = q.refetch;
  // Re-sync behavior, goal and source text from the server whenever this tab regains focus (e.g. after a scan).
  useFocusEffect(useCallback(() => { if (child) refetch(); }, [child, refetch]));
  const savedCards = q.data?.supportCards ?? [];
  const behaviors = getParentBehaviors(q.data?.child ?? child ?? {});
  const cards = savedCards.filter((k) => behaviors.some((b) => parentBehaviorIdentity(b) === parentBehaviorIdentity(k)));
  const logs = q.data?.logs ?? [];
  const cardFor = (id: string) => cards.find((k) => parentBehaviorIdentity(k) === id);
  const card = (pickId && cardFor(pickId)) || (cards.length === 1 ? cards[0] : undefined);
  const activeId = card ? parentBehaviorIdentity(card) : null;
  const activeGoal = behaviors.find((b) => parentBehaviorIdentity(b) === activeId)?.goal ?? null;

  return (
    <Screen>
      <H sub={`For ${q.data?.child.name ?? child?.name ?? ""}`}>Today's Support</H>
      <ChildSwitch />
      <T weight="bold" size={17}>Need help right now?</T>
      <Pressable testID="help-now" accessibilityRole="button" onPress={() => { if (open || picking) { setOpen(false); setPicking(false); return; } if (cards.length === 1) { setPickId(parentBehaviorIdentity(cards[0])); setOpen(true); } else { setPickId(null); setPicking(true); } }} style={({ pressed }) => ({ backgroundColor: c.destructive, borderRadius: 20, padding: 22, flexDirection: "row", alignItems: "center", gap: 14, opacity: pressed ? 0.9 : 1 })}>
        <Feather name="life-buoy" size={30} color={c.destructiveForeground} />
        <View style={{ flex: 1 }}>
          <T weight="bold" size={22} color={c.destructiveForeground}>I Need Help Now</T>
          <T size={13} color={c.destructiveForeground}>{open || picking ? "Tap to close" : "Tap for steps to use right now"}</T>
        </View>
      </Pressable>

      {q.isLoading ? <Skeleton lines={4} /> : q.isError ? <ErrorBox message={msg(q.error, "Your support could not load.")} onRetry={() => q.refetch()} /> : (
        <>
          {picking ? (
            <Card>
              <T weight="bold" size={18}>What do you need help with right now?</T>
              {cards.map((k) => <Btn key={k.id} label={k.behaviorName} onPress={() => { setPickId(parentBehaviorIdentity(k)); setPicking(false); setOpen(true); }} />)}
              {!cards.length ? <T size={14}>No active support cards yet.</T> : null}
              <Btn kind="ghost" icon="plus" label="Add Another Behavior" onPress={() => router.push({ pathname: "/parent-edit", params: { add: "pick" } } as never)} />
            </Card>
          ) : null}
          {open ? (
            !card ? <Card><T weight="semi">Your support card is not ready yet.</T><Btn label="Finish setup" onPress={() => router.push("/parent-quickstart" as never)} /></Card> : (
              <>
                <H>{`${card.behaviorName} Support`}</H>
                {cards.length > 1 ? <Btn kind="ghost" label="Choose a different behavior" onPress={() => { setOpen(false); setPicking(true); }} /> : null}
                <T size={13} weight="semi" color={card.source === "clinician_reviewed" ? c.primary : c.secondary}>{SOURCE[card.source]}</T>
                {card.conflict ? <Card tone="warn"><T weight="semi">Conflict detected. Clinician review recommended.</T>{card.conflictMessage ? <T size={14}>{card.conflictMessage}</T> : null}</Card> : null}
                {activeGoal && activeGoal !== card.goal ? <Card tone="warn"><T size={14}>The saved plan steps below were written for the earlier goal: {card.goal}. Your current goal is {activeGoal}.</T></Card> : null}
                <List title="What to do right now" items={card.rightNow} />
                <Card><T weight="bold" size={16}>What may be happening</T><T>{card.whatMayBeHappening}</T></Card>
                <List title="What to avoid" items={card.avoid} tone="warn" />
                <List title="Prevent it next time" items={card.prevention} />
                <Card><T weight="bold" size={16}>Try this replacement skill</T><T>{card.replacementSkill}</T><T size={14} color={c.secondary}>{card.reinforcementIdea}</T></Card>
                <Card><T weight="bold" size={16}>Current goal</T><T>{activeGoal ?? "No goal chosen yet"}</T></Card>
                <Card><T weight="bold" size={16}>When to get help</T><T>{card.seekHelp}</T></Card>
                <List title="What to track" items={card.track} />
                <Btn icon="edit-3" label="Log what happened" onPress={() => router.push({ pathname: "/(parent)/log", params: { b: parentBehaviorIdentity(card) } } as never)} />
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
            {behaviors.map((b) => <View key={parentBehaviorIdentity(b)}><T weight="semi" size={14}>{b.behaviorName}</T><T size={14}>{b.goal ?? "Choose a goal"}</T></View>)}
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
                <T size={12} weight="semi" color={c.mutedForeground}>Goal</T>
                <T weight="semi">{b.goal ?? "No goal chosen yet"}</T>
                <T size={12} weight="semi" color={c.mutedForeground}>Your log</T>
                {p.entries ? (
                  <T size={14}>{`${p.entries} ${p.entries === 1 ? "entry" : "entries"} logged: ${p.episodes} with an episode, ${p.notHappened} without. ${p.episodesWeek} ${p.episodesWeek === 1 ? "episode" : "episodes"} in the last 7 days. Last entry ${when(p.last)}.`}</T>
                ) : <T size={14} color={c.secondary}>Nothing logged yet. Entries you record will be summarized here.</T>}
                <Row wrap>
                  <Chip label="Support steps" selected={open && activeId === id} onPress={() => { setPickId(id); setOpen(true); }} />
                  <Chip label="Log it" onPress={() => router.push({ pathname: "/(parent)/log", params: { b: id } } as never)} />
                </Row>
              </Card>
            );
          })}
          <T weight="bold" size={17}>Behavior Support Library</T>
          <BehaviorLibrary behaviors={behaviors} cards={savedCards} onOpen={(id) => { setPickId(id); setPicking(false); setOpen(true); }} />
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
