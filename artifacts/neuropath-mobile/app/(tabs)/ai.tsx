import React, { useState, useRef } from "react";
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
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { entities, invokeAI } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  ts: number;
}

const SUGGESTED = [
  "Summarize my behavior plan",
  "What are my main triggers?",
  "Help me build a calming routine",
  "What coping strategies work for me?",
];

export default function AIScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const childId = user?.id;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: plans = [] } = useQuery({
    queryKey: ["behavior-plans", childId],
    queryFn: () => entities.BehaviorPlan.filter({ childId }).catch(() => []),
    enabled: !!childId,
  });

  const { data: childProfile = null } = useQuery({
    queryKey: ["mobile-child-profile", childId],
    queryFn: async () => {
      const children = await entities.Child.filter();
      return children.find((child: any) => child.id === childId) ?? null;
    },
    enabled: !!childId,
  });

  const sendMessage = async (text?: string) => {
    const msgText = (text ?? input).trim();
    if (!msgText || loading) return;
    setInput("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      text: msgText,
      ts: Date.now(),
    };
    setMessages((prev) => [userMsg, ...prev]);
    setLoading(true);

    try {
      if (!childId) throw new Error("The signed-in client could not be verified.");
      const profileLines = [
        `Name: ${childProfile?.childName ?? user?.child_name ?? "not recorded"}`,
        childProfile?.age != null ? `Age: ${childProfile.age}` : "",
        childProfile?.diagnosis ? `Recorded diagnosis: ${childProfile.diagnosis}` : "",
        childProfile?.triggers ? `Recorded triggers: ${childProfile.triggers}` : "",
      ].filter(Boolean);
      const profileContext = `\n\nSelected child profile:\n${profileLines.join("\n")}`;
      const planContext =
        plans.length > 0
          ? `\n\nSelected child's behavior plans:\n${plans
              .slice(0, 3)
              .map(
                (p: any) => {
                  const name = p.behaviorName ?? p.behavior_name ?? "Plan";
                  const details = [
                    p.behaviorDescription ?? p.behavior_description,
                    p.behaviorFunction ?? p.behavior_function ? `Possible purpose: ${p.behaviorFunction ?? p.behavior_function}` : "",
                    p.commonTriggers ?? p.common_triggers ? `Recorded triggers: ${p.commonTriggers ?? p.common_triggers}` : "",
                    p.strategyTitle ?? p.strategy_title,
                    p.strategySteps ?? p.strategy_steps,
                    p.deescalationSteps ?? p.deescalation_steps ? `Calming steps: ${p.deescalationSteps ?? p.deescalation_steps}` : "",
                    p.reinforcementMethod ?? p.reinforcement_method ? `What to encourage: ${p.reinforcementMethod ?? p.reinforcement_method}` : "",
                    p.avoidActions ?? p.avoid_actions ? `What to avoid: ${p.avoidActions ?? p.avoid_actions}` : "",
                  ].filter(Boolean);
                  return `- ${name}: ${details.join("; ")}`;
                }
              )
              .join("\n")}`
          : "";

      const history = messages
        .slice(0, 8)
        .reverse()
        .map((message) => `${message.role === "user" ? "You" : "NeuroPath AI"}: ${message.text}`)
        .join("\n");
      const prompt = `You are NeuroPath AI, a warm and practical support assistant speaking directly to the child who is using this chat.

Use "you" and "your"; do not talk about the child as if they are absent. Adapt your words to the child's recorded age and profile. Use their name naturally, not in every sentence. When relevant, connect advice to a specific recorded plan strategy or trigger. Never assume a diagnosis explains how the child feels or behaves, and do not invent personal details. If the profile or plan does not answer the question, say so briefly and offer safe general support. Do not claim advice is clinician-approved unless the plan explicitly says it has been reviewed. Keep the answer clear, kind, and easy to act on. Do not diagnose, recommend medication changes, or give physical restraint instructions. If someone is in immediate danger, tell the child to get a trusted adult and contact local emergency services.

${profileContext}
${planContext}

Recent conversation:
${history || "No earlier messages."}

Child's message: ${msgText}`;

      const reply = await invokeAI(prompt, childId);
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        text: reply,
        ts: Date.now(),
      };
      setMessages((prev) => [assistantMsg, ...prev]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        text: "Sorry, I couldn't connect right now. Please try again.",
        ts: Date.now(),
      };
      setMessages((prev) => [errMsg, ...prev]);
    } finally {
      setLoading(false);
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
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    headerIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
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
    listContent: {
      padding: 16,
      gap: 12,
      flexDirection: "column",
    },
    emptyContainer: {
      flex: 1,
      paddingHorizontal: 24,
      paddingTop: 40,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: "700" as const,
      color: colors.foreground,
      fontFamily: "Inter_700Bold",
      marginBottom: 6,
      marginTop: 16,
    },
    emptySubtitle: {
      fontSize: 14,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      lineHeight: 20,
      marginBottom: 28,
    },
    suggestedLabel: {
      fontSize: 12,
      fontWeight: "600" as const,
      color: colors.mutedForeground,
      fontFamily: "Inter_600SemiBold",
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginBottom: 10,
    },
    suggChip: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 20,
      paddingVertical: 10,
      paddingHorizontal: 16,
      marginBottom: 8,
      alignSelf: "flex-start",
    },
    suggText: {
      fontSize: 14,
      color: colors.primary,
      fontFamily: "Inter_500Medium",
    },
    bubble: {
      maxWidth: "82%",
      borderRadius: 18,
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    userBubble: {
      alignSelf: "flex-end",
      backgroundColor: colors.primary,
      borderBottomRightRadius: 4,
    },
    aiBubble: {
      alignSelf: "flex-start",
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderBottomLeftRadius: 4,
    },
    userText: {
      color: "#fff",
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      lineHeight: 21,
    },
    aiText: {
      color: colors.foreground,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      lineHeight: 21,
    },
    typingBubble: {
      alignSelf: "flex-start",
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 18,
      borderBottomLeftRadius: 4,
      paddingVertical: 14,
      paddingHorizontal: 18,
      flexDirection: "row",
      gap: 5,
      alignItems: "center",
    },
    dot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.mutedForeground,
    },
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
      minWidth: 78,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 7,
      paddingHorizontal: 12,
    },
    sendBtnText: {
      color: "#fff",
      fontSize: 14,
      fontFamily: "Inter_500Medium",
    },
    sendBtnDisabled: { opacity: 0.45 },
  });

  const renderItem = ({ item }: { item: Message }) => (
    <View style={[s.bubble, item.role === "user" ? s.userBubble : s.aiBubble]}>
      <Text style={item.role === "user" ? s.userText : s.aiText}>
        {item.text}
      </Text>
    </View>
  );

  const ListHeader = loading ? (
    <View style={s.typingBubble}>
      <View style={s.dot} />
      <View style={s.dot} />
      <View style={s.dot} />
    </View>
  ) : null;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.headerIcon}>
          <Feather name="cpu" size={20} color={colors.primary} />
        </View>
        <View>
          <Text style={s.headerTitle}>NeuroPath AI</Text>
          <Text style={s.headerSub}>Your behavioral health companion</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        {messages.length === 0 ? (
          <View style={s.emptyContainer}>
            <Feather name="cpu" size={36} color={colors.primary} />
            <Text style={s.emptyTitle}>Ask anything</Text>
            <Text style={s.emptySubtitle}>
              I can help with your behavior plans, coping strategies, and daily
              support.
            </Text>
            <Text style={s.suggestedLabel}>Try asking</Text>
            {SUGGESTED.map((s_) => (
              <Pressable
                key={s_}
                style={s.suggChip}
                onPress={() => sendMessage(s_)}
              >
                <Text style={s.suggText}>{s_}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <FlatList
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            inverted
            contentContainerStyle={s.listContent}
            style={s.list}
            ListHeaderComponent={ListHeader}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
          />
        )}

        <View style={s.inputRow}>
          <TextInput
            style={s.textInput}
            placeholder="Message NeuroPath AI..."
            placeholderTextColor={colors.mutedForeground}
            value={input}
            onChangeText={setInput}
            multiline
            returnKeyType="default"
          />
          <Pressable
            style={[s.sendBtn, (!input.trim() || loading) && s.sendBtnDisabled]}
            onPress={() => sendMessage()}
            disabled={!input.trim() || loading}
            accessibilityRole="button"
            accessibilityLabel={loading ? "Sending message" : "Send message"}
            accessibilityState={{ disabled: !input.trim() || loading }}
            hitSlop={6}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Feather name="send" size={17} color="#fff" />
                <Text style={s.sendBtnText}>Send</Text>
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
