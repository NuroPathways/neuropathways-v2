import React, { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { createParentChild, getStarterLibrary, getParentDashboard, parentBehaviorIdentity, updateParentChild } from "@workspace/api-client-react";
import { BehaviorGoalsEditor, selsFromChild, selsToInput, validateSels, type BehaviorSel } from "@/components/BehaviorPicker";
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
  const [sels, setSels] = useState<BehaviorSel[]>([]);
  const [more, setMore] = useState(false);
  const [extra, setExtra] = useState<BehaviorSel[]>([]);
  const lib = useQuery({ queryKey: ["parent-starter-library"], queryFn: () => getStarterLibrary(), enabled: more });
  const [showUpload, setShowUpload] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Resume where the parent stopped, based on what the server has saved.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!child) return;
    setName(child.name); setAge(child.age != null ? String(child.age) : ""); setNotes(child.notes ?? "");
    const resumed = selsFromChild(child);
    setSels(resumed);
    setStep(!resumed.length || resumed.some((b) => !b.goal.trim()) ? 2 : 3);
  }, [child]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(""); setNotice("");
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
  const saveBehaviors = () => run(async () => {
    if (!child) throw new Error("Save your child's nickname first.");
    const v = validateSels(sels);
    if (v) throw new Error(v);
    const saved = await updateParentChild(child.id, { behaviors: selsToInput(sels) }, opts);
    upsertChild(saved);
    setMore(true);
    setStep(3);
  });
  const saveDraft = () => run(async () => {
    if (!child) throw new Error("Save your child's nickname first.");
    const issue = validateSels(sels, false);
    if (issue) throw new Error(issue);
    const saved = await updateParentChild(child.id, { behaviors: selsToInput(sels) }, opts);
    upsertChild(saved);
    setNotice("Your behaviors and goals are saved. You can return later to finish setup.");
  });

  const addExtra = () => run(async () => {
    if (!child) throw new Error("Save your child's nickname first.");
    if (extra.some((e) => !e.goal.trim())) throw new Error("Write a goal for each behavior you add.");
    const all = [...sels, ...extra];
    const v = validateSels(all);
    if (v) throw new Error(v);
    const saved = await updateParentChild(child.id, { behaviors: selsToInput(all) }, opts);
    upsertChild(saved); setSels(all); setExtra([]); setMore(false);
  });
  const dash = useQuery({
    queryKey: ["parent-dashboard", child?.id],
    queryFn: () => getParentDashboard(child!.id, opts),
    enabled: step === 3 && !!child,
  });
  const cards = dash.data?.supportCards ?? [];

  return (
    <Screen top>
      <T size={13} weight="semi" color={c.primary}>{step <= 2 ? `Step ${step} of 2` : "Ready"}{parent ? `  |  ${parent.firstName}` : ""}</T>
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
          <H sub="Choose one or more. Every behavior gets its own goal.">Behaviors and Goals</H>
          <T size={13} weight="semi" color={c.secondary}>Starter behavior support — not yet based on an uploaded clinician plan.</T>
          <BehaviorGoalsEditor value={sels} onChange={setSels} />
        </>
      ) : null}
      {step === 3 && more ? (
        <>
          <H sub="You can add behaviors now or come back later.">Want to add more support areas?</H>
          {lib.isLoading ? <Skeleton lines={3} /> : lib.isError ? <ErrorBox message="Starter behaviors could not load." onRetry={() => lib.refetch()} /> : (
            <>
              <Row wrap>
                {(lib.data ?? []).filter((s) => !sels.some((b) => b.behaviorKey === s.key)).map((s) => (
                  <Chip key={s.key} label={s.name} selected={extra.some((e) => e.behaviorKey === s.key)} onPress={() => setExtra((cur) => cur.some((e) => e.behaviorKey === s.key) ? cur.filter((e) => e.behaviorKey !== s.key) : [...cur, { behaviorKey: s.key, customBehavior: "", goal: "" }])} />
                ))}
              </Row>
              {extra.map((e, i) => <Field key={e.behaviorKey} label={`Goal for ${lib.data?.find((s) => s.key === e.behaviorKey)?.name ?? e.behaviorKey}`} value={e.goal} onChangeText={(t) => setExtra((cur) => cur.map((x, j) => (j === i ? { ...x, goal: t } : x)))} multiline />)}
            </>
          )}
          {error ? <ErrorBox message={error} /> : null}
          <Btn label="Add Selected Behaviors" onPress={addExtra} loading={busy} disabled={!extra.length} />
          <Btn kind="ghost" label="Skip for Now" onPress={() => setMore(false)} disabled={busy} />
        </>
      ) : null}
      {step === 3 && !more ? (
        <>
          <H sub="Starter support based on common behavior patterns. It is not clinician-approved.">Your support cards are ready.</H>
          {dash.isLoading ? <Skeleton lines={4} /> : dash.isError ? <ErrorBox message={msg(dash.error)} onRetry={() => dash.refetch()} /> : cards.length ? cards.map((card) => {
            const selection = sels.find((b) => parentBehaviorIdentity(b) === parentBehaviorIdentity(card));
            if (!selection) return null;
            return <Card key={card.id}><T weight="bold" size={17}>{card.behaviorName}</T><T size={13} weight="semi">Goal: {selection.goal}</T><T size={14}>{card.rightNow[0]}</T></Card>;
          }) : null}
          <T weight="bold" size={16}>Have a behavior plan, school plan, or treatment plan?</T>
          {showUpload && child ? <UploadPanel key={child.id} childId={child.id} /> : <Btn testID="qs-upload-now" icon="upload" label="Upload Now" onPress={() => setShowUpload(true)} />}
        </>
      ) : null}
      {error ? <ErrorBox message={error} /> : null}
      {notice ? <T size={14}>{notice}</T> : null}
      {step === 1 ? <Btn testID="qs-next" label="Continue" onPress={saveName} loading={busy} /> : null}
      {step === 2 ? <><Btn label="Build my cards" onPress={saveBehaviors} loading={busy} /><Btn kind="ghost" label="Save and finish later" onPress={saveDraft} disabled={busy || !sels.length} /><Btn kind="ghost" label="Back" onPress={() => setStep(1)} disabled={busy} /></> : null}
      {step === 3 && !more ? <Btn testID="qs-open" label={showUpload ? "Continue to Today's Support" : "Skip for Now"} onPress={() => router.replace("/(parent)/home" as never)} /> : null}
      {step < 3 ? <Btn kind="ghost" label="Sign out" onPress={signout} /> : null}
    </Screen>
  );
}
