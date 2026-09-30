import React, { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";

type Child = { id: string; child_name?: string; family_id?: string | null; diagnosis?: string | null; status?: string | null };
type Family = { id: string; family_name?: string; parent_name?: string; first_name?: string; last_name?: string };
type Activity = { id: string; child_id?: string; behavior_type?: string; created_date?: string };
type Message = { id: string; is_read?: boolean };
type Overview = { children: Child[]; families: Family[]; logs: Activity[]; messages: Message[] };

const getOverview = async (): Promise<Overview> => {
  // /clinician-data is the actual authenticated aggregate route in entities.ts.
  const result = await apiFetch("/clinician-data");
  if (!Array.isArray(result?.children) || !Array.isArray(result?.families) || !Array.isArray(result?.logs) || !Array.isArray(result?.messages)) {
    throw new Error("The clinical overview response was incomplete.");
  }
  return result;
};
const dateLabel = (value?: string) => value && !Number.isNaN(Date.parse(value))
  ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" })
  : "Recent";

export default function ClinicianWorkspace() {
  const colors = useColors();
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  // The current mobile auth context does not yet expose role. Fail closed.
  const clinician = (user as typeof user & { role?: string; app_role?: string; display_name?: string })?.role === "clinician"
    || (user as typeof user & { app_role?: string })?.app_role === "clinician";
  const overview = useQuery({
    queryKey: ["clinician-overview", user?.id],
    queryFn: getOverview,
    enabled: !!user?.id && clinician,
    staleTime: 30000,
  });

  if (isLoading) return <View style={[styles.center, { backgroundColor: colors.background }]}><View style={[styles.skeleton, { backgroundColor: colors.muted }]} /><View style={[styles.skeleton, { backgroundColor: colors.muted }]} /></View>;
  if (!clinician) return (
    <View style={[styles.center, { backgroundColor: colors.background, padding: 30 }]}>
      <Feather name="lock" size={28} color={colors.primary} />
      <Text style={[styles.heading, { color: colors.text, marginTop: 18, textAlign: "center" }]}>Clinician access required</Text>
      <Text style={[styles.body, { color: colors.mutedForeground, textAlign: "center", marginTop: 10 }]}>This workspace is only available with a clinician session. Your current mobile sign-in is for clients.</Text>
      <Pressable testID="clinician-sign-out" onPress={() => void logout()} style={[styles.button, { backgroundColor: colors.primary, marginTop: 24 }]}><Text style={{ color: colors.primaryForeground, fontWeight: "700" }}>Sign out</Text></Pressable>
    </View>
  );

  const data = overview.data;
  const children = data?.children ?? [];
  const families = data?.families ?? [];
  const filtered = children.filter(child => {
    const family = families.find(item => item.id === child.family_id);
    return `${child.child_name ?? ""} ${family?.family_name ?? ""}`.toLowerCase().includes(search.toLowerCase().trim());
  });
  const recent = [...(data?.logs ?? [])].sort((a, b) => (Date.parse(b.created_date ?? "") || 0) - (Date.parse(a.created_date ?? "") || 0)).slice(0, 3);
  const unread = data?.messages.filter(message => !message.is_read).length ?? 0;
  const name = user?.first_name;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 36 }]}
      refreshControl={<RefreshControl refreshing={overview.isRefetching} onRefresh={() => void overview.refetch()} tintColor={colors.primary} />}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.topline}>
        <View style={styles.brand}><View style={[styles.brandMark, { backgroundColor: colors.primary }]}><Feather name="activity" size={17} color={colors.primaryForeground} /></View><Text style={[styles.brandText, { color: colors.primary }]}>NEUROPATHWAYS</Text></View>
        <Pressable testID="clinician-logout" accessibilityLabel="Sign out" onPress={() => void logout()} style={[styles.iconButton, { borderColor: colors.border }]}><Feather name="log-out" size={18} color={colors.mutedForeground} /></Pressable>
      </View>
      <Text style={[styles.kicker, { color: colors.mutedForeground }]}>CLINICIAN WORKSPACE</Text>
      <Text style={[styles.title, { color: colors.text }]}>{name ? `Good to see you, ${name}.` : "Your care workspace."}</Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>The people and plans in your care, all in one place.</Text>

      {overview.isPending ? (
        <View style={styles.loading}>{[0, 1, 2].map(i => <View key={i} style={[styles.skeleton, { backgroundColor: colors.muted }]} />)}</View>
      ) : overview.isError ? (
        <View style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.destructive }]}>
          <Feather name="alert-circle" size={22} color={colors.destructive} />
          <Text style={[styles.body, { color: colors.text, marginTop: 10 }]}>Couldn’t load the clinical workspace.</Text>
          <Text selectable style={[styles.small, { color: colors.destructive, marginTop: 5 }]}>{overview.error instanceof Error ? overview.error.message : "Unknown error"}</Text>
          <Pressable testID="clinician-retry" onPress={() => void overview.refetch()} style={[styles.button, { backgroundColor: colors.primary, marginTop: 16 }]}><Text style={{ color: colors.primaryForeground, fontWeight: "700" }}>Try again</Text></Pressable>
        </View>
      ) : (
        <>
          <View style={[styles.feature, { backgroundColor: colors.primary }]}>
            <View style={styles.featureTop}><Feather name="users" size={21} color={colors.primaryForeground} /><Text style={[styles.featureLabel, { color: colors.primaryForeground }]}>YOUR CASELOAD</Text></View>
            <Text style={[styles.featureNumber, { color: colors.primaryForeground }]}>{children.length}</Text>
            <Text style={[styles.featureCaption, { color: colors.primaryForeground }]}>{children.length === 1 ? "client" : "clients"} across {families.length} {families.length === 1 ? "family" : "families"}</Text>
            <View style={[styles.featureDivider, { backgroundColor: colors.primaryForeground }]} />
            <View style={styles.featureFooter}><Text style={{ color: colors.primaryForeground, fontSize: 13 }}>Recorded behaviors  {data?.logs.length ?? 0}</Text><Text style={{ color: colors.primaryForeground, fontSize: 13 }}>Unread messages  {unread}</Text></View>
          </View>

          <View style={styles.sectionHeader}><Text style={[styles.sectionTitle, { color: colors.text }]}>Families & clients</Text><Text style={[styles.sectionCount, { color: colors.primary }]}>{children.length} TOTAL</Text></View>
          <Pressable testID="clinician-add-client" onPress={() => router.push("/clinician-create-client" as any)} style={[styles.button, { backgroundColor: colors.primary, marginBottom: 14 }]}>
            <Text style={{ color: colors.primaryForeground, fontWeight: "700" }}>Add a client</Text>
          </Pressable>
          <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="search" size={18} color={colors.mutedForeground} />
            <TextInput testID="clinician-search" value={search} onChangeText={setSearch} placeholder="Find a client or family" placeholderTextColor={colors.mutedForeground} style={[styles.searchInput, { color: colors.text }]} />
            {!!search && <Pressable accessibilityLabel="Clear search" onPress={() => setSearch("")}><Feather name="x" size={18} color={colors.mutedForeground} /></Pressable>}
          </View>
          {filtered.length === 0 ? (
            <View style={[styles.empty, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Feather name={search ? "search" : "users"} size={25} color={colors.primary} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>{search ? "No matching clients" : "No clients in your caseload"}</Text>
              <Text style={[styles.small, { color: colors.mutedForeground, textAlign: "center" }]}>{search ? "Try another name or family." : "Clients assigned to your account will appear here."}</Text>
            </View>
          ) : filtered.map(child => {
            const family = families.find(item => item.id === child.family_id);
            return (
              <Pressable key={child.id} testID={`clinician-client-${child.id}`} onPress={() => router.push({ pathname: "/clinician-client", params: { childId: child.id } })} style={[styles.client, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.avatar, { backgroundColor: colors.muted }]}><Text style={[styles.initials, { color: colors.primary }]}>{(child.child_name ?? "C").slice(0, 1).toUpperCase()}</Text></View>
                <View style={styles.clientText}><Text numberOfLines={1} style={[styles.clientName, { color: colors.text }]}>{child.child_name || "Unnamed client"}</Text><Text numberOfLines={1} style={[styles.small, { color: colors.mutedForeground, marginTop: 3 }]}>{family?.family_name || family?.parent_name || "Family not assigned"}{child.diagnosis ? ` · ${child.diagnosis}` : ""}</Text></View>
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              </Pressable>
            );
          })}
          <View style={styles.sectionHeader}><Text style={[styles.sectionTitle, { color: colors.text }]}>Recent behavior</Text><Text style={[styles.sectionCount, { color: colors.mutedForeground }]}>LATEST 3</Text></View>
          {recent.length ? recent.map(log => (
            <View key={log.id} style={[styles.activity, { borderBottomColor: colors.border }]}>
              <View style={[styles.activityDot, { backgroundColor: colors.accent }]} />
              <View style={{ flex: 1 }}><Text style={[styles.clientName, { color: colors.text }]}>{children.find(c => c.id === log.child_id)?.child_name || "Client"}</Text><Text style={[styles.small, { color: colors.mutedForeground }]}>{log.behavior_type || "Behavior recorded"}</Text></View>
              <Text style={[styles.small, { color: colors.mutedForeground }]}>{dateLabel(log.created_date)}</Text>
            </View>
          )) : <Text style={[styles.small, { color: colors.mutedForeground, marginTop: 8 }]}>No behavior has been recorded yet.</Text>}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { paddingHorizontal: 22 },
  topline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 36 },
  brand: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandMark: { height: 31, width: 31, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  brandText: { fontSize: 11, fontWeight: "800", letterSpacing: 1.7 },
  iconButton: { width: 38, height: 38, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  kicker: { fontSize: 10, fontWeight: "800", letterSpacing: 2.2, marginBottom: 10 },
  title: { fontSize: 29, lineHeight: 34, fontWeight: "700", letterSpacing: -1.1, marginBottom: 9 },
  heading: { fontSize: 24, fontWeight: "700" },
  body: { fontSize: 14, lineHeight: 21 },
  small: { fontSize: 12, lineHeight: 18 },
  loading: { marginTop: 30, gap: 12 },
  skeleton: { width: "100%", height: 90, borderRadius: 18, marginBottom: 10, opacity: 0.6 },
  notice: { marginTop: 27, borderRadius: 18, borderWidth: 1, padding: 20 },
  button: { minHeight: 45, borderRadius: 12, paddingHorizontal: 22, alignItems: "center", justifyContent: "center" },
  feature: { borderRadius: 22, marginTop: 29, padding: 22 },
  featureTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  featureLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.7, opacity: 0.85 },
  featureNumber: { fontSize: 54, fontWeight: "700", letterSpacing: -2, marginTop: 15 },
  featureCaption: { fontSize: 13, opacity: 0.85, marginTop: -4 },
  featureDivider: { height: 1, opacity: 0.25, marginVertical: 20 },
  featureFooter: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: 10 },
  sectionHeader: { marginTop: 35, marginBottom: 15, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  sectionTitle: { fontSize: 19, fontWeight: "700", letterSpacing: -0.4 },
  sectionCount: { fontSize: 10, fontWeight: "800", letterSpacing: 1.1 },
  searchBox: { height: 48, flexDirection: "row", alignItems: "center", gap: 11, borderWidth: 1, borderRadius: 13, paddingHorizontal: 15, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 8 },
  client: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 15, padding: 13, marginBottom: 9, gap: 12 },
  avatar: { height: 43, width: 43, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  initials: { fontSize: 19, fontWeight: "700" },
  clientText: { flex: 1 },
  clientName: { fontSize: 14, fontWeight: "700" },
  empty: { borderWidth: 1, borderStyle: "dashed", padding: 27, borderRadius: 17, alignItems: "center", gap: 9 },
  emptyTitle: { fontSize: 15, fontWeight: "700" },
  activity: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, borderBottomWidth: 1 },
  activityDot: { width: 8, height: 8, borderRadius: 4 },
});