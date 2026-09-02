import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  Platform,
  ActivityIndicator,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { entities } from "@/lib/api";

export default function MessagesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const qc = useQueryClient();
  const childId = user?.id;

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const { data: msgs = [], isLoading } = useQuery({
    queryKey: ["messages", childId],
    queryFn: () => entities.Message.filter({ childId }).catch(() => []),
    enabled: !!childId,
    refetchInterval: 15000,
  });

  const sorted = [...msgs].sort(
    (a: any, b: any) =>
      new Date(b.createdAt ?? b.created_at ?? 0).getTime() -
      new Date(a.createdAt ?? a.created_at ?? 0).getTime()
  );

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await entities.Message.create({
        childId,
        content: text,
        senderRole: "client",
        sentAt: new Date().toISOString(),
      });
      qc.invalidateQueries({ queryKey: ["messages"] });
    } catch {}
    setSending(false);
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
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    headerAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: `${colors.primary}18`,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: "600" as const,
      color: colors.foreground,
      fontFamily: "Inter_600SemiBold",
    },
    headerSub: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
    },
    list: { flex: 1 },
    listContent: { padding: 16, gap: 10 },
    emptyContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 40,
      gap: 12,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: "600" as const,
      color: colors.foreground,
      fontFamily: "Inter_600SemiBold",
      textAlign: "center",
    },
    emptySubtitle: {
      fontSize: 14,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
      lineHeight: 20,
    },
    bubble: {
      maxWidth: "80%",
      borderRadius: 18,
      paddingVertical: 10,
      paddingHorizontal: 14,
    },
    clinicianBubble: {
      alignSelf: "flex-start",
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderBottomLeftRadius: 4,
    },
    clientBubble: {
      alignSelf: "flex-end",
      backgroundColor: colors.primary,
      borderBottomRightRadius: 4,
    },
    clinicianText: {
      fontSize: 15,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
      lineHeight: 21,
    },
    clientText: {
      fontSize: 15,
      color: "#FFFFFF",
      fontFamily: "Inter_400Regular",
      lineHeight: 21,
    },
    ts: {
      fontSize: 11,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginTop: 3,
    },
    tsRight: { alignSelf: "flex-end" },
    inputRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 10,
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 10),
      backgroundColor: colors.card,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    textInput: {
      flex: 1,
      backgroundColor: colors.muted,
      borderRadius: 24,
      paddingHorizontal: 18,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
      maxHeight: 100,
    },
    sendBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    sendDisabled: { opacity: 0.45 },
  });

  const formatTime = (ts: any) => {
    if (!ts) return "";
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const renderItem = ({ item }: { item: any }) => {
    const isClient = item.senderRole === "client" || item.sender_role === "client";
    return (
      <View>
        <View style={[s.bubble, isClient ? s.clientBubble : s.clinicianBubble]}>
          <Text style={isClient ? s.clientText : s.clinicianText}>
            {item.content ?? item.body ?? ""}
          </Text>
        </View>
        <Text style={[s.ts, isClient && s.tsRight]}>
          {formatTime(item.sentAt ?? item.sent_at ?? item.createdAt ?? item.created_at)}
        </Text>
      </View>
    );
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.headerAvatar}>
          <Feather name="user" size={20} color={colors.primary} />
        </View>
        <View>
          <Text style={s.headerTitle}>Messages</Text>
          <Text style={s.headerSub}>Your clinician</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
        {isLoading ? (
          <View style={s.emptyContainer}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : sorted.length === 0 ? (
          <View style={s.emptyContainer}>
            <Feather name="message-circle" size={40} color={colors.mutedForeground} />
            <Text style={s.emptyTitle}>No messages yet</Text>
            <Text style={s.emptySubtitle}>
              Send a message to start a conversation with your clinician.
            </Text>
          </View>
        ) : (
          <FlatList
            data={sorted}
            keyExtractor={(item: any) => item.id}
            renderItem={renderItem}
            inverted
            contentContainerStyle={s.listContent}
            style={s.list}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
          />
        )}

        <View style={s.inputRow}>
          <TextInput
            style={s.textInput}
            placeholder="Message your clinician..."
            placeholderTextColor={colors.mutedForeground}
            value={input}
            onChangeText={setInput}
            multiline
          />
          <Pressable
            style={[s.sendBtn, (!input.trim() || sending) && s.sendDisabled]}
            onPress={send}
            disabled={!input.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Feather name="send" size={18} color="#fff" />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
