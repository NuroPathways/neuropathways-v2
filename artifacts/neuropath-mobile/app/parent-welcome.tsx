import React, { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Btn, Card, Check, ErrorBox, Field, H, Screen, T, msg } from "@/components/ParentUi";
import { useParent } from "@/context/ParentContext";
import { useColors } from "@/hooks/useColors";

export default function ParentWelcome() {
  const c = useColors();
  const { signup, signin } = useParent();
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [privacy, setPrivacy] = useState(false);
  const [health, setHealth] = useState(false);
  const [accountHolderAgeGroup, setAccountHolderAgeGroup] = useState<"" | "under_13" | "13_17" | "18_plus">("");
  const [adultOrGuardianConfirmed, setAdultOrGuardianConfirmed] = useState(false);
  const [parentGuardianAuthorityConfirmed, setParentGuardianAuthorityConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    if (!email.trim() || !password) return setError("Enter your email and password.");
    if (mode === "signup") {
      if (!firstName.trim()) return setError("Enter your first name.");
      if (password.length < 8) return setError("Use at least 8 characters for your password.");
      if (password !== confirm) return setError("Passwords do not match.");
      if (!privacy || !health) return setError("Please agree to both statements to continue.");
      if (accountHolderAgeGroup === "under_13") return setError("A parent or guardian must create this account. NeuroPathways does not allow children under 13 to create their own accounts.");
      if (!accountHolderAgeGroup || !adultOrGuardianConfirmed || !parentGuardianAuthorityConfirmed) return setError("Select your age group and confirm the adult/guardian statements to continue.");
    }
    setBusy(true);
    try {
      if (mode === "signup") await signup({
        firstName,
        email,
        password,
        confirmPassword: confirm,
        accountHolderAgeGroup: accountHolderAgeGroup as "13_17" | "18_plus",
        adultOrGuardianConfirmed: true,
        parentGuardianAuthorityConfirmed: true,
      });
      else await signin(email, password);
    } catch (e) {
      setError(msg(e, "We could not sign you in."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen top>
      <H sub={mode === "signup" ? "NeuroPathways helps parents turn behavior goals and support plans into simple steps they can use during stressful moments." : "Sign in to see your child's support steps."}>
        {mode === "signup" ? "What to do in the moment, based on your child's plan." : "Welcome back"}
      </H>
      {mode === "signup" ? (
        <Card>
          <T weight="bold" size={16}>How it works</T>
          <T size={14}><T weight="semi" size={14}>1. Add your child.</T> Create a quick profile with just a name or nickname.</T>
          <T size={14}><T weight="semi" size={14}>2. Choose your behaviors.</T> Pick one or more, such as elopement, self-injury, aggression, meltdowns, task refusal, or transition difficulty, and set a goal for each.</T>
          <T size={14}><T weight="semi" size={14}>3. Get support steps.</T> See simple steps for what to do right now, what to avoid, and what to track.</T>
          <T weight="bold" size={15} style={{ marginTop: 6 }}>Have a treatment plan, behavior plan, or school support plan? Upload it later.</T>
          <T size={14}>You can start with starter support now. When you are ready, upload a plan so NeuroPathways can make the steps more personalized.</T>
          <T weight="bold" size={15} style={{ marginTop: 6 }}>Simple support for stressful moments.</T>
          <T size={14}>Your notes and documents are stored in your account and may be processed by service providers that help operate NeuroPathways. Starter support is general guidance until you upload a plan or connect with a clinician.</T>
        </Card>
      ) : null}
      <Card>
        {mode === "signup" ? <Field label="Your first name" value={firstName} onChangeText={setFirstName} autoComplete="given-name" testID="parent-first-name" /> : null}
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" testID="parent-email" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === "signup" ? "new-password" : "current-password"} testID="parent-password" />
        {mode === "signup" ? (
          <>
            <Field label="Confirm password" value={confirm} onChangeText={setConfirm} secureTextEntry />
            <Check checked={privacy} onToggle={() => setPrivacy(!privacy)}>
              <T size={14}>I have read the privacy policy and agree to how my information is handled.</T>
            </Check>
            <Check checked={health} onToggle={() => setHealth(!health)}>
              <T size={14}>I understand that electronic health information has risks, and I consent to NeuroPathways storing health-related information about my child that I choose to enter or upload.</T>
            </Check>
            <T weight="semi" size={14}>Who is creating this account? Parent / Guardian.</T>
            <T size={13}>Client accounts are created by an authorized parent/guardian or clinician; clients do not self-register here.</T>
            <T weight="semi" size={14}>Account holder's age group</T>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {([["under_13", "Under 13"], ["13_17", "13–17"], ["18_plus", "18 or older"]] as const).map(([value, label]) => (
                <Btn key={value} kind={accountHolderAgeGroup === value ? "primary" : "ghost"} label={label} onPress={() => setAccountHolderAgeGroup(value)} />
              ))}
            </View>
            {accountHolderAgeGroup === "under_13" && (
              <T color={c.destructive}>A parent or guardian must create this account. NeuroPathways does not allow children under 13 to create their own accounts.</T>
            )}
            <Check checked={adultOrGuardianConfirmed} onToggle={() => setAdultOrGuardianConfirmed(!adultOrGuardianConfirmed)}>
              <T size={14}>I confirm I am 18 or older, or I have parent/guardian permission to use this account.</T>
            </Check>
            <Check checked={parentGuardianAuthorityConfirmed} onToggle={() => setParentGuardianAuthorityConfirmed(!parentGuardianAuthorityConfirmed)}>
              <T size={14}>I confirm I am the parent, guardian, or authorized caregiver for any child profile I create.</T>
            </Check>
          </>
        ) : null}
        {error ? <ErrorBox message={error} /> : null}
        <Btn testID="parent-submit" label={mode === "signup" ? "Start With One Behavior" : "Sign in"} onPress={submit} loading={busy} />
        <Btn kind="ghost" label={mode === "signup" ? "I Already Have an Account" : "Create your free account"} onPress={() => { setError(""); setMode(mode === "signup" ? "login" : "signup"); }} />
      </Card>
      <View style={{ gap: 8 }}>
        {mode === "signup" ? <Btn kind="ghost" label="Upload a Plan Later" onPress={submit} loading={busy} /> : null}
        {mode === "signup" ? <T size={12}>Uploading a plan is optional and happens after setup.</T> : null}
        <Btn kind="ghost" label="Read the privacy policy" onPress={() => router.push("/privacy")} />
        <Btn kind="ghost" label="Back to other sign-in options" onPress={() => router.replace("/login")} />
      </View>
      <T size={12} color={c.mutedForeground}>NeuroPathways provides general guidance and is not a substitute for professional care. In an emergency, call your local emergency number.</T>
    </Screen>
  );
}
