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

function getDate(value: any) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : "Date unavailable";
}

export default function WinsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [description, setDescription] = useState("");
  const [success, setSuccess] = useState(false);
  const childId = user?.id;
  const queryKey = ["win-logs", childId];

  const { data: wins = [], isLoading, error } = useQuery({
    queryKey,
    queryFn: () => entities.WinLog.filter({ childId }),
    enabled: !!childId,
  });

  const createWin = useMutation({
    mutationFn: () => entities.WinLog.create({ description: description.trim(), winType: "personal" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      setDescription("");
      setSuccess(true);
    },
    onError: (err: any) => Alert.alert("Could not save win", err?.message || "Please try again."),
  });

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0), paddingHorizontal: 20, paddingBottom: 16, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
    title: { fontSize: 22, fontWeight: "700" as const, color: colors.foreground, fontFamily: "Inter_700Bold" },
    subtitle: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 3 },
    section: { paddingHorizontal: 20, marginTop: 22 },
    sectionTitle: { fontSize: 12, fontWeight: "600" as const, color: colors.mutedForeground, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 12 },
    input: { minHeight: 84, textAlignVertical: "top", padding: 13, borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius, backgroundColor: colors.card, color: colors.foreground, fontFamily: "Inter_400Regular", fontSize: 14 },
    saveButton: { marginTop: 14, paddingVertical: 14, borderRadius: colors.radius, backgroundColor: colors.primary, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 },
    saveText: { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold", fontSize: 15 },
    card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius, padding: 15, marginBottom: 10, flexDirection: "row", alignItems: "flex-start", gap: 12 },
    iconBox: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" },
    description: { flex: 1, color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: 14, lineHeight: 20 },
    date: { color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 5 },
    message: { color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center", paddingVertical: 24 },
    success: { marginTop: 12, padding: 12, borderRadius: colors.radius, backgroundColor: colors.muted, flexDirection: "row", alignItems: "center", gap: 8 },
    bottom: { height: insets.bottom + (Platform.OS === "web" ? 34 : 20) },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Win Log</Text>
        <Text style={s.subtitle}>Record a moment, effort, or step forward worth remembering.</Text>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={s.section}>
          <Text style={s.sectionTitle}>What went well?</Text>
          <TextInput
            testID="win-description"
            accessibilityLabel="Describe a win"
            style={s.input}
            placeholder="Write about your win…"
            placeholderTextColor={colors.mutedForeground}
            value={description}
            onChangeText={(value) => { setDescription(value); setSuccess(false); }}
            multiline
          />
          <Pressable
            testID="save-win"
            accessibilityRole="button"
            style={[s.saveButton, (!description.trim() || createWin.isPending) && { opacity: 0.55 }]}
            disabled={!description.trim() || createWin.isPending}
            onPress={() => createWin.mutate()}
          >
            {createWin.isPending ? <ActivityIndicator color={colors.primaryForeground} /> : <Feather name="star" size={18} color={colors.primaryForeground} />}
            <Text style={s.saveText}>{createWin.isPending ? "Saving…" : "Save this win"}</Text>
          </Pressable>
          {success && (
            <View style={s.success}>
              <Feather name="check-circle" size={17} color={colors.primary} />
              <Text style={{ color: colors.foreground, fontFamily: "Inter_500Medium" }}>Win added to your log.</Text>
            </View>
          )}
        </View>
        <View style={s.section}>
          <Text style={s.sectionTitle}>Your wins</Text>
          {isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : error ? (
            <Text style={s.message}>Wins could not be loaded. Please try again later.</Text>
          ) : wins.length === 0 ? (
            <Text style={s.message}>No wins recorded yet. Your progress starts with one moment.</Text>
          ) : (
            [...wins].sort((a: any, b: any) =>
              new Date(b.createdDate ?? b.created_date ?? b.createdAt ?? 0).getTime() -
              new Date(a.createdDate ?? a.created_date ?? a.createdAt ?? 0).getTime()
            ).map((item: any) => (
              <View key={item.id} style={s.card}>
                <View style={s.iconBox}><Feather name="star" size={17} color={colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.description}>{item.description || item.winType || item.win_type || "Win logged"}</Text>
                  <Text style={s.date}>{getDate(item.createdDate ?? item.created_date ?? item.createdAt)}</Text>
                </View>
              </View>
            ))
          )}
        </View>
        <View style={s.bottom} />
      </ScrollView>
    </View>
  );
}