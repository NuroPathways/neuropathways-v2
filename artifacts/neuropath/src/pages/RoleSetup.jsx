import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from '@/api/entities';
import { useAuth } from "@/lib/AuthContext";
import { Brain, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

// This page no longer asks the user to pick a role.
// The role comes from which login portal they used (?role=clinician or ?role=parent),
// or from an invite token. It sets everything up automatically and redirects.
export default function RoleSetup() {
  const [status, setStatus] = useState("Setting up your account...");
  const [invalidInvite, setInvalidInvite] = useState(false);
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  const params = new URLSearchParams(window.location.search);
  const inviteToken = params.get("invite");
  const forceRole = params.get("role");

  const finishParent = async (me, family) => {
    const updates = { app_role: "parent" };
    if (family) {
      updates.linked_family_id = family.id;
      updates.linked_clinician_id = family.clinician_id;
      updates.account_type = family.account_type || "parent_family";
      const kids = await base44.entities.Child.filter({ family_id: family.id }).catch(() => []);
      for (const kid of kids) {
        await base44.entities.Child.update(kid.id, { parent_id: me.id, parent_email: me.email }).catch(() => {});
      }
      await base44.entities.Family.update(family.id, { invite_status: "accepted" }).catch(() => {});
    }
    await base44.auth.updateMe(updates);
    await refreshUser();
    navigate("/ParentDashboard");
  };

  const finishClinician = async () => {
    await base44.auth.updateMe({ app_role: "clinician", account_type: "clinician" });
    await refreshUser();
    navigate("/ClinicianDashboard");
  };

  useEffect(() => {
    const init = async () => {
      const me = await base44.auth.me().catch(() => null);
      if (!me) {
        base44.auth.redirectToLogin(window.location.href);
        return;
      }

      // ── Invite link flow (always means client/parent) ──
      if (inviteToken) {
        const families = await base44.entities.Family.filter({ invite_token: inviteToken }).catch(() => []);
        if (families[0]) {
          setStatus("Linking your account to your care profile...");
          await finishParent(me, families[0]);
          return;
        }
        // Invalid token — if they already have a role, just route them
        if (me.app_role === "clinician") { navigate("/ClinicianDashboard"); return; }
        if (me.app_role === "parent") { navigate("/ParentDashboard"); return; }
        setInvalidInvite(true);
        return;
      }

      // ── Existing users go straight to their dashboard ──
      if (me.app_role === "clinician") { navigate("/ClinicianDashboard"); return; }
      if (me.app_role === "parent") { navigate("/ParentDashboard"); return; }

      // ── New users: role comes from the portal they signed in through ──
      if (forceRole === "clinician") {
        setStatus("Creating your clinician account...");
        await finishClinician();
        return;
      }

      // Default: anyone coming from the client portal (or with no role param) is a client/parent
      setStatus("Creating your account...");
      await finishParent(me, null);
    };
    init();
  }, [inviteToken, forceRole]);

  if (invalidInvite) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4 font-inter">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center max-w-md w-full">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4">
            <Brain className="w-8 h-8 text-primary-foreground" />
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-5">
            <p className="text-sm font-semibold text-yellow-800 mb-1">Invalid or expired invite link</p>
            <p className="text-sm text-yellow-700">Please contact your clinician for a new invitation.</p>
          </div>
          <button onClick={() => navigate("/")} className="mt-6 text-sm text-muted-foreground hover:text-foreground">
            ← Back to welcome page
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 font-inter">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-5">
          <Brain className="w-8 h-8 text-primary-foreground" />
        </div>
        <h1 className="text-xl font-semibold text-foreground mb-2">Welcome to NeuroPathways</h1>
        <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> {status}
        </p>
      </motion.div>
    </div>
  );
}