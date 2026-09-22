import { useState } from "react";
import { base44 } from '@/api/entities';
import { Brain, ArrowLeft, Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { saveClientSession } from "@/lib/clientSession";
import { useAuth } from "@/lib/AuthContext";

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

      // Redirect to parent dashboard
      window.location.href = "/ParentDashboard";
    } catch {
      setError("Could not connect. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 font-inter">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <Brain className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-semibold text-foreground">NeuroPathways</span>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-foreground mb-1">Client Sign In</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Enter the username and access code provided by your clinician.
          </p>

          {isClinician && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3 mb-4">
              You're currently signed in as a clinician. Client sign-in is disabled here so your clinician session isn't lost.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                disabled={isClinician}
                onChange={e => setUsername(e.target.value)}
                placeholder="e.g. jsmith-2048"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="w-full min-h-[44px] border border-border rounded-xl px-4 py-2.5 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                Access Code
              </label>
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
                  className="w-full min-h-[44px] border border-border rounded-xl px-4 py-2.5 pr-12 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono tracking-widest"
                />
                <button
                  type="button"
                  onClick={() => setShowCode(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                >
                  {showCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-destructive/10 text-destructive text-sm rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full min-h-[44px] rounded-xl"
              disabled={isClinician || loading || !username.trim() || !accessCode.trim()}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in...
                </span>
              ) : "Sign In"}
            </Button>
          </form>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mt-4">
          <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider mb-2">Demo Accounts</p>
          <div className="space-y-1.5 text-xs text-amber-900 font-mono">
            {[
              { u: "rivera.parent", c: "DEMO01", label: "Rivera (ADHD + Dyslexia)" },
              { u: "nguyen.parent", c: "DEMO02", label: "Nguyen (Sensory)" },
              { u: "jordan.e",     c: "DEMO03", label: "Jordan (Anxiety)" },
              { u: "alex.m",       c: "DEMO04", label: "Alex (ADHD)" },
            ].map(d => (
              <button key={d.u} type="button" onClick={() => { setUsername(d.u); setAccessCode(d.c); }}
                className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-amber-100 transition-colors cursor-pointer">
                <span className="font-semibold">{d.u}</span> / <span>{d.c}</span>
                <span className="text-amber-700 font-sans text-[10px] ml-1.5">{d.label}</span>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-amber-600 mt-2">Tap an account to auto-fill, then press Sign In.</p>
        </div>

        <div className="mt-6 text-center space-y-3">
          <p className="text-xs text-muted-foreground">
            No account yet?{" "}
            <a href="/ParentSignup" className="text-primary hover:underline font-medium">
              Create one here
            </a>
          </p>
          <p className="text-xs text-muted-foreground">
            Are you a clinician?{" "}
            <button
              onClick={() => base44.auth.redirectToLogin("/RoleSetup")}
              className="text-primary hover:underline font-medium"
            >
              Sign in with email
            </button>
          </p>
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mx-auto"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
        </div>
      </motion.div>
    </div>
  );
}