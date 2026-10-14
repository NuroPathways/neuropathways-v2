import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";

type CreateClientBody = {
  accountType: "individual";
  familyName: string;
  parentName: string;
  children: Array<{ child_name: string; age?: number; diagnosis?: string }>;
  clientAccount: { username: string; access_code: string };
};

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Unable to create the client account. Please try again.";

export default function ClinicianCreateClient() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const cache = useQueryClient();
  const { user, isLoading } = useAuth();
  const clinician = user?.role === "clinician";

  const [familyName, setFamilyName] = useState("");
  const [parentName, setParentName] = useState("");
  const [childName, setChildName] = useState("");
  const [age, setAge] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [username, setUsername] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [validationError, setValidationError] = useState("");
  const [apiError, setApiError] = useState("");
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(false);

  const submit = async () => {
    if (created || saving) return;
    setValidationError("");
    setApiError("");
    const cleanFamilyName = familyName.trim();
    const cleanParentName = parentName.trim();
    const cleanChildName = childName.trim();
    const cleanUsername = username.trim();
    const cleanAccessCode = accessCode.trim();

    if (!cleanFamilyName || !cleanParentName || !cleanChildName || !cleanUsername || !cleanAccessCode) {
      setValidationError("Complete the required family, parent, child, username, and access code fields.");
      return;
    }
    if (cleanAccessCode.length < 8) {
      setValidationError("Choose an access code of at least 8 characters.");
      return;
    }
    if (age.trim() && (!/^\d+$/.test(age.trim()) || Number(age) > 120)) {
      setValidationError("Enter an age from 0 to 120, or leave it blank.");
      return;
    }

    const body: CreateClientBody = {
      accountType: "individual",
      familyName: cleanFamilyName,
      parentName: cleanParentName,
      children: [{
        child_name: cleanChildName,
        ...(age.trim() ? { age: Number(age.trim()) } : {}),
        ...(diagnosis.trim() ? { diagnosis: diagnosis.trim() } : {}),
      }],
      clientAccount: { username: cleanUsername, access_code: cleanAccessCode },
    };
    setSaving(true);
    try {
      await apiFetch("/create-client-account", {
        method: "POST",
        body: JSON.stringify(body),
      });
      await cache.invalidateQueries({ queryKey: ["clinician-overview"] });
      setCreated(true);
    } catch (error) {
      setApiError(errorText(error));
    } finally {
      setSaving(false);
    }
  };

  const fieldStyle = [styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }];

  if (isLoading) {
    return <View style={[styles.center, { backgroundColor: colors.background }]}><Text style={{ color: colors.mutedForeground }}>Loading clinician session…</Text></View>;
  }
  if (!clinician) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: 28 }]}>
        <Feather name="lock" size={28} color={colors.primary} />
        <Text style={[styles.title, { color: colors.text, textAlign: "center", marginTop: 16 }]}>Clinician access required</Text>
        <Text style={[styles.body, { color: colors.mutedForeground, textAlign: "center", marginTop: 8 }]}>Sign in with a clinician account to add a client.</Text>
        <Pressable onPress={() => router.replace("/clinician")} style={[styles.primaryButton, { backgroundColor: colors.primary, marginTop: 22 }]}>
          <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Return to workspace</Text>
        </Pressable>
      </View>
    );
  }
  if (created) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: 28 }]}>
        <Feather name="check-circle" size={34} color={colors.primary} />
        <Text style={[styles.title, { color: colors.text, textAlign: "center", marginTop: 16 }]}>Client account created</Text>
        <Text style={[styles.body, { color: colors.mutedForeground, textAlign: "center", marginTop: 12 }]}>Share these sign-in details securely with the caregiver. The access code will not be shown again after you leave this page.</Text>
        <Text selectable style={[styles.body, { color: colors.text, marginTop: 22 }]}>Username: {username.trim()}</Text>
        <Text selectable style={[styles.body, { color: colors.text, marginTop: 8 }]}>Access code: {accessCode.trim()}</Text>
        <Pressable onPress={() => { setAccessCode(""); setUsername(""); router.replace("/clinician"); }} style={[styles.primaryButton, { backgroundColor: colors.primary, marginTop: 26 }]}>
          <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Done</Text>
        </Pressable>
      </View>
    );
  }

  const formError = validationError || apiError;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Pressable
          testID="create-client-back"
          accessibilityRole="button"
          accessibilityLabel="Back to clinician workspace"
          onPress={() => router.replace("/clinician")}
          style={[styles.backButton, { borderColor: colors.border, backgroundColor: colors.card }]}
        >
          <Feather name="arrow-left" size={19} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.kicker, { color: colors.primary }]}>CLIENT SETUP</Text>
          <Text style={[styles.title, { color: colors.text }]}>Add a client</Text>
        </View>
        <View style={[styles.headerMark, { backgroundColor: colors.muted }]}>
          <Feather name="user-plus" size={19} color={colors.primary} />
        </View>
      </View>

      <Text style={[styles.body, { color: colors.mutedForeground, marginBottom: 24 }]}>
        Create an individual client account and share their sign-in details with them manually.
      </Text>

      <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.sectionHeading}>
          <View style={[styles.sectionIcon, { backgroundColor: colors.muted }]}><Feather name="users" size={16} color={colors.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Family details</Text>
            <Text style={[styles.sectionCaption, { color: colors.mutedForeground }]}>Required to organize the client record</Text>
          </View>
        </View>
        <Field label="Family name" required>
          <TextInput testID="client-family-name" value={familyName} onChangeText={setFamilyName} placeholder="e.g. Rivera family" placeholderTextColor={colors.mutedForeground} style={fieldStyle} returnKeyType="next" />
        </Field>
        <Field label="Parent or caregiver name" required>
          <TextInput testID="client-parent-name" value={parentName} onChangeText={setParentName} placeholder="Full name" placeholderTextColor={colors.mutedForeground} style={fieldStyle} returnKeyType="next" />
        </Field>
      </View>

      <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.sectionHeading}>
          <View style={[styles.sectionIcon, { backgroundColor: colors.muted }]}><Feather name="user" size={16} color={colors.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Client details</Text>
            <Text style={[styles.sectionCaption, { color: colors.mutedForeground }]}>One client is added to this account</Text>
          </View>
        </View>
        <Field label="Child name" required>
          <TextInput testID="client-child-name" value={childName} onChangeText={setChildName} placeholder="Full name" placeholderTextColor={colors.mutedForeground} style={fieldStyle} returnKeyType="next" />
        </Field>
        <View style={styles.row}>
          <View style={{ flex: 0.7 }}>
            <Field label="Age" optional>
              <TextInput testID="client-age" value={age} onChangeText={setAge} placeholder="Years" placeholderTextColor={colors.mutedForeground} style={fieldStyle} keyboardType="number-pad" maxLength={3} />
            </Field>
          </View>
          <View style={{ flex: 1.3 }}>
            <Field label="Diagnosis" optional>
              <TextInput testID="client-diagnosis" value={diagnosis} onChangeText={setDiagnosis} placeholder="Add if known" placeholderTextColor={colors.mutedForeground} style={fieldStyle} returnKeyType="next" />
            </Field>
          </View>
        </View>
      </View>

      <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.sectionHeading}>
          <View style={[styles.sectionIcon, { backgroundColor: colors.muted }]}><Feather name="key" size={16} color={colors.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Sign-in details</Text>
            <Text style={[styles.sectionCaption, { color: colors.mutedForeground }]}>Choose credentials to share securely with the caregiver</Text>
          </View>
        </View>
        <Field label="Username" required>
          <TextInput testID="client-username" value={username} onChangeText={setUsername} placeholder="Choose a username" placeholderTextColor={colors.mutedForeground} style={fieldStyle} autoCapitalize="none" autoCorrect={false} returnKeyType="next" />
        </Field>
        <Field label="Access code" required>
          <TextInput testID="client-access-code" value={accessCode} onChangeText={setAccessCode} placeholder="Choose an access code" placeholderTextColor={colors.mutedForeground} style={fieldStyle} autoCapitalize="characters" autoCorrect={false} returnKeyType="done" />
        </Field>
        <View style={[styles.infoNote, { backgroundColor: colors.muted }]}>
          <Feather name="info" size={15} color={colors.primary} />
          <Text style={[styles.noteText, { color: colors.mutedForeground }]}>After creation, the sign-in details will be shown once so you can share them securely with the caregiver.</Text>
        </View>
      </View>

      {formError ? (
        <View accessibilityRole="alert" style={[styles.errorBox, { backgroundColor: colors.card, borderColor: colors.destructive }]}>
          <Feather name="alert-circle" size={18} color={colors.destructive} />
          <Text selectable style={[styles.errorText, { color: colors.destructive }]}>{formError}</Text>
        </View>
      ) : null}

      <Pressable
        testID="create-client-submit"
        accessibilityRole="button"
        disabled={saving}
        onPress={submit}
        style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: saving ? 0.65 : 1 }]}
      >
        {saving ? <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Creating account…</Text> : (
          <><Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Create client account</Text><Feather name="arrow-right" size={17} color={colors.primaryForeground} /></>
        )}
      </Pressable>
    </ScrollView>
  );
}

