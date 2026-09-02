import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  RefreshControl,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { entities } from "@/lib/api";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const childId = user?.id;
  const name = user?.child_name?.split(" ")[0] ?? user?.username ?? "there";

  const [refreshing, setRefreshing] = useState(false);

  const { data: recentLogs = [], refetch: refetchLogs } = useQuery({
    queryKey: ["behavior-logs", childId],
    queryFn: () =>
      entities.BehaviorLog.filter({ childId }).catch(() => []),
    enabled: !!childId,
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["messages", childId],
    queryFn: () =>
      entities.Message.filter({ childId }).catch(() => []),
    enabled: !!childId,
  });

  const { data: plans = [] } = useQuery({
    queryKey: ["behavior-plans", childId],
    queryFn: () =>
      entities.BehaviorPlan.filter({ childId }).catch(() => []),
    enabled: !!childId,
  });

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  const logsThisWeek = recentLogs.filter(
    (l: any) => new Date(l.createdAt) > weekStart
  );
  const unreadMessages = messages.filter((m: any) => !m.readAt && m.senderRole !== "client").length;

  const onRefresh = async () => {
    setRefreshing(true);
    await refetchLogs();
    setRefreshing(false);
  };

  const quickActions = [
    {
      icon: "cpu" as const,
      label: "AI Chat",
      color: colors.primary,
      bg: colors.muted,
      route: "/(tabs)/ai",
    },
    {
      icon: "edit-2" as const,
      label: "Log Behavior",
      color: "#7C3AED",
      bg: "#EDE9FE",
      route: "/(tabs)/log",
    },
    {
      icon: "message-circle" as const,
      label: "Messages",
      color: "#059669",
      bg: "#D1FAE5",
      route: "/(tabs)/messages",
    },
    {
      icon: "target" as const,
      label: "Goals",
      color: "#D97706",
      bg: "#FEF3C7",
      route: "/goals",
    },
  ];

  const intensityColor = (i?: string) => {
    if (i === "high") return "#EF4444";
    if (i === "moderate") return "#F59E0B";
    return "#10B981";
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0),
      paddingHorizontal: 20,
      paddingBottom: 20,
      backgroundColor: colors.primary,
    },
    headerTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 16,
    },
    brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    brandDot: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: "rgba(255,255,255,0.2)",
      alignItems: "center",
      justifyContent: "center",
    },
    brandName: {
      color: "rgba(255,255,255,0.8)",
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
    },
    notifBtn: {
      position: "relative",
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: "rgba(255,255,255,0.15)",
      alignItems: "center",
      justifyContent: "center",
    },
    notifBadge: {
      position: "absolute",
      top: 6,
      right: 6,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: "#EF4444",
    },
    greetText: {
      color: "rgba(255,255,255,0.7)",
      fontSize: 14,
      fontFamily: "Inter_400Regular",
    },
    nameText: {
      color: "#FFFFFF",
      fontSize: 24,
      fontWeight: "700" as const,
      fontFamily: "Inter_700Bold",
      marginTop: 2,
    },
    statsRow: {
      flexDirection: "row",
      gap: 10,
      marginTop: 20,
    },
    statCard: {
      flex: 1,
      backgroundColor: "rgba(255,255,255,0.15)",
      borderRadius: 14,
      padding: 12,
      alignItems: "center",
    },
    statValue: {
      color: "#FFFFFF",
      fontSize: 22,
      fontWeight: "700" as const,
      fontFamily: "Inter_700Bold",
    },
    statLabel: {
      color: "rgba(255,255,255,0.65)",
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      marginTop: 2,
    },
    body: { flex: 1 },
    section: { paddingHorizontal: 20, marginTop: 24 },
    sectionTitle: {
      fontSize: 12,
      fontWeight: "600" as const,
      color: colors.mutedForeground,
      fontFamily: "Inter_600SemiBold",
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: 14,
    },
    helpBtn: {
      marginHorizontal: 20,
      marginTop: 20,
      backgroundColor: "#EF4444",
      borderRadius: colors.radius,
      paddingVertical: 16,
      paddingHorizontal: 20,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
    },
    helpIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: "rgba(255,255,255,0.2)",
      alignItems: "center",
      justifyContent: "center",
    },
    helpTextBlock: { flex: 1 },
    helpTitle: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "700" as const,
      fontFamily: "Inter_700Bold",
    },
    helpSub: {
      color: "rgba(255,255,255,0.75)",
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      marginTop: 2,
    },
    actionsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
    },
    actionCard: {
      width: "47%",
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    actionIcon: {
      width: 40,
      height: 40,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
    },
    actionLabel: {
      fontSize: 14,
      fontWeight: "600" as const,
      color: colors.foreground,
      fontFamily: "Inter_600SemiBold",
    },
    logItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    logDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    logTitle: {
      fontSize: 14,
      fontWeight: "500" as const,
      color: colors.foreground,
      fontFamily: "Inter_500Medium",
      flex: 1,
    },
    logSub: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
    },
    emptyBox: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: "dashed",
      padding: 28,
      alignItems: "center",
    },
    emptyText: {
      color: colors.mutedForeground,
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      marginTop: 8,
    },
    planCard: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    planIcon: {
      width: 40,
      height: 40,
      borderRadius: 11,
      backgroundColor: `${colors.primary}18`,
      alignItems: "center",
      justifyContent: "center",
    },
    planName: {
      fontSize: 14,
      fontWeight: "600" as const,
      color: colors.foreground,
      fontFamily: "Inter_600SemiBold",
    },
    planSub: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginTop: 2,
    },
    bottomSpace: { height: Platform.OS === "web" ? 84 : 90 },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.headerTop}>
          <View style={s.brandRow}>
            <View style={s.brandDot}>
              <Feather name="activity" size={16} color="#fff" />
            </View>
            <Text style={s.brandName}>NuroPathways</Text>
          </View>
          <Pressable
            style={s.notifBtn}
            onPress={() => router.push("/(tabs)/messages")}
          >
            <Feather name="bell" size={18} color="#fff" />
            {unreadMessages > 0 && <View style={s.notifBadge} />}
          </Pressable>
        </View>

        <Text style={s.greetText}>{greeting()},</Text>
        <Text style={s.nameText}>{name}</Text>

        <View style={s.statsRow}>
          {[
            { label: "Logs This Week", value: logsThisWeek.length },
            { label: "Active Plans", value: plans.length },
            { label: "Messages", value: messages.length },
          ].map((stat) => (
            <View key={stat.label} style={s.statCard}>
              <Text style={s.statValue}>{stat.value}</Text>
              <Text style={s.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <ScrollView
        style={s.body}
        contentContainerStyle={{ paddingBottom: 0 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        <Pressable
          style={s.helpBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push("/help");
          }}
        >
          <View style={s.helpIcon}>
            <Feather name="alert-circle" size={22} color="#fff" />
          </View>
          <View style={s.helpTextBlock}>
            <Text style={s.helpTitle}>I Need Help Right Now</Text>
            <Text style={s.helpSub}>
              Get instant clinician-approved guidance
            </Text>
          </View>
          <Feather name="chevron-right" size={20} color="rgba(255,255,255,0.7)" />
        </Pressable>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Quick Actions</Text>
          <View style={s.actionsGrid}>
            {quickActions.map((action) => (
              <Pressable
                key={action.label}
                style={s.actionCard}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push(action.route as any);
                }}
              >
                <View style={[s.actionIcon, { backgroundColor: action.bg }]}>
                  <Feather name={action.icon} size={20} color={action.color} />
                </View>
                <Text style={s.actionLabel}>{action.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {plans.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>My Behavior Plans</Text>
            {plans.slice(0, 3).map((plan: any) => (
              <View key={plan.id} style={s.planCard}>
                <View style={s.planIcon}>
                  <Feather name="clipboard" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.planName}>{plan.behaviorName ?? plan.behavior_name ?? "Behavior Plan"}</Text>
                  <Text style={s.planSub}>{plan.status ?? "Active"}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={s.section}>
          <Text style={s.sectionTitle}>Recent Activity</Text>
          {recentLogs.length === 0 ? (
            <View style={s.emptyBox}>
              <Feather name="bar-chart-2" size={28} color={colors.mutedForeground} />
              <Text style={s.emptyText}>No activity logged yet</Text>
            </View>
          ) : (
            recentLogs.slice(0, 5).map((log: any) => (
              <View key={log.id} style={s.logItem}>
                <View
                  style={[
                    s.logDot,
                    { backgroundColor: intensityColor(log.intensity) },
                  ]}
                />
                <View style={{ flex: 1 }}>
                  <Text style={s.logTitle}>
                    {log.behaviorType ?? log.behavior_type ?? "Behavior logged"}
                  </Text>
                  <Text style={s.logSub}>
                    {log.intensity ?? "—"} intensity
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={s.bottomSpace} />
      </ScrollView>
    </View>
  );
}
