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
  starter: "Starter support",
  parent_document: "Uploaded plan · not clinician-reviewed",
  clinician_document: "Clinician-uploaded plan",
  clinician_reviewed: "Clinician reviewed",
};

export default function HelpNow() {
  const c = useColors();
  const { child, opts } = useParent();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const query = useQuery({ queryKey: ["parent-dashboard", child?.id], queryFn: () => getParentDashboard(child!.id, opts), enabled: !!child });
  const behaviors = getParentBehaviors(query.data?.child ?? child ?? {});
  const cards = query.data?.supportCards ?? [];
  const activeIds = new Set(behaviors.map(parentBehaviorIdentity));
  const discoveredCards = cards.filter((card) => !activeIds.has(parentBehaviorIdentity(card)) && card.source !== "starter");
  const selected = cards.find((card) => parentBehaviorIdentity(card) === selectedId);
  return (
    <Screen>
      <H sub={child ? `Saved guidance for ${child.name}` : undefined}>Help Now</H>
      <ChildSwitch />
      <T size={14} color={c.secondary}>Choose a saved support area. Use only steps that feel safe for this moment.</T>
      {query.isLoading ? <Skeleton lines={4} /> : query.isError ? <ErrorBox message={msg(query.error, "Saved support could not load.")} onRetry={() => query.refetch()} /> : (
        <>
          {selected ? (
            <>
              <Card>
                <T weight="bold" size={18}>{selected.behaviorName}</T>
                <T size={12} weight="semi" color={c.primary}>{SOURCE[selected.source]}</T>
                {selected.rightNow.map((step, index) => <View key={`${selected.id}-now-${index}`} style={{ flexDirection: "row", gap: 10 }}><T weight="bold" color={c.primary}>{index + 1}.</T><View style={{ flex: 1 }}><T>{step}</T></View></View>)}
                {!selected.rightNow.length ? <T size={14} color={c.secondary}>No immediate steps are saved for this support area yet.</T> : null}
                {selected.seekHelp ? <T size={14}><T weight="semi">When to get help: </T>{selected.seekHelp}</T> : null}
              </Card>
              {selected.avoid.length ? <Card tone="warn"><T weight="bold">What to avoid</T>{selected.avoid.map((step, index) => <T key={`${selected.id}-avoid-${index}`}>{step}</T>)}</Card> : null}
              <Pressable accessibilityRole="button" onPress={() => setSelectedId(null)} style={{ minHeight: 48, justifyContent: "center" }}><T color={c.primary} weight="semi">Choose another support area</T></Pressable>
            </>
          ) : behaviors.length ? behaviors.map((behavior) => {
            const card = cards.find((item) => parentBehaviorIdentity(item) === parentBehaviorIdentity(behavior));
            return (
              <Pressable key={parentBehaviorIdentity(behavior)} accessibilityRole="button" onPress={() => setSelectedId(parentBehaviorIdentity(behavior))} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
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
                <Pressable key={card.id} accessibilityRole="button" onPress={() => setSelectedId(parentBehaviorIdentity(card))}>
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
