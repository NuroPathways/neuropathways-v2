import React, { useEffect, useMemo, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addParentLog, getParentBehaviors, getParentDashboard, parentBehaviorIdentity } from "@workspace/api-client-react";
import { Btn, Card, Chip, ErrorBox, Field, H, Row, Screen, T, msg } from "@/components/ParentUi";
import { useParent } from "@/context/ParentContext";
import { logIdentity } from "@/lib/parentProgress";

type Intensity = "low" | "medium" | "high";

export default function LogScreen() {
  const { child, opts } = useParent();
  const { b } = useLocalSearchParams<{ b?: string }>();
  const qc = useQueryClient();
  const behaviors = useMemo(() => (child ? getParentBehaviors(child) : []), [child]);
  const [pick, setPick] = useState<string | null>(null);
  const [happened, setHappened] = useState(true);
  const [intensity, setIntensity] = useState<Intensity>("medium");
  const [duration, setDuration] = useState("");
  const [trigger, setTrigger] = useState("");
  const [helped, setHelped] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const q = useQuery({ queryKey: ["parent-dashboard", child?.id], queryFn: () => getParentDashboard(child!.id, opts), enabled: !!child });

  // Reset when the child changes; honor a behavior passed from the dashboard.
  useEffect(() => { setPick(null); setSaved(false); setError(""); }, [child?.id]);
  const selected = behaviors.find((x) => parentBehaviorIdentity(x) === (pick ?? b)) ?? behaviors[0];
  const names = useMemo(() => new Map(behaviors.map((x) => [parentBehaviorIdentity(x), x.behaviorName])), [behaviors]);

  const save = async () => {
    if (!child || !selected) return setError("Finish setup so there is a behavior to log.");
    const d = Number(duration);
    if (happened && (!duration.trim() || !Number.isFinite(d) || d < 0)) return setError("Enter how many minutes it lasted.");
    setBusy(true); setError(""); setSaved(false);
    try {
      const body = {
        happened, intensity, duration: happened ? d : 0,
        behaviorKey: selected.behaviorKey,
        ...(selected.behaviorKey === "custom" ? { customBehavior: selected.customBehavior ?? selected.behaviorName } : {}),
        goal: selected.goal ?? undefined,
        trigger: trigger.trim() || undefined, whatHelped: helped.trim() || undefined, notes: notes.trim() || undefined,
      };
      await addParentLog(child.id, body, opts);
      setDuration(""); setTrigger(""); setHelped(""); setNotes(""); setSaved(true);
      qc.invalidateQueries({ queryKey: ["parent-dashboard", child.id] });
    } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  };

  return (
    <Screen>
      <H sub={selected ? `Tracking: ${selected.behaviorName}` : undefined}>Log an episode</H>
      {behaviors.length > 1 ? (
        <>
          <T weight="semi">Which behavior?</T>
          <Row wrap>{behaviors.map((x) => { const id = parentBehaviorIdentity(x); return <Chip key={id} label={x.behaviorName} selected={id === (selected && parentBehaviorIdentity(selected))} onPress={() => { setPick(id); setSaved(false); }} />; })}</Row>
        </>
      ) : null}
      {selected?.goal ? <Card><T size={12} weight="semi">Goal for this behavior</T><T>{selected.goal}</T></Card> : null}
      <Row><Chip label="It happened" selected={happened} onPress={() => setHappened(true)} /><Chip label="Did not happen" selected={!happened} onPress={() => setHappened(false)} /></Row>
      <T weight="semi">How intense?</T>
      <Row>{(["low", "medium", "high"] as Intensity[]).map((i) => <Chip key={i} label={i[0].toUpperCase() + i.slice(1)} selected={intensity === i} onPress={() => setIntensity(i)} />)}</Row>
      {happened ? <Field label="Minutes it lasted" value={duration} onChangeText={setDuration} keyboardType="number-pad" testID="log-duration" /> : null}
      <Field label="What set it off (optional)" value={trigger} onChangeText={setTrigger} />
      <Field label="What helped (optional)" value={helped} onChangeText={setHelped} />
      <Field label="Notes (optional)" value={notes} onChangeText={setNotes} multiline />
      {error ? <ErrorBox message={error} /> : null}
      {saved ? <Card><T weight="semi">Saved.</T></Card> : null}
      <Btn label="Save log" onPress={save} loading={busy} disabled={!child || !selected} testID="log-save" />
      <T weight="bold" size={17}>Recent</T>
      {q.data?.logs?.length ? q.data.logs.slice(0, 10).map((l) => (
        <Card key={l.id}>
          <T weight="semi">{names.get(logIdentity(l)) ?? "Behavior"}: {l.happened ? `${l.intensity} intensity, ${l.duration} min` : "Did not happen"}</T>
          <T size={13}>{new Date(l.createdAt).toLocaleString()}</T>
          {l.trigger ? <T size={14}>Trigger: {l.trigger}</T> : null}
          {l.whatHelped ? <T size={14}>Helped: {l.whatHelped}</T> : null}
        </Card>
      )) : <Card><T>No logs yet. Your first entry will show up here.</T></Card>}
    </Screen>
  );
}
