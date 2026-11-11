import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { chatSupport } from "@/lib/api";

const QUICK_BEHAVIORS = [
  "Aggression",
  "Self-injury",
  "Elopement",
  "Tantrum",
  "Anxiety",
  "Non-compliance",
];

export default function HelpScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const childId = user?.id;

  const [selected, setSelected] = useState<string | null>(null);
  const [guidance, setGuidance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const getHelp = async (behavior: string) => {
    setSelected(behavior);
    setGuidance(null);
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      if (!childId) throw new Error("The signed-in client could not be verified.");
      const result = await chatSupport(
        childId,
        `I need help now with ${behavior}. What is one safe next step?`,
        [],
        "help_now",
      );
      setGuidance(result.answer);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setGuidance("Unable to load guidance right now. Please contact your clinician directly.");
    } finally {
      setLoading(false);
    }
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    heroBlock: {
      backgroundColor: colors.destructive,
      paddingTop: Platform.OS === "web" ? 67 : 0,
      paddingHorizontal: 20,
      paddingBottom: 24,
    },
    heroIcon: {
      width: 52,
      height: 52,
      borderRadius: 16,
      backgroundColor: "rgba(255,255,255,0.2)",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 14,
    },
    heroTitle: {
      color: "#FFFFFF",
      fontSize: 24,
      fontWeight: "700" as const,
      fontFamily: "Inter_700Bold",
      marginBottom: 6,
    },
    heroSub: {
      color: "rgba(255,255,255,0.8)",
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      lineHeight: 20,
    },
    scroll: { flex: 1 },
    section: { paddingHorizontal: 20, marginTop: 24 },
    label: {
      fontSize: 12,
      fontWeight: "600" as const,
      color: colors.mutedForeground,
      fontFamily: "Inter_600SemiBold",
      textTransform: "uppercase",
      letterSpacing: 0.7,
      marginBottom: 14,
    },
    behaviorGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    behaviorChip: {
      paddingVertical: 12,
      paddingHorizontal: 18,
      borderRadius: 24,
      backgroundColor: colors.card,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    behaviorChipSelected: {
      borderColor: colors.destructive,
      backgroundColor: `${colors.destructive}14`,
    },
    behaviorText: {
      fontSize: 14,
      color: colors.foreground,
      fontFamily: "Inter_500Medium",
    },
    behaviorTextSelected: { color: colors.destructive, fontFamily: "Inter_600SemiBold" },
    guidanceCard: {
      marginHorizontal: 20,
      marginTop: 20,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 18,
    },
    guidanceTitle: {
      fontSize: 15,
      fontWeight: "700" as const,
      color: colors.foreground,
      fontFamily: "Inter_700Bold",
      marginBottom: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    guidanceTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 12,
    },
    guidanceText: {
      fontSize: 15,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
      lineHeight: 22,
    },
    loadingBox: {
      marginHorizontal: 20,
      marginTop: 20,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 32,
      alignItems: "center",
      gap: 12,
    },
    loadingText: {
      color: colors.mutedForeground,
      fontSize: 14,
      fontFamily: "Inter_400Regular",
    },
    bottomSpace: { height: Platform.OS === "web" ? 84 : 30 },
  });

  return (
    <View style={s.container}>
      <View style={s.heroBlock}>
        <View style={s.heroIcon}>
          <Feather name="alert-circle" size={26} color="#FFFFFF" />
        </View>
        <Text style={s.heroTitle}>Help Right Now</Text>
        <Text style={s.heroSub}>
          Select what you're experiencing to see available guidance.
        </Text>
      </View>

      <ScrollView style={s.scroll}>
        <View style={s.section}>
          <Text style={s.label}>What's happening?</Text>
          <View style={s.behaviorGrid}>
            {QUICK_BEHAVIORS.map((b) => (
              <Pressable
                key={b}
                style={[s.behaviorChip, selected === b && s.behaviorChipSelected]}
                onPress={() => getHelp(b)}
              >
                <Text
                  style={[s.behaviorText, selected === b && s.behaviorTextSelected]}
                >
                  {b}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {loading && (
          <View style={s.loadingBox}>
            <ActivityIndicator color={colors.primary} />
            <Text style={s.loadingText}>Getting guidance...</Text>
          </View>
        )}

        {guidance && !loading && (
          <View style={s.guidanceCard}>
            <View style={s.guidanceTitleRow}>
              <Feather name="shield" size={18} color={colors.primary} />
              <Text style={[s.guidanceText, { fontFamily: "Inter_700Bold", fontSize: 15, color: colors.foreground }]}>
                Guidance for {selected}
              </Text>
            </View>
            <Text style={s.guidanceText}>{guidance}</Text>
          </View>
        )}

        <View style={s.bottomSpace} />
      </ScrollView>
    </View>
  );
}
