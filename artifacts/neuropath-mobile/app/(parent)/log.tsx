import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addParentLog, getParentDashboard } from "@workspace/api-client-react";
import { Btn, Card, Chip, ErrorBox, Field, H, Row, Screen, T, msg } from "@/components/ParentUi";
import { useParent } from "@/context/ParentContext";

type Intensity = "low" | "medium" | "high";

export default function LogScreen() {
  const { child, opts } = useParent();
  const qc = useQueryClient();
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

  const save = async () => {
    if (!child) return;
    const d = Number(duration);
    if (happened && (!Number.isFinite(d) || d < 0)) return setError("Enter how many minutes it lasted.");
    setBusy(true); setError(""); setSaved(false);
    try {
      await addParentLog(child.id, { happened, intensity, duration: happened ? d : 0, trigger: trigger.trim() || undefined, whatHelped: helped.trim() || undefined, notes: notes.trim() || undefined }, opts);
      setDuration(""); setTrigger(""); setHelped(""); setNotes(""); setSaved(true);
      qc.invalidateQueries({ queryKey: ["parent-dashboard", child.id] });
    } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  };

  return (
    <Screen>
      <H sub={child?.behaviorName ? `Tracking: ${child.behaviorName}` : undefined}>Log an episode</H>
      <Row><Chip label="It happened" selected={happened} onPress={() => setHappened(true)} /><Chip label="Did not happen" selected={!happened} onPress={() => setHappened(false)} /></Row>
      <T weight="semi">How intense?</T>
      <Row>{(["low", "medium", "high"] as Intensity[]).map((i) => <Chip key={i} label={i[0].toUpperCase() + i.slice(1)} selected={intensity === i} onPress={() => setIntensity(i)} />)}</Row>
      {happened ? <Field label="Minutes it lasted" value={duration} onChangeText={setDuration} keyboardType="number-pad" testID="log-duration" /> : null}
      <Field label="What set it off (optional)" value={trigger} onChangeText={setTrigger} />
      <Field label="What helped (optional)" value={helped} onChangeText={setHelped} />
      <Field label="Notes (optional)" value={notes} onChangeText={setNotes} multiline />
      {error ? <ErrorBox message={error} /> : null}
      {saved ? <Card><T weight="semi">Saved.</T></Card> : null}
      <Btn label="Save log" onPress={save} loading={busy} disabled={!child} testID="log-save" />
      <T weight="bold" size={17}>Recent</T>
      {q.data?.logs?.length ? q.data.logs.slice(0, 10).map((l) => (
        <Card key={l.id}>
          <T weight="semi">{l.happened ? `${l.intensity} intensity, ${l.duration} min` : "Did not happen"}</T>
          <T size={13}>{new Date(l.createdAt).toLocaleString()}</T>
          {l.trigger ? <T size={14}>Trigger: {l.trigger}</T> : null}
          {l.whatHelped ? <T size={14}>Helped: {l.whatHelped}</T> : null}
        </Card>
      )) : <Card><T>No logs yet. Your first entry will show up here.</T></Card>}
    </Screen>
  );
}
