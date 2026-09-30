import React from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { entities } from "@/lib/api";

function profileValue(child: any, camel: string, snake: string) {
  return child?.[camel] ?? child?.[snake] ?? null;
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ["child-profile", user?.id],
    queryFn: () => entities.Child.filter(),
    enabled: !!user?.id,
  });
  const child = rows.find((row: any) => row.id === user?.id) ?? rows[0];
  const name = profileValue(child, "childName", "child_name") ?? user?.child_name ?? "Profile";
  const details = [
    { label: "Age", value: profileValue(child, "age", "age") },
    { label: "Diagnosis", value: profileValue(child, "diagnosis", "diagnosis") },
    { label: "Gender", value: profileValue(child, "gender", "gender") },
    { label: "Triggers", value: profileValue(child, "triggers", "triggers") },
    { label: "Notes", value: profileValue(child, "notes", "notes") },
  ].filter((item) => item.value !== null && item.value !== undefined && String(item.value).trim() !== "");

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0), paddingHorizontal: 20, paddingBottom: 16, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
    title: { fontSize: 22, fontWeight: "700" as const, color: colors.foreground, fontFamily: "Inter_700Bold" },
    subtitle: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 3 },
    content: { padding: 20 },
    hero: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius, padding: 20, alignItems: "center", marginBottom: 22 },
    avatar: { width: 62, height: 62, borderRadius: 20, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginBottom: 12 },
    initial: { color: colors.primaryForeground, fontSize: 24, fontFamily: "Inter_700Bold" },
    name: { color: colors.foreground, fontSize: 19, fontFamily: "Inter_700Bold" },
    username: { color: colors.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 4 },
    sectionTitle: { fontSize: 12, fontWeight: "600" as const, color: colors.mutedForeground, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 10 },
    infoCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius, paddingHorizontal: 16 },
    infoRow: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
    label: { color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 4 },
    value: { color: colors.foreground, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
    familyCard: { marginTop: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius, padding: 16, flexDirection: "row", gap: 12 },
    message: { color: colors.mutedForeground, fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 24 },
    bottom: { height: insets.bottom + (Platform.OS === "web" ? 34 : 20) },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Profile</Text>
        <Text style={s.subtitle}>Your profile information</Text>
      </View>
      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.primary} /></View>
      ) : error ? (
        <Text style={s.message}>Profile information could not be loaded. Please try again later.</Text>
      ) : !child ? (
        <Text style={s.message}>No profile information is available.</Text>
      ) : (
        <ScrollView contentContainerStyle={s.content}>
          <View style={s.hero}>
            <View style={s.avatar}><Text style={s.initial}>{String(name).slice(0, 1).toUpperCase()}</Text></View>
            <Text style={s.name}>{name}</Text>
            {!!(profileValue(child, "username", "username") ?? user?.username) && (
              <Text style={s.username}>@{profileValue(child, "username", "username") ?? user?.username}</Text>
            )}
          </View>
          <Text style={s.sectionTitle}>About</Text>
          {details.length ? (
            <View style={s.infoCard}>
              {details.map((item, index) => (
                <View key={item.label} style={[s.infoRow, index === details.length - 1 && { borderBottomWidth: 0 }]}>
                  <Text style={s.label}>{item.label}</Text>
                  <Text style={s.value}>{String(item.value)}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={s.infoCard}><Text style={s.message}>No additional profile details are available.</Text></View>
          )}
          <View style={s.familyCard}>
            <Feather name="users" size={19} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[s.label, { color: colors.foreground, marginBottom: 4 }]}>Family information</Text>
              <Text style={s.value}>Family and caregiver details are not provided by the mobile profile service.</Text>
            </View>
          </View>
          <View style={s.bottom} />
        </ScrollView>
      )}
    </View>
  );
}