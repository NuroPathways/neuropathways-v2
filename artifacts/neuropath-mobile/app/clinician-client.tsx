import React, { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";
import DocumentLibrary from "@/components/DocumentLibrary";

type Child = { id: string; child_name?: string; age?: number | null; diagnosis?: string | null; triggers?: string | null; notes?: string | null; parent_id?: string | null; family_id?: string | null };
type Family = { id: string; family_name?: string; parent_name?: string };
type BehaviorPlan = { id: string; child_id: string; behavior_name?: string; behavior_description?: string; common_triggers?: string; strategy_steps?: string; created_date?: string };
type InterventionPlan = { id: string; child_id: string; title?: string; behavior_category?: string; description?: string; immediate_steps?: string; prevention_tips?: string; created_date?: string };
type Log = { id: string; behavior_type?: string; intensity?: string; notes?: string; created_date?: string };
type Document = { id: string; title?: string; file_name?: string; category?: string; created_date?: string };
type Message = { id: string; content?: string; sender_role?: string; from_user_id?: string; created_date?: string };
type Detail = { child: Child; family?: Family; behaviors: BehaviorPlan[]; interventions: InterventionPlan[]; logs: Log[]; documents: Document[]; messages: Message[] };
type Tab = "Plans" | "Logs" | "Documents" | "Messages";
type PlanKind = "behavior" | "intervention";

const list = async <T,>(path: string, childId: string): Promise<T[]> => {
  const result = await apiFetch(`${path}?child_id=${encodeURIComponent(childId)}`);
  if (!Array.isArray(result)) throw new Error(`Invalid response from ${path}`);
  return result;
};
async function loadDetail(childId: string): Promise<Detail> {
  const [child, behaviors, interventions, logs, documents, messages] = await Promise.all([
    apiFetch(`/children/${encodeURIComponent(childId)}`) as Promise<Child>,
    list<BehaviorPlan>("/behavior-plans", childId),
    list<InterventionPlan>("/intervention-plans", childId),
    list<Log>("/behavior-logs", childId),
    list<Document>("/documents", childId),
    list<Message>("/messages", childId),
  ]);
  if (!child || child.id !== childId) throw new Error("Client record not found.");
  // Lists are server-scoped to clinician/tenant; additionally constrain to the selected client.
  const families = child.family_id ? await apiFetch(`/families/${encodeURIComponent(child.family_id)}`) as Family : undefined;
  return {
    child, family: families,
    behaviors: behaviors.filter(item => item.child_id === childId),
    interventions: interventions.filter(item => item.child_id === childId),
    logs, documents, messages,
  };
}
const formattedDate = (value?: string) => value && !Number.isNaN(Date.parse(value))
  ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
  : "";
const errorText = (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Please try again.";

export default function ClinicianClient() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ childId?: string }>();
  const childId = typeof params.childId === "string" ? params.childId : "";
  const { user, isLoading } = useAuth();
  const clinician = (user as typeof user & { role?: string; app_role?: string })?.role === "clinician"
    || (user as typeof user & { app_role?: string })?.app_role === "clinician";
  const cache = useQueryClient();
  const [tab, setTab] = useState<Tab>("Plans");
  const [editor, setEditor] = useState<{ kind: PlanKind; id?: string } | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [detail, setDetail] = useState("");
  const [category, setCategory] = useState("");
  const [draft, setDraft] = useState("");
  const [actionError, setActionError] = useState("");
  const query = useQuery({ queryKey: ["clinician-client", childId, user?.id], queryFn: () => loadDetail(childId), enabled: !!childId && clinician, staleTime: 20000 });
  const refresh = () => void query.refetch();
  const planMutation = useMutation({
    mutationFn: async () => {
      if (!editor) throw new Error("Choose a plan type.");
      const isBehavior = editor.kind === "behavior";
      const route = isBehavior ? "/behavior-plans" : "/intervention-plans";
      const body = isBehavior
        ? { child_id: childId, behavior_name: title.trim(), behavior_description: description.trim(), strategy_steps: detail.trim(), common_triggers: category.trim() }
        : { child_id: childId, title: title.trim(), description: description.trim(), immediate_steps: detail.trim(), behavior_category: category.trim(), prevention_tips: "" };
      return apiFetch(editor.id ? `${route}/${encodeURIComponent(editor.id)}` : route, { method: editor.id ? "PATCH" : "POST", body: JSON.stringify(body) });
    },
    onSuccess: async () => {
      setEditor(null);
      setActionError("");
      await cache.invalidateQueries({ queryKey: ["clinician-client", childId, user?.id] });
    },
    onError: error => setActionError(errorText(error)),
  });
  const sendMutation = useMutation({
    mutationFn: (content: string) => apiFetch("/messages", {
      method: "POST",
      body: JSON.stringify({
        child_id: childId,
        from_user_id: user?.id,
        // A child-session recipient is the child id; otherwise use the linked parent.
        to_user_id: query.data?.child.parent_id || childId,
        sender_role: "clinician",
        content,
        is_read: false,
      }),
    }),
    onSuccess: async () => {
      setDraft("");
      setActionError("");
      await cache.invalidateQueries({ queryKey: ["clinician-client", childId, user?.id] });
    },
    onError: error => setActionError(errorText(error)),
  });
  const begin = (kind: PlanKind, plan?: BehaviorPlan | InterventionPlan) => {
    setEditor({ kind, id: plan?.id });
    setTitle(plan ? (kind === "behavior" ? (plan as BehaviorPlan).behavior_name : (plan as InterventionPlan).title) ?? "" : "");
    setDescription(plan ? (kind === "behavior" ? (plan as BehaviorPlan).behavior_description : (plan as InterventionPlan).description) ?? "" : "");
    setDetail(plan ? (kind === "behavior" ? (plan as BehaviorPlan).strategy_steps : (plan as InterventionPlan).immediate_steps) ?? "" : "");
    setCategory(plan ? (kind === "behavior" ? (plan as BehaviorPlan).common_triggers : (plan as InterventionPlan).behavior_category) ?? "" : "");
    setActionError("");
  };
  const field = (label: string, value: string, change: (value: string) => void, multiline = false, placeholder = "") => (
    <View style={styles.field} key={label}>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <TextInput value={value} onChangeText={change} multiline={multiline} placeholder={placeholder} placeholderTextColor={colors.mutedForeground}
        textAlignVertical={multiline ? "top" : "center"} style={[styles.input, multiline && styles.multiline, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]} />
    </View>
  );
  const card = (children: React.ReactNode) => <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>{children}</View>;
  const empty = (icon: React.ComponentProps<typeof Feather>["name"], titleText: string, copy: string) => card(<View style={styles.empty}><Feather name={icon} size={25} color={colors.primary} /><Text style={[styles.itemTitle, { color: colors.text, marginTop: 12 }]}>{titleText}</Text><Text style={[styles.body, { color: colors.mutedForeground, textAlign: "center", marginTop: 5 }]}>{copy}</Text></View>);

  if (isLoading) return <View style={[styles.center, { backgroundColor: colors.background }]}><View style={[styles.skeleton, { backgroundColor: colors.muted }]} /></View>;
  if (!clinician || !childId) return <View style={[styles.center, { backgroundColor: colors.background, padding: 25 }]}><Feather name="lock" size={28} color={colors.primary} /><Text style={[styles.body, { color: colors.text, textAlign: "center", marginVertical: 16 }]}>{!clinician ? "Clinician access required." : "Choose a client from the workspace."}</Text><Pressable onPress={() => router.replace("/clinician")}><Text style={{ color: colors.primary, fontWeight: "700" }}>Back to workspace</Text></Pressable></View>;

  const data = query.data;
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={[styles.page, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 45 }]}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={refresh} tintColor={colors.primary} />} keyboardShouldPersistTaps="handled">
      <Pressable testID="back-to-clinician" onPress={() => router.back()} style={styles.back}><Feather name="arrow-left" size={19} color={colors.primary} /><Text style={[styles.backText, { color: colors.primary }]}>Workspace</Text></Pressable>
      {query.isPending ? <View style={styles.loading}>{[0, 1, 2].map(i => <View key={i} style={[styles.skeleton, { backgroundColor: colors.muted }]} />)}</View>
        : query.isError ? card(<><Feather name="alert-circle" size={23} color={colors.destructive} /><Text style={[styles.itemTitle, { color: colors.text, marginTop: 12 }]}>Client details unavailable</Text><Text selectable style={[styles.body, { color: colors.destructive, marginTop: 8 }]}>{errorText(query.error)}</Text><Pressable onPress={refresh} style={[styles.action, { backgroundColor: colors.primary, marginTop: 17 }]}><Text style={{ color: colors.primaryForeground, fontWeight: "700" }}>Retry</Text></Pressable></>)
        : data && <>
          <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>CLIENT RECORD</Text>
          <Text style={[styles.title, { color: colors.text }]}>{data.child.child_name || "Unnamed client"}</Text>
          <Text style={[styles.body, { color: colors.mutedForeground, marginTop: 5 }]}>{data.family?.family_name || "Family not assigned"}{data.child.age != null ? `  ·  Age ${data.child.age}` : ""}</Text>
          {(data.child.diagnosis || data.child.triggers || data.child.notes) && card(<>
            <Text style={[styles.label, { color: colors.primary }]}>CARE CONTEXT</Text>
            {data.child.diagnosis && <Text style={[styles.body, { color: colors.text, marginTop: 9 }]}>Diagnosis  ·  {data.child.diagnosis}</Text>}
            {data.child.triggers && <Text style={[styles.body, { color: colors.text, marginTop: 9 }]}>Triggers  ·  {data.child.triggers}</Text>}
            {data.child.notes && <Text style={[styles.body, { color: colors.text, marginTop: 9 }]}>Notes  ·  {data.child.notes}</Text>}
          </>)}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={{ gap: 8 }}>
            {(["Plans", "Logs", "Documents", "Messages"] as Tab[]).map(item =>
              <Pressable key={item} testID={`client-tab-${item.toLowerCase()}`} onPress={() => { setTab(item); setEditor(null); setActionError(""); }} style={[styles.tab, { backgroundColor: tab === item ? colors.primary : colors.card, borderColor: tab === item ? colors.primary : colors.border }]}>
                <Text style={{ color: tab === item ? colors.primaryForeground : colors.mutedForeground, fontWeight: "700", fontSize: 12 }}>{item}</Text>
              </Pressable>)}
          </ScrollView>
          {!!actionError && <View style={[styles.error, { borderColor: colors.destructive }]}><Feather name="alert-circle" size={16} color={colors.destructive} /><Text selectable style={[styles.body, { color: colors.destructive, flex: 1 }]}>{actionError}</Text></View>}
          {tab === "Plans" && <>
            {editor ? card(<>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>{editor.id ? "Edit" : "New"} {editor.kind} plan</Text>
              <Text style={[styles.body, { color: colors.mutedForeground, marginTop: 5, marginBottom: 16 }]}>For {data.child.child_name}</Text>
              {field(editor.kind === "behavior" ? "BEHAVIOR NAME *" : "PLAN TITLE *", title, setTitle)}
              {field(editor.kind === "behavior" ? "COMMON TRIGGERS" : "BEHAVIOR CATEGORY *", category, setCategory)}
              {field("DESCRIPTION", description, setDescription, true)}
              {field(editor.kind === "behavior" ? "STRATEGY STEPS" : "IMMEDIATE STEPS", detail, setDetail, true)}
              <View style={styles.actions}>
                <Pressable testID="cancel-plan" onPress={() => { setEditor(null); setActionError(""); }} style={[styles.secondary, { borderColor: colors.border }]}><Text style={{ color: colors.text, fontWeight: "700" }}>Cancel</Text></Pressable>
                <Pressable testID="save-plan" disabled={planMutation.isPending || !title.trim() || (editor.kind === "intervention" && !category.trim())} onPress={() => planMutation.mutate()}
                  style={[styles.action, { backgroundColor: colors.primary, opacity: planMutation.isPending || !title.trim() || (editor.kind === "intervention" && !category.trim()) ? 0.45 : 1 }]}>
                  <Text style={{ color: colors.primaryForeground, fontWeight: "700" }}>{planMutation.isPending ? "Saving…" : "Save plan"}</Text>
                </Pressable>
              </View>
            </>) : <>
              <View style={styles.sectionRow}><Text style={[styles.sectionTitle, { color: colors.text }]}>Behavior plans</Text><Pressable testID="add-behavior-plan" onPress={() => begin("behavior")} style={[styles.add, { backgroundColor: colors.muted }]}><Feather name="plus" size={17} color={colors.primary} /><Text style={[styles.addText, { color: colors.primary }]}>New</Text></Pressable></View>
              {data.behaviors.length ? data.behaviors.map(plan => <Pressable key={plan.id} testID={`edit-behavior-${plan.id}`} onPress={() => begin("behavior", plan)}>{card(<><View style={styles.row}><Text style={[styles.itemTitle, { color: colors.text, flex: 1 }]}>{plan.behavior_name || "Untitled behavior"}</Text><Feather name="edit-2" size={15} color={colors.primary} /></View>{plan.behavior_description && <Text style={[styles.body, { color: colors.mutedForeground, marginTop: 9 }]} numberOfLines={3}>{plan.behavior_description}</Text>}{plan.strategy_steps && <Text style={[styles.body, { color: colors.text, marginTop: 10 }]} numberOfLines={3}>Strategy  ·  {plan.strategy_steps}</Text>}</>)}</Pressable>) : empty("clipboard", "No behavior plans yet", "Create a plan to document a strategy for this client.")}
              <View style={styles.sectionRow}><Text style={[styles.sectionTitle, { color: colors.text }]}>Intervention plans</Text><Pressable testID="add-intervention-plan" onPress={() => begin("intervention")} style={[styles.add, { backgroundColor: colors.muted }]}><Feather name="plus" size={17} color={colors.primary} /><Text style={[styles.addText, { color: colors.primary }]}>New</Text></Pressable></View>
              {data.interventions.length ? data.interventions.map(plan => <Pressable key={plan.id} testID={`edit-intervention-${plan.id}`} onPress={() => begin("intervention", plan)}>{card(<><View style={styles.row}><Text style={[styles.itemTitle, { color: colors.text, flex: 1 }]}>{plan.title || "Untitled intervention"}</Text><Feather name="edit-2" size={15} color={colors.primary} /></View>{plan.behavior_category && <Text style={[styles.label, { color: colors.primary, marginTop: 8 }]}>{plan.behavior_category.replace(/_/g, " ").toUpperCase()}</Text>}{plan.immediate_steps && <Text style={[styles.body, { color: colors.mutedForeground, marginTop: 10 }]} numberOfLines={3}>{plan.immediate_steps}</Text>}</>)}</Pressable>) : empty("shield", "No intervention plans yet", "Add immediate steps and support guidance for this client.")}
            </>}
          </>}
          {tab === "Logs" && <>
            <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 13 }]}>Behavior history</Text>
            {data.logs.length ? [...data.logs].sort((a, b) => (Date.parse(b.created_date ?? "") || 0) - (Date.parse(a.created_date ?? "") || 0)).map(log => <View key={log.id}>{card(<><View style={styles.row}><Text style={[styles.itemTitle, { color: colors.text, flex: 1 }]}>{log.behavior_type || "Behavior recorded"}</Text><Text style={[styles.date, { color: colors.mutedForeground }]}>{formattedDate(log.created_date)}</Text></View>{log.intensity && <Text style={[styles.label, { color: colors.primary, marginTop: 9 }]}>INTENSITY  ·  {log.intensity.toUpperCase()}</Text>}{log.notes && <Text style={[styles.body, { color: colors.mutedForeground, marginTop: 9 }]}>{log.notes}</Text>}</>)}</View>) : empty("activity", "No behavior logs yet", "Entries recorded for this client will appear here.")}
          </>}
          {tab === "Documents" && <>
            <DocumentLibrary key={childId} childId={childId} clinician />
          </>}
          {tab === "Messages" && <>
            <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 13 }]}>Conversation</Text>
            {data.messages.length ? [...data.messages].sort((a, b) => (Date.parse(a.created_date ?? "") || 0) - (Date.parse(b.created_date ?? "") || 0)).map(message =>
              <View key={message.id} style={[styles.message, { backgroundColor: message.sender_role === "clinician" ? colors.muted : colors.card, borderColor: colors.border }]}>
                <Text style={[styles.label, { color: colors.primary }]}>{message.sender_role === "clinician" ? "YOU" : "CLIENT"}  ·  {formattedDate(message.created_date)}</Text>
                <Text style={[styles.body, { color: colors.text, marginTop: 7 }]}>{message.content || "Empty message"}</Text>
              </View>) : empty("message-circle", "No messages yet", "Start a conversation with this client or family.")}
            <View style={[styles.compose, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <TextInput testID="clinician-message-input" value={draft} onChangeText={setDraft} placeholder="Write a message…" placeholderTextColor={colors.mutedForeground} multiline style={[styles.composeInput, { color: colors.text }]} />
              <Pressable testID="send-clinician-message" accessibilityLabel="Send message" disabled={!draft.trim() || sendMutation.isPending}
                onPress={() => { const text = draft.trim(); if (text) sendMutation.mutate(text); }}
                style={[styles.send, { backgroundColor: colors.primary, opacity: !draft.trim() || sendMutation.isPending ? 0.45 : 1 }]}>
                <Feather name="arrow-up" size={20} color={colors.primaryForeground} />
              </Pressable>
            </View>
          </>}
        </>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  page: { paddingHorizontal: 21 },
  back: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 29, alignSelf: "flex-start", paddingVertical: 6 },
  backText: { fontSize: 13, fontWeight: "700" },
  eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 2, marginBottom: 9 },
  title: { fontSize: 30, fontWeight: "700", letterSpacing: -0.9 },
  body: { fontSize: 14, lineHeight: 21 },
  label: { fontSize: 10, fontWeight: "800", letterSpacing: 1.1 },
  sectionTitle: { fontSize: 19, fontWeight: "700", letterSpacing: -0.4 },
  itemTitle: { fontSize: 15, fontWeight: "700", lineHeight: 21 },
  date: { fontSize: 11 },
  card: { borderWidth: 1, borderRadius: 17, padding: 17, marginTop: 10 },
  tabs: { marginTop: 27, marginBottom: 13, flexGrow: 0 },
  tab: { borderRadius: 30, borderWidth: 1, paddingHorizontal: 17, paddingVertical: 10 },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14, marginBottom: 3 },
  add: { flexDirection: "row", gap: 4, borderRadius: 10, alignItems: "center", paddingHorizontal: 12, paddingVertical: 8 },
  addText: { fontSize: 12, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  empty: { alignItems: "center", paddingVertical: 16 },
  field: { marginBottom: 16 },
  input: { minHeight: 47, borderWidth: 1, borderRadius: 11, paddingHorizontal: 13, paddingVertical: 10, fontSize: 14, marginTop: 7 },
  multiline: { minHeight: 94 },
  actions: { flexDirection: "row", gap: 10, marginTop: 3 },
  secondary: { flex: 1, borderWidth: 1, borderRadius: 11, minHeight: 45, alignItems: "center", justifyContent: "center" },
  action: { flex: 1, borderRadius: 11, minHeight: 45, alignItems: "center", justifyContent: "center", paddingHorizontal: 15 },
  error: { borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: "row", gap: 9, alignItems: "flex-start" },
  message: { borderWidth: 1, padding: 15, borderRadius: 15, marginBottom: 8 },
  compose: { marginTop: 18, flexDirection: "row", borderWidth: 1, borderRadius: 15, padding: 8, alignItems: "flex-end" },
  composeInput: { flex: 1, minHeight: 40, maxHeight: 120, paddingHorizontal: 8, paddingVertical: 8, fontSize: 14 },
  send: { width: 39, height: 39, borderRadius: 11, justifyContent: "center", alignItems: "center" },
  loading: { gap: 10 },
  skeleton: { height: 90, width: "100%", borderRadius: 15, opacity: 0.55, marginBottom: 10 },
});