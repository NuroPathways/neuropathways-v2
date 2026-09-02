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

function intensityColor(i?: string) {
  if (i === "high") return "#EF4444";
  if (i === "moderate") return "#F59E0B";
  return "#10B981";
}

export default function ProgressScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const childId = user?.id;

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["behavior-logs", childId],
    queryFn: () => entities.BehaviorLog.filter({ childId }).catch(() => []),
    enabled: !!childId,
  });

  const { data: winLogs = [] } = useQuery({
    queryKey: ["win-logs", childId],
    queryFn: () => entities.WinLog.filter({ childId }).catch(() => []),
    enabled: !!childId,
  });

  const sorted = [...logs].sort(
    (a: any, b: any) =>
      new Date(b.createdDate ?? b.created_at ?? 0).getTime() -
      new Date(a.createdDate ?? a.created_at ?? 0).getTime()
  );

  const highCount = logs.filter((l: any) => l.intensity === "high").length;
  const modCount = logs.filter((l: any) => l.intensity === "moderate").length;
  const lowCount = logs.filter((l: any) => l.intensity === "low").length;

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
      flexDirection: "row" as const,
      gap: 12,
      marginHorizontal: 20,
      marginTop: 20,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      alignItems: "center" as const,
    },
    statValue: {
      fontSize: 28,
      fontWeight: "700" as const,
      fontFamily: "Inter_700Bold",
    },
    statLabel: {
      fontSize: 11,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginTop: 3,
      textAlign: "center" as const,
    },
    section: { paddingHorizontal: 20, marginTop: 24 },
    sectionLabel: {
      fontSize: 12,
      fontWeight: "600" as const,
      color: colors.mutedForeground,
      fontFamily: "Inter_600SemiBold",
      textTransform: "uppercase" as const,
      letterSpacing: 0.7,
      marginBottom: 12,
    },
    logItem: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
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
    logBehavior: {
      fontSize: 14,
      fontWeight: "500" as const,
      color: colors.foreground,
      fontFamily: "Inter_500Medium",
      flex: 1,
    },
    logDate: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
    },
    emptyBox: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: "dashed" as const,
      padding: 28,
      alignItems: "center" as const,
      gap: 8,
    },
    emptyText: {
      color: colors.mutedForeground,
      fontSize: 14,
      fontFamily: "Inter_400Regular",
    },
    loadingBox: {
      paddingVertical: 60,
      alignItems: "center" as const,
    },
    logsContainer: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 16,
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
        <Text style={s.headerTitle}>Progress Reports</Text>
        <Text style={s.headerSub}>Behavior trends over time</Text>
      </View>

      <ScrollView style={s.scroll}>
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={[s.statValue, { color: "#EF4444" }]}>{highCount}</Text>
            <Text style={s.statLabel}>High Intensity</Text>
          </View>
          <View style={s.statCard}>
            <Text style={[s.statValue, { color: "#F59E0B" }]}>{modCount}</Text>
            <Text style={s.statLabel}>Moderate</Text>
          </View>
          <View style={s.statCard}>
            <Text style={[s.statValue, { color: "#10B981" }]}>{lowCount}</Text>
            <Text style={s.statLabel}>Low</Text>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionLabel}>Behavior History</Text>
          {sorted.length === 0 ? (
            <View style={s.emptyBox}>
              <Feather name="bar-chart-2" size={28} color={colors.mutedForeground} />
              <Text style={s.emptyText}>No logs recorded yet</Text>
            </View>
          ) : (
            <View style={s.logsContainer}>
              {sorted.slice(0, 20).map((log: any) => (
                <View key={log.id} style={s.logItem}>
                  <View
                    style={[
                      s.logDot,
                      { backgroundColor: intensityColor(log.intensity) },
                    ]}
                  />
                  <Text style={s.logBehavior} numberOfLines={1}>
                    {log.behaviorType ?? log.behavior_type ?? "Behavior"}
                  </Text>
                  <Text style={s.logDate}>
                    {log.createdDate
                      ? new Date(log.createdDate).toLocaleDateString()
                      : ""}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={s.section}>
          <Text style={s.sectionLabel}>Recent Wins ({winLogs.length})</Text>
          {winLogs.length === 0 ? (
            <View style={s.emptyBox}>
              <Feather name="award" size={28} color={colors.mutedForeground} />
              <Text style={s.emptyText}>No wins logged yet</Text>
            </View>
          ) : (
            <View style={s.logsContainer}>
              {winLogs.slice(0, 10).map((log: any) => (
                <View key={log.id} style={s.logItem}>
                  <Feather name="star" size={14} color="#D97706" />
                  <Text style={s.logBehavior} numberOfLines={1}>
                    {log.description ?? log.win_description ?? "Win"}
                  </Text>
                  <Text style={s.logDate}>
                    {log.createdDate
                      ? new Date(log.createdDate).toLocaleDateString()
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
