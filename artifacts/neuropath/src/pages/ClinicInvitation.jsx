import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, KeyRound, ShieldCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import { useAcceptClinicInvitation, useLoginClinician, useRegisterClinician } from "@workspace/api-client-react";
import { Button } from "@workspace/neuropathways-foundations/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/neuropathways-foundations/components/ui/card";
import { Input } from "@workspace/neuropathways-foundations/components/ui/input";
import { Label } from "@workspace/neuropathways-foundations/components/ui/label";
import { PageHeader, SectionHeading } from "@workspace/neuropathways-foundations/components/ui/page-header";
import { Checkbox } from "@workspace/neuropathways-foundations/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/neuropathways-foundations/components/ui/select";
import { StatusBadge } from "@workspace/neuropathways-foundations/components/ui/status-badge";
import { Form } from "@/components/ui/form";
import { useAuth } from "@/lib/AuthContext";
import { getApiMessage } from "@/lib/clinicOnboarding";
import "@workspace/neuropathways-foundations/scoped.css";
import "../clinic-onboarding.css";

function parseInvitationToken(fragment) {
  const raw = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  const params = new URLSearchParams(raw);
  if (params.get("token")) return params.get("token");
  if (!raw || raw.includes("=")) return "";
  try { return decodeURIComponent(raw); } catch { return ""; }
}

function invitationErrorMessage(error, token) {
  const message = getApiMessage(error);
  const safeMessage = token ? message.split(token).join("[hidden]") : message;
  const lower = safeMessage.toLowerCase();
  if (lower.includes("expired")) return `This invitation has expired. Ask your clinic administrator to issue a new invitation. ${safeMessage}`;
  if (lower.includes("revoked") || lower.includes("superseded")) return `This invitation is no longer active. Ask your clinic administrator for a current invitation. ${safeMessage}`;
  if (lower.includes("email") || lower.includes("match") || lower.includes("account")) return `The signed-in account does not match this invitation. Sign in with the invited email address. ${safeMessage}`;
  return safeMessage;
}