function Field({ label, required, optional, children }: { label: string; required?: boolean; optional?: boolean; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.text }]}>{label}<Text style={{ color: colors.mutedForeground }}>{required ? "  *" : optional ? "  Optional" : ""}</Text></Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 21 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 13, marginBottom: 19 },
  backButton: { width: 42, height: 42, borderWidth: 1, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  headerMark: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  kicker: { fontSize: 10, fontWeight: "800", letterSpacing: 1.8, marginBottom: 4 },
  title: { fontSize: 26, fontWeight: "700", letterSpacing: -0.7, flexShrink: 1 },
  body: { fontSize: 14 },
  formCard: { borderWidth: 1, borderRadius: 20, padding: 17, marginBottom: 13 },
  sectionHeading: { flexDirection: "row", alignItems: "flex-start", gap: 11, marginBottom: 18 },
  sectionIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 16, fontWeight: "700" },
  sectionCaption: { fontSize: 11, marginTop: 2 },
  field: { marginBottom: 15 },
  label: { fontSize: 12, fontWeight: "600", marginBottom: 7 },
  input: { minHeight: 47, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10, fontSize: 14 },
  row: { flexDirection: "column", gap: 12 },
  generateButton: { minHeight: 43, borderWidth: 1, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: -2 },
  generateText: { fontSize: 13, fontWeight: "700" },
  infoNote: { flexDirection: "row", alignItems: "flex-start", gap: 9, padding: 12, borderRadius: 12, marginTop: 14 },
  noteText: { flex: 1, fontSize: 11 },
  errorBox: { borderWidth: 1, borderRadius: 13, padding: 13, flexDirection: "row", alignItems: "flex-start", gap: 9, marginBottom: 14 },
  errorText: { flex: 1, fontSize: 13 },
  primaryButton: { minHeight: 52, borderRadius: 14, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  buttonText: { fontSize: 14, fontWeight: "700" },
});