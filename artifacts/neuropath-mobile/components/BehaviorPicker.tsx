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
