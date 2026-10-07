import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useRegisterParent, useLoginParent } from "@workspace/api-client-react";
import { useAuth } from "@/lib/AuthContext";
import { rememberInvite } from "@/lib/parentSession";
import { Shell, Field, ErrorBox, errMsg } from "./common";
import SignupAuthorityFields from "@/components/signup/SignupAuthorityFields";

export default function AuthForm({ mode }) {
  const signup = mode === "signup";
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const invite = sp.get("invite");
  if (invite) rememberInvite(invite);
  const { setParentAuth } = useAuth();
  const [f, setF] = useState({ firstName: "", email: "", password: "", confirmPassword: "" });
  const [privacy, setPrivacy] = useState(false);
  const [health, setHealth] = useState(false);
  const [ageGroup, setAgeGroup] = useState("");
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [parentConfirmed, setParentConfirmed] = useState(false);
  const [error, setError] = useState("");
  const reg = useRegisterParent();
  const log = useLoginParent();
  const pending = reg.isPending || log.isPending;
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const done = (res) => {
    setParentAuth(res);
    nav(signup || !(res.children || []).length ? "/ParentQuickStart" : "/ParentHome", { replace: true });
  };

  const submit = (e) => {
    e.preventDefault();
    setError("");
    if (signup) {
      if (!privacy || !health) return setError("Please read and confirm both consent statements.");
      if (!ageGroup || ageGroup === "under_13") return setError("A parent or guardian must create this account. Children under 13 cannot sign up independently.");
      if (!adultConfirmed || !parentConfirmed) return setError("Confirm the adult/guardian and child-profile authorization statements to continue.");
      if (f.password !== f.confirmPassword) return setError("The two passwords do not match.");
      reg.mutate(
        { data: { firstName: f.firstName.trim(), email: f.email.trim(), password: f.password, confirmPassword: f.confirmPassword, privacyConsent: true, healthConsent: true, accountHolderType: "parent_guardian", accountHolderAgeGroup: ageGroup, adultOrGuardianConfirmed: adultConfirmed, parentGuardianAuthorityConfirmed: parentConfirmed } },
        { onSuccess: done, onError: (er) => setError(errMsg(er, "We could not create your account.")) }
      );
    } else {
      log.mutate({ data: { email: f.email.trim(), password: f.password } }, { onSuccess: done, onError: (er) => setError(errMsg(er, "Email or password is not right.")) });
    }
  };

  const can = f.email && f.password && (!signup || (f.firstName.trim() && f.confirmPassword && privacy && health && ageGroup && ageGroup !== "under_13" && adultConfirmed && parentConfirmed));

  return (
    <Shell right={<Link to="/UsernameLogin" className="pf-btn small ghost" data-testid="link-username-login">Have a username and code?</Link>}>
      <main className="pf-narrow pf-rise" style={{ paddingTop: 24, paddingBottom: 60 }}>
        <p className="pf-eyebrow">{signup ? "Parent account" : "Welcome back"}</p>
        <h1 style={{ fontSize: "clamp(2rem,7vw,2.8rem)", margin: "8px 0 8px" }}>{signup ? "Start with one hard moment." : "Pick up where you left off."}</h1>
        <p style={{ color: "var(--pf-ink-soft)", marginBottom: 22 }}>
          {signup ? "No clinician and no documents needed. Tell us your first name and we will take it from there." : "Sign in with your email."}
        </p>
        <form onSubmit={submit} className="pf-card" style={{ display: "grid", gap: 16 }}>
          {signup && (
            <Field label="Your first name">
              <input className="pf-input" value={f.firstName} onChange={set("firstName")} autoComplete="given-name" data-testid="input-first-name" />
            </Field>
          )}
          <Field label="Email">
            <input className="pf-input" type="email" value={f.email} onChange={set("email")} autoComplete="email" data-testid="input-email" />
          </Field>
          <Field label="Password" hint={signup ? "At least 8 characters." : undefined}>
            <input className="pf-input" type="password" value={f.password} onChange={set("password")} autoComplete={signup ? "new-password" : "current-password"} data-testid="input-password" />
          </Field>
          {signup && (
            <>
              <Field label="Confirm password">
                <input className="pf-input" type="password" value={f.confirmPassword} onChange={set("confirmPassword")} autoComplete="new-password" data-testid="input-confirm-password" />
              </Field>
              <label style={{ display: "flex", gap: 10, fontSize: ".88rem" }}>
                <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} data-testid="checkbox-privacy" />
                <span>I have read the <Link to="/privacy" className="pf-link" target="_blank">privacy policy</Link> and agree to it.</span>
              </label>
              <label style={{ display: "flex", gap: 10, fontSize: ".88rem" }}>
                <input type="checkbox" checked={health} onChange={(e) => setHealth(e.target.checked)} data-testid="checkbox-health" />
                <span>I understand that electronic health information has risks, and I consent to NeuroPathways storing health-related information about my child that I choose to enter or upload.</span>
              </label>
              <SignupAuthorityFields role="parent_guardian" ageGroup={ageGroup} setAgeGroup={setAgeGroup} adultConfirmed={adultConfirmed} setAdultConfirmed={setAdultConfirmed} parentConfirmed={parentConfirmed} setParentConfirmed={setParentConfirmed} />
            </>
          )}
          <ErrorBox error={error} />
          <button className="pf-btn primary" disabled={!can || pending} data-testid="button-submit">
            {pending ? "One moment..." : signup ? "Create my account" : "Sign in"}
          </button>
        </form>
        <p style={{ marginTop: 18, fontSize: ".92rem" }}>
          {signup ? (
            <>Already have an account? <Link to="/ParentLogin" className="pf-link" data-testid="link-login">Sign in</Link></>
          ) : (
            <>New here? <Link to="/ParentSignup" className="pf-link" data-testid="link-signup">Create a free account</Link></>
          )}
        </p>
        <p style={{ marginTop: 10, fontSize: ".85rem", color: "var(--pf-ink-soft)" }}>Clinician? <Link to="/ClinicianLogin" className="pf-link" data-testid="link-clinician">Sign in here</Link></p>
      </main>
    </Shell>
  );
}
