import { useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useCompletePasswordReset, useRequestPasswordReset } from "@workspace/api-client-react";
import { Button } from "@workspace/neuropathways-foundations/components/ui/button";
import { Input } from "@workspace/neuropathways-foundations/components/ui/input";
import { Label } from "@workspace/neuropathways-foundations/components/ui/label";
import { ArrowLeft, CheckCircle2, KeyRound, Loader2, Mail } from "lucide-react";
import { Shell } from "@/components/parentfree/common";

function getResetDetails() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return {
    token: params.get("token") || "",
    accountType: params.get("accountType") === "clinician" ? "clinician" : "parent",
  };
}

export default function PasswordRecovery() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isResetPage = location.pathname === "/ResetPassword";
  const resetDetails = getResetDetails();
  const [accountType, setAccountType] = useState(
    resetDetails.token
      ? resetDetails.accountType
      : searchParams.get("accountType") === "clinician" ? "clinician" : "parent",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [requestSent, setRequestSent] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const requestReset = useRequestPasswordReset();
  const completeReset = useCompletePasswordReset();
  const pending = requestReset.isPending || completeReset.isPending;
  const signInPath = accountType === "clinician" ? "/ClinicianLogin" : "/ParentLogin";

  const requestLink = async (event) => {
    event.preventDefault();
    setError("");
    try {
      await requestReset.mutateAsync({ data: { accountType, email: email.trim() } });
      setRequestSent(true);
    } catch {
      setError("We could not process that request right now. Please wait a moment and try again.");
    }
  };

  const setNewPassword = async (event) => {
    event.preventDefault();
    setError("");
    if (!resetDetails.token) {
      setError("This reset link is missing its token. Request a new password reset link.");
      return;
    }
    if (password.length < 8 || password.length > 128) {
      setError("Choose a password between 8 and 128 characters.");
      return;
    }
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    try {
      await completeReset.mutateAsync({
        data: { token: resetDetails.token, newPassword: password },
      });
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      setPassword("");
      setConfirmation("");
      setPasswordChanged(true);
    } catch {
      setError("This reset link is invalid or expired. Request a new link and try again.");
    }
  };

  return (
    <Shell>
      <main className="pf-narrow pf-rise" style={{ paddingTop: 24, paddingBottom: 56 }}>
        <section className="pf-card" style={{ maxWidth: 500, margin: "0 auto", padding: 24 }}>
          {isResetPage ? (
            passwordChanged ? (
              <div className="space-y-4 text-center" role="status">
                <CheckCircle2 className="mx-auto h-12 w-12 text-primary" aria-hidden="true" />
                <div>
                  <h1 className="text-2xl font-semibold">Password updated</h1>
                  <p className="mt-2 text-sm text-muted-foreground">Your existing sessions have been signed out. Sign in with your new password.</p>
                </div>
                <Button className="w-full min-h-11 rounded-xl" onClick={() => navigate(signInPath)}>
                  Go to sign in
                </Button>
              </div>
            ) : (
              <>
                <p className="pf-eyebrow">Account recovery</p>
                <h1 className="mt-2 text-2xl font-semibold">Create a new password</h1>
                <p className="mt-2 text-sm text-muted-foreground">Choose a secure password between 8 and 128 characters.</p>
                {!resetDetails.token && (
                  <p role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    This reset link is missing its token. Request a new link to continue.
                  </p>
                )}
                <form onSubmit={setNewPassword} className="mt-6 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">New password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      maxLength={128}
                      required
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      disabled={!resetDetails.token || pending}
                      className="min-h-11 rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm new password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      maxLength={128}
                      required
                      value={confirmation}
                      onChange={(event) => setConfirmation(event.target.value)}
                      disabled={!resetDetails.token || pending}
                      className="min-h-11 rounded-xl"
                    />
                  </div>
                  {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
                  <Button type="submit" className="w-full min-h-11 rounded-xl" disabled={!resetDetails.token || pending}>
                    {pending ? <><Loader2 className="h-4 w-4 animate-spin" /> Updating…</> : <><KeyRound className="h-4 w-4" /> Update password</>}
                  </Button>
                </form>
              </>
            )
          ) : requestSent ? (
            <div className="space-y-4 text-center" role="status">
              <Mail className="mx-auto h-12 w-12 text-primary" aria-hidden="true" />
              <div>
                <h1 className="text-2xl font-semibold">Check your email</h1>
                <p className="mt-2 text-sm text-muted-foreground">If an account matches that sign-in type, a reset link will be sent. The link expires in 30 minutes.</p>
              </div>
              <p className="text-sm text-muted-foreground">Replit sign-in passwords are managed by Replit. Family username and access-code accounts use the separate access-code reset.</p>
              <Button variant="outline" className="w-full min-h-11 rounded-xl" onClick={() => setRequestSent(false)}>Try another email</Button>
            </div>
          ) : (
            <>
              <p className="pf-eyebrow">Account recovery</p>
              <h1 className="mt-2 text-2xl font-semibold">Forgot your password?</h1>
              <p className="mt-2 text-sm text-muted-foreground">Enter the email address for your NeuroPathways email-and-password account.</p>
              <form onSubmit={requestLink} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="account-type">Account type</Label>
                  <select
                    id="account-type"
                    value={accountType}
                    onChange={(event) => setAccountType(event.target.value)}
                    className="pf-input min-h-11"
                    disabled={pending}
                  >
                    <option value="parent">Parent</option>
                    <option value="clinician">Clinician</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="recovery-email">Email</Label>
                  <Input
                    id="recovery-email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={pending}
                    className="min-h-11 rounded-xl"
                  />
                </div>
                {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full min-h-11 rounded-xl" disabled={pending || !email.trim()}>
                  {pending ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : "Send reset link"}
                </Button>
              </form>
              <p className="mt-4 text-sm text-muted-foreground">Replit sign-in passwords are managed by Replit. Family username and access-code accounts use the separate access-code reset.</p>
            </>
          )}
        </section>
        <Link to={signInPath} className="mx-auto mt-5 flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to sign in
        </Link>
      </main>
    </Shell>
  );
}
