import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from '@/api/entities';
import { Brain } from "lucide-react";
import { motion } from "framer-motion";

export default function ParentLogin() {
  const navigate = useNavigate();

  useEffect(() => {
    base44.auth.isAuthenticated().then(async (authed) => {
      if (authed) {
        const user = await base44.auth.me();
        if (user.app_role === "parent") navigate("/ParentDashboard");
        else if (user.app_role === "clinician") navigate("/ClinicianDashboard");
        else navigate("/RoleSetup?role=parent");
      }
    });
  }, []);

  const handleLogin = () => {
    base44.auth.redirectToLogin("/RoleSetup?role=parent");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 font-inter">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4">
          <Brain className="w-8 h-8 text-primary-foreground" />
        </div>
        <div className="inline-block px-3 py-1 rounded-full bg-accent/10 text-accent text-xs font-semibold uppercase tracking-wider mb-3">Parent Login</div>
        <h1 className="text-2xl font-semibold text-foreground mb-2">Parent Sign In</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Access your family dashboard and behavioral guidance. Parents can create an account without a clinic invite.
        </p>
        <div className="space-y-3">
          <button
            onClick={() => navigate("/UsernameLogin")}
            className="w-full bg-primary text-primary-foreground rounded-2xl py-4 font-semibold text-base hover:bg-primary/90 transition-all"
          >
            Sign In with Username
          </button>
          <button
            onClick={handleLogin}
            className="w-full bg-card text-foreground border border-border rounded-2xl py-4 font-semibold text-base hover:bg-muted transition-all"
          >
            Sign In with Email
          </button>
          <button
            onClick={() => navigate("/ParentSignup")}
            className="w-full bg-primary/10 text-primary border border-primary/20 rounded-2xl px-4 py-4 hover:bg-primary/15 transition-all"
          >
            <span className="block text-sm text-muted-foreground">Don&apos;t have an account?</span>
            <span className="block text-base font-semibold mt-0.5">Sign up now</span>
          </button>
        </div>
        <button onClick={() => navigate("/")} className="mt-5 text-sm text-muted-foreground hover:text-foreground">
          ← Back to welcome page
        </button>
      </motion.div>
    </div>
  );
}