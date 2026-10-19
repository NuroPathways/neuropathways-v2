import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from '@/api/entities';
import { useAuth } from '@/lib/AuthContext';
import { Mail, Lock, Eye, EyeOff, User, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shell } from "@/components/parentfree/common";
import SignupAuthorityFields from "@/components/signup/SignupAuthorityFields";

export default function ClinicianLogin() {
  const navigate = useNavigate();
  const { checkUserAuth } = useAuth();
  const [mode, setMode] = useState("choose"); // "choose" | "email-login" | "email-register"
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ email: "", password: "", firstName: "", lastName: "" });
  const [ageGroup, setAgeGroup] = useState("");
  const [adultConfirmed, setAdultConfirmed] = useState(false);

  useEffect(() => {
    base44.auth.isAuthenticated().then(async (authed) => {
      if (authed) {
        const user = await base44.auth.me();
        if (user.app_role === "clinician") navigate("/ClinicianDashboard");
        else if (user.app_role === "parent") navigate("/ParentDashboard");
        else navigate("/RoleSetup?role=clinician");
      }
    });
  }, []);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/clinician/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, password: form.password }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setError(data.error || "Login failed"); setLoading(false); return; }
      await checkUserAuth();
      navigate("/ClinicianDashboard");
    } catch {
      setError("Network error — please try again.");
    }
    setLoading(false);
  };

  const handleEmailRegister = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    if (!ageGroup || ageGroup === "under_13" || !adultConfirmed) {
      setError(ageGroup === "under_13"
        ? "A parent or guardian must create this account. NeuroPathways does not allow children under 13 to create their own accounts."
        : "Select your age group and confirm the adult/guardian statement to continue.");
      setLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/clinician/register", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, password: form.password, firstName: form.firstName, lastName: form.lastName, accountHolderType: "clinician", accountHolderAgeGroup: ageGroup, adultOrGuardianConfirmed: adultConfirmed }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setError(data.error || "Registration failed"); setLoading(false); return; }
      await checkUserAuth();
      navigate("/ClinicianDashboard");
    } catch {
      setError("Network error — please try again.");
    }
    setLoading(false);
  };

  return (
    <Shell right={<Link to="/UsernameLogin" className="pf-btn small ghost">Client sign in</Link>}>
    <main className="pf-narrow" style={{ paddingTop: 24, paddingBottom: 56 }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">

        <div className="text-center mb-8">
          <p className="pf-eyebrow" style={{ marginBottom: 8 }}>Clinician portal</p>
          <h1 style={{ fontSize: "clamp(2rem,7vw,2.8rem)", margin: "8px 0" }}>Welcome back</h1>
          <p className="pf-hint">Sign in to access your clinical dashboard.</p>
        </div>

        <div className="pf-card" style={{ display: "grid", gap: 14 }}>

          {/* Email / Password Login */}
          <AnimatePresence mode="wait">
            {mode === "choose" && (
              <motion.div key="choose" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                <Button
                  className="w-full rounded-xl py-5 font-semibold text-sm gap-2"
                  onClick={() => setMode("email-login")}
                >
                  <Mail className="w-4 h-4" /> Sign In with Email
                </Button>
                <Button
                  variant="outline"
                  className="w-full rounded-xl py-5 font-semibold text-sm gap-2"
                  onClick={() => setMode("email-register")}
                >
                  <User className="w-4 h-4" /> Create New Account
                </Button>

              </motion.div>
            )}

            {mode === "email-login" && (
              <motion.form key="email-login" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} onSubmit={handleEmailLogin} className="space-y-4">
                <button type="button" onClick={() => { setMode("choose"); setError(""); }} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2">
                  ← Back
                </button>
                <h2 className="font-semibold text-foreground">Sign In</h2>

                <div>
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email</Label>
                  <Input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="you@clinic.com" required className="mt-1.5 rounded-xl" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Password</Label>
                  <div className="relative mt-1.5">
                    <Input type={showPassword ? "text" : "password"} value={form.password} onChange={e => set("password", e.target.value)} placeholder="••••••••" required className="rounded-xl pr-10" />
                    <button type="button" onClick={() => setShowPassword(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <p className="-mt-2 text-right text-sm">
                  <Link to="/ForgotPassword?accountType=clinician" className="text-primary font-medium hover:underline" data-testid="link-clinician-forgot-password">Forgot your password?</Link>
                </p>

                {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

                <Button type="submit" className="w-full rounded-xl py-5 font-semibold" disabled={loading}>
                  {loading ? "Signing in…" : "Sign In"}
                </Button>

                <p className="text-xs text-center text-muted-foreground">
                  No account yet?{" "}
                  <button type="button" onClick={() => { setMode("email-register"); setError(""); }} className="text-primary font-medium hover:underline">
                    Create one
                  </button>
                </p>
              </motion.form>
            )}

            {mode === "email-register" && (
              <motion.form key="email-register" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} onSubmit={handleEmailRegister} className="space-y-4">
                <button type="button" onClick={() => { setMode("choose"); setError(""); }} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2">
                  ← Back
                </button>
                <h2 className="font-semibold text-foreground">Create Account</h2>
                <SignupAuthorityFields role="clinician" ageGroup={ageGroup} setAgeGroup={setAgeGroup} adultConfirmed={adultConfirmed} setAdultConfirmed={setAdultConfirmed} parentConfirmed={false} setParentConfirmed={() => {}} />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">First Name</Label>
                    <Input value={form.firstName} onChange={e => set("firstName", e.target.value)} placeholder="First" required className="mt-1.5 rounded-xl" />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Last Name</Label>
                    <Input value={form.lastName} onChange={e => set("lastName", e.target.value)} placeholder="Last" required className="mt-1.5 rounded-xl" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Work Email</Label>
                  <Input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="you@clinic.com" required className="mt-1.5 rounded-xl" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Password</Label>
                  <div className="relative mt-1.5">
                    <Input type={showPassword ? "text" : "password"} value={form.password} onChange={e => set("password", e.target.value)} placeholder="At least 8 characters" required className="rounded-xl pr-10" />
                    <button type="button" onClick={() => setShowPassword(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

                <Button type="submit" className="w-full rounded-xl py-5 font-semibold" disabled={loading}>
                  {loading ? "Creating account…" : "Create Account"}
                </Button>

                <p className="text-xs text-center text-muted-foreground">
                  Already have an account?{" "}
                  <button type="button" onClick={() => { setMode("email-login"); setError(""); }} className="text-primary font-medium hover:underline">
                    Sign in
                  </button>
                </p>
              </motion.form>
            )}
          </AnimatePresence>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mt-4">
          <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider mb-2">Demo Account</p>
          <button type="button" onClick={() => { setMode("email-login"); setForm(f => ({ ...f, email: "demo@neuropathways.app", password: "Demo2026!np" })); }}
            className="w-full text-left px-3 py-2 rounded-lg hover:bg-amber-100 transition-colors cursor-pointer text-xs font-mono text-amber-900">
            <span className="font-semibold">demo@neuropathways.app</span> / <span>Demo2026!np</span>
            <span className="text-amber-700 font-sans text-[10px] ml-1.5">Dr. Sarah Chen — 4 families, 5 clients</span>
          </button>
          <p className="text-[10px] text-amber-600 mt-2">Tap to auto-fill, then press Sign In.</p>
        </div>

        <button onClick={() => navigate("/")} className="pf-link" style={{ margin: "18px auto 0", display: "block" }}>
          ← Back to welcome page
        </button>
      </motion.div>
    </main>
    </Shell>
  );
}
