import React from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { getGetParentDashboardQueryKey, getParentDashboard, getParentBehaviors, parentBehaviorIdentity } from "@workspace/api-client-react";
import { ChildSwitch } from "@/components/ChildSwitch";
import { Card, ErrorBox, H, Screen, Skeleton, T, msg } from "@/components/ParentUi";
import { useParent } from "@/context/ParentContext";
import { useColors } from "@/hooks/useColors";

export default function ParentHome() {
  const c = useColors();
  const { child, opts } = useParent();
  const query = useQuery({ queryKey: getGetParentDashboardQueryKey(child?.id ?? ""), queryFn: () => getParentDashboard(child!.id, opts), enabled: !!child });
  const behaviorNames = new Map(getParentBehaviors(query.data?.child ?? child ?? {}).map((behavior) => [parentBehaviorIdentity(behavior), behavior.behaviorName]));
  return (
    <Screen>
      <H>{child ? `Support for ${child.name}` : "Family Home"}</H>
      <ChildSwitch />
      <T size={14} color={c.secondary}>Choose what would help your family right now.</T>
      {query.isLoading ? <Skeleton lines={4} /> : query.isError ? <ErrorBox message={msg(query.error, "Your home could not load.")} onRetry={() => query.refetch()} /> : (
        <>
          <Pressable accessibilityRole="button" testID="home-help-now" onPress={() => router.push("/(parent)/help-now" as never)} style={({ pressed }) => ({ backgroundColor: c.destructive, borderRadius: 18, padding: 17, flexDirection: "row", alignItems: "center", gap: 13, opacity: pressed ? 0.88 : 1 })}>
            <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: c.destructiveForeground, alignItems: "center", justifyContent: "center" }}><T size={18} weight="bold" color={c.destructive}>!</T></View>
            <View style={{ flex: 1 }}><T weight="bold" size={18} color={c.destructiveForeground}>Need help right now?</T><T size={13} color={c.destructiveForeground}>Open saved support steps</T></View>
          </Pressable>
          <View style={{ gap: 10 }}>
            {(() => {
              const paused = (query.data?.dailyActions ?? []).find((a) => (a.currentStep ?? 0) > 0 || a.bookmarked || a.status === "saved_for_later");
              return paused ? (
                <Card>
                  <T size={12} weight="semi" color={c.secondary}>CONTINUE</T>
                  <T weight="semi" size={16}>{paused.title}</T>
                  <Pressable accessibilityRole="button" testID="home-continue" onPress={() => router.push("/(parent)/practice" as never)} style={{ minHeight: 44, justifyContent: "center" }}><T weight="semi" color={c.primary}>Continue where you left off</T></Pressable>
                </Card>
              ) : null;
            })()}
            <Card>
              <T size={12} weight="semi" color={c.secondary}>PREPARE</T>
              <T size={14} color={c.secondary}>Review saved support steps before a hard moment.</T>
              <Pressable accessibilityRole="button" testID="home-prepare" onPress={() => router.push("/(parent)/help-now" as never)} style={{ minHeight: 44, justifyContent: "center" }}><T weight="semi" color={c.primary}>Prepare</T></Pressable>
            </Card>
            <T size={17} weight="bold">Practice Together</T>
            <Card>
              <T size={12} weight="semi" color={c.secondary}>PRACTICE</T>
              <T weight="semi" size={16}>One small step is enough</T>
              <T size={14} color={c.secondary}>{query.data?.dailyActions?.length ? `${query.data.dailyActions.length} saved activities are ready to explore.` : "No activities are scheduled yet. Browse saved skills when the moment feels right."}</T>
              <Pressable accessibilityRole="button" onPress={() => router.push("/(parent)/practice" as never)} style={{ minHeight: 44, justifyContent: "center" }}><T weight="semi" color={c.primary}>Open Practice</T></Pressable>
            </Card>
            <Card>
              <T size={12} weight="semi" color={c.secondary}>LATEST SAVED NOTE</T>
              {query.data?.logs?.[0] ? (
                <>
                  <T weight="semi">{behaviorNames.get(parentBehaviorIdentity(query.data.logs[0])) || query.data.logs[0].customBehavior || "Behavior note"}</T>
                  <T size={13} color={c.secondary}>{new Date(query.data.logs[0].createdAt).toLocaleDateString()}</T>
                  <Pressable accessibilityRole="button" onPress={() => router.push("/(parent)/history" as never)} style={{ minHeight: 44, justifyContent: "center" }}><T weight="semi" color={c.primary}>View History</T></Pressable>
                </>
              ) : <T size={14} color={c.secondary}>No recent notes to review. Start fresh whenever it feels useful.</T>}
            </Card>
          </View>
        </>
      )}
    </Screen>
  );
}
