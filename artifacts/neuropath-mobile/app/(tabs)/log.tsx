import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { entities } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

const BEHAVIORS = [
  "Aggression",
  "Self-injury",
  "Elopement",
  "Non-compliance",
  "Tantrum",
  "Property destruction",
  "Verbal outburst",
  "Anxiety",
  "Repetitive behavior",
  "Other",
];

const INTENSITIES = [
  { label: "Low", value: "low", color: "#10B981", bg: "#D1FAE5" },
  { label: "Moderate", value: "moderate", color: "#F59E0B", bg: "#FEF3C7" },
  { label: "High", value: "high", color: "#EF4444", bg: "#FEE2E2" },
];

export default function LogScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [selectedBehavior, setSelectedBehavior] = useState<string>("");
  const [intensity, setIntensity] = useState<string>("moderate");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!selectedBehavior) {
      Alert.alert("Select Behavior", "Please choose a behavior type to log.");
      return;
    }
    setSubmitting(true);
    try {
      await entities.BehaviorLog.create({
        childId: user?.id,
        behaviorType: selectedBehavior,
        intensity,
        notes: notes.trim() || null,
        loggedAt: new Date().toISOString(),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["behavior-logs"] });
      setSuccess(true);
      setSelectedBehavior("");
      setIntensity("moderate");
      setNotes("");
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: any) {
      Alert.alert("Error", "Could not save the log. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0),
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
    behaviorGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    behaviorChip: {
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 24,
      backgroundColor: colors.card,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    behaviorChipSelected: {
      borderColor: colors.primary,
      backgroundColor: `${colors.primary}12`,
    },
    behaviorChipText: {
      fontSize: 14,
      color: colors.foreground,
      fontFamily: "Inter_500Medium",
    },
    behaviorChipTextSelected: {
      color: colors.primary,
      fontFamily: "Inter_600SemiBold",
    },
    intensityRow: { flexDirection: "row", gap: 10 },
    intensityCard: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: colors.radius,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: "center",
    },
    intensityLabel: {
      fontSize: 14,
      fontWeight: "600" as const,
      fontFamily: "Inter_600SemiBold",
    },
    notesInput: {
      backgroundColor: colors.card,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: colors.radius,
      padding: 14,
      fontSize: 15,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
      minHeight: 90,
      textAlignVertical: "top",
    },
    submitBtn: {
      margin: 20,
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      paddingVertical: 16,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
      gap: 10,
    },
    submitBtnDisabled: { opacity: 0.6 },
    submitBtnText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "600" as const,
      fontFamily: "Inter_600SemiBold",
    },
    successBanner: {
      marginHorizontal: 20,
      marginTop: 12,
      backgroundColor: "#D1FAE5",
      borderRadius: colors.radius,
      padding: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    successText: {
      color: "#065F46",
      fontSize: 14,
      fontFamily: "Inter_500Medium",
    },
    bottomSpace: { height: Platform.OS === "web" ? 84 : 90 },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Log Behavior</Text>
        <Text style={s.headerSub}>Record a behavior observation</Text>
      </View>

      <ScrollView style={s.scroll} keyboardShouldPersistTaps="handled">
        {success && (
          <View style={s.successBanner}>
            <Feather name="check-circle" size={18} color="#065F46" />
            <Text style={s.successText}>Behavior logged successfully</Text>
          </View>
        )}

        <View style={s.section}>
          <Text style={s.sectionLabel}>Behavior Type</Text>
          <View style={s.behaviorGrid}>
            {BEHAVIORS.map((b) => (
              <Pressable
                key={b}
                style={[
                  s.behaviorChip,
                  selectedBehavior === b && s.behaviorChipSelected,
                ]}
                onPress={() => {
                  setSelectedBehavior(b);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <Text
                  style={[
                    s.behaviorChipText,
                    selectedBehavior === b && s.behaviorChipTextSelected,
                  ]}
                >
                  {b}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionLabel}>Intensity</Text>
          <View style={s.intensityRow}>
            {INTENSITIES.map((item) => (
              <Pressable
                key={item.value}
                style={[
                  s.intensityCard,
                  intensity === item.value && {
                    borderColor: item.color,
                    backgroundColor: item.bg,
                  },
                ]}
                onPress={() => {
                  setIntensity(item.value);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <Text
                  style={[
                    s.intensityLabel,
                    { color: intensity === item.value ? item.color : colors.mutedForeground },
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionLabel}>Notes (optional)</Text>
          <TextInput
            style={s.notesInput}
            placeholder="Add context, antecedents, or observations..."
            placeholderTextColor={colors.mutedForeground}
            value={notes}
            onChangeText={setNotes}
            multiline
          />
        </View>

        <Pressable
          style={[s.submitBtn, submitting && s.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          <Feather name="check" size={20} color="#fff" />
          <Text style={s.submitBtnText}>
            {submitting ? "Saving..." : "Save Log"}
          </Text>
        </Pressable>

        <View style={s.bottomSpace} />
      </ScrollView>
    </View>
  );
}
