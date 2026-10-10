import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from '@/api/entities';
import { useAuth } from "@/lib/AuthContext";
import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import BrandMark from "@/components/brand/BrandMark";
import SignupAuthorityFields from "@/components/signup/SignupAuthorityFields";

// This page no longer asks the user to pick a role.
// The role comes from which login portal they used (?role=clinician or ?role=parent),
// or from an invite token. It sets everything up automatically and redirects.
export default function RoleSetup() {
  const [status, setStatus] = useState("Setting up your account...");
  const [invalidInvite, setInvalidInvite] = useState(false);
  const [signupRole, setSignupRole] = useState("");
  const [signupContext, setSignupContext] = useState(null);
  const [ageGroup, setAgeGroup] = useState("");
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [parentConfirmed, setParentConfirmed] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [submittingAuthority, setSubmittingAuthority] = useState(false);
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  const params = new URLSearchParams(window.location.search);
  const inviteToken = params.get("invite");
  const forceRole = params.get("role");

  const finishParent = async (me, family, authority = null) => {
    const updates = { app_role: "parent" };
    if (family) {
      // Only an invite can establish care-team relationships. Never accept
      // family/clinician identifiers from the URL or invent them for a
      // standalone parent account.
      updates.linked_family_id = family.id;
      updates.linked_clinician_id = family.clinician_id;
      updates.account_type = family.account_type || "parent_family";
      const kids = await base44.entities.Child.filter({ family_id: family.id }).catch(() => []);
      for (const kid of kids) {
        await base44.entities.Child.update(kid.id, { parent_id: me.id, parent_email: me.email }).catch(() => {});
      }
      await base44.entities.Family.update(family.id, { invite_status: "accepted" }).catch(() => {});
    } else {
      // OIDC parents can onboard independently; they do not need a clinic
      // invite and must start without fabricated relationship identifiers.
      updates.account_type = "parent_family";
    }
    if (authority) Object.assign(updates, authority);
    await base44.auth.updateMe(updates);
    await refreshUser();
    navigate("/ParentDashboard");
  };

  const finishClinician = async (authority = null) => {
    await base44.auth.updateMe({ app_role: "clinician", account_type: "clinician", ...(authority || {}) });
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
          setSignupRole("parent");
          setSignupContext({ me, family: families[0] });
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
        setSignupRole("clinician");
        setSignupContext({ me, family: null });
        return;
      }

      if (forceRole === "parent") {
        setSignupRole("parent");
        setSignupContext({ me, family: null });
        return;
      }

      setInvalidInvite(true);
    };
    init();
  }, [inviteToken, forceRole]);

  const submitAuthority = async (event) => {
    event.preventDefault();
    setSetupError("");
    if (!signupRole || !signupContext) return;
    if (!ageGroup || ageGroup === "under_13") {
      setSetupError(ageGroup === "under_13"
        ? "A parent or guardian must create this account. NeuroPathways does not allow children under 13 to create their own accounts."
        : "Select your age group before continuing.");
      return;
    }
    if (!adultConfirmed || (signupRole === "parent" && !parentConfirmed)) {
      setSetupError("Confirm the adult/guardian and child-profile authority statements to continue.");
      return;
    }
    const authority = {
      account_holder_type: signupRole === "parent" ? "parent_guardian" : "clinician",
      account_holder_age_group: ageGroup,
      adult_or_guardian_confirmed: true,
      ...(signupRole === "parent" ? { parent_guardian_authority_confirmed: true } : {}),
    };
    setSubmittingAuthority(true);
    try {
      if (signupRole === "clinician") await finishClinician(authority);
      else await finishParent(signupContext.me, signupContext.family, authority);
    } catch {
      setSetupError("We could not record your account details. Please try again.");
      setSubmittingAuthority(false);
    }
  };

  if (signupRole && signupContext) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4 font-inter">
        <motion.main initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg space-y-4 rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center"><BrandMark size={38} /></div>
            <div><p className="text-xs text-muted-foreground">NeuroPathways</p><h1 className="text-xl font-semibold text-foreground">Account holder details</h1></div>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">We ask for an age group and these statements to record who is creating the account. Children under 13 cannot create their own accounts.</p>
          <form onSubmit={submitAuthority} className="space-y-4">
            <SignupAuthorityFields role={signupRole === "parent" ? "parent_guardian" : "clinician"} ageGroup={ageGroup} setAgeGroup={setAgeGroup} adultConfirmed={adultConfirmed} setAdultConfirmed={setAdultConfirmed} parentConfirmed={parentConfirmed} setParentConfirmed={setParentConfirmed} />
            {setupError && <p role="alert" className="text-sm text-destructive">{setupError}</p>}
            <button type="submit" disabled={submittingAuthority || !ageGroup || ageGroup === "under_13" || !adultConfirmed || (signupRole === "parent" && !parentConfirmed)} className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-50">
              {submittingAuthority ? "Saving…" : "Continue"}
            </button>
          </form>
        </motion.main>
      </div>
    );
  }

  if (invalidInvite) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4 font-inter">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center max-w-md w-full">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <BrandMark size={60} />
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-5">
            <p className="text-sm font-semibold text-yellow-800 mb-1">Unable to set up this account</p>
            <p className="text-sm text-yellow-700">Client accounts require a parent/guardian or clinician invitation. Return to the correct signup page or contact your clinician.</p>
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
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <BrandMark size={60} />
        </div>
        <h1 className="text-xl font-semibold text-foreground mb-2">Welcome to NeuroPathways</h1>
        <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> {status}
        </p>
      </motion.div>
    </div>
  );
}