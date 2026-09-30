import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

export default function ClinicianLoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { loginClinician, registerClinician } = useAuth();
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const styles = StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.background },
    content: { padding: 24, paddingBottom: insets.bottom + 28, gap: 14 },
    title: { fontFamily: "Inter_700Bold", fontSize: 27, color: colors.foreground, marginTop: 16 },
    caption: { color: colors.mutedForeground, fontSize: 14, lineHeight: 21, marginBottom: 12 },
    label: { color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13 },
    input: { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border, borderWidth: 1, borderRadius: colors.radius, padding: 14, fontSize: 16 },
    button: { backgroundColor: colors.primary, padding: 16, borderRadius: colors.radius, alignItems: "center", marginTop: 10 },
    buttonText: { color: colors.primaryForeground, fontFamily: "Inter_700Bold", fontSize: 16 },
    link: { color: colors.primary, fontFamily: "Inter_600SemiBold", textAlign: "center", padding: 14 },
    error: { color: colors.destructive, lineHeight: 20 },
  });
  async function submit() {
    if (!email.trim() || !password || (register && (!firstName.trim() || !lastName.trim()))) {
      setError("Complete all fields to continue."); return;
    }
    if (register && password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setBusy(true); setError("");
    try {
      if (register) await registerClinician(email, password, firstName, lastName);
      else await loginClinician(email, password);
      router.replace("/clinician");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in. Please try again.");
    } finally { setBusy(false); }
  }
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{register ? "Create clinician account" : "Clinician sign in"}</Text>
      <Text style={styles.caption}>Use the same email and password as the clinician web portal. Replit sign-in remains available on the web.</Text>
      {register && <>
        <Text style={styles.label}>First name</Text><TextInput style={styles.input} value={firstName} onChangeText={setFirstName} autoComplete="given-name" />
        <Text style={styles.label}>Last name</Text><TextInput style={styles.input} value={lastName} onChangeText={setLastName} autoComplete="family-name" />
      </>}
      <Text style={styles.label}>Email</Text>
      <TextInput testID="clinician-email" style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Text style={styles.label}>Password</Text>
      <TextInput testID="clinician-password" style={styles.input} value={password} onChangeText={setPassword} secureTextEntry autoComplete={register ? "new-password" : "current-password"} />
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <Pressable testID="clinician-submit" style={[styles.button, busy && { opacity: 0.6 }]} disabled={busy} onPress={submit}>
        {busy ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={styles.buttonText}>{register ? "Create account" : "Sign in"}</Text>}
      </Pressable>
      <Pressable onPress={() => { setRegister(!register); setError(""); }}><Text style={styles.link}>{register ? "Already have an account? Sign in" : "New clinician? Create an account"}</Text></Pressable>
      <Pressable onPress={() => router.back()}><Text style={styles.link}>Back to client sign in</Text></Pressable>
    </ScrollView>
  );
}