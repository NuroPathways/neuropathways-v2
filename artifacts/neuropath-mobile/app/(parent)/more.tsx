import React from "react";
import { router } from "expo-router";
import { ChildSwitch } from "@/components/ChildSwitch";
import { Btn, Card, H, Screen, T } from "@/components/ParentUi";
import { useParent } from "@/context/ParentContext";

export default function More() {
  const { parent, child, signout } = useParent();
  return (
    <Screen>
      <H sub={parent?.email}>{parent ? `Hi, ${parent.firstName}` : "Account"}</H>
      <ChildSwitch />
      {child ? <Card><T weight="semi">{child.name}</T><T size={14}>{child.behaviorName ?? "No behavior chosen"}</T><T size={14}>{child.goal ? `Goal: ${child.goal}` : "No goal yet"}</T></Card> : null}
      <Btn icon="edit-2" label="Edit nickname, notes, behavior, goal" onPress={() => router.push("/parent-edit" as never)} />
      <Btn kind="ghost" icon="plus" label="Add another child" onPress={() => router.push("/parent-add-child" as never)} />
      <Btn kind="ghost" icon="link" label="Connect to a clinic" onPress={() => router.push("/parent-connect" as never)} />
      <Btn kind="ghost" icon="shield" label="Privacy policy" onPress={() => router.push("/privacy")} />
      <Btn kind="danger" icon="log-out" label="Sign out" onPress={signout} />
    </Screen>
  );
}
