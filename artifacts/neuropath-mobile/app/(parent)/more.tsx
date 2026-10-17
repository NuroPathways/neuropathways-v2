import React from "react";
import { router } from "expo-router";
import { ChildSwitch } from "@/components/ChildSwitch";
import { Btn, Card, H, Screen, T } from "@/components/ParentUi";
import { useParent } from "@/context/ParentContext";
import { ParentMessagesSection } from "@/components/ParentGoalsMessages";

export default function More() {
  const { parent, child, signout } = useParent();
  const legacy = (parent as { accountType?: string } | null)?.accountType === "legacy_family";
  return (
    <Screen>
      <H sub={parent?.email}>{parent ? `Hi, ${parent.firstName}` : "Family tools"}</H>
      <ChildSwitch />
      <T size={13}>Your family tools, ready when you need them.</T>
      <Btn icon="clock" label="History" onPress={() => router.push("/(parent)/history" as never)} />
      <Btn kind="ghost" icon="book-open" label="Support library" onPress={() => router.push("/(parent)/index" as never)} />
      <Btn kind="ghost" icon="file-text" label="Care plan and documents" onPress={() => router.push("/(parent)/documents" as never)} />
      <Btn kind="ghost" icon="upload" label="Upload a plan" onPress={() => router.push("/(parent)/documents" as never)} />
      <Btn kind="ghost" icon="message-circle" label="AI Chat" onPress={() => router.push("/(parent)/chat" as never)} />
      <Btn kind="ghost" icon="heart" label="Enjoyment and preferences" testID="menu-preferences" onPress={() => router.push({ pathname: "/(parent)/practice", params: { view: "preferences" } } as never)} />
      {legacy ? <Card><T size={13}>Your clinic already manages this family account.</T></Card> : <Btn kind="ghost" icon="link" label="Clinic connection" onPress={() => router.push("/parent-connect" as never)} />}
      <Btn kind="ghost" icon="shield" label="Settings and privacy" onPress={() => router.push("/privacy")} />
      <ParentMessagesSection />
      {child ? <Card><T size={12}>Current child</T><T weight="semi">{child.name}</T></Card> : null}
      {legacy ? null : <>
        <Btn kind="ghost" icon="edit-2" label="Edit child profile" onPress={() => router.push("/parent-edit" as never)} />
        <Btn kind="ghost" icon="plus" label="Add another child" onPress={() => router.push("/parent-add-child" as never)} />
      </>}
      <Btn kind="danger" icon="log-out" label="Sign out" onPress={signout} />
    </Screen>
  );
}
