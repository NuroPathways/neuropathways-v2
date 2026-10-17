import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { getParentBehaviors, getParentDashboard, parentBehaviorIdentity } from "@workspace/api-client-react";
import type { SupportCard } from "@workspace/api-client-react";
import { ChildSwitch } from "@/components/ChildSwitch";
import { Card, ErrorBox, H, Screen, Skeleton, T, msg } from "@/components/ParentUi";
import { useParent } from "@/context/ParentContext";
import { useColors } from "@/hooks/useColors";

const SOURCE: Record<SupportCard["source"], string> = {
  starter: "Source: Pre-programmed library",
  parent_document: "Source: Behavior plan",
  clinician_document: "Source: Behavior plan",
  clinician_reviewed: "Source: Behavior plan",
};

function GuidanceSection({ title, items }: { title: string; items: string[] }) {
  const c = useColors();
  if (!items.length) return null;
  const visible = items.slice(0, 5);
  return (
    <Card>
      <T weight="bold" size={16}>{title}</T>
      {visible.map((item, index) => (
        <View key={`${title}-${index}`} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
          <T weight="bold" color={c.primary}>{index + 1}.</T>
          <View style={{ flex: 1 }}><T size={14}>{item}</T></View>
        </View>
      ))}
      {visible.length < 3 ? <T size={12} color={c.secondary}>Only {visible.length} source-grounded {visible.length === 1 ? "item is" : "items are"} available here; no extra guidance has been added.</T> : null}
    </Card>
  );
}

