import React, { useState } from "react";
import { Alert, View } from "react-native";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetParentGoals, getGetParentGoalsQueryKey, useCreateParentGoal, useUpdateParentGoal, useDeleteParentGoal,
  useGetParentMessages, getGetParentMessagesQueryKey, useSendParentMessage,
} from "@workspace/api-client-react";
import type { ParentGoal } from "@workspace/api-client-react";
import { Btn, Card, ErrorBox, Field, Row, Skeleton, T, msg } from "@/components/ParentUi";
import { useParent } from "@/context/ParentContext";
import { useColors } from "@/hooks/useColors";

type Action = { id: string; title: string; behaviorName?: string | null; goalId?: string | null };

function GoalForm({ initial, busy, onSave, onCancel }: { initial?: ParentGoal; busy: boolean; onSave: (d: { title: string; description: string; target: number }) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [target, setTarget] = useState(String(initial?.target ?? 10));
  return (
    <View style={{ gap: 8 }}>
      <Field label="Goal" value={title} onChangeText={setTitle} maxLength={180} testID="goal-title" />
      <Field label="Details (optional)" value={description} onChangeText={setDescription} maxLength={3000} multiline testID="goal-description" />
      <Field label="Times to practice" value={target} onChangeText={setTarget} keyboardType="number-pad" testID="goal-target" />
      <Row wrap>
        <Btn label="Save goal" loading={busy} disabled={busy || !title.trim()} onPress={() => onSave({ title: title.trim(), description: description.trim(), target: Math.max(1, Number(target) || 1) })} testID="goal-save" />
        <Btn kind="ghost" label="Cancel" onPress={onCancel} />
      </Row>
    </View>
  );
}

export function ParentGoalsSection({ actions = [], excludeIds = [] }: { actions?: Action[]; excludeIds?: string[] }) {
  const c = useColors();
  const qc = useQueryClient();
  const { child, opts } = useParent();
  const id = child?.id ?? "";
  const key = getGetParentGoalsQueryKey(id);
  const q = useGetParentGoals(id, { query: { queryKey: key, enabled: !!child }, request: opts });
  const create = useCreateParentGoal({ request: opts });
  const update = useUpdateParentGoal({ request: opts });
  const remove = useDeleteParentGoal({ request: opts });
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const busy = create.isPending || update.isPending || remove.isPending;
  const done = { onSuccess: () => { setAdding(false); setEditId(null); void qc.invalidateQueries({ queryKey: key }); }, onError: (e: unknown) => setError(msg(e)) };
  const goals = (q.data ?? []).filter((g) => !(g.source === "care_team" && excludeIds.includes(g.id)));
  const render = (g: ParentGoal) => {
    const linked = actions.filter((a) => a.goalId ? a.goalId === g.id : (a.behaviorName ?? "").trim().toLowerCase() === g.title.trim().toLowerCase());
    return (
      <Card key={g.id} tone={g.createdByClinician ? "primary" : undefined}>
        <T size={12} weight="semi" color={c.secondary}>{g.createdByClinician ? "SET BY YOUR CARE TEAM" : "FAMILY GOAL"}</T>
        <T weight="bold" size={16}>{g.title}</T>
        {g.description ? <T size={14}>{g.description}</T> : null}
        <T size={13} color={c.secondary}>{g.createdByClinician ? "Clinical progress" : "Practice recorded"}: {g.progress} of {g.target}</T>
        <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: g.target, now: g.progress }} style={{ height: 8, borderRadius: 8, backgroundColor: c.border, overflow: "hidden" }}>
          <View style={{ height: 8, width: `${Math.min(100, g.target ? (g.progress / g.target) * 100 : 0)}%`, backgroundColor: c.primary }} />
        </View>
        {linked.map((a) => <Btn key={a.id} kind="ghost" icon="play" label={`Practice: ${a.title}`} onPress={() => router.push({ pathname: "/(parent)/practice", params: { activityId: a.id } } as never)} />)}
        {editId === g.id ? <GoalForm initial={g} busy={busy} onCancel={() => setEditId(null)} onSave={(data) => update.mutate({ childId: id, goalId: g.id, data }, done)} /> : (
          <Row wrap>
            {g.canEdit && !g.createdByClinician ? <Btn kind="ghost" icon="plus" label="Record practice" disabled={busy || g.progress >= g.target} onPress={() => update.mutate({ childId: id, goalId: g.id, data: { progress: g.progress + 1 } }, done)} /> : null}
            {g.canEdit ? <Btn kind="ghost" icon="edit-2" label="Edit" onPress={() => setEditId(g.id)} /> : null}
            {g.canDelete ? <Btn kind="danger" icon="trash-2" label="Remove" disabled={busy} onPress={() => Alert.alert("Remove this goal?", g.title, [{ text: "Keep", style: "cancel" }, { text: "Remove", style: "destructive", onPress: () => remove.mutate({ childId: id, goalId: g.id }, done) }])} /> : null}
          </Row>
        )}
      </Card>
    );
  };
  if (!child) return null;
  return (
    <View style={{ gap: 10 }}>
      {error ? <ErrorBox message={error} /> : null}
      {q.isLoading ? <Skeleton lines={3} /> : q.isError ? <ErrorBox message={msg(q.error, "Goals could not load.")} onRetry={() => q.refetch()} /> : (
        <>
          <T size={17} weight="bold">Clinical progress</T>
          {goals.filter((g) => g.createdByClinician).map(render)}
          {!goals.some((g) => g.createdByClinician) ? <T size={14} color={c.secondary}>No care team goals have been shared yet.</T> : null}
          <T size={17} weight="bold">Observation and participation</T>
          {goals.filter((g) => !g.createdByClinician).map(render)}
          {!goals.some((g) => !g.createdByClinician) ? <T size={14} color={c.secondary}>No family goals yet.</T> : null}
          {adding ? <Card><GoalForm busy={busy} onCancel={() => setAdding(false)} onSave={(data) => create.mutate({ childId: id, data }, done)} /></Card> : <Btn icon="plus" label="Add a family goal" onPress={() => setAdding(true)} testID="add-family-goal" />}
        </>
      )}
    </View>
  );
}

