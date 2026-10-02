import React from "react";
import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { getStarterLibrary } from "@workspace/api-client-react";
import { Card, Chip, ErrorBox, Field, Row, Skeleton, T } from "@/components/ParentUi";

export interface BehaviorChoice { behaviorKey: string | null; customBehavior: string }

export function BehaviorPicker({ value, onChange }: { value: BehaviorChoice; onChange: (v: BehaviorChoice) => void }) {
  const q = useQuery({ queryKey: ["parent-starter-library"], queryFn: () => getStarterLibrary() });
  const [custom, setCustom] = React.useState(!value.behaviorKey && !!value.customBehavior);
  if (q.isLoading) return <Skeleton lines={4} />;
  if (q.isError || !q.data) return <ErrorBox message="Starter behaviors could not load." onRetry={() => q.refetch()} />;
  const sel = q.data.find((s) => s.key === value.behaviorKey);
  return (
    <View style={{ gap: 12 }}>
      <Row wrap>
        {q.data.map((s) => (
          <Chip key={s.key} label={s.name} selected={!custom && value.behaviorKey === s.key} onPress={() => { setCustom(false); onChange({ behaviorKey: s.key, customBehavior: "" }); }} />
        ))}
        <Chip label="Something else" selected={custom} onPress={() => { setCustom(true); onChange({ behaviorKey: null, customBehavior: value.customBehavior }); }} />
      </Row>
      {!custom && sel ? <Card><T weight="semi">{sel.name}</T><T color="#636E82" size={14}>{sel.description}</T></Card> : null}
      {custom ? <Field label="Describe the behavior" value={value.customBehavior} onChangeText={(t) => onChange({ behaviorKey: null, customBehavior: t })} placeholder="For example: hits the table at dinner" /> : null}
    </View>
  );
}

// ---------- Multi-behavior selection with an independent goal per behavior ----------
import { getParentBehaviors, parentBehaviorIdentity } from "@workspace/api-client-react";
import { Btn } from "@/components/ParentUi";
import { useColors } from "@/hooks/useColors";

export interface BehaviorSel { behaviorKey: string; customBehavior: string; goal: string }

export const selsFromChild = (child: object | null | undefined): BehaviorSel[] =>
  child ? getParentBehaviors(child).map((b) => ({
    behaviorKey: b.behaviorKey,
    customBehavior: b.behaviorKey === "custom" ? (b.customBehavior ?? b.behaviorName) : "",
    goal: b.goal ?? "",
  })) : [];

export const selsToInput = (sels: BehaviorSel[]) => sels.map((s) => ({
  behaviorKey: s.behaviorKey,
  ...(s.behaviorKey === "custom" ? { customBehavior: s.customBehavior.trim() } : {}),
  goal: s.goal.trim() || null,
}));

export function validateSels(sels: BehaviorSel[], requireGoals = true): string | null {
  if (!sels.length) return "Choose at least one behavior or describe your own.";
  const seen = new Set<string>();
  for (const s of sels) {
    if (s.behaviorKey === "custom" && !s.customBehavior.trim()) return "Describe each behavior you added, or remove it.";
    const id = parentBehaviorIdentity(s);
    if (seen.has(id)) return "Two of your behaviors are the same. Remove one.";
    seen.add(id);
  }
  if (requireGoals && sels.some((s) => !s.goal.trim())) return "Write or pick a goal for every behavior.";
  return null;
}

export function BehaviorGoalsEditor({ value, onChange }: { value: BehaviorSel[]; onChange: (v: BehaviorSel[]) => void }) {
  const c = useColors();
  const q = useQuery({ queryKey: ["parent-starter-library"], queryFn: () => getStarterLibrary() });
  if (q.isLoading) return <Skeleton lines={4} />;
  if (q.isError || !q.data) return <ErrorBox message="Starter behaviors could not load." onRetry={() => q.refetch()} />;
  const lib = q.data;
  const has = (key: string) => value.some((s) => s.behaviorKey === key);
  const toggle = (key: string) => onChange(has(key) ? value.filter((s) => s.behaviorKey !== key) : [...value, { behaviorKey: key, customBehavior: "", goal: "" }]);
  const patch = (i: number, p: Partial<BehaviorSel>) => onChange(value.map((s, j) => (j === i ? { ...s, ...p } : s)));
  return (
    <View style={{ gap: 12 }}>
      <T size={13} weight="semi" color={c.secondary}>Select every behavior you want support with. Each one gets its own goal.</T>
      <Row wrap>
        {lib.map((s) => <Chip key={s.key} label={s.name} selected={has(s.key)} onPress={() => toggle(s.key)} />)}
      </Row>
      <Btn kind="ghost" icon="plus" label="Add a behavior of your own" onPress={() => onChange([...value, { behaviorKey: "custom", customBehavior: "", goal: "" }])} />
      {value.map((s, i) => {
        const t = lib.find((x) => x.key === s.behaviorKey);
        const custom = s.behaviorKey === "custom";
        return (
          <Card key={`${s.behaviorKey}-${custom ? i : ""}`}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ flex: 1 }}><T weight="bold" size={16}>{custom ? s.customBehavior.trim() || "Your own behavior" : t?.name ?? s.behaviorKey}</T></View>
              <Chip label="Remove" onPress={() => onChange(value.filter((_, j) => j !== i))} />
            </View>
            {custom ? <Field label="Describe the behavior" value={s.customBehavior} onChangeText={(x) => patch(i, { customBehavior: x })} placeholder="For example: hits the table at dinner" /> : t ? <T size={14} color={c.secondary}>{t.description}</T> : null}
            {t?.relatedGoals?.length ? <Row wrap>{t.relatedGoals.map((g) => <Chip key={g} label={g} selected={s.goal === g} onPress={() => patch(i, { goal: g })} />)}</Row> : null}
            <Field label="Goal for this behavior" value={s.goal} onChangeText={(x) => patch(i, { goal: x })} multiline placeholder="For example: ask for a break instead of yelling" />
          </Card>
        );
      })}
    </View>
  );
}
