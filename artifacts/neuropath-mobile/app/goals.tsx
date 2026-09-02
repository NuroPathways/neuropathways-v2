import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { entities } from "@/lib/api";

export default function GoalsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const childId = user?.id;

  const { data: tokens = [], isLoading } = useQuery({
    queryKey: ["reward-tokens", childId],
    queryFn: () => entities.RewardToken.filter({ childId }).catch(() => []),
    enabled: !!childId,
  });

  const { data: logs = [] } = useQuery({
    queryKey: ["win-logs", childId],
    queryFn: () => entities.WinLog.filter({ childId }).catch(() => []),
    enabled: !!childId,
  });

  const totalTokens = tokens.reduce(
    (sum: number, t: any) => sum + (Number(t.balance ?? t.tokens ?? 0)),
    0
  );

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: Platform.OS === "web" ? 67 : 0,
      paddingHorizontal: 20,
      paddingBottom: 16,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: 22,
      fontWeight: "700" as const,
      color: colors.foreground,
      fontFamily: "Inter_700Bold",
    },
    headerSub: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginTop: 2,
    },
    scroll: { flex: 1 },
    statsRow: {
      flexDirection: "row",
      gap: 14,
      marginHorizontal: 20,
      marginTop: 20,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      alignItems: "center",
    },
    statValue: {
      fontSize: 32,
      fontWeight: "700" as const,
      color: colors.primary,
      fontFamily: "Inter_700Bold",
    },
    statLabel: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginTop: 4,
      textAlign: "center",
    },
    section: { paddingHorizontal: 20, marginTop: 24 },
    sectionLabel: {
      fontSize: 12,
      fontWeight: "600" as const,
      color: colors.mutedForeground,
      fontFamily: "Inter_600SemiBold",
      textTransform: "uppercase",
      letterSpacing: 0.7,
      marginBottom: 12,
    },
    goalCard: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 10,
    },
    goalHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginBottom: 10,
    },
    goalIcon: {
      width: 38,
      height: 38,
      borderRadius: 10,
      backgroundColor: `${colors.accent}20`,
      alignItems: "center",
      justifyContent: "center",
    },
    goalName: {
      fontSize: 15,
      fontWeight: "600" as const,
      color: colors.foreground,
      fontFamily: "Inter_600SemiBold",
      flex: 1,
    },
    progressBar: {
      height: 6,
      backgroundColor: colors.muted,
      borderRadius: 3,
      overflow: "hidden",
    },
    progressFill: {
      height: 6,
      backgroundColor: colors.accent,
      borderRadius: 3,
    },
    progressLabel: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginTop: 6,
    },
    winItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    winIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: "#FEF3C7",
      alignItems: "center",
      justifyContent: "center",
    },
    winText: {
      fontSize: 14,
      color: colors.foreground,
      fontFamily: "Inter_500Medium",
      flex: 1,
    },
    winDate: {
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
      gap: 8,
    },
    emptyText: {
      fontSize: 14,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
    },
    loadingBox: {
      paddingVertical: 40,
      alignItems: "center",
    },
    bottomSpace: { height: Platform.OS === "web" ? 84 : 30 },
  });

  if (isLoading) {
    return (
      <View style={[s.container, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Goals & Milestones</Text>
        <Text style={s.headerSub}>Track your progress</Text>
      </View>

      <ScrollView style={s.scroll}>
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statValue}>{totalTokens}</Text>
            <Text style={s.statLabel}>Total Tokens Earned</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statValue}>{logs.length}</Text>
            <Text style={s.statLabel}>Wins Logged</Text>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionLabel}>Active Goals</Text>
          {tokens.length === 0 ? (
            <View style={s.emptyBox}>
              <Feather name="target" size={28} color={colors.mutedForeground} />
              <Text style={s.emptyText}>No goals set yet</Text>
              <Text style={[s.emptyText, { fontSize: 12 }]}>
                Your clinician will add goals here
              </Text>
            </View>
          ) : (
            tokens.map((token: any) => {
              const current = Number(token.balance ?? token.tokens ?? 0);
              const goal = Number(token.goalAmount ?? token.goal_amount ?? 10);
              const pct = Math.min(1, goal > 0 ? current / goal : 0);
              return (
                <View key={token.id} style={s.goalCard}>
                  <View style={s.goalHeader}>
                    <View style={s.goalIcon}>
                      <Feather name="star" size={18} color={colors.accent} />
                    </View>
                    <Text style={s.goalName}>
                      {token.goalName ?? token.goal_name ?? "Goal"}
                    </Text>
                    <Text style={[s.progressLabel, { marginTop: 0 }]}>
                      {current}/{goal}
                    </Text>
                  </View>
                  <View style={s.progressBar}>
                    <View style={[s.progressFill, { width: `${pct * 100}%` }]} />
                  </View>
                  <Text style={s.progressLabel}>
                    {Math.round(pct * 100)}% complete
                  </Text>
                </View>
              );
            })
          )}
        </View>

        <View style={s.section}>
          <Text style={s.sectionLabel}>Recent Wins</Text>
          {logs.length === 0 ? (
            <View style={s.emptyBox}>
              <Feather name="award" size={28} color={colors.mutedForeground} />
              <Text style={s.emptyText}>No wins logged yet</Text>
            </View>
          ) : (
            <View style={{ backgroundColor: colors.card, borderRadius: colors.radius, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16 }}>
              {logs.slice(0, 10).map((log: any) => (
                <View key={log.id} style={s.winItem}>
                  <View style={s.winIcon}>
                    <Feather name="star" size={16} color="#D97706" />
                  </View>
                  <Text style={s.winText}>
                    {log.description ?? log.winDescription ?? log.win_description ?? "Win logged"}
                  </Text>
                  <Text style={s.winDate}>
                    {log.createdAt
                      ? new Date(log.createdAt).toLocaleDateString()
                      : ""}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={s.bottomSpace} />
      </ScrollView>
    </View>
  );
}