export default function ClinicInvitation() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [invitationToken, setInvitationToken] = useState("");
  const [mode, setMode] = useState("login");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [ageGroup, setAgeGroup] = useState("18_plus");
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const tokenRead = useRef(false);
  const loginForm = useForm({ defaultValues: { email: "", password: "" } });
  const registerForm = useForm({ defaultValues: { email: "", password: "", firstName: "", lastName: "" } });
  const login = useLoginClinician();
  const register = useRegisterClinician();
  const accept = useAcceptClinicInvitation();
  const busy = login.isPending || register.isPending || accept.isPending;

  useEffect(() => {
    if (tokenRead.current) return;
    tokenRead.current = true;
    const token = parseInvitationToken(window.location.hash);
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
    setInvitationToken(token);
    if (!token) setError("This invitation link does not contain a valid invitation token. Open the full link from your clinic invitation email.");
  }, []);

  const acceptInvitation = (token) => {
    accept.mutate({ data: { token } }, {
      onSuccess: async (result) => {
        setInvitationToken("");
        const user = await refreshUser();
        setNotice(`Invitation accepted for ${result.clinicName}. Your clinic access is ready.`);
        if (result.role === "clinic_admin") navigate("/ClinicianUsers", { replace: true });
        else if (result.role === "treating_clinician") navigate("/ClinicianDashboard", { replace: true });
        else if (user) navigate("/ClinicianDashboard", { replace: true });
      },
      onError: (reason) => setError(invitationErrorMessage(reason, token)),
    });
  };

  const submitLogin = loginForm.handleSubmit(({ email, password }) => {
    if (!invitationToken) {
      setError("The invitation token is unavailable. Reopen the current invitation link.");
      return;
    }
    setError(""); setNotice("");
    login.mutate({ data: { email, password, invitationToken } }, {
      onSuccess: () => acceptInvitation(invitationToken),
      onError: (reason) => setError(invitationErrorMessage(reason, invitationToken)),
    });
  });

  const submitRegistration = registerForm.handleSubmit(({ email, password, firstName, lastName }) => {
    if (!invitationToken) {
      setError("The invitation token is unavailable. Reopen the current invitation link.");
      return;
    }
    if (!adultConfirmed) {
      setError("Confirm that you are an adult or have guardian confirmation before continuing.");
      return;
    }
    setError(""); setNotice("");
    register.mutate({ data: {
      email, password, firstName, lastName,
      accountHolderType: "clinician",
      accountHolderAgeGroup: ageGroup,
      adultOrGuardianConfirmed: true,
    } }, {
      onSuccess: () => {
        loginForm.setValue("email", email);
        loginForm.setValue("password", password);
        setMode("login");
        setNotice("Clinician account created and is pending. Sign in with the invited email and the password you just created to finish accepting the invitation.");
      },
      onError: (reason) => setError(invitationErrorMessage(reason, invitationToken)),
    });
  });

  return (
    <main className="np-foundations np-invitation-page">
      <div className="np-invitation-shell">
        <PageHeader title="Accept clinic invitation" context="NeuroPathways · Clinician access" description="Use the email address that received this invitation. We will confirm the match before clinic access is granted." data-testid="header-clinic-invitation" />
        <Card className="np-onboarding-card">
          <CardHeader>
            <div className="np-invitation-heading">
              <div className="np-invitation-icon" aria-hidden="true"><KeyRound /></div>
              <div><CardTitle className="np-card-title">Secure invitation sign-in</CardTitle><p className="np-muted">Invitation credentials are handled securely and are not shown on this page.</p></div>
            </div>
          </CardHeader>
          <CardContent className="np-invitation-form-content">
            {notice && <p role="status" className="np-feedback" data-testid="status-invitation-feedback"><CheckCircle2 aria-hidden="true" />{notice}</p>}
            {error && <p role="alert" className="np-feedback np-feedback-error" data-testid="status-invitation-error">{error}</p>}
            {!invitationToken ? <div className="np-empty-panel" data-testid="empty-invitation-token"><p>Invitation token not found in this link. Request a new email if needed.</p></div> : <>
              <div className="np-mode-switch" role="group" aria-label="Choose account action">
                <Button type="button" variant={mode === "login" ? "default" : "outline"} onClick={() => { setMode("login"); setError(""); }} data-testid="button-mode-login">Sign in</Button>
                <Button type="button" variant={mode === "register" ? "default" : "outline"} onClick={() => { setMode("register"); setError(""); }} data-testid="button-mode-register">Create account</Button>
              </div>
              {mode === "login" ? (
                <Form {...loginForm}>
                  <form onSubmit={submitLogin} className="np-form-grid" data-testid="form-invitation-login">
                    <SectionHeading title="Sign in to accept" description="Use your existing clinician account and the invited email address." />
                    <div className="np-field"><Label htmlFor="invite-login-email">Email</Label><Input id="invite-login-email" type="email" autoComplete="email" required data-testid="input-invite-login-email" {...loginForm.register("email", { required: "Enter the email address from the invitation." })} /></div>
                    <div className="np-field"><Label htmlFor="invite-login-password">Password</Label><Input id="invite-login-password" type="password" autoComplete="current-password" required data-testid="input-invite-login-password" {...loginForm.register("password", { required: "Enter your password." })} /></div>
                    <Button type="submit" disabled={busy} data-testid="button-invitation-sign-in">{busy ? "Checking invitation…" : "Sign in and accept invitation"}</Button>
                  </form>
                </Form>
              ) : (
                <Form {...registerForm}>
                  <form onSubmit={submitRegistration} className="np-form-grid" data-testid="form-invitation-register">
                    <SectionHeading title="Create a clinician account" description="Registration creates a pending account. Sign in next to complete the invitation acceptance." />
                    <div className="np-field"><Label htmlFor="invite-first-name">First name</Label><Input id="invite-first-name" autoComplete="given-name" required data-testid="input-invite-first-name" {...registerForm.register("firstName", { required: "Enter your first name." })} /></div>
                    <div className="np-field"><Label htmlFor="invite-last-name">Last name</Label><Input id="invite-last-name" autoComplete="family-name" required data-testid="input-invite-last-name" {...registerForm.register("lastName", { required: "Enter your last name." })} /></div>
                    <div className="np-field"><Label htmlFor="invite-register-email">Invited email</Label><Input id="invite-register-email" type="email" autoComplete="email" required data-testid="input-invite-register-email" {...registerForm.register("email", { required: "Enter the invited email address." })} /></div>
                    <div className="np-field"><Label htmlFor="invite-register-password">Password</Label><Input id="invite-register-password" type="password" autoComplete="new-password" minLength={8} required data-testid="input-invite-register-password" {...registerForm.register("password", { required: "Create a password.", minLength: 8 })} /></div>
                    <div className="np-field"><Label htmlFor="invite-age-group">Age group</Label><Select value={ageGroup} onValueChange={setAgeGroup}><SelectTrigger id="invite-age-group" className="np-select-trigger" data-testid="select-invite-age-group"><SelectValue placeholder="Select an age group" /></SelectTrigger><SelectContent><SelectItem value="18_plus">18 or older</SelectItem><SelectItem value="13_17">13 to 17</SelectItem></SelectContent></Select></div>
                    <label className="np-confirmation"><Checkbox checked={adultConfirmed} onCheckedChange={(checked) => setAdultConfirmed(checked === true)} data-testid="checkbox-adult-confirmation" /> <span>I am an adult or have appropriate guardian confirmation.</span></label>
                    <Button type="submit" disabled={busy} data-testid="button-create-invited-account">{register.isPending ? "Creating account…" : "Create pending account"}</Button>
                  </form>
                </Form>
              )}
            </>}
            <div className="np-invitation-security"><ShieldCheck aria-hidden="true" /><span>Clinic membership is assigned only after the server verifies the account and invitation.</span><StatusBadge tone="outline" data-testid="status-invitation-secure">Secure acceptance</StatusBadge></div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
