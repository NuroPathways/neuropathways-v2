import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Linking,
} from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();

  const [username, setUsername] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    if (!username.trim() || !accessCode.trim()) {
      setError("Enter your username and access code");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await login(username.trim(), accessCode.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message || "Invalid username or access code");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scroll: {
      flexGrow: 1,
    },
    hero: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 32),
      paddingHorizontal: 28,
      paddingBottom: 40,
      alignItems: "center",
    },
    logoCircle: {
      width: 72,
      height: 72,
      borderRadius: 20,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 20,
    },
    appName: {
      fontSize: 28,
      fontWeight: "700" as const,
      color: colors.foreground,
      fontFamily: "Inter_700Bold",
      marginBottom: 6,
    },
    tagline: {
      fontSize: 15,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
    },
    form: {
      flex: 1,
      paddingHorizontal: 24,
      paddingTop: 8,
    },
    label: {
      fontSize: 13,
      fontWeight: "600" as const,
      color: colors.mutedForeground,
      fontFamily: "Inter_600SemiBold",
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginBottom: 8,
      marginTop: 20,
    },
    input: {
      backgroundColor: colors.card,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: colors.radius,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
    },
    inputFocused: {
      borderColor: colors.primary,
    },
    errorBox: {
      backgroundColor: "#FEE2E2",
      borderRadius: 10,
      padding: 12,
      marginTop: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    errorText: {
      color: "#DC2626",
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      flex: 1,
    },
    loginBtn: {
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      paddingVertical: 16,
      alignItems: "center",
      marginTop: 28,
      flexDirection: "row",
      justifyContent: "center",
      gap: 8,
    },
    loginBtnDisabled: {
      opacity: 0.6,
    },
    loginBtnText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "600" as const,
      fontFamily: "Inter_600SemiBold",
    },
    divider: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 32,
      marginBottom: 20,
      gap: 12,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.border,
    },
    dividerText: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
    },
    clinicianCard: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: colors.radius,
      padding: 18,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
    },
    clinicianIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
    },
    clinicianTextBlock: { flex: 1 },
    clinicianTitle: {
      fontSize: 15,
      fontWeight: "600" as const,
      color: colors.foreground,
      fontFamily: "Inter_600SemiBold",
    },
    clinicianSub: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginTop: 2,
    },
    footer: {
      paddingHorizontal: 24,
      paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 20),
      paddingTop: 12,
    },
  });

  const [userFocused, setUserFocused] = useState(false);
  const [codeFocused, setCodeFocused] = useState(false);

  const webDomain = process.env.EXPO_PUBLIC_DOMAIN;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <View style={styles.logoCircle}>
            <Feather name="activity" size={34} color="#FFFFFF" />
          </View>
          <Text style={styles.appName}>NeuroPath</Text>
          <Text style={styles.tagline}>
            Your behavioral health companion
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Username</Text>
          <TextInput
            style={[styles.input, userFocused && styles.inputFocused]}
            placeholder="Your username"
            placeholderTextColor={colors.mutedForeground}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            onFocus={() => setUserFocused(true)}
            onBlur={() => setUserFocused(false)}
            returnKeyType="next"
          />

          <Text style={styles.label}>Access Code</Text>
          <TextInput
            style={[styles.input, codeFocused && styles.inputFocused]}
            placeholder="Your access code"
            placeholderTextColor={colors.mutedForeground}
            value={accessCode}
            onChangeText={setAccessCode}
            secureTextEntry
            onFocus={() => setCodeFocused(true)}
            onBlur={() => setCodeFocused(false)}
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />

          {!!error && (
            <View style={styles.errorBox}>
              <Feather name="alert-circle" size={16} color="#DC2626" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Pressable
            style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.loginBtnText}>Sign In</Text>
                <Feather name="arrow-right" size={18} color="#FFFFFF" />
              </>
            )}
          </Pressable>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>CLINICIANS</Text>
            <View style={styles.dividerLine} />
          </View>

          <Pressable
            style={styles.clinicianCard}
            onPress={() => {
              const url = webDomain
                ? `https://${webDomain}/api/login`
                : "https://replit.com";
              Linking.openURL(url);
            }}
          >
            <View style={styles.clinicianIcon}>
              <Feather name="monitor" size={22} color={colors.primary} />
            </View>
            <View style={styles.clinicianTextBlock}>
              <Text style={styles.clinicianTitle}>Clinician Login</Text>
              <Text style={styles.clinicianSub}>
                Opens your browser for secure sign-in
              </Text>
            </View>
            <Feather name="external-link" size={16} color={colors.mutedForeground} />
          </Pressable>
        </View>

        <View style={styles.footer} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
