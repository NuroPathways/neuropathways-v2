import { useState, useEffect } from "react";
import { base44 } from '@/api/entities';
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, ShieldAlert, Wind, X, ChevronRight, Loader2, Phone } from "lucide-react";
import BehaviorSelector from "./BehaviorSelector";
import CrisisPlan from "./CrisisPlan";
import CalmDownTool from "./CalmDownTool";

// Used as a fallback when sessionStorage is unavailable, and for legacy
// authenticated users who do not have a client invite token.
const shownThisLoad = new Set();

const splitGuidance = (value) => String(value || "")
  .split(/\n+|(?=\d+\.\s)/)
  .map((item) => item.replace(/^\d+\.\s*/, "").trim())
  .filter(Boolean);

const behaviorFromPlan = (plan) => ({
  name: plan.behavior_name || plan.behaviorName || "Behavior support",
  emoji: "📋",
  what_may_be_happening: plan.behavior_description || plan.behaviorDescription || plan.behavior_function || plan.behaviorFunction,
  interventions: splitGuidance(plan.strategy_steps || plan.strategySteps),
  if_it_escalates: splitGuidance(plan.deescalation_steps || plan.deescalationSteps),
  avoid: splitGuidance(plan.avoid_actions || plan.avoidActions),
  prevention_tips: splitGuidance(plan.common_triggers || plan.commonTriggers),
  reinforcement_rewards: splitGuidance(plan.reinforcement_method || plan.reinforcementMethod),
});

const SUPPORT_POPUP_DISMISSED_KEY = "np_support_popup_dismissed";

