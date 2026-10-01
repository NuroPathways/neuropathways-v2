import React, { useState } from "react";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { updateParentChild } from "@workspace/api-client-react";
import { BehaviorPicker, type BehaviorChoice } from "@/components/BehaviorPicker";
import { Btn, ErrorBox, Field, H, Screen, T, msg } from "@/components/ParentUi";
import { useParent } from "@/context/ParentContext";

export default function EditChild() {
  const { child, opts, upsertChild } = useParent();
  const qc = useQueryClient();
  const [name, setName] = useState(child?.name ?? "");
  const [age, setAge] = useState(child?.age != null ? String(child.age) : "");
  const [notes, setNotes] = useState(child?.notes ?? "");
  const [goal, setGoal] = useState(child?.goal ?? "");
  const [beh, setBeh] = useState<BehaviorChoice>({ behaviorKey: child?.behaviorKey && child.behaviorKey !== "custom" ? child.behaviorKey : null, customBehavior: !child?.behaviorKey || child.behaviorKey === "custom" ? child?.behaviorName ?? "" : "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!child) return null;

  const save = async () => {
    if (!name.trim()) return setError("Nickname cannot be empty.");
    if (!goal.trim()) return setError("Goal cannot be empty.");
    if (!beh.behaviorKey && !beh.customBehavior.trim()) return setError("Choose a behavior or describe your own.");
    const ageNum = age.trim() ? Number(age) : undefined;
    if (ageNum !== undefined && !Number.isFinite(ageNum)) return setError("Age must be a number.");
    setBusy(true); setError("");
    try {
      // Only changed behavior is sent so uploaded guidance is not reset by nickname, notes or goal edits.
      const wasCustom = !child.behaviorKey || child.behaviorKey === "custom";
      const behChanged = beh.behaviorKey ? beh.behaviorKey !== child.behaviorKey : !wasCustom || beh.customBehavior.trim() !== (child.behaviorName ?? "");
      const saved = await updateParentChild(child.id, {
        name: name.trim(), age: ageNum, notes, goal: goal.trim(),
        ...(behChanged ? (beh.behaviorKey ? { behaviorKey: beh.behaviorKey } : { behaviorKey: "custom", customBehavior: beh.customBehavior.trim() }) : {}),
      }, opts);
      upsertChild(saved);
      qc.invalidateQueries({ queryKey: ["parent-dashboard", child.id] });
      router.back();
    } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  };

  return (
    <Screen>
      <H>Edit {child.name}</H>
      <Field label="Nickname" value={name} onChangeText={setName} />
      <Field label="Age" value={age} onChangeText={setAge} keyboardType="number-pad" />
      <Field label="Notes" value={notes} onChangeText={setNotes} multiline />
      <T weight="semi">Behavior</T>
      <BehaviorPicker value={beh} onChange={setBeh} />
      <Field label="Goal" value={goal} onChangeText={setGoal} multiline />
      {error ? <ErrorBox message={error} /> : null}
      <Btn label="Save changes" onPress={save} loading={busy} />
    </Screen>
  );
}
