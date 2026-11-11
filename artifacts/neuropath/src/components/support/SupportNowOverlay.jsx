import { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from '@/api/entities';
import { getParentDashboard, updateParentDocumentSupportCard } from "@workspace/api-client-react";
import { parentRequest } from "@/lib/parentSession";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { AlertTriangle, ShieldAlert, Wind, X, Phone } from "lucide-react";
import { MenuRow } from "@workspace/neuropathways-foundations/components/ui/menu-row";
import { PageHeader } from "@workspace/neuropathways-foundations/components/ui/page-header";
import "@workspace/neuropathways-foundations/scoped.css";
import "./help-now.css";
import BehaviorSelector from "./BehaviorSelector";
import CrisisPlan from "./CrisisPlan";
import CalmDownTool from "./CalmDownTool";
import { hasSupportPopupBeenShown, markSupportPopupShown } from "@/lib/supportPopupSession";

export { clearSupportPopupSession } from "@/lib/supportPopupSession";

function isParentSupportAccount(user) {
  if (!user) return false;
  const accountType = String(user.account_type || user.accountType || "").toLowerCase();
  const role = String(user.app_role || user.appRole || user.role || "").toLowerCase();
  if (accountType === "individual" || user.invite_token || user.client_session) return false;
  if (["clinician", "admin"].includes(role) || ["clinician", "admin"].includes(accountType)) return false;
  return ["parent", "parent_free", "parent_family", "family", "legacy_family", "caregiver"].includes(accountType)
    || ["parent", "parent_free", "parent_family", "family", "legacy_family", "caregiver"].includes(role);
}

const splitGuidance = (value) => String(value || "")
  .split(/\n+|(?=\d+\.\s)/)
  .map((item) => item.replace(/^\d+\.\s*/, "").trim())
  .filter(Boolean);

const behaviorFromPlan = (plan) => ({
  name: plan.behavior_name || plan.behaviorName || "Behavior support",
  sourceLabel: "Clinician-uploaded",
  what_may_be_happening: plan.behavior_description || plan.behaviorDescription || plan.behavior_function || plan.behaviorFunction,
  interventions: splitGuidance(plan.strategy_steps || plan.strategySteps),
  if_it_escalates: splitGuidance(plan.deescalation_steps || plan.deescalationSteps),
  avoid: splitGuidance(plan.avoid_actions || plan.avoidActions),
  prevention_tips: splitGuidance(plan.common_triggers || plan.commonTriggers),
  reinforcement_rewards: splitGuidance(plan.reinforcement_method || plan.reinforcementMethod),
});

function CloseButton({ onDismiss }) {
  return (
    <button
      type="button"
      onClick={onDismiss}
      aria-label="Close support"
      data-testid="button-close-support"
      className="np-help-icon-btn"
    >
      <X aria-hidden="true" />
    </button>
  );
}

function EmergencyLine() {
  return (
    <p className="np-help-emergency" role="note">
      <Phone aria-hidden="true" />
      <span>If there is immediate danger, call 911 or emergency services.</span>
    </p>
  );
}

function ChildSelector({ children, selectedChildId, onSelect, onContinue, onDismiss }) {
  return (
    <div className="np-help-body">
      <div className="np-help-header">
        <PageHeader
          as="h2"
          title="Who do you need help with?"
          description="Choose a child to see the right support plan."
        />
        <CloseButton onDismiss={onDismiss} />
      </div>
      <div className="np-help-group">
        {children.length > 0 && (
          <div className="np-help-options">
            {children.map((child) => (
              <MenuRow
                key={child.id}
                onClick={() => onSelect(child.id)}
                aria-pressed={selectedChildId === child.id}
                data-testid={`button-select-child-${child.id}`}
                data-tone="child"
                className="np-help-option"
                icon={<span className="np-help-option-initial">{(child.child_name || child.childName || child.name)?.[0]?.toUpperCase() || "?"}</span>}
                label={child.child_name || child.childName || child.name || "Child"}
                description={selectedChildId === child.id ? [child.diagnosis, "Selected"].filter(Boolean).join(" · ") : child.diagnosis || undefined}
              />
            ))}
          </div>
        )}
        {children.length === 0 && (
          <p role="status" className="np-help-muted">No child profile is connected to this sign-in. Please contact your care team.</p>
        )}
        <button
          type="button"
          onClick={onContinue}
          disabled={!selectedChildId}
          data-testid="button-continue-support"
          data-variant="primary"
          data-block="true"
          className="np-help-btn"
        >
          Continue to support options
        </button>
      </div>
    </div>
  );
}

function MainMenu({ child, onSelect, onDismiss, isIndividual }) {
  const name = child?.child_name;
  return (
    <div className="np-help-body">
      <div className="np-help-header">
        <PageHeader
          as="h2"
          title="Need support right now?"
          context={name ? <>For: <strong>{name}</strong></> : undefined}
          description="Choose what you need. Support guidance is labeled by where it came from."
        />
        <CloseButton onDismiss={onDismiss} />
      </div>

      <div className="np-help-group">
        <div className="np-help-options">
          <MenuRow
            onClick={() => onSelect("behavior")}
            data-testid="button-help-behavior"
            data-tone="choice-behavior"
            className="np-help-option"
            icon={<AlertTriangle />}
            label="Help With a Behavior"
            description="Step-by-step support for a selected behavior"
          />
          <MenuRow
            onClick={() => onSelect("crisis")}
            data-testid="button-help-crisis"
            data-tone="choice-crisis"
            className="np-help-option"
            icon={<ShieldAlert />}
            label="Safety / Crisis Plan"
            description="Review available safety information and next steps"
          />
          <MenuRow
            onClick={() => onSelect("calm")}
            data-testid="button-help-calm"
            data-tone="choice-calm"
            className="np-help-option"
            icon={<Wind />}
            label="Calm Down First"
            description="Breathing, grounding, and co-regulation tools"
          />
          <MenuRow
            onClick={onDismiss}
            data-testid="button-help-dashboard"
            data-tone="choice-neutral"
            className="np-help-option"
            label="I'm Okay — Go to Dashboard"
            description="Continue to your Home"
          />
        </div>
        <EmergencyLine />
      </div>
    </div>
  );
}

export default function SupportNowOverlay({
  user,
  children,
  isIndividual,
  loadProfileForChild,
  logEngagement = true,
  openRequest = 0,
  autoOpen = false,
  autoOpenReady = true,
  parentDirect,
  initialChildId = null,
}) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState("child_select"); // "child_select" | "menu" | "behavior" | "crisis" | "calm"
  const [selectedChild, setSelectedChild] = useState(null);
  const [pendingChildId, setPendingChildId] = useState("");
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileLoadError, setProfileLoadError] = useState(false);

  const loadProfile = useCallback(async (childId) => {
    setLoadingProfile(true);
    setProfileLoadError(false);
    try {
      const withDocumentSupportCards = async (loadedProfile, sourceDocuments = []) => {
        const profileWithSources = {
          ...(loadedProfile && typeof loadedProfile === "object" ? loadedProfile : {}),
          sourceDocuments: Array.isArray(sourceDocuments) ? sourceDocuments : [],
        };
        if (parentDirect !== true && !isParentSupportAccount(user)) return profileWithSources;
        try {
          const dashboard = await getParentDashboard(childId, parentRequest());
          return {
            ...profileWithSources,
            documentSupportCards: Array.isArray(dashboard.documentSupportCards) ? dashboard.documentSupportCards : [],
            documentSupportCardsLoadError: false,
            sourceDocuments: Array.isArray(dashboard.documents) ? dashboard.documents : profileWithSources.sourceDocuments,
          };
        } catch {
          return {
            ...profileWithSources,
            documentSupportCards: [],
            documentSupportCardsLoadError: true,
          };
        }
      };
      if (loadProfileForChild) {
        setProfile(await loadProfileForChild(childId) || null);
        return;
      }
      const isClientSession = user && !user.role;
      if (isClientSession) {
        let portalRequestFailed = false;
        try {
          const res = await base44.functions.invoke("getClientPortalData", {
            child_id: childId,
            account_id: user.id,
            invite_token: user.invite_token,
          });
          if (res?.error) throw new Error("The client support request failed.");
          if (res?.data && typeof res.data === "object" && !Array.isArray(res.data)) {
            const rawBehaviors = res.data.profile?.behaviors;
            let generatedBehaviors = Array.isArray(rawBehaviors)
              ? rawBehaviors
              : rawBehaviors && typeof rawBehaviors === "object"
                ? rawBehaviors
                : [];
            if (typeof rawBehaviors === "string") {
              try {
                const parsed = JSON.parse(rawBehaviors);
                generatedBehaviors = Array.isArray(parsed)
                  ? parsed
                  : parsed && typeof parsed === "object"
                    ? parsed
                    : [];
              } catch {
                generatedBehaviors = [];
              }
            }
            const plans = Array.isArray(res.data.plans) ? res.data.plans : [];
            const approvedPlanBehaviors = plans
              .filter((plan) => plan && typeof plan === "object" && !Array.isArray(plan))
              .map(behaviorFromPlan);
            const hasGeneratedBehaviors = Array.isArray(generatedBehaviors)
              ? generatedBehaviors.length > 0
              : Object.keys(generatedBehaviors).length > 0;
            setProfile(await withDocumentSupportCards({
              ...(res.data.profile && typeof res.data.profile === "object" ? res.data.profile : {}),
              behaviors: hasGeneratedBehaviors
                ? generatedBehaviors
                : approvedPlanBehaviors,
            }, res.data.documents));
            return;
          }
        } catch {
          portalRequestFailed = true;
        }

        const profiles = await base44.entities.ClientProfile.filter({ child_id: childId });
        if (!Array.isArray(profiles)) throw new Error("Client support information could not be verified.");
        if (profiles.length === 0 && portalRequestFailed) {
          throw new Error("Neither client support source could be reached.");
        }
        setProfile(await withDocumentSupportCards(profiles[0] || null));
        return;
      }
      const profiles = await base44.entities.ClientProfile.filter({ child_id: childId });
      if (!Array.isArray(profiles)) throw new Error("Client support information could not be verified.");
      setProfile(await withDocumentSupportCards(profiles[0] || null));
    } catch (error) {
      console.error("Unable to load support information for the selected child.", error);
      setProfile(null);
      setProfileLoadError(true);
    } finally {
      setLoadingProfile(false);
    }
  }, [loadProfileForChild, parentDirect, user]);

  useEffect(() => {
    if (!autoOpen || !autoOpenReady || openRequest || !isParentSupportAccount(user) || !user.id) return;
    if (hasSupportPopupBeenShown(user.id)) return;
    // Let the current parent Home view paint before presenting support.
    const t = setTimeout(() => {
      if (hasSupportPopupBeenShown(user.id)) return;
      // Mark before changing state so Strict Mode/remounts cannot open it twice.
      markSupportPopupShown(user.id);
      setStep("child_select");
      setSelectedChild(null);
      setVisible(true);
    }, 300);
    return () => clearTimeout(t);
  }, [user?.account_type, user?.accountType, user?.app_role, user?.appRole, user?.role, user?.invite_token, user?.client_session, user?.id, autoOpen, autoOpenReady, openRequest]);

  useEffect(() => {
    if (!user || !openRequest) return;
    if (isParentSupportAccount(user)) markSupportPopupShown(user.id);
    setStep("child_select");
    setSelectedChild(null);
    setPendingChildId("");
    setProfile(null);
    setProfileLoadError(false);
    setVisible(true);
  }, [openRequest, user?.id, user?.account_type, user?.accountType, user?.app_role, user?.appRole, user?.role, user?.invite_token, user?.client_session]);

  useEffect(() => {
    if (!visible) return;
    const preselected = initialChildId ? children.find((item) => String(item.id) === String(initialChildId)) : null;
    if (preselected) {
      setProfile(null);
      setProfileLoadError(false);
      setSelectedChild(preselected);
      setPendingChildId(preselected.id);
      setStep("menu");
      return;
    }
    setSelectedChild(null);
    setPendingChildId(children.length === 1 ? children[0].id : "");
    setStep("child_select");
  }, [visible, children.length, initialChildId, openRequest]);

  useEffect(() => {
    if (!selectedChild) return;
    loadProfile(selectedChild.id);
    // Log engagement event
    if (logEngagement && selectedChild.clinician_id) {
      base44.entities.EngagementEvent.create({
        child_id: selectedChild.id,
        clinician_id: selectedChild.clinician_id,
        event_type: "help_opened",
        topic: "support_now_opened",
      }).catch(() => {});
    }
  }, [selectedChild?.id, loadProfile, logEngagement]);

  const handleDismiss = useCallback(() => {
    if (isParentSupportAccount(user)) markSupportPopupShown(user.id);
    setVisible(false);
  }, [user?.account_type, user?.accountType, user?.app_role, user?.appRole, user?.role, user?.invite_token, user?.client_session, user?.id]);

  const dialogRef = useRef(null);
  useEffect(() => {
    if (!visible) return;
    const panel = dialogRef.current;
    if (!panel) return;
    const trigger = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.focus({ preventScroll: true });
    const handleKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleDismiss();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = [...panel.querySelectorAll("button, a[href], input, select, textarea, [tabindex]")]
        .filter((element) => !element.disabled && element.tabIndex >= 0
          && !element.closest("[hidden], [inert]") && getComputedStyle(element).display !== "none");
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first) {
        event.preventDefault();
        panel.focus();
      } else if (!panel.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [visible, handleDismiss]);

  useEffect(() => {
    if (visible && dialogRef.current) dialogRef.current.scrollTop = 0;
  }, [visible, step]);

  const handleSelectChild = (child) => {
    setProfile(null);
    setProfileLoadError(false);
    setSelectedChild(child);
    setStep("menu");
  };

  const handleContinueFromChildSelect = () => {
    const child = children.find((item) => item.id === pendingChildId);
    if (child) handleSelectChild(child);
  };

  const handleSelectSection = (section) => {
    if (logEngagement && selectedChild?.clinician_id) {
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

  const handleUpdateDocumentSupportCard = useCallback(async (cardId, update) => {
    if (!selectedChild?.id) throw new Error("Select a child before updating this suggestion.");
    const result = await updateParentDocumentSupportCard(
      selectedChild.id,
      cardId,
      update,
      parentRequest(),
    );
    if (!result?.card) throw new Error("The support suggestion could not be refreshed.");
    setProfile((current) => ({
      ...(current || {}),
      documentSupportCards: (current?.documentSupportCards || []).map((card) =>
        card.id === result.card.id ? result.card : card,
      ),
    }));
    return result.card;
  }, [selectedChild?.id]);

  const reduceMotion = useReducedMotion();

  const isParentDirectAccount = parentDirect ?? (
    ["parent_free", "legacy_family"].includes(user?.account_type || user?.accountType) ||
    user?.role === "parent" ||
    user?.app_role === "parent"
  );
  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={false}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
          className="np-help-overlay-shell fixed inset-0 z-50 flex justify-center pointer-events-none"
          style={{
            position: "fixed",
            alignItems: "center",
            paddingTop: "max(16px, env(safe-area-inset-top))",
            paddingBottom: "max(16px, env(safe-area-inset-bottom))",
            paddingLeft: "max(16px, env(safe-area-inset-left))",
            paddingRight: "max(16px, env(safe-area-inset-right))",
          }}
      >
        {/* Dark backdrop — blocks background taps/clicks, sits behind the modal */}
        <div className="absolute inset-0 bg-black/50 pointer-events-auto" style={{ zIndex: 0 }} />
        <motion.div
          initial={false}
          animate={{ y: 0, opacity: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { y: 60, opacity: 0 }}
          transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 30 }}
          className={`np-foundations np-help np-help-dialog pointer-events-auto relative w-full overflow-y-auto ${step === "behavior" ? "max-w-2xl" : "max-w-md"}`}
          role="dialog"
          ref={dialogRef}
          tabIndex={-1}
          aria-modal="true"
          aria-label="Choose support for a child"
          style={{ zIndex: 1 }}
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
              profileLoadError={profileLoadError}
              onBack={handleBack}
              onOpenSafety={() => setStep("crisis")}
              onDismiss={handleDismiss}
              isIndividual={isIndividual}
              parentDirect={isParentDirectAccount}
              logEngagement={logEngagement}
              onUpdateDocumentSupportCard={handleUpdateDocumentSupportCard}
            />
          )}

          {step === "crisis" && (
            <CrisisPlan
              child={selectedChild}
              profile={profile}
              loadingProfile={loadingProfile}
              profileLoadError={profileLoadError}
              onBack={handleBack}
              onDismiss={handleDismiss}
              isIndividual={isIndividual}
              parentDirect={isParentDirectAccount}
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