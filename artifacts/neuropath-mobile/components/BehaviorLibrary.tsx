import React from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { getStarterLibrary, parentBehaviorIdentity } from "@workspace/api-client-react";
import type { ParentBehavior, SupportCard } from "@workspace/api-client-react";
import { Btn, Card, ErrorBox, Row, Skeleton, T } from "@/components/ParentUi";
import { useColors } from "@/hooks/useColors";

type Status = "Active" | "Available to Add" | "Based on Uploaded Plan · Active" | "Clinician Reviewed · Active" | "Found in Uploaded Plan";

const planGoal = (card: SupportCard) => card.planGoal;
const hasPlanGoal = (card: SupportCard) =>
  typeof card.planGoal === "string" && card.planGoal.trim().length > 0;

export function BehaviorLibrary({ behaviors, cards, onOpen }: { behaviors: ParentBehavior[]; cards: SupportCard[]; onOpen: (id: string) => void }) {
  const c = useColors();
  const q = useQuery({ queryKey: ["parent-starter-library"], queryFn: () => getStarterLibrary() });
  if (q.isLoading) return <Skeleton lines={4} />;
  if (q.isError || !q.data) return <ErrorBox message="The behavior library could not load." onRetry={() => q.refetch()} />;
  const goEdit = (params: Record<string, string>) => router.push({ pathname: "/parent-edit", params } as never);
  const upload = () => router.push("/(parent)/documents" as never);
  const selected = new Set(behaviors.map(parentBehaviorIdentity));
  const cardFor = (id: string) => cards.find((k) => parentBehaviorIdentity(k) === id);
  const statusOf = (id: string): Status => {
    const k = cardFor(id);
    if (selected.has(id)) return k?.source === "clinician_reviewed" ? "Clinician Reviewed · Active" : k && k.source !== "starter" ? "Based on Uploaded Plan · Active" : "Active";
    return k && k.source !== "starter" ? "Found in Uploaded Plan" : "Available to Add";
  };
  const starterIds = new Set(q.data.map((s) => `starter:${s.key}`));
  const rows = [
    ...q.data.map((s) => ({ id: `starter:${s.key}`, name: s.name, desc: s.description, key: s.key })),
    ...behaviors.filter((b) => !starterIds.has(parentBehaviorIdentity(b))).map((b) => ({ id: parentBehaviorIdentity(b), name: b.behaviorName, desc: "Your own behavior.", key: "custom" })),
    ...cards.filter((k) => !selected.has(parentBehaviorIdentity(k)) && !starterIds.has(parentBehaviorIdentity(k)) && k.source !== "starter").map((k) => ({ id: parentBehaviorIdentity(k), name: k.behaviorName, desc: "Found in your uploaded plan.", key: "custom" })),
  ];
  // Found-in-plan cards for starter behaviors that are not selected
  return (
    <View style={{ gap: 10 }}>
      {rows.map((r) => {
        const st = statusOf(r.id);
        const k = cardFor(r.id);
        const active = selected.has(r.id);
        const behavior = behaviors.find((item) => parentBehaviorIdentity(item) === r.id);
        const savedGoal = behavior?.goal;
        const add: Record<string, string> = k ? { card: k.id } : { add: r.key };
        return (
          <Card key={r.id}>
            <T weight="bold" size={16}>{r.name}</T>
            <T size={13} weight="semi" color={st === "Available to Add" ? c.mutedForeground : c.primary}>{st}</T>
            <T size={14} color={c.secondary}>{r.desc}</T>
            {active ? <T size={13}>Saved goal: {savedGoal ?? "No goal chosen yet"}</T> : null}
            {active && k && hasPlanGoal(k) ? <T size={13}>Plan goal: {planGoal(k)}</T> : active && k?.goal ? <T size={13}>Saved guidance goal: {k.goal}</T> : null}
            {st === "Found in Uploaded Plan" && k ? (
              <>
                <T size={13} weight="semi">{hasPlanGoal(k) ? `Plan goal: ${planGoal(k)}` : "No plan goal identified in the uploaded plan."}</T>
                {!hasPlanGoal(k) && k.goal ? <T size={13}>Saved guidance goal: {k.goal}</T> : null}
                {k.rightNow.slice(0, 3).map((s, i) => <T key={i} size={14}>{i + 1}. {s}</T>)}
              </>
            ) : null}
            <Row wrap>
              {active ? <Btn kind="ghost" label="Open steps" onPress={() => onOpen(r.id)} /> : <Btn kind="ghost" icon="plus" label="Add Behavior" onPress={() => goEdit(add)} />}
              <Btn kind="ghost" icon="upload" label="Upload a plan" onPress={upload} />
            </Row>
          </Card>
        );
      })}
      <Card>
        <T weight="bold" size={16}>Other / Custom Behavior</T>
        <T size={14} color={c.secondary}>Describe a behavior that is not listed. It gets its own goal.</T>
        <Btn kind="ghost" icon="plus" label="Add Behavior" onPress={() => goEdit({ add: "custom" })} />
      </Card>
    </View>
  );
}
