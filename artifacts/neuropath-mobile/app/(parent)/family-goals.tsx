import React from "react";
import { Pressable } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { getGetParentDashboardQueryKey, getParentDashboard } from "@workspace/api-client-react";
import { ChildSwitch } from "@/components/ChildSwitch";
import { Btn, Card, ErrorBox, H, Screen, Skeleton, T, msg } from "@/components/ParentUi";
import { useParent } from "@/context/ParentContext";
import { useColors } from "@/hooks/useColors";

export default function FamilyGoals() {
  const c = useColors();
  const { child, opts } = useParent();
  const query = useQuery({ queryKey: getGetParentDashboardQueryKey(child?.id ?? ""), queryFn: () => getParentDashboard(child!.id, opts), enabled: !!child });
  return (
    <Screen>
      <H sub={child ? `Goals for ${child.name}` : undefined}>Goals</H>
      <ChildSwitch />
      {query.isLoading ? <Skeleton lines={4} /> : query.isError ? <ErrorBox message={msg(query.error, "Goals could not load.")} onRetry={() => query.refetch()} /> : (
        <>
          <T size={14} color={c.secondary}>Saved goals and goals found in plans remain clearly identified by their source.</T>
          {(query.data?.child.behaviors ?? []).length ? (query.data?.child.behaviors ?? []).map((behavior, index) => (
            <Card key={`${behavior.behaviorKey}-${index}`}>
              <T size={12} weight="semi" color={c.secondary}>{behavior.behaviorName}</T>
              <T weight="bold" size={16}>Saved goal</T>
              <T>{behavior.goal || "No saved goal yet"}</T>
              {(query.data?.dailyActions ?? []).filter((action) => action.behaviorName === behavior.behaviorName).map((action) => (
                <Pressable key={action.id} accessibilityRole="button" onPress={() => router.push({ pathname: "/(parent)/practice", params: { activityId: action.id } } as never)} style={{ minHeight: 40, justifyContent: "center" }}>
                  <T size={13} weight="semi" color={c.primary}>Practice: {action.title}</T>
                </Pressable>
              ))}
            </Card>
          )) : null}
          {(query.data?.planGoals ?? []).map((goal) => (
            <Card key={goal.id} tone="primary">
              <T weight="bold" size={16}>{goal.title}</T>
              <T size={12} weight="semi" color={c.secondary}>{goal.sourceType === "clinician_uploaded_plan" ? "Clinician-uploaded plan" : "Uploaded plan · not clinician-reviewed"}</T>
              {goal.description ? <T size={14}>{goal.description}</T> : null}
              {goal.milestones.map((line, index) => <T key={`${goal.id}-${index}`} size={14}>{index + 1}. {line}</T>)}
            </Card>
          ))}
          {!query.data?.planGoals?.length && !query.data?.child.behaviors?.length ? <Card><T>No goals have been saved yet.</T></Card> : null}
          <Btn icon="edit-2" label="Edit saved goals" onPress={() => router.push("/parent-edit" as never)} />
        </>
      )}
    </Screen>
  );
}
