import React from "react";
import { Alert } from "react-native";
import { Chip, Row, msg } from "@/components/ParentUi";
import { useParent } from "@/context/ParentContext";

export function ChildSwitch() {
  const { children, child, selectChild } = useParent();
  if (children.length < 2) return null;
  return (
    <Row wrap>
      {children.map((k) => (
        <Chip key={k.id} label={k.name} selected={k.id === child?.id} onPress={() => selectChild(k.id).catch((e) => Alert.alert("Could not switch", msg(e)))} />
      ))}
    </Row>
  );
}
