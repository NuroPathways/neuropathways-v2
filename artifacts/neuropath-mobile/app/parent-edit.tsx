import React, { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getParentDashboard, parentBehaviorIdentity, updateParentChild } from "@workspace/api-client-react";
import { BehaviorGoalsEditor, selsFromChild, selsToInput, validateSels, type BehaviorSel } from "@/components/BehaviorPicker";
import { Btn, ErrorBox, Field, H, Screen, T, msg } from "@/components/ParentUi";
import { useParent } from "@/context/ParentContext";

export default function EditChild() {
  const { child } = useParent();
  // Keyed by child id so switching children resets all local form state.
  return child ? <Editor key={child.id} /> : null;
}

function Editor() {
  const { child: c, opts, upsertChild } = useParent();
  const child = c!;
  const qc = useQueryClient();
  const [name, setName] = useState(child.name);
  const [age, setAge] = useState(child.age != null ? String(child.age) : "");
  const [notes, setNotes] = useState(child.notes ?? "");
  const { add, card: cardId, focus } = useLocalSearchParams<{ add?: string; card?: string; focus?: string }>();
  const dash = useQuery({ queryKey: ["parent-dashboard", child.id], queryFn: () => getParentDashboard(child.id, opts), enabled: !!cardId });
  const [sels, setSels] = useState<BehaviorSel[]>(() => {
    const base = selsFromChild(child);
    if (add && add !== "pick" && !base.some((s) => s.behaviorKey === add && add !== "custom")) base.push({ behaviorKey: add, customBehavior: "", goal: "" });
    return base;
  });
  const prefilled = React.useRef(false);
  React.useEffect(() => {
    const k = dash.data?.supportCards.find((x) => x.id === cardId);
    if (!k || prefilled.current) return;
    prefilled.current = true;
    setSels((cur) => cur.some((s) => parentBehaviorIdentity(s) === parentBehaviorIdentity(k)) ? cur : [...cur, { behaviorKey: k.behaviorKey, customBehavior: k.behaviorKey === "custom" ? k.behaviorName : "", goal: "" }]);
  }, [dash.data, cardId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!name.trim()) return setError("Nickname cannot be empty.");
    const v = validateSels(sels);
    if (v) return setError(v);
    const ageNum = age.trim() ? Number(age) : undefined;
    if (ageNum !== undefined && !Number.isFinite(ageNum)) return setError("Age must be a number.");
    setBusy(true); setError("");
    try {
      const body = { name: name.trim(), age: ageNum, notes, behaviors: selsToInput(sels) };
      const saved = await updateParentChild(child.id, body, opts);
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
      <T weight="semi">Behaviors and goals</T>
      {focus ? <T size={13}>Write a goal for each behavior below.</T> : null}
      <BehaviorGoalsEditor value={sels} onChange={setSels} />
      {error ? <ErrorBox message={error} /> : null}
      <Btn kind="ghost" icon="upload" label="Upload a plan" onPress={() => router.push("/(parent)/documents" as never)} />
      <Btn label="Save changes" onPress={save} loading={busy} />
    </Screen>
  );
}
