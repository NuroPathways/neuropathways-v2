import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { entities } from "@/lib/api";

const MOODS = ["great", "good", "okay", "rough", "bad"] as const;

function getDate(value: any) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString()
    : "Date unavailable";
}

export default function CheckInScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [mood, setMood] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [success, setSuccess] = useState(false);
  const childId = user?.id;
  const queryKey = ["daily-check-ins", childId];

  const { data: checkIns = [], isLoading, error } = useQuery({
    queryKey,
    queryFn: () => entities.DailyCheckIn.filter({ childId }),
    enabled: !!childId,
  });

  const createCheckIn = useMutation({
    mutationFn: () =>
      entities.DailyCheckIn.create({
        mood,
        notes: notes.trim() || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      setMood(null);
      setNotes("");
      setSuccess(true);
    },
    onError: (err: any) => Alert.alert("Could not save check-in", err?.message || "Please try again."),
  });

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
    title: { fontSize: 22, fontWeight: "700" as const, color: colors.foreground, fontFamily: "Inter_700Bold" },
    subtitle: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 3 },
    section: { paddingHorizontal: 20, marginTop: 22 },
    sectionTitle: { fontSize: 12, fontWeight: "600" as const, color: colors.mutedForeground, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 12 },
    moodRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    moodButton: { paddingVertical: 11, paddingHorizontal: 15, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    moodButtonSelected: { borderColor: colors.primary, backgroundColor: colors.muted },
    moodText: { color: colors.foreground, fontSize: 14, fontFamily: "Inter_500Medium", textTransform: "capitalize" },
    input: { minHeight: 86, textAlignVertical: "top", padding: 13, borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius, backgroundColor: colors.card, color: colors.foreground, fontFamily: "Inter_400Regular", fontSize: 14 },
    saveButton: { marginTop: 16, paddingVertical: 14, borderRadius: colors.radius, backgroundColor: colors.primary, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 },
    saveText: { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold", fontSize: 15 },
    card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius, padding: 15, marginBottom: 10 },
    row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
    cardMood: { color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 15, textTransform: "capitalize" },
    date: { color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12 },
    notes: { color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14, marginTop: 8, lineHeight: 20 },
    message: { color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center", paddingVertical: 24 },
    success: { marginTop: 12, padding: 12, borderRadius: colors.radius, backgroundColor: colors.muted, flexDirection: "row", alignItems: "center", gap: 8 },
    bottom: { height: insets.bottom + (Platform.OS === "web" ? 34 : 20) },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Daily Check-In</Text>
        <Text style={s.subtitle}>Take a moment to record how you are feeling.</Text>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={s.section}>
          <Text style={s.sectionTitle}>How are you feeling today?</Text>
          <View style={s.moodRow}>
            {MOODS.map((option) => (
              <Pressable
                key={option}
                testID={`mood-${option}`}
                accessibilityRole="button"
                accessibilityState={{ selected: mood === option }}
                style={[s.moodButton, mood === option && s.moodButtonSelected]}
                onPress={() => { setMood(option); setSuccess(false); }}
              >
                <Text style={s.moodText}>{option}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={[s.sectionTitle, { marginTop: 20 }]}>Notes (optional)</Text>
          <TextInput
            accessibilityLabel="Optional check-in notes"
            style={s.input}
            placeholder="Anything you would like to remember?"
            placeholderTextColor={colors.mutedForeground}
            value={notes}
            onChangeText={(value) => { setNotes(value); setSuccess(false); }}
            multiline
          />
          <Pressable
            testID="save-check-in"
            accessibilityRole="button"
            style={[s.saveButton, (!mood || createCheckIn.isPending) && { opacity: 0.55 }]}
            disabled={!mood || createCheckIn.isPending}
            onPress={() => createCheckIn.mutate()}
          >
            {createCheckIn.isPending ? <ActivityIndicator color={colors.primaryForeground} /> : <Feather name="check" size={18} color={colors.primaryForeground} />}
            <Text style={s.saveText}>{createCheckIn.isPending ? "Saving…" : "Save check-in"}</Text>
          </Pressable>
          {success && (
            <View style={s.success}>
              <Feather name="check-circle" size={17} color={colors.primary} />
              <Text style={{ color: colors.foreground, fontFamily: "Inter_500Medium" }}>Check-in saved.</Text>
            </View>
          )}
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Recent check-ins</Text>
          {isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : error ? (
            <Text style={s.message}>Check-ins could not be loaded. Please try again later.</Text>
          ) : checkIns.length === 0 ? (
            <Text style={s.message}>No check-ins recorded yet.</Text>
          ) : (
            [...checkIns].sort((a: any, b: any) =>
              new Date(b.createdDate ?? b.created_date ?? b.createdAt ?? 0).getTime() -
              new Date(a.createdDate ?? a.created_date ?? a.createdAt ?? 0).getTime()
            ).map((item: any) => (
              <View key={item.id} style={s.card}>
                <View style={s.row}>
                  <Text style={s.cardMood}>{item.mood || "Mood not recorded"}</Text>
                  <Text style={s.date}>{getDate(item.createdDate ?? item.created_date ?? item.createdAt)}</Text>
                </View>
                {!!item.notes && <Text style={s.notes}>{item.notes}</Text>}
              </View>
            ))
          )}
        </View>
        <View style={s.bottom} />
      </ScrollView>
    </View>
  );
}