function ChildSelector({ children, selectedChildId, onSelect, onContinue, onDismiss }) {
  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h2 className="text-xl font-bold text-foreground mb-1">Who do you need help with?</h2>
          <p className="text-sm text-muted-foreground">Choose a child to see the right support plan.</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Close support"
          className="min-w-[40px] min-h-[40px] flex items-center justify-center text-muted-foreground hover:text-foreground rounded-xl hover:bg-muted transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="space-y-3 mt-5">
        {children.map((child) => (
          <button
            type="button"
            key={child.id}
            onClick={() => onSelect(child.id)}
            aria-pressed={selectedChildId === child.id}
            className={`w-full flex items-center justify-between bg-card border-2 rounded-2xl p-4 text-left transition-all group ${selectedChildId === child.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-primary font-bold text-base">{(child.child_name || child.childName || child.name)?.[0]?.toUpperCase() || "?"}</span>
              </div>
              <div>
                <p className="font-semibold text-foreground">{child.child_name || child.childName || child.name || "Child"}</p>
                {child.diagnosis && <p className="text-xs text-muted-foreground">{child.diagnosis}</p>}
              </div>
            </div>
            {selectedChildId === child.id
              ? <span className="text-xs font-semibold text-primary">Selected</span>
              : <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />}
          </button>
        ))}
      </div>
      {children.length === 0 && (
        <p role="status" className="text-sm text-muted-foreground mt-5">No child profile is connected to this sign-in. Please contact your care team.</p>
      )}
      <button
        type="button"
        onClick={onContinue}
        disabled={!selectedChildId}
        className="w-full mt-5 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Continue to support options
      </button>
    </div>
  );
}

function MainMenu({ child, onSelect, onDismiss, isIndividual }) {
  const name = child?.child_name;
  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h2 className="text-2xl font-bold text-foreground leading-tight">Need support right now?</h2>
          {name && (
            <p className="text-sm text-muted-foreground mt-1">For: <span className="font-semibold text-foreground">{name}</span></p>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="min-w-[40px] min-h-[40px] flex items-center justify-center text-muted-foreground hover:text-foreground rounded-xl hover:bg-muted transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <p className="text-sm text-muted-foreground mb-6">Choose what you need — all guidance comes from {name ? `${name}'s` : isIndividual ? "your" : "the child's"} clinician-approved plans.</p>

      <div className="space-y-3">
        <button
          onClick={() => onSelect("behavior")}
          className="w-full flex items-center gap-4 bg-orange-50 border-2 border-orange-200 hover:border-orange-400 rounded-2xl p-5 text-left transition-all group"
        >
          <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-6 h-6 text-orange-600" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-orange-900 text-base">Help With a Behavior</p>
            <p className="text-xs text-orange-700 mt-0.5">Step-by-step guidance from the treatment plan</p>
          </div>
          <ChevronRight className="w-5 h-5 text-orange-400 group-hover:text-orange-600 transition-colors" />
        </button>

        <button
          onClick={() => onSelect("crisis")}
          className="w-full flex items-center gap-4 bg-red-50 border-2 border-red-200 hover:border-red-400 rounded-2xl p-5 text-left transition-all group"
        >
          <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
            <ShieldAlert className="w-6 h-6 text-red-600" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-red-900 text-base">Safety / Crisis Plan</p>
            <p className="text-xs text-red-700 mt-0.5">Immediate safety steps from the safety plan</p>
          </div>
          <ChevronRight className="w-5 h-5 text-red-400 group-hover:text-red-600 transition-colors" />
        </button>

        <button
          onClick={() => onSelect("calm")}
          className="w-full flex items-center gap-4 bg-teal-50 border-2 border-teal-200 hover:border-teal-400 rounded-2xl p-5 text-left transition-all group"
        >
          <div className="w-12 h-12 rounded-xl bg-teal-100 flex items-center justify-center flex-shrink-0">
            <Wind className="w-6 h-6 text-teal-600" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-teal-900 text-base">Calm Down First</p>
            <p className="text-xs text-teal-700 mt-0.5">Breathing, grounding, and co-regulation tools</p>
          </div>
          <ChevronRight className="w-5 h-5 text-teal-400 group-hover:text-teal-600 transition-colors" />
        </button>

        <button
          onClick={onDismiss}
          className="w-full flex items-center gap-4 bg-muted border-2 border-border hover:border-muted-foreground/30 rounded-2xl p-5 text-left transition-all group"
        >
          <div className="flex-1">
            <p className="font-bold text-foreground text-base">I'm Okay — Go to Dashboard</p>
            <p className="text-xs text-muted-foreground mt-0.5">Continue to your regular dashboard</p>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
        </button>
      </div>

      <div className="mt-6 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
        <Phone className="w-4 h-4 text-red-600 flex-shrink-0" />
        <p className="text-xs text-red-700 font-medium">If there is immediate danger, call 911 or emergency services.</p>
      </div>
    </div>
  );
}

export default function SupportNowOverlay({ user, children, isIndividual }) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState("menu"); // "child_select" | "menu" | "behavior" | "crisis" | "calm"
  const [selectedChild, setSelectedChild] = useState(null);
  const [pendingChildId, setPendingChildId] = useState("");
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  useEffect(() => {
    if (!user) return;
    const key = user.invite_token || user.id;
    if (user.invite_token) {
      try {
        if (sessionStorage.getItem(SUPPORT_POPUP_DISMISSED_KEY) === "1") return;
      } catch {
        if (shownThisLoad.has(key)) return;
      }
    } else if (shownThisLoad.has(key)) return;
    // Short delay so the dashboard paints first
    const t = setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(t);
  }, [user?.invite_token, user?.id]);

  useEffect(() => {
    if (!visible) return;
    setSelectedChild(null);
    setPendingChildId(children.length === 1 ? children[0].id : "");
    setStep("child_select");
  }, [visible, children.length]);

  useEffect(() => {
    if (!selectedChild) return;
    loadProfile(selectedChild.id);
    // Log engagement event
    base44.entities.EngagementEvent.create({
      child_id: selectedChild.id,
      clinician_id: selectedChild.clinician_id,
      event_type: "help_opened",
      topic: "support_now_opened",
    }).catch(() => {});
  }, [selectedChild?.id]);

  const loadProfile = async (childId) => {
    setLoadingProfile(true);
    try {
      const isClientSession = user && !user.role;
      if (isClientSession) {
        const res = await base44.functions.invoke("getClientPortalData", {
          child_id: childId,
          account_id: user.id,
          invite_token: user.invite_token,
        }).catch(() => null);
        if (res?.data) {
          const generatedBehaviors = res.data.profile?.behaviors || [];
          const approvedPlanBehaviors = (res.data.plans || []).map(behaviorFromPlan);
          setProfile({
            ...(res.data.profile || {}),
            behaviors: generatedBehaviors.length > 0 ? generatedBehaviors : approvedPlanBehaviors,
          });
          setLoadingProfile(false);
          return;
        }
      }
      const profiles = await base44.entities.ClientProfile.filter({ child_id: childId }).catch(() => []);
      setProfile(profiles[0] || null);
    } finally {
      setLoadingProfile(false);
    }
  };

  const handleDismiss = () => {
    const key = user?.invite_token || user?.id;
    if (user?.invite_token) {
      try { sessionStorage.setItem(SUPPORT_POPUP_DISMISSED_KEY, "1"); }
      catch { if (key) shownThisLoad.add(key); }
    } else if (key) shownThisLoad.add(key);
    setVisible(false);
  };

  const handleSelectChild = (child) => {
    setProfile(null);
    setSelectedChild(child);
    setStep("menu");
  };

  const handleContinueFromChildSelect = () => {
    const child = children.find((item) => item.id === pendingChildId);
    if (child) handleSelectChild(child);
  };

  const handleSelectSection = (section) => {
    if (selectedChild) {
      base44.entities.EngagementEvent.create({
        child_id: selectedChild.id,
        clinician_id: selectedChild.clinician_id,
        event_type: "support_section_opened",
        topic: section,
      }).catch(() => {});
    }
    setStep(section);
  };

  const handleBack = () => setStep("menu");

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pointer-events-none"
      >
        {/* Dark backdrop — blocks background taps/clicks, sits behind the modal */}
        <div className="absolute inset-0 bg-black/50 pointer-events-auto" style={{ zIndex: 0 }} />
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
          className="pointer-events-auto relative w-full max-w-md bg-background rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-y-auto border border-border"
          role="dialog"
          aria-modal="true"
          aria-label="Choose support for a child"
          style={{ zIndex: 1, maxHeight: "90vh" }}
        >
          {step === "child_select" && (
            <ChildSelector
              children={children}
              selectedChildId={pendingChildId}
              onSelect={setPendingChildId}
              onContinue={handleContinueFromChildSelect}
              onDismiss={handleDismiss}
            />
          )}

          {step === "menu" && (
            <MainMenu
              child={selectedChild}
              onSelect={handleSelectSection}
              onDismiss={handleDismiss}
              isIndividual={isIndividual}
            />
          )}

          {step === "behavior" && (
            <BehaviorSelector
              child={selectedChild}
              profile={profile}
              loadingProfile={loadingProfile}
              onBack={handleBack}
              onDismiss={handleDismiss}
              isIndividual={isIndividual}
            />
          )}

          {step === "crisis" && (
            <CrisisPlan
              child={selectedChild}
              profile={profile}
              loadingProfile={loadingProfile}
              onBack={handleBack}
              onDismiss={handleDismiss}
              isIndividual={isIndividual}
            />
          )}

          {step === "calm" && (
            <CalmDownTool
              child={selectedChild}
              profile={profile}
              onBack={handleBack}
              onDismiss={handleDismiss}
              isIndividual={isIndividual}
            />
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}