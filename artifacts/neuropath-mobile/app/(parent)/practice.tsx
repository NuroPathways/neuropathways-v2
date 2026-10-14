import React, { useCallback } from "react";
import { View } from "react-native";
import { useFocusEffect, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { getParentBehaviors, getParentDashboard, parentBehaviorIdentity } from "@workspace/api-client-react";
import type { SupportCard } from "@workspace/api-client-react";
import { Btn, Card, ErrorBox, H, Screen, Skeleton, T, msg } from "@/components/ParentUi";
import { useParent } from "@/context/ParentContext";
import { useColors } from "@/hooks/useColors";

const SOURCE: Record<SupportCard["source"], string> = {
  starter: "Starter support",
  parent_document: "Uploaded plan · not clinician-reviewed",
  clinician_document: "Clinician-uploaded plan",
  clinician_reviewed: "Clinician reviewed",
};

export default function Practice() {
  const c = useColors();
  const { child, opts } = useParent();
  const q = useQuery({
    queryKey: ["parent-dashboard", child?.id],
    queryFn: () => getParentDashboard(child!.id, opts),
    enabled: !!child,
  });
  useFocusEffect(useCallback(() => { if (child) q.refetch(); }, [child, q.refetch]));

  const childName = q.data?.child.name ?? child?.name ?? "your child";
  const behaviors = getParentBehaviors(q.data?.child ?? child ?? {});
  const activeIds = new Set(behaviors.map(parentBehaviorIdentity));
  const cards = (q.data?.supportCards ?? []).filter((card) =>
    activeIds.has(parentBehaviorIdentity(card)),
  );

  return (
    <Screen>
      <H>{`Practice with ${childName}`}</H>
      <T size={14} color={c.secondary}>
        Choose a calm, familiar moment. Use only skills and supports already saved for your child.
      </T>
      {q.isLoading ? <Skeleton lines={3} /> : q.isError ? (
        <ErrorBox message={msg(q.error, "Practice guidance could not load.")} onRetry={() => q.refetch()} />
      ) : cards.length ? cards.map((card) => (
        <Card key={card.id}>
          <T size={12} weight="semi" color={c.secondary}>{card.behaviorName}</T>
          <T size={12} weight="semi" color={c.primary}>{SOURCE[card.source]}</T>
          <View style={{ borderLeftWidth: 3, borderLeftColor: c.primary, paddingLeft: 12, gap: 8 }}>
            <T size={12} weight="bold" color={c.secondary}>Skill to practice</T>
            <T size={15}>{card.replacementSkill}</T>
          </View>
          {card.reinforcementIdea ? (
            <T size={14}><T weight="semi">Encourage: </T>{card.reinforcementIdea}</T>
          ) : null}
        </Card>
      )) : (
        <Card>
          <T weight="bold" size={17}>No practice skill is ready yet</T>
          <T size={14} color={c.secondary}>Finish setup or add a behavior to see a saved, child-specific skill here.</T>
          <Btn kind="ghost" icon="plus" label="Finish setup" onPress={() => router.push("/parent-quickstart" as never)} />
        </Card>
      )}
    </Screen>
  );
}
