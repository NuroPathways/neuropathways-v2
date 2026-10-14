import React, { useCallback, useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { getApiBase } from "@/lib/api";

type Form = {
  parent_name: string;
  child_name: string;
  child_age: string;
  diagnosis: string;
  username: string;
  access_code: string;
};
type Consent = { privacy: boolean; security: boolean; authorizedUploader: boolean };
type PrivacyConfig = {
  privacy_policy_version: string;
  health_consent_version: string;
  authorized_uploader_attestation_version: string;
};

const consentLabels: { key: keyof Consent; text: string }[] = [
  {
    key: "privacy",
    text: "I have read and agree to the NeuroPathways Consumer Health Privacy Policy. I understand that I may voluntarily provide private and sensitive health information and authorize NeuroPathways to receive, store, and process it for the services I request.",
  },
  {
    key: "security",
    text: "I understand that electronic transmission and storage of information involves security risks and that no electronic system can guarantee absolute security.",
  },
  {
    key: "authorizedUploader",
    text: "I confirm that I am authorized to possess and provide the health information and documents I upload concerning my child or another person.",
  },
];

async function responseError(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => null);
  const message = typeof data?.error === "string" ? data.error : typeof data?.message === "string" ? data.message : fallback;
  if (res.status === 429) return `Too many attempts. ${message}`;
  if (res.status === 409) return `Privacy information has changed. ${message} Refresh the policy versions below before trying again.`;
  return message;
}

