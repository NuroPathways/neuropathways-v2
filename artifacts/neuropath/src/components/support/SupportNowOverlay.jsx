import { useState, useEffect } from "react";
import { base44 } from '@/api/entities';
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, ShieldAlert, Wind, X, ChevronRight, Loader2, Phone } from "lucide-react";
import BehaviorSelector from "./BehaviorSelector";
import CrisisPlan from "./CrisisPlan";
import CalmDownTool from "./CalmDownTool";

// Tracks which tokens have already shown the popup in this page load.
// A module-level Set resets on every refresh, so the popup reappears after reload.
const shownThisLoad = new Set();

function ChildSelector({ children, onSelect }) {
  return (
    <div className="p-6">
      <h2 className="text-xl font-bold text-foreground mb-1">Who do you need support for?</h2>
      <p className="text-sm text-muted-foreground mb-5">Select the person so we can show the right plan.</p>
      <div className="space-y-3">
        {children.map((child) => (
          <button
            key={child.id}
            onClick={() => onSelect(child)}
            className="w-full flex items-center justify-between bg-card border-2 border-border hover:border-primary/50 rounded-2xl p-4 text-left transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-primary font-bold text-base">{child.child_name?.[0]?.toUpperCase() || "?"}</span>
              </div>
              <div>
                <p className="font-semibold text-foreground">{child.child_name}</p>
                {child.diagnosis && <p className="text-xs text-muted-foreground">{child.diagnosis}</p>}
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
          </button>
        ))}
      </div>
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
          {name && !isIndividual && (
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

      <p className="text-sm text-muted-foreground mb-6">Choose what you need — all guidance comes from {isIndividual ? "your" : `${name}'s`} clinician-approved plans.</p>

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
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  useEffect(() => {
    if (!user) return;
    const key = user.invite_token || user.id;
    if (shownThisLoad.has(key)) return;
    // Short delay so the dashboard paints first
    const t = setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(t);
  }, [user?.invite_token, user?.id]);

  useEffect(() => {
    if (!visible) return;
    if (children.length === 0) return;
    if (children.length === 1) {
      setSelectedChild(children[0]);
      setStep("menu");
    } else {
      setStep("child_select");
    }
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
        if (res?.data?.profile) { setProfile(res.data.profile); setLoadingProfile(false); return; }
      }
      const profiles = await base44.entities.ClientProfile.filter({ child_id: childId }).catch(() => []);
      setProfile(profiles[0] || null);
    } finally {
      setLoadingProfile(false);
    }
  };

  const handleDismiss = () => {
    const key = user?.invite_token || user?.id;
    if (key) shownThisLoad.add(key);
    setVisible(false);
  };

  const handleSelectChild = (child) => {
    setSelectedChild(child);
    setStep("menu");
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
          style={{ zIndex: 1, maxHeight: "90vh" }}
        >
          {step === "child_select" && (
            <ChildSelector children={children} onSelect={handleSelectChild} />
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