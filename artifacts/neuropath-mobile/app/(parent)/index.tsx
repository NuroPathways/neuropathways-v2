import React, { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { useFocusEffect, router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { getParentDashboard } from "@workspace/api-client-react";
import type { SupportCard } from "@workspace/api-client-react";
import { ChildSwitch } from "@/components/ChildSwitch";
import { Btn, Card, Chip, ErrorBox, H, Row, Screen, Skeleton, T, msg } from "@/components/ParentUi";
import { useParent } from "@/context/ParentContext";
import { useColors } from "@/hooks/useColors";

const SOURCE: Record<SupportCard["source"], string> = {
  starter: "Starter support based on common behavior patterns. Upload your child's plan later for more personalized guidance.",
  parent_document: "Based on your child's uploaded plan. Not yet reviewed by a clinician.",
  clinician_document: "Document-Based Support from a plan shared by your clinician.",
  clinician_reviewed: "Reviewed by your clinician.",
};

function List({ title, items, tone }: { title: string; items: string[]; tone?: "warn" }) {
  const c = useColors();
  if (!items?.length) return null;
  return (
    <Card tone={tone}>
      <T weight="bold" size={16}>{title}</T>
      {items.map((it, i) => (
        <View key={i} style={{ flexDirection: "row", gap: 10 }}>
          <T weight="bold" color={c.primary}>{i + 1}.</T>
          <View style={{ flex: 1 }}><T>{it}</T></View>
        </View>
      ))}
    </Card>
  );
}

export default function SupportNow() {
  const c = useColors();
  const { child, opts } = useParent();
  const [pick, setPick] = useState(0);
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ["parent-dashboard", child?.id], queryFn: () => getParentDashboard(child!.id, opts), enabled: !!child });
  const refetch = q.refetch;
  // Re-sync behavior, goal and source text from the server whenever this tab regains focus (e.g. after a scan).
  useFocusEffect(useCallback(() => { if (child) refetch(); }, [child, refetch]));
  const cards = q.data?.supportCards ?? [];
  const card = cards[Math.min(pick, Math.max(cards.length - 1, 0))];
  const goal = card?.goal ?? q.data?.child.goal ?? child?.goal;
  const behavior = card?.behaviorName ?? q.data?.child.behaviorName ?? child?.behaviorName;

  return (
    <Screen>
      <H sub={`For ${q.data?.child.name ?? child?.name ?? ""}`}>Today's Support</H>
      <ChildSwitch />
      <T weight="bold" size={17}>Need help right now?</T>
      <Pressable testID="help-now" accessibilityRole="button" onPress={() => setOpen((o) => !o)} style={({ pressed }) => ({ backgroundColor: c.destructive, borderRadius: 20, padding: 22, flexDirection: "row", alignItems: "center", gap: 14, opacity: pressed ? 0.9 : 1 })}>
        <Feather name="life-buoy" size={30} color={c.destructiveForeground} />
        <View style={{ flex: 1 }}>
          <T weight="bold" size={22} color={c.destructiveForeground}>I Need Help Now</T>
          <T size={13} color={c.destructiveForeground}>{open ? "Tap to close the steps" : "Tap for steps to use right now"}</T>
        </View>
      </Pressable>

      {q.isLoading ? <Skeleton lines={4} /> : q.isError ? <ErrorBox message={msg(q.error, "Your support could not load.")} onRetry={() => q.refetch()} /> : (
        <>
          {open ? (
            !card ? <Card><T weight="semi">Your support card is not ready yet.</T><Btn label="Finish setup" onPress={() => router.push("/parent-quickstart" as never)} /></Card> : (
              <>
                <H>{`${card.behaviorName} Support`}</H>
                {cards.length > 1 ? <Row wrap>{cards.map((k, i) => <Chip key={k.id} label={k.behaviorName} selected={i === pick} onPress={() => setPick(i)} />)}</Row> : null}
                <T size={13} weight="semi" color={card.source === "clinician_reviewed" ? c.primary : c.secondary}>{SOURCE[card.source]}</T>
                {card.conflict ? <Card tone="warn"><T weight="semi">Conflict detected. Clinician review recommended.</T>{card.conflictMessage ? <T size={14}>{card.conflictMessage}</T> : null}</Card> : null}
                <List title="What to do right now" items={card.rightNow} />
                <Card><T weight="bold" size={16}>What may be happening</T><T>{card.whatMayBeHappening}</T></Card>
                <List title="What to avoid" items={card.avoid} tone="warn" />
                <List title="Prevent it next time" items={card.prevention} />
                <Card><T weight="bold" size={16}>Try this replacement skill</T><T>{card.replacementSkill}</T><T size={14} color={c.secondary}>{card.reinforcementIdea}</T></Card>
                <Card><T weight="bold" size={16}>Current goal</T><T>{goal ?? "No goal chosen yet"}</T></Card>
                <Card><T weight="bold" size={16}>When to get help</T><T>{card.seekHelp}</T></Card>
                <List title="What to track" items={card.track} />
                <Btn icon="edit-3" label="Log what happened" onPress={() => router.push("/(parent)/log" as never)} />
                {card.source === "starter" ? <T size={13} weight="semi" color={c.secondary}>This is starter support. Upload your child's plan for personalized guidance.</T> : null}
                {card.sourceReferences?.length ? (
                  <Card>
                    <T weight="bold" size={16}>Sources</T>
                    {card.sourceReferences.map((r, i) => (<View key={i}><T weight="semi" size={14}>{r.title}</T>{r.excerpt ? <T size={13} color={c.secondary}>{r.excerpt}</T> : null}</View>))}
                  </Card>
                ) : null}
              </>
            )
          ) : null}

          <Card>
            <T weight="bold" size={17}>Current Focus</T>
            <T size={12} weight="semi" color={c.mutedForeground}>Current Behavior</T>
            <T weight="bold" size={18}>{behavior ?? "Not chosen yet"}</T>
            {card ? <T size={13} color={c.secondary}>{SOURCE[card.source]}</T> : null}
            <Btn kind="ghost" label="Open Support Steps" onPress={() => setOpen(true)} disabled={!card} />
          </Card>
          <Card>
            <T size={12} weight="semi" color={c.mutedForeground}>Current Goal</T>
            <T weight="bold" size={18}>{goal ?? "No goal chosen yet"}</T>
          </Card>
          <Card>
            <T weight="bold" size={17}>Log What Happened</T>
            <T size={14}>Record what set it off, how long it lasted and what helped.</T>
            <Btn icon="edit-3" label="Log What Happened" onPress={() => router.push("/(parent)/log" as never)} />
          </Card>
          <Btn kind="ghost" icon="edit-2" label="Edit Behavior / Goal" onPress={() => router.push("/parent-edit" as never)} />
          <Card>
            <T weight="bold" size={17}>Make this more personalized</T>
            <T size={14}>Upload a behavior plan, school support plan, or treatment plan when you are ready.</T>
            <Btn testID="upload-plan" icon="upload" label="Upload a Plan" onPress={() => router.push("/(parent)/documents" as never)} />
          </Card>
        </>
      )}
    </Screen>
  );
}