export default function HelpNow() {
  const c = useColors();
  const { child, opts } = useParent();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [simpler, setSimpler] = useState(false);
  const query = useQuery({ queryKey: ["parent-dashboard", child?.id], queryFn: () => getParentDashboard(child!.id, opts), enabled: !!child });
  const behaviors = getParentBehaviors(query.data?.child ?? child ?? {});
  const cards = (query.data?.supportCards ?? []).filter((card) => !card.conflict);
  const activeIds = new Set(behaviors.map(parentBehaviorIdentity));
  const discoveredCards = cards.filter((card) => !activeIds.has(parentBehaviorIdentity(card)) && card.source !== "starter");
  const selected = cards.find((card) => parentBehaviorIdentity(card) === selectedId);
  return (
    <Screen>
      <H sub={child ? `Saved guidance for ${child.name}` : undefined}>Help Now</H>
      <ChildSwitch />
      <Card tone="warn">
        <T weight="bold" size={16}>If anyone is in immediate danger or hurt</T>
        <T size={14}>Call your local emergency number now. Emergency help is available even while saved guidance is loading.</T>
      </Card>
      <T size={14} color={c.secondary}>Choose saved guidance from its labeled source. Take one step at a time, and stop if it does not feel safe.</T>
      {query.isLoading ? <Skeleton lines={4} /> : query.isError ? <ErrorBox message={msg(query.error, "Saved support could not load.")} onRetry={() => query.refetch()} /> : (
        <>
          {selected ? (
            <>
              <Card>
                <T weight="bold" size={18}>{selected.behaviorName}</T>
                <T size={12} weight="semi" color={c.primary}>{SOURCE[selected.source]}</T>
                {selected.rightNow.length && !simpler ? <View style={{ flexDirection: "row", gap: 10 }}><T weight="bold" color={c.primary}>{stepIndex + 1}.</T><View style={{ flex: 1 }}><T>{selected.rightNow[stepIndex]}</T></View></View> : null}
                {!selected.rightNow.length || simpler ? <T size={14} color={c.secondary}>{selected.seekHelp || "Move to a quieter, familiar place if safe. Give space, reduce demands, and contact your care team for guidance."}</T> : null}
                {!simpler && selected.rightNow.length ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
                  <Pressable accessibilityRole="button" accessibilityState={{ disabled: stepIndex === 0 }} disabled={stepIndex === 0} onPress={() => setStepIndex((value) => Math.max(0, value - 1))} style={{ minWidth: 72, minHeight: 44, justifyContent: "center" }}><T size={13} weight="semi" color={stepIndex === 0 ? c.mutedForeground : c.primary}>Back</T></Pressable>
                  <T size={12} color={c.secondary} style={{ alignSelf: "center" }}>Step {stepIndex + 1} of {selected.rightNow.length}</T>
                  <Pressable accessibilityRole="button" accessibilityState={{ disabled: stepIndex >= selected.rightNow.length - 1 }} disabled={stepIndex >= selected.rightNow.length - 1} onPress={() => setStepIndex((value) => Math.min(selected.rightNow.length - 1, value + 1))} style={{ minWidth: 72, minHeight: 44, justifyContent: "center" }}><T size={13} weight="semi" color={stepIndex >= selected.rightNow.length - 1 ? c.mutedForeground : c.primary}>Next</T></Pressable>
                </View> : null}
                <GuidanceSection title="What to avoid" items={selected.avoid} />
                <GuidanceSection title="Prevention ideas" items={selected.prevention} />
                <GuidanceSection title="What to notice" items={selected.track} />
                <GuidanceSection title="Related goals from this source" items={selected.relatedGoals} />
                {selected.whatMayBeHappening ? <Card><T weight="bold" size={16}>One possible explanation</T><T size={14}>{selected.whatMayBeHappening}</T></Card> : null}
                {selected.replacementSkill ? <Card><T weight="bold" size={16}>Practice a helpful skill</T><T size={14}>{selected.replacementSkill}</T>{selected.reinforcementIdea ? <T size={14}><T weight="semi" size={14}>Reinforce: </T>{selected.reinforcementIdea}</T> : null}</Card> : null}
                {selected.seekHelp ? <T size={14}><T weight="semi">When to get help: </T>{selected.seekHelp}</T> : null}
                {(selected.dailyActivities ?? []).filter((activity) => activity.assignedAt).map((activity, index) => (
                  <Card key={`${activity.title}:${activity.sourceDocumentId}`}>
                    <T size={12} weight="semi" color={c.primary}>ASSIGNED BY YOUR CARE TEAM</T>
                    <T weight="bold" size={15}>{activity.title}</T>
                    <T size={13}>{activity.routineContext} · Practice: {activity.skill}</T>
                    {activity.reinforcement ? <T size={13}>Reinforcement: {activity.reinforcement}</T> : null}
                  </Card>
                ))}
                <Pressable accessibilityRole="button" onPress={() => setSimpler((value) => !value)} style={{ minHeight: 44, justifyContent: "center" }}><T color={c.primary} weight="semi">{simpler ? "Return to saved steps" : "This isn't working"}</T></Pressable>
                <T size={12} color={c.secondary}>No behavior log is created by opening or using Help Now. Logging is optional elsewhere.</T>
              </Card>
              <Pressable accessibilityRole="button" onPress={() => { setSelectedId(null); setStepIndex(0); setSimpler(false); }} style={{ minHeight: 48, justifyContent: "center" }}><T color={c.primary} weight="semi">Choose another support area</T></Pressable>
            </>
          ) : behaviors.length ? behaviors.map((behavior) => {
            const card = cards.find((item) => parentBehaviorIdentity(item) === parentBehaviorIdentity(behavior));
            if (!card) return null;
            return (
              <Pressable key={parentBehaviorIdentity(behavior)} accessibilityRole="button" onPress={() => { setSelectedId(parentBehaviorIdentity(behavior)); setStepIndex(0); setSimpler(false); }} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
                <Card><T weight="bold" size={16}>{behavior.behaviorName}</T><T size={13} color={c.secondary}>{card ? SOURCE[card.source] : "No saved steps are available yet"}</T><T size={13} color={c.primary}>View support steps</T></Card>
              </Pressable>
            );
          }) : (
            <Card><T weight="bold" size={17}>No saved support areas yet</T><T size={14} color={c.secondary}>Contact your care team or add a support area to see child-specific steps here.</T></Card>
          )}
          {discoveredCards.length ? (
            <>
              <T weight="bold" size={16}>Also found in plans</T>
              <T size={13} color={c.secondary}>These are available to review but are not active behaviors in your setup.</T>
              {discoveredCards.map((card) => (
                <Pressable key={card.id} accessibilityRole="button" onPress={() => { setSelectedId(parentBehaviorIdentity(card)); setStepIndex(0); setSimpler(false); }}>
                  <Card><T weight="bold" size={16}>{card.behaviorName}</T><T size={13} color={c.secondary}>{SOURCE[card.source]} · not active</T><T size={13} color={c.primary}>Review support steps</T></Card>
                </Pressable>
              ))}
            </>
          ) : null}
          <T size={12} color={c.secondary}>If anyone is in immediate danger, contact local emergency services.</T>
        </>
      )}
    </Screen>
  );
}