export function ParentMessagesSection() {
  const c = useColors();
  const qc = useQueryClient();
  const { child, opts } = useParent();
  const id = child?.id ?? "";
  const key = getGetParentMessagesQueryKey(id);
  const q = useGetParentMessages(id, { query: { queryKey: key, enabled: !!child }, request: opts });
  const send = useSendParentMessage({ request: opts });
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  if (!child) return null;
  const list = [...(q.data ?? [])].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return (
    <Card>
      <T weight="bold" size={16}>Messages with your care team</T>
      {q.isLoading ? <Skeleton lines={2} /> : q.isError ? <ErrorBox message={msg(q.error, "Messages could not load.")} onRetry={() => q.refetch()} /> : list.length === 0 ? <T size={14} color={c.secondary}>No messages yet.</T> : list.map((m) => (
        <View key={m.id} style={{ alignSelf: m.senderRole === "clinician" ? "flex-start" : "flex-end", maxWidth: "88%", padding: 10, borderRadius: 12, borderWidth: 1, borderColor: c.border }}>
          <T size={12} weight="semi" color={c.secondary}>{m.senderRole === "clinician" ? "Care team" : "You"}</T>
          <T size={14}>{m.content}</T>
          <T size={11} color={c.secondary}>{new Date(m.createdAt).toLocaleString()}</T>
        </View>
      ))}
      {error ? <ErrorBox message={error} /> : null}
      <Field label="New message" value={text} onChangeText={setText} maxLength={5000} multiline testID="message-input" />
      <Btn icon="send" label="Send" loading={send.isPending} disabled={send.isPending || !text.trim()} testID="message-send" onPress={() => { setError(""); send.mutate({ childId: id, data: { content: text.trim() } }, { onSuccess: () => { setText(""); void qc.invalidateQueries({ queryKey: key }); }, onError: (e) => setError(msg(e, "Your message could not be sent.")) }); }} />
    </Card>
  );
}
