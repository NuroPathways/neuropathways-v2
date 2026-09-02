import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from '@/api/entities';
import { Brain, Mail, User } from "lucide-react";
import { motion } from "framer-motion";

export default function ClientLogin() {
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

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 font-inter">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mb-4">
            <Brain className="w-8 h-8 text-primary-foreground" />
          </div>
          <div className="inline-block px-3 py-1 rounded-full bg-accent/10 text-accent text-xs font-semibold uppercase tracking-wider mb-2">Client / Parent Login</div>
          <h1 className="text-2xl font-semibold text-foreground mb-1">Welcome Back</h1>
          <p className="text-sm text-muted-foreground">Choose how you'd like to sign in</p>
        </div>

        <div className="space-y-3">
          {/* Username login */}
          <button
            onClick={() => navigate("/UsernameLogin")}
            className="w-full bg-primary text-primary-foreground rounded-2xl py-4 px-5 font-semibold text-base hover:bg-primary/90 transition-all flex items-center gap-3"
          >
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div className="text-left">
              <p className="font-semibold">Sign in with Username</p>
              <p className="text-xs font-normal text-white/80">Use the username your clinician gave you</p>
            </div>
          </button>

          {/* Email login */}
          <button
            onClick={() => base44.auth.redirectToLogin("/RoleSetup?role=parent")}
            className="w-full bg-card border-2 border-border text-foreground rounded-2xl py-4 px-5 font-semibold text-base hover:border-primary/50 transition-all flex items-center gap-3"
          >
            <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
              <Mail className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="text-left">
              <p className="font-semibold text-foreground">Sign in with Email</p>
              <p className="text-xs font-normal text-muted-foreground">Use your email address</p>
            </div>
          </button>
        </div>

        <button onClick={() => navigate("/")} className="mt-6 text-sm text-muted-foreground hover:text-foreground w-full text-center">
          ← Back to welcome page
        </button>
      </motion.div>
    </div>
  );
}