export default function SignupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [form, setForm] = useState<Form>({ parent_name: "", child_name: "", child_age: "", diagnosis: "", username: "", access_code: "" });
  const [consent, setConsent] = useState<Consent>({ privacy: false, security: false, authorizedUploader: false });
  const [config, setConfig] = useState<PrivacyConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(false);
  const [accountHolderAgeGroup, setAccountHolderAgeGroup] = useState<"" | "under_13" | "13_17" | "18_plus">("");
  const [adultOrGuardianConfirmed, setAdultOrGuardianConfirmed] = useState(false);
  const [parentGuardianAuthorityConfirmed, setParentGuardianAuthorityConfirmed] = useState(false);

  const loadConfig = useCallback(async () => {
    setConfigLoading(true);
    setConfig(null);
    setError("");
    try {
      const res = await fetch(`${getApiBase()}/api/privacy-config`);
      if (!res.ok) throw new Error(await responseError(res, "Could not load the current privacy information."));
      const data = await res.json();
      if (!data?.privacy_policy_version || !data?.health_consent_version || !data?.authorized_uploader_attestation_version) {
        throw new Error("Could not load the current privacy information.");
      }
      setConfig(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the current privacy information. Please try again.");
    } finally {
      setConfigLoading(false);
    }
  }, []);

  useEffect(() => { void loadConfig(); }, [loadConfig]);

  const set = (key: keyof Form) => (value: string) => setForm(current => ({ ...current, [key]: value }));
  const valid = !!config && !!form.parent_name.trim() && !!form.child_name.trim() &&
    form.username.trim().length >= 3 && form.access_code.trim().length >= 4 &&
    consent.privacy && consent.security && consent.authorizedUploader &&
    accountHolderAgeGroup !== "" && accountHolderAgeGroup !== "under_13" &&
    adultOrGuardianConfirmed && parentGuardianAuthorityConfirmed;

  const submit = async () => {
    if (!valid || loading || !config || created) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${getApiBase()}/api/parent-signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          accountHolderType: "parent_guardian",
          accountHolderAgeGroup,
          adultOrGuardianConfirmed,
          parentGuardianAuthorityConfirmed,
          consent: {
            privacy_policy_accepted: consent.privacy,
            privacy_policy_version: config.privacy_policy_version,
            health_information_accepted: consent.security,
            health_consent_version: config.health_consent_version,
            authorized_uploader_accepted: consent.authorizedUploader,
            authorized_uploader_attestation_version: config.authorized_uploader_attestation_version,
          },
        }),
      });
      if (!res.ok) throw new Error(await responseError(res, "Something went wrong. Please try again."));
      setCreated(true);
      try {
        await login(form.username.trim(), form.access_code.trim());
        router.replace("/(tabs)");
      } catch (e) {
        setError(`Your account was created, but automatic sign-in failed: ${e instanceof Error ? e.message : "Please sign in with your new credentials."}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const s = StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: 24, paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 36), width: "100%", maxWidth: 560, alignSelf: "center" },
    back: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", paddingVertical: 8, marginBottom: 24 },
    backText: { color: colors.mutedForeground, fontFamily: "Inter_500Medium", fontSize: 14 },
    eyebrow: { color: colors.primary, fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 1.4, marginBottom: 10 },
    title: { color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 30, marginBottom: 10 },
    intro: { color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 15, marginBottom: 24 },
    card: { backgroundColor: colors.card, borderRadius: 20, borderColor: colors.border, borderWidth: 1, padding: 20 },
    label: { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold", fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase", marginTop: 20, marginBottom: 8 },
    input: { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, borderRadius: 12, minHeight: 48, paddingHorizontal: 14, color: colors.foreground, fontFamily: "Inter_400Regular", fontSize: 16 },
    inputRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, borderRadius: 12 },
    codeInput: { flex: 1, borderWidth: 0 },
    iconButton: { padding: 12 },
    hint: { color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 6 },
    rule: { height: 1, backgroundColor: colors.border, marginTop: 26, marginBottom: 4 },
    privacy: { backgroundColor: colors.background, borderRadius: 16, borderColor: colors.border, borderWidth: 1, padding: 17, marginTop: 28 },
    privacyHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 9 },
    privacyTitle: { color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 16 },
    privacyText: { color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13 },
    link: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 10, marginBottom: 9 },
    linkText: { color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 13 },
    consent: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 12, borderTopWidth: 1, borderColor: colors.border },
    checkbox: { width: 23, height: 23, borderRadius: 6, borderColor: colors.primary, borderWidth: 1.5, backgroundColor: colors.card, alignItems: "center", justifyContent: "center", marginTop: 1 },
    checked: { backgroundColor: colors.primary },
    consentText: { flex: 1, color: colors.foreground, fontFamily: "Inter_400Regular", fontSize: 13 },
    error: { color: colors.destructive, fontFamily: "Inter_500Medium", fontSize: 13, marginTop: 18, backgroundColor: colors.muted, borderRadius: 10, padding: 14 },
    button: { backgroundColor: colors.primary, borderRadius: 12, minHeight: 50, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginTop: 24 },
    disabled: { opacity: 0.5 },
    buttonText: { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold", fontSize: 16 },
    footer: { flexDirection: "row", justifyContent: "center", gap: 5, marginTop: 24 },
    footerText: { color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13 },
    skeleton: { height: 68, backgroundColor: colors.muted, borderRadius: 10, marginTop: 12 },
  });

  return (
    <KeyboardAvoidingView style={s.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
        <Pressable testID="signup-back" style={s.back} onPress={() => router.back()} accessibilityRole="button">
          <Feather name="arrow-left" size={17} color={colors.mutedForeground} /><Text style={s.backText}>Back</Text>
        </Pressable>
        <Text style={s.eyebrow}>NEUROPATHWAYS  /  PARENT ACCESS</Text>
        <Text style={s.title}>A place to keep care connected.</Text>
        <Text style={s.intro}>Create your account to track your child’s behavioral goals, upload documents, and access personalized guidance.</Text>
        <View style={s.card}>
          <Text style={[s.label, { marginTop: 0 }]}>Who is creating this account? Parent / Guardian</Text>
          <Text style={s.label}>Account holder's age group</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(["under_13", "13_17", "18_plus"] as const).map((group) => (
              <Pressable key={group} accessibilityRole="radio" accessibilityState={{ selected: accountHolderAgeGroup === group }} onPress={() => setAccountHolderAgeGroup(group)} style={{ padding: 10, borderRadius: 10, borderWidth: 1, borderColor: accountHolderAgeGroup === group ? colors.primary : colors.border }}>
                <Text style={{ color: colors.foreground, fontSize: 12 }}>{group === "under_13" ? "Under 13" : group === "13_17" ? "13–17" : "18 or older"}</Text>
              </Pressable>
            ))}
          </View>
          {accountHolderAgeGroup === "under_13" && <Text accessibilityRole="alert" style={s.error}>A parent or guardian must create this account. NeuroPathways does not allow children under 13 to create their own accounts.</Text>}
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: adultOrGuardianConfirmed }} onPress={() => setAdultOrGuardianConfirmed(!adultOrGuardianConfirmed)} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start", marginTop: 12 }}>
            <Text style={{ color: colors.primary, fontSize: 20 }}>{adultOrGuardianConfirmed ? "☑" : "□"}</Text>
            <Text allowFontScaling style={{ color: colors.foreground, flex: 1 }}>I confirm I am 18 or older, or I have parent/guardian permission to use this account.</Text>
          </Pressable>
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: parentGuardianAuthorityConfirmed }} onPress={() => setParentGuardianAuthorityConfirmed(!parentGuardianAuthorityConfirmed)} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start", marginTop: 12 }}>
            <Text style={{ color: colors.primary, fontSize: 20 }}>{parentGuardianAuthorityConfirmed ? "☑" : "□"}</Text>
            <Text allowFontScaling style={{ color: colors.foreground, flex: 1 }}>I confirm I am the parent, guardian, or authorized caregiver for any child profile I create.</Text>
          </Pressable>
          <Text style={[s.label, { marginTop: 0 }]}>Your Name</Text>
          <TextInput testID="signup-parent-name" style={s.input} value={form.parent_name} onChangeText={set("parent_name")} placeholder="e.g. Maria Rivera" placeholderTextColor={colors.mutedForeground} autoComplete="name" />
          <Text style={s.label}>Child&apos;s Name</Text>
          <TextInput testID="signup-child-name" style={s.input} value={form.child_name} onChangeText={set("child_name")} placeholder="e.g. Sofia Rivera" placeholderTextColor={colors.mutedForeground} />
          <Text style={s.label}>Child&apos;s Age</Text>
          <TextInput testID="signup-child-age" style={s.input} value={form.child_age} onChangeText={set("child_age")} placeholder="e.g. 7" placeholderTextColor={colors.mutedForeground} keyboardType="number-pad" />
          <Text style={s.label}>Diagnosis (optional)</Text>
          <TextInput testID="signup-diagnosis" style={s.input} value={form.diagnosis} onChangeText={set("diagnosis")} placeholder="e.g. ADHD" placeholderTextColor={colors.mutedForeground} />
          <View style={s.rule} />
          <Text style={s.label}>Choose a Username</Text>
          <TextInput testID="signup-username" style={s.input} value={form.username} onChangeText={set("username")} placeholder="e.g. maria.rivera" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" autoCorrect={false} autoComplete="username" />
          <Text style={s.hint}>At least 3 characters. You’ll use this to sign in.</Text>
          <Text style={s.label}>Create an Access Code</Text>
          <View style={s.inputRow}>
            <TextInput testID="signup-access-code" style={[s.input, s.codeInput]} value={form.access_code} onChangeText={set("access_code")} placeholder="e.g. MyCode123" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" autoCorrect={false} secureTextEntry={!showCode} autoComplete="new-password" />
            <Pressable testID="signup-toggle-code" style={s.iconButton} onPress={() => setShowCode(v => !v)} accessibilityLabel={showCode ? "Hide access code" : "Show access code"}>
              <Feather name={showCode ? "eye-off" : "eye"} size={19} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <Text style={s.hint}>At least 4 characters. This is your password.</Text>
          <View style={s.privacy}>
            <View style={s.privacyHead}><Feather name="shield" size={21} color={colors.primary} /><Text style={s.privacyTitle}>Your privacy matters</Text></View>
            <Text style={s.privacyText}>NeuroPathways may process private and sensitive health information that you choose to provide. Please review how your information will be handled before creating your account.</Text>
            <Pressable testID="signup-policy-link" style={s.link} onPress={() => router.push("/privacy")} accessibilityRole="link">
              <Text style={s.linkText}>Read Privacy Policy</Text><Feather name="arrow-up-right" size={15} color={colors.primary} />
            </Pressable>
            {configLoading ? <><View style={s.skeleton} /><View style={s.skeleton} /><View style={s.skeleton} /></> : consentLabels.map(item => (
              <Pressable key={item.key} testID={`consent-${item.key}`} style={s.consent} onPress={() => setConsent(current => ({ ...current, [item.key]: !current[item.key] }))} accessibilityRole="checkbox" accessibilityState={{ checked: consent[item.key] }}>
                <View style={[s.checkbox, consent[item.key] && s.checked]}>{consent[item.key] && <Feather name="check" size={15} color={colors.primaryForeground} />}</View>
                <Text style={s.consentText}>{item.text}</Text>
              </Pressable>
            ))}
          </View>
          {!!error && <Text testID="signup-error" style={s.error} accessibilityRole="alert">{error}</Text>}
          {!config && !configLoading && !created && <Pressable testID="signup-retry-config" style={s.link} onPress={() => void loadConfig()}><Text style={s.linkText}>Reload privacy information</Text><Feather name="refresh-cw" size={14} color={colors.primary} /></Pressable>}
          {config && error.toLowerCase().includes("privacy information has changed") && <Pressable testID="signup-refresh-versions" style={s.link} onPress={() => void loadConfig()}><Text style={s.linkText}>Refresh policy versions</Text><Feather name="refresh-cw" size={14} color={colors.primary} /></Pressable>}
          {created ? (
            <Pressable testID="signup-signin-after-create" style={s.button} onPress={() => router.replace("/login")}><Text style={s.buttonText}>Sign in to your account</Text></Pressable>
          ) : (
            <Pressable testID="signup-submit" style={[s.button, (!valid || loading) && s.disabled]} disabled={!valid || loading} onPress={() => void submit()} accessibilityRole="button" accessibilityState={{ disabled: !valid || loading }}>
              <Text style={s.buttonText}>{loading ? "Creating account…" : "Create Account"}</Text>{!loading && <Feather name="arrow-right" size={17} color={colors.primaryForeground} />}
            </Pressable>
          )}
        </View>
        <View style={s.footer}><Text style={s.footerText}>Already have an account?</Text><Pressable onPress={() => router.replace("/login")} accessibilityRole="link"><Text style={s.linkText}>Sign in</Text></Pressable></View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}