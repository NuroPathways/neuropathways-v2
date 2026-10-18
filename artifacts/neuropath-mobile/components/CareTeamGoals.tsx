import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import type { CareActivity, CareGoal } from "@workspace/api-client-react";
import { Card, T } from "@/components/ParentUi";
import { useColors } from "@/hooks/useColors";

const MEASURE: Record<string, string> = {
  frequency: "Frequency", duration: "Duration", percentage: "Percentage of observed opportunities",
  completed_steps: "Completed steps", clinician_defined: "Clinician-defined measurement", observation: "Observation only",
};

/** Clinician-published goals. Hidden entirely when empty (independent families see nothing). */
export function CareTeamGoals({ goals, assignments, preview = false }: { goals: CareGoal[]; assignments: CareActivity[]; preview?: boolean }) {
  const c = useColors();
  const [open, setOpen] = useState<string | null>(preview ? goals[0]?.id ?? null : null);
  if (!goals.length) return null;
  return <View style={{ gap: 10 }}>
    <T size={17} weight="bold">Care Team Goals</T>
    {goals.map((g) => {
      const linked = assignments.filter((a) => a.goalId === g.id || (g.linkedActivityIds ?? []).includes(a.id));
      const expanded = open === g.id;
      return <Card key={g.id} tone="primary">
        <View style={{ alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: c.muted, borderWidth: 1, borderColor: c.primary }}>
          <T size={11} weight="semi" color={c.primary}>Assigned by Your Care Team</T>
        </View>
        <T weight="bold" size={16}>{g.title}</T>
        {g.skill ? <T size={12} weight="semi" color={c.secondary}>{g.skill}</T> : null}
        <T size={14} color={c.secondary}>{expanded || g.description.length <= 140 ? g.description : `${g.description.slice(0, 137)}...`}</T>
        {expanded ? <>
          {g.measurement ? <T size={13} color={c.secondary}>Measured by: {MEASURE[g.measurement] ?? g.measurement}{g.target != null ? ` · Target ${g.target}` : ""}</T> : null}
          {(g.milestones ?? []).length ? <View style={{ gap: 4 }}><T size={13} weight="semi">Milestones</T>{(g.milestones ?? []).map((m, i) => <T key={i} size={13}>{i + 1}. {m}</T>)}</View> : null}
          {g.progress != null ? <T size={13} color={c.secondary}>Clinician-assessed progress: {g.progress}{g.target ? ` of ${g.target}` : ""}</T> : <T size={12} color={c.secondary}>Progress on this goal is assessed by your care team. Practice updates do not change it.</T>}
        </> : null}
        {linked.length ? <T size={13} color={c.secondary}>Related activity: {linked.map((a) => a.title).join(", ")}</T> : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
          <Pressable accessibilityRole="button" onPress={() => setOpen(expanded ? null : g.id)} style={{ minHeight: 40, justifyContent: "center" }}>
            <T size={13} weight="semi" color={c.primary}>{expanded ? "Hide details" : "View Goal"}</T></Pressable>
          {linked.map((a) => <Pressable key={a.id} accessibilityRole="button" onPress={() => preview ? undefined : router.push({ pathname: "/(parent)/practice", params: { assignmentId: a.id } } as never)} style={{ minHeight: 40, justifyContent: "center" }}>
            <T size={13} weight="semi" color={c.primary}>{linked.length > 1 ? `Start: ${a.title}` : "Start Activity"}</T></Pressable>)}
        </View>
      </Card>;
    })}
  </View>;
}
