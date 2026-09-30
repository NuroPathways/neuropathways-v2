import React from "react";
import { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";

export default function ChangeCodeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [currentCode, setCurrentCode] = useState("");
  const [newCode, setNewCode] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    setError("");
    setSuccess(false);
    if (!currentCode || !newCode || !confirmCode) {
      setError("Enter your current code and both new-code fields.");
      return;
    }
    if (newCode.length < 4) {
      setError("Your new access code must be at least 4 characters.");
      return;
    }
    if (newCode !== confirmCode) {
      setError("The new access codes do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await apiFetch("/mobile/auth/change-access-code", {
        method: "POST",
        body: JSON.stringify({
          current_access_code: currentCode,
          new_access_code: newCode,
        }),
      });
      if (result?.ok !== true) {
        throw new Error("The access code could not be changed. Please try again.");
      }
      setCurrentCode("");
      setNewCode("");
      setConfirmCode("");
      setSuccess(true);
    } catch (e: any) {
      setError(e?.message || "The access code could not be changed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0), paddingHorizontal: 20, paddingBottom: 16, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
    title: { fontSize: 22, fontWeight: "700" as const, color: colors.foreground, fontFamily: "Inter_700Bold" },
    subtitle: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 3 },
    content: { padding: 20, gap: 16 },
    intro: { color: colors.mutedForeground, fontSize: 14, lineHeight: 20, fontFamily: "Inter_400Regular" },
    label: { color: colors.foreground, fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 7 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius, backgroundColor: colors.card, color: colors.foreground, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, fontFamily: "Inter_400Regular" },
    message: { padding: 12, borderRadius: colors.radius, backgroundColor: colors.card, color: colors.destructive, fontSize: 14, lineHeight: 20, fontFamily: "Inter_400Regular" },
    success: { padding: 12, borderRadius: colors.radius, backgroundColor: colors.card, color: colors.primary, fontSize: 14, lineHeight: 20, fontFamily: "Inter_500Medium" },
    button: { paddingVertical: 15, borderRadius: colors.radius, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 9 },
    buttonText: { color: colors.primaryForeground, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  });
  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Change Access Code</Text>
        <Text style={s.subtitle}>Access-code management</Text>
      </View>
      <ScrollView
        contentContainerStyle={[
          s.content,
          { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 20) },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.intro}>
          Enter your current access code, then choose and confirm a new code.
        </Text>
        <View>
          <Text style={s.label}>Current access code</Text>
          <TextInput
            testID="current-access-code"
            accessibilityLabel="Current access code"
            style={s.input}
            value={currentCode}
            onChangeText={setCurrentCode}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!submitting}
          />
        </View>
        <View>
          <Text style={s.label}>New access code</Text>
          <TextInput
            testID="new-access-code"
            accessibilityLabel="New access code"
            style={s.input}
            value={newCode}
            onChangeText={setNewCode}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!submitting}
          />
        </View>
        <View>
          <Text style={s.label}>Confirm new access code</Text>
          <TextInput
            testID="confirm-access-code"
            accessibilityLabel="Confirm new access code"
            style={s.input}
            value={confirmCode}
            onChangeText={setConfirmCode}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!submitting}
          />
        </View>
        {!!error && <Text accessibilityRole="alert" style={s.message}>{error}</Text>}
        {success && (
          <Text accessibilityRole="alert" style={s.success}>
            Your access code has been updated.
          </Text>
        )}
        <Pressable
          testID="change-access-code-submit"
          accessibilityRole="button"
          style={[s.button, submitting && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Feather name="lock" size={17} color={colors.primaryForeground} />
          )}
          <Text style={s.buttonText}>{submitting ? "Updating…" : "Update access code"}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}