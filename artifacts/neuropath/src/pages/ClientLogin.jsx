import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from '@/api/entities';
import { Mail, User, UserPlus } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { Shell } from "@/components/parentfree/common";

export default function ClientLogin() {
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (user?.invite_token) {
      navigate("/ClientHome", { replace: true });
      return;
    }
    base44.auth.isAuthenticated().then(async (authed) => {
      if (authed) {
        const user = await base44.auth.me();
        if (user.app_role === "parent") navigate("/ParentDashboard");
        else if (user.app_role === "clinician") navigate("/ClinicianDashboard");
        else navigate("/RoleSetup?role=parent");
      }
    });
  }, [user?.invite_token, navigate]);

  return (
    <Shell right={<Link to="/ClinicianLogin" className="pf-btn small ghost">Clinician sign in</Link>}>
      <main className="pf-narrow" style={{ paddingTop: 24, paddingBottom: 56 }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <p className="pf-eyebrow" style={{ marginBottom: 8 }}>Family portal</p>
        <h1 style={{ fontSize: "clamp(2rem,7vw,2.8rem)", margin: "8px 0" }}>Welcome back</h1>
        <p className="pf-hint" style={{ marginBottom: 18 }}>Choose how you’d like to sign in.</p>

        <div style={{ display: "grid", gap: 12 }}>
          {/* Username login */}
          <button
            onClick={() => navigate("/UsernameLogin")}
            className="pf-btn primary"
            style={{ width: "100%", justifyContent: "flex-start", minHeight: 76, borderRadius: 18, padding: "14px 18px", textAlign: "left" }}
          >
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div>
              <span style={{ display: "block", fontWeight: 700 }}>Sign in with username and access code</span>
              <small style={{ display: "block", fontWeight: 400, opacity: .9, marginTop: 3 }}>Use the login your clinician gave you</small>
            </div>
          </button>

          {/* Email login */}
          <button
            onClick={() => base44.auth.redirectToLogin("/RoleSetup?role=parent")}
            className="pf-card"
            style={{ width: "100%", minHeight: 76, display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit" }}
          >
            <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
              <Mail className="w-5 h-5 text-slate-600" />
            </div>
            <div>
              <span style={{ display: "block", fontWeight: 700 }}>Sign in with email</span>
              <small className="pf-hint" style={{ display: "block", marginTop: 3 }}>Use your existing email account</small>
            </div>
          </button>

          {/* New family account */}
          <button
            onClick={() => navigate("/ParentSignupUsername")}
            className="pf-card"
            style={{ width: "100%", minHeight: 76, display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit" }}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "var(--pf-sage)", color: "var(--pf-sage-ink)" }}>
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <small className="pf-hint" style={{ display: "block" }}>Don’t have an account?</small>
              <span style={{ display: "block", fontWeight: 700 }}>Create a family account</span>
            </div>
          </button>
        </div>

        <Link to="/" className="pf-link" style={{ display: "block", textAlign: "center", marginTop: 20 }}>Back to welcome page</Link>
      </motion.div>
      </main>
    </Shell>
  );
}