import React, { useMemo } from "react";
import { Pressable } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { getGetParentDashboardQueryKey, getParentDashboard, getParentBehaviors, parentBehaviorIdentity, useGetParentFamilyTools, getGetParentFamilyToolsQueryKey } from "@workspace/api-client-react";
import type { ParentDashboard } from "@workspace/api-client-react";
import { ChildSwitch } from "@/components/ChildSwitch";
import { Card, ErrorBox, H, Screen, Skeleton, T, msg } from "@/components/ParentUi";
import { useParent } from "@/context/ParentContext";
import { useColors } from "@/hooks/useColors";

type HistoryRow =
  | { kind: "behavior"; id: string; at: string; title: string; detail: string; clinicianFeedback?: string | null }
  | { kind: "activity"; id: string; actionId: string; at: string; title: string; detail: string }
  | { kind: "routine"; id: string; at: string; title: string; detail: string };

export default function ParentHistory() {
  const c = useColors();
  const { child, opts } = useParent();
  const query = useQuery({ queryKey: getGetParentDashboardQueryKey(child?.id ?? ""), queryFn: () => getParentDashboard(child!.id, opts), enabled: !!child });
  const tools = useGetParentFamilyTools(child?.id ?? "", { query: { queryKey: getGetParentFamilyToolsQueryKey(child?.id ?? ""), enabled: !!child, retry: false }, request: opts });
  const rows = useMemo<HistoryRow[]>(() => {
    const data = query.data as ParentDashboard | undefined;
    if (!data) return [];
    const names = new Map(getParentBehaviors(data.child).map((behavior) => [parentBehaviorIdentity(behavior), behavior.behaviorName]));
    const behaviorRows: HistoryRow[] = data.logs.map((log) => ({
      kind: "behavior",
      id: `behavior-${log.id}`,
      at: log.createdAt,
      title: names.get(parentBehaviorIdentity({ behaviorKey: log.behaviorKey, customBehavior: log.customBehavior })) || log.customBehavior || "Behavior observation",
      detail: log.happened ? `${log.intensity} intensity · ${log.duration} min` : "Did not happen",
      clinicianFeedback: log.clinicianFeedback,
    }));
    const activityRows: HistoryRow[] = data.dailyActions.flatMap((action) => action.logs.map((log) => ({
      kind: "activity",
      id: `activity-${action.id}-${log.id}`,
      actionId: action.id,
      at: log.createdAt,
      title: action.title,
      detail: log.outcome || log.rating || log.eventType,
    })));
    const routines = (tools.data?.routines ?? []) as { id?: unknown; name?: unknown }[];
    const routineRows: HistoryRow[] = (tools.data?.routineRuns ?? []).map((run) => {
      const routine = routines.find((item) => item.id === run.routineId);
      const step = Number(run.currentStep) || 0;
      return {
        kind: "routine",
        id: `routine-${String(run.id)}`,
        at: String(run.updatedAt ?? run.createdAt ?? ""),
        title: typeof routine?.name === "string" ? routine.name : "Family routine",
        detail: run.status === "completed" ? "Completed" : run.status === "paused" ? `Paused at step ${step + 1}` : String(run.status ?? "Started"),
      };
    });
    const seen = new Set<string>();
    return [...behaviorRows, ...activityRows, ...routineRows]
      .filter((row) => (seen.has(row.id) ? false : (seen.add(row.id), true)))
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [query.data, tools.data]);
  return (
    <Screen>
      <H sub={child ? `Saved records for ${child.name}` : undefined}>History</H>
      <ChildSwitch />
      <T size={14} color={c.secondary}>Behavior observations, practice activity, and routines are labeled separately.</T>
      {query.isLoading ? <Skeleton lines={4} /> : query.isError ? <ErrorBox message={msg(query.error, "History could not load.")} onRetry={() => query.refetch()} /> : rows.length ? rows.map((row) => (
        <Card key={row.id}>
          <T size={11} weight="semi" color={c.secondary}>{row.kind === "behavior" ? "BEHAVIOR OBSERVATION" : row.kind === "routine" ? "ROUTINE" : "PRACTICE ACTIVITY"}</T>
          <T weight="bold" size={16}>{row.title}</T>
          <T size={14}>{row.detail}</T>
          {row.kind === "behavior" && row.clinicianFeedback ? <T size={13} color={c.primary}><T weight="semi" size={13}>Clinician feedback: </T>{row.clinicianFeedback}</T> : null}
          <T size={12} color={c.mutedForeground}>{Number.isNaN(new Date(row.at).getTime()) ? "Date unavailable" : new Date(row.at).toLocaleString()}</T>
          {row.kind === "activity" ? <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/(parent)/practice", params: { activityId: row.actionId } } as never)} style={{ minHeight: 40, justifyContent: "center" }}><T size={13} weight="semi" color={c.primary}>Open this activity</T></Pressable> : null}
        </Card>
      )) : <Card><T weight="semi">No saved history yet</T><T size={14} color={c.secondary}>Behavior notes and practice activity will appear here after they are recorded.</T></Card>}
    </Screen>
  );
}
