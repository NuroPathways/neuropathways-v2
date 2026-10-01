import React, { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { createParentChild, getParentDashboard, getStarterLibrary, updateParentChild } from "@workspace/api-client-react";
import { BehaviorPicker, type BehaviorChoice } from "@/components/BehaviorPicker";
import { UploadPanel } from "@/components/UploadPanel";
import { Btn, Card, Chip, ErrorBox, Field, H, Row, Screen, Skeleton, T, msg } from "@/components/ParentUi";
import { useParent } from "@/context/ParentContext";
import { useColors } from "@/hooks/useColors";

export default function QuickStart() {
  const c = useColors();
  const { child, upsertChild, opts, signout, parent } = useParent();
  const [step, setStep] = useState(1);
  const started = useRef(false);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [notes, setNotes] = useState("");
  const [beh, setBeh] = useState<BehaviorChoice>({ behaviorKey: null, customBehavior: "" });
  const [goal, setGoal] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Resume where the parent stopped, based on what the server has saved.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!child) return;
    setName(child.name); setAge(child.age != null ? String(child.age) : ""); setNotes(child.notes ?? "");
    setBeh({ behaviorKey: child.behaviorKey && child.behaviorKey !== "custom" ? child.behaviorKey : null, customBehavior: !child.behaviorKey || child.behaviorKey === "custom" ? child.behaviorName ?? "" : "" });
    setGoal(child.goal ?? "");
    setStep(!child.behaviorName ? 2 : !child.goal ? 3 : 4);
  }, [child]);

  const lib = useQuery({ queryKey: ["parent-starter-library"], queryFn: () => getStarterLibrary() });
  const goals = lib.data?.find((s) => s.key === beh.behaviorKey)?.relatedGoals ?? [];

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await fn(); } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  };

  const saveName = () => run(async () => {
    if (!name.trim()) throw new Error("Enter a nickname for your child.");
    const ageNum = age.trim() ? Number(age) : undefined;
    if (ageNum !== undefined && (!Number.isFinite(ageNum) || ageNum < 0 || ageNum > 25)) throw new Error("Enter an age between 0 and 25, or leave it blank.");
    const saved = child
      ? await updateParentChild(child.id, { name: name.trim(), age: ageNum, notes }, opts)
      : await createParentChild({ name: name.trim(), age: ageNum, notes: notes.trim() || undefined }, opts);
    upsertChild(saved);
    setStep(2);
  });
  const saveBehavior = () => run(async () => {
    if (!child) throw new Error("Save your child's nickname first.");
    if (!beh.behaviorKey && !beh.customBehavior.trim()) throw new Error("Choose a behavior or describe your own.");
    const saved = await updateParentChild(child.id, beh.behaviorKey ? { behaviorKey: beh.behaviorKey } : { behaviorKey: "custom", customBehavior: beh.customBehavior.trim() }, opts);
    upsertChild(saved);
    setStep(3);
  });
  const saveGoal = () => run(async () => {
    if (!child) throw new Error("Save your child's nickname first.");
    if (!goal.trim()) throw new Error("Write a goal in your own words, or pick one.");
    const saved = await updateParentChild(child.id, { goal: goal.trim() }, opts);
    upsertChild(saved);
    setStep(4);
  });

  const dash = useQuery({
    queryKey: ["parent-dashboard", child?.id],
    queryFn: () => getParentDashboard(child!.id, opts),
    enabled: step === 4 && !!child,
  });
  const card = dash.data?.supportCards?.[0];

  return (
    <Screen top>
      <T size={13} weight="semi" color={c.primary}>{step <= 3 ? `Step ${step} of 3` : "Ready"}{parent ? `  |  ${parent.firstName}` : ""}</T>
      {step === 1 ? (
        <>
          <H sub="Who are you creating support for?">Add Your Child</H>
          <Field label="Child first name or nickname" value={name} onChangeText={setName} testID="qs-name" />
          <Field label="Age (optional)" value={age} onChangeText={setAge} keyboardType="number-pad" />
          <Field label="Notes (optional)" value={notes} onChangeText={setNotes} multiline placeholder="Example: transitions are hard, homework is stressful, or runs away in parking lots." />
        </>
      ) : null}
      {step === 2 ? (
        <>
          <H sub="What do you need help with most often?">Choose One Behavior</H>
          <T size={13} weight="semi" color={c.secondary}>Starter behavior support — not yet based on an uploaded clinician plan.</T>
          <BehaviorPicker value={beh} onChange={setBeh} />
        </>
      ) : null}
      {step === 3 ? (
        <>
          <H sub="What would you like to work on first?">Choose One Goal</H>
          {goals.length ? <Row wrap>{goals.map((g) => <Chip key={g} label={g} selected={goal === g} onPress={() => setGoal(g)} />)}</Row> : null}
          <Field label="Custom goal" value={goal} onChangeText={setGoal} multiline placeholder="For example: ask for a break instead of yelling" />
        </>
      ) : null}
      {step === 4 ? (
        <>
          <H sub="Starter support based on common behavior patterns. It is not clinician-approved.">Your first support card is ready.</H>
          {dash.isLoading ? <Skeleton lines={4} /> : dash.isError ? <ErrorBox message={msg(dash.error)} onRetry={() => dash.refetch()} /> : card ? (
            <Card><T weight="bold" size={17}>{card.behaviorName}</T><T size={14}>{card.rightNow[0]}</T></Card>
          ) : null}
          <T weight="bold" size={16}>Have a behavior plan, school plan, or treatment plan?</T>
          {showUpload && child ? <UploadPanel key={child.id} childId={child.id} /> : <Btn testID="qs-upload-now" icon="upload" label="Upload Now" onPress={() => setShowUpload(true)} />}
        </>
      ) : null}
      {error ? <ErrorBox message={error} /> : null}
      {step === 1 ? <Btn testID="qs-next" label="Continue" onPress={saveName} loading={busy} /> : null}
      {step === 2 ? <><Btn label="Continue" onPress={saveBehavior} loading={busy} /><Btn kind="ghost" label="Back" onPress={() => setStep(1)} /></> : null}
      {step === 3 ? <><Btn label="Build my card" onPress={saveGoal} loading={busy} /><Btn kind="ghost" label="Back" onPress={() => setStep(2)} /></> : null}
      {step === 4 ? <Btn testID="qs-open" label={showUpload ? "Continue to Today's Support" : "Skip for Now"} onPress={() => router.replace("/(parent)" as never)} /> : null}
      {step < 4 ? <Btn kind="ghost" label="Sign out" onPress={signout} /> : null}
    </Screen>
  );
}
