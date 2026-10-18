import React, { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Card, ErrorBox, T, msg } from "@/components/ParentUi";
import { useColors } from "@/hooks/useColors";

export type Outcome = "tried" | "support" | "none";
export const OUTCOMES: { value: Outcome; label: string; daily: "used_skill" | "partially" | "not_yet"; care: "tried" | "needed_support" | "not_tried" }[] = [
  { value: "tried", label: "We tried it", daily: "used_skill", care: "tried" },
  { value: "support", label: "We needed support", daily: "partially", care: "needed_support" },
  { value: "none", label: "Didn't get a chance", daily: "not_yet", care: "not_tried" },
];
export type GuideItem = {
  kind: "daily" | "care"; id: string; title: string; skill: string; minutes: number | null; description: string;
  materials: string; steps: string[]; why: string; ifDifficult: string; notes: string; goalTitle: string | null;
  assigned: boolean; source: string; step: number; finished: boolean; closed: boolean; bookmarked: boolean;
};
export function AssignedBadge() {
  const c = useColors();
  return <View style={{ alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: c.muted, borderWidth: 1, borderColor: c.primary }}>
    <T size={11} weight="semi" color={c.primary}>Assigned by Your Care Team</T>
  </View>;
}

export function ActivityGuide({ item, childName, onExit, onStep, onSaveForLater, onFeedback, preview = false, visibilityNote }: {
  item: GuideItem; childName: string; onExit: () => void; onStep: (step: number, finished: boolean) => Promise<void>;
  onSaveForLater: (step: number) => Promise<void>; onFeedback: (o: Outcome | "", note: string) => Promise<void>; preview?: boolean; visibilityNote?: string;
}) {
  const c = useColors();
  const n = item.steps.length;
  const [step, setStep] = useState(item.step);
  const [finished, setFinished] = useState(item.finished && !item.closed);
  const [whyOpen, setWhyOpen] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const go = (next: number, fin: boolean) => {
    setStep(next); setFinished(fin); setError("");
    void onStep(next, fin).catch((e) => setError(msg(e, "Your place could not be saved.")));
  };
  const run = async (fn: () => Promise<void>, fallback: string) => {
    setBusy(true); setError("");
    try { await fn(); } catch (e) { setError(msg(e, fallback)); } finally { setBusy(false); }
  };
  const primaryBtn = (label: string, onPress: () => void, disabled = false) => <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={{ flex: 1, minHeight: 46, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: c.primary, opacity: disabled ? 0.5 : 1 }}>
    <T size={14} weight="semi" color={c.primaryForeground}>{label}</T></Pressable>;
  const ghostBtn = (label: string, onPress: () => void) => <Pressable accessibilityRole="button" onPress={onPress}
    style={{ flex: 1, minHeight: 46, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border, backgroundColor: c.card }}>
    <T size={14} weight="semi" color={c.foreground}>{label}</T></Pressable>;

  return <View style={{ gap: 14 }}>
    {preview ? <View style={{ padding: 10, borderRadius: 10, backgroundColor: c.muted }}><T size={12} weight="semi" color={c.foreground}>Parent preview · nothing is saved</T></View> : null}
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Pressable accessibilityRole="button" testID="practice-exit" onPress={onExit} style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40 }}>
        <Feather name="x" size={18} color={c.secondary} /><T size={14} weight="semi" color={c.secondary}>Exit</T>
      </Pressable>
      {!item.closed && !finished && !preview ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => void run(() => onSaveForLater(step), "Could not save this activity for later.")} style={{ minHeight: 40, justifyContent: "center" }}>
        <T size={13} weight="semi" color={c.primary}>Save for later</T></Pressable> : null}
    </View>
    <View style={{ gap: 6 }}>
      <T size={22} weight="bold">{item.title}</T>
      <T size={13} weight="semi" color={c.secondary}>{[item.skill, item.minutes ? `About ${item.minutes} minutes` : null].filter(Boolean).join(" · ")}</T>
      {item.assigned ? <AssignedBadge /> : <T size={12} color={c.secondary}>{item.source}</T>}
      {item.goalTitle ? <T size={13} color={c.secondary}>Related goal: <T size={13} weight="semi">{item.goalTitle}</T></T> : null}
    </View>
    {error ? <ErrorBox message={error} /> : null}
    {item.closed ? <Card>
      <T size={13} weight="semi" color={c.primary}>Completed · review only</T>
      {item.steps.map((s, i) => <T key={i} size={14}>{i + 1}. {s}</T>)}
      {primaryBtn("Back to Practice", onExit)}
    </Card> : !finished ? <>
      {item.materials ? <Card><T size={15} weight="bold">What You'll Need</T><T size={14}>{item.materials}</T></Card> : null}
      <Card>
        <T size={15} weight="bold">Let's Try It</T>
        {n ? <>
          <T size={12} weight="semi" color={c.secondary}>Step {step + 1} of {n}</T>
          <View style={{ height: 6, borderRadius: 6, backgroundColor: c.muted, overflow: "hidden" }}><View style={{ height: 6, width: `${((step + 1) / n) * 100}%`, backgroundColor: c.primary }} /></View>
          <T size={17} style={{ lineHeight: 25, marginVertical: 6 }}>{item.steps[step]}</T>
        </> : <T size={14} color={c.secondary}>No steps were included with this activity. Ask your care team or exit.</T>}
        <View style={{ flexDirection: "row", gap: 10 }}>
          {step > 0 ? ghostBtn("Back", () => go(step - 1, false)) : null}
          {primaryBtn(step < n - 1 ? "Next" : "Finish", () => (step < n - 1 ? go(step + 1, false) : go(step, true)))}
        </View>
      </Card>
      {item.ifDifficult ? <Card><T size={14} weight="bold">If it becomes difficult</T><T size={14}>{item.ifDifficult}</T></Card> : null}
      {item.notes ? <Card><T size={14} weight="bold">Notes from your care team</T><T size={14}>{item.notes}</T></Card> : null}
      {item.why ? <Card>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: whyOpen }} onPress={() => setWhyOpen(!whyOpen)} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 32 }}>
          <T size={14} weight="semi" color={c.primary}>Why this helps</T><Feather name={whyOpen ? "chevron-up" : "chevron-down"} size={16} color={c.primary} />
        </Pressable>
        {whyOpen ? <T size={14}>{item.why}</T> : null}
      </Card> : null}
    </> : <Card>
      <T size={18} weight="bold">How did it go?</T>
      <T size={12} color={c.secondary}>Optional. This is a practice note, not a measure of {childName}'s progress.</T>
      {visibilityNote ? <T size={12} weight="semi" color={c.foreground}>{visibilityNote}</T> : null}
      {OUTCOMES.map((o) => <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ selected: outcome === o.value }} onPress={() => setOutcome(o.value)}
        style={{ padding: 12, borderRadius: 10, borderWidth: 1, borderColor: outcome === o.value ? c.primary : c.border, backgroundColor: outcome === o.value ? c.muted : c.card }}>
        <T size={14} weight={outcome === o.value ? "semi" : "regular"}>{o.label}</T></Pressable>)}
      <TextInput value={note} onChangeText={setNote} maxLength={2000} multiline placeholder="Optional note" placeholderTextColor={c.mutedForeground}
        style={{ minHeight: 80, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 12, color: c.foreground, textAlignVertical: "top" }} />
      <View style={{ flexDirection: "row", gap: 10 }}>
        {ghostBtn("Skip", onExit)}
        {primaryBtn(busy ? "Saving..." : "Save Update", () => void run(() => onFeedback(outcome, note.trim()), "Your update could not be saved."), busy || (!outcome && !note.trim()) || (item.assigned && !outcome))}
      </View>
      {n ? <Pressable accessibilityRole="button" onPress={() => go(n - 1, false)} style={{ minHeight: 36, justifyContent: "center" }}><T size={13} color={c.secondary}>Back to last step</T></Pressable> : null}
    </Card>}
  </View>;
}
