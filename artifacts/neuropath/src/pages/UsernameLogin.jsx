import { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from '@/api/entities';
import { Loader2, Eye, EyeOff } from "lucide-react";
import { motion } from "framer-motion";
import { saveClientSession } from "@/lib/clientSession";
import { useAuth } from "@/lib/AuthContext";
import { Shell, Field, ErrorBox } from "@/components/parentfree/common";

export default function UsernameLogin() {
  const { user, isAuthenticated } = useAuth();
  const isClinician = isAuthenticated && (user?.app_role === "clinician" || user?.role === "admin") && !user?.client_session;
  const [username, setUsername] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !accessCode.trim()) return;
    if (isClinician) {
      setError("You're signed in as a clinician. Sign out first to log in as a client.");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const res = await base44.functions.invoke("verifyClientCredentials", {
        username: username.trim(),
        access_code: accessCode.trim(),
      });

      const { session, error: apiError } = res.data;

      if (apiError || !session) {
        setError(apiError || "Invalid username or access code.");
        setLoading(false);
        return;
      }

      // Store client session in localStorage — bypasses Base44 auth
      saveClientSession(session);

      // Existing accounts keep their client session and records, but use the
      // current client home instead of the legacy parent dashboard.
      window.location.href = "/ClientHome";
    } catch {
      setError("Could not connect. Please try again.");
      setLoading(false);
    }
  };

  return (
    <Shell right={<Link to="/ClientLogin" className="pf-btn small ghost">Sign-in options</Link>}>
    <main className="pf-narrow" style={{ paddingTop: 24, paddingBottom: 56 }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="pf-eyebrow">Existing client account</div>
        <h1 style={{ fontSize: "clamp(2rem,7vw,2.8rem)", margin: "8px 0" }}>Client sign in</h1>
        <p className="pf-hint" style={{ marginBottom: 18 }}>
            Enter the username and access code provided by your clinician.
        </p>

          {isClinician && (
            <div className="pf-error" style={{ marginBottom: 14 }}>
              You're currently signed in as a clinician. Client sign-in is disabled here so your clinician session isn't lost.
            </div>
          )}

          <form onSubmit={handleSubmit} className="pf-card" style={{ display: "grid", gap: 14 }}>
            <Field label="Username">
              <input
                type="text"
                value={username}
                disabled={isClinician}
                onChange={e => setUsername(e.target.value)}
                placeholder="e.g. jsmith-2048"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="username"
                className="pf-input"
                data-testid="input-client-username"
              />
            </Field>

            <Field label="Access code">
              <div className="relative">
                <input
                  type={showCode ? "text" : "password"}
                  value={accessCode}
                  disabled={isClinician}
                  onChange={e => setAccessCode(e.target.value)}
                  placeholder="e.g. AB3X7Q"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete="current-password"
                  className="pf-input pr-12 font-mono tracking-widest"
                  data-testid="input-client-access-code"
                />
                <button
                  type="button"
                  aria-label={showCode ? "Hide access code" : "Show access code"}
                  onClick={() => setShowCode(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-2"
                >
                  {showCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </Field>

            <ErrorBox error={error} />

            <button
              type="submit"
              className="pf-btn primary"
              style={{ width: "100%" }}
              disabled={isClinician || loading || !username.trim() || !accessCode.trim()}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in...
                </span>
              ) : "Sign In"}
            </button>
          </form>

        <div className="pf-card sun" style={{ padding: 16, marginTop: 14 }}>
          <p className="pf-eyebrow" style={{ marginBottom: 8 }}>Demo accounts</p>
          <div style={{ display: "grid", gap: 4, fontSize: ".78rem" }}>
            {[
              { u: "rivera.parent", c: "DEMO01", label: "Rivera (ADHD + Dyslexia)" },
              { u: "nguyen.parent", c: "DEMO02", label: "Nguyen (Sensory)" },
              { u: "jordan.e",     c: "DEMO03", label: "Jordan (Anxiety)" },
              { u: "alex.m",       c: "DEMO04", label: "Alex (ADHD)" },
            ].map(d => (
              <button key={d.u} type="button" onClick={() => { setUsername(d.u); setAccessCode(d.c); }}
                className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/70 transition-colors cursor-pointer">
                <span style={{ fontWeight: 700 }}>{d.u}</span> / <span>{d.c}</span>
                <span style={{ color: "var(--pf-ink-soft)", fontSize: ".7rem", marginLeft: 6 }}>{d.label}</span>
              </button>
            ))}
          </div>
          <p className="pf-hint" style={{ fontSize: ".7rem", marginTop: 8 }}>Select an account to fill the form, then sign in.</p>
        </div>

        <div style={{ marginTop: 18, display: "grid", gap: 10, textAlign: "center" }}>
          <p className="pf-hint">
            No account yet?{" "}
            <Link to="/ParentSignupUsername" className="pf-link">
              Create one here
            </Link>
          </p>
          <p className="pf-hint">
            Are you a clinician?{" "}
            <button
              onClick={() => base44.auth.redirectToLogin("/RoleSetup")}
              className="pf-link"
            >
              Sign in with email
            </button>
          </p>
          <Link to="/" className="pf-link">Back to NeuroPathways</Link>
        </div>
      </motion.div>
    </main>
    </Shell>
  );
}