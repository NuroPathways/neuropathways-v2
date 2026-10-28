import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from '@/api/entities';
import { useAuth } from "@/lib/AuthContext";
import { ArrowLeft, AlertTriangle, ChevronRight, CheckCircle2, ShieldAlert, Loader2, MessageSquare, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { getBehaviorAppearance } from "@/components/support/behaviorVisuals";
import { supportSourceDocumentIds, supportUploadSourceLabel } from "@/components/support/supportUploadSource";

const CLIENT_SUPPORT_CONTENT_VERSION = 3;

function Section({ title, items, colorClass, emptyText }) {
  const visibleItems = Array.isArray(items)
    ? items.filter((item) => typeof item === "string" && item.trim())
    : [];
  if (visibleItems.length === 0 && !emptyText) return null;
  return (
    <div className="mb-5">
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">{title}</h3>
      {visibleItems.length > 0 ? (
        <div className="space-y-2">
          {visibleItems.map((item, i) => (
            <div key={i} className={"flex items-start gap-3 p-3 rounded-xl border " + colorClass}>
              <span className="text-xs font-bold mt-0.5 flex-shrink-0">{i + 1}</span>
              <p className="text-sm leading-snug">{item}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className={"rounded-xl border p-3 " + colorClass}>
          <p className="text-sm leading-snug">{emptyText}</p>
        </div>
      )}
    </div>
  );
}

function hasCurrentClinicalApproval(behavior) {
  const status = String(behavior?.reviewStatus ?? behavior?.review_status ?? behavior?.approvalStatus ?? behavior?.approval_status ?? "").toLowerCase();
  const reviewer = behavior?.reviewer ?? behavior?.reviewerName ?? behavior?.reviewer_name ?? behavior?.approvedBy ?? behavior?.approved_by;
  const credentials = behavior?.reviewerCredentials ?? behavior?.reviewer_credentials ?? behavior?.reviewerCredential ?? behavior?.reviewer_credential;
  const reviewedAt = behavior?.reviewedAt ?? behavior?.reviewed_at ?? behavior?.reviewDate ?? behavior?.review_date;
  const scope = behavior?.approvalScope ?? behavior?.approval_scope;
  const renewalAt = behavior?.renewalDate ?? behavior?.renewal_date ?? behavior?.reviewExpiresAt ?? behavior?.review_expires_at;
  const renewalTime = Date.parse(renewalAt || "");
  return status === "approved"
    && Boolean(String(reviewer || "").trim())
    && Boolean(String(credentials || "").trim())
    && Boolean(String(reviewedAt || "").trim())
    && Boolean(String(scope || "").trim())
    && Boolean(String(behavior?.version ?? behavior?.contentVersion ?? behavior?.content_version ?? "").trim())
    && Number.isFinite(renewalTime)
    && renewalTime >= Date.now()
    && behavior.publishable === true
    && (behavior.productionEligible === true || behavior.production_eligible === true);
}

function isHighRiskBehavior(behavior) {
  return /\b(aggression|hitting|biting|self[- ]?injury|self[- ]?harm|elopement|wandering|leaving the area)\b/i.test(String(behavior?.name || ""))
    || ["high", "high_risk", "high-risk"].includes(String(behavior?.riskTier ?? behavior?.risk_tier ?? "").toLowerCase());
}

export default function HelpNow() {
  const navigate = useNavigate();
  const { user, isLoadingAuth } = useAuth();
  const [child, setChild] = useState(null);
  const [profile, setProfile] = useState(null);
  const [behaviorPlans, setBehaviorPlans] = useState([]);
  const [selectedBehavior, setSelectedBehavior] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [step, setStep] = useState("select_behavior");
  const [isIndividualClient, setIsIndividualClient] = useState(false);
  const [portalFailed, setPortalFailed] = useState(false);
  const [buildFailed, setBuildFailed] = useState(false);
  const [docsCount, setDocsCount] = useState(0);
  const [sourceDocuments, setSourceDocuments] = useState([]);
  const [childrenForPicker, setChildrenForPicker] = useState([]);

  const childId = new URLSearchParams(window.location.search).get("child_id");
  const scannedChildIdRef = useRef(null);

  useEffect(() => {
    if (isLoadingAuth) return;
    const load = async () => {
      setLoading(true);
      const me = user;
      if (!me) { setLoading(false); return; }

      let allChildren = [];
      // Username+code client sessions carry their children with them
      if (me.children && me.children.length > 0) {
        allChildren = me.children;
      } else {
        const byId = await base44.entities.Child.filter({ parent_id: me.id }).catch(() => []);
        const byEmail = me.email
          ? await base44.entities.Child.filter({ parent_email: me.email }).catch(() => [])
          : [];
        const seen = new Set();
        allChildren = [...byId, ...byEmail].filter(c => {
          if (seen.has(c.id)) return false;
          seen.add(c.id);
          return true;
        });
      }

      let savedId = null;
      try { savedId = localStorage.getItem(`np-family-child:${me.id}`); } catch { /* Storage may be unavailable. */ }
      const authorizedRequested = allChildren.find((candidate) => String(candidate.id) === String(childId));
      const authorizedSaved = allChildren.find((candidate) => String(candidate.id) === String(savedId));
      const hasValidSelection = !!(authorizedRequested || authorizedSaved || allChildren.length === 1);
      if (!hasValidSelection && allChildren.length > 1) {
        setChildrenForPicker(allChildren);
        setStep("child_select");
        setLoading(false);
        return;
      }

      const foundChild = authorizedRequested || authorizedSaved || allChildren[0];
      if (!foundChild) { setLoading(false); return; }
      try { localStorage.setItem(`np-family-child:${me.id}`, foundChild.id); } catch { /* Storage may be unavailable. */ }
      setChild(foundChild);
      setStep("select_behavior");

      // Information event — opening Help Now is NOT a behavior occurrence
      base44.entities.EngagementEvent.create({
        child_id: foundChild.id,
        clinician_id: foundChild.clinician_id,
        event_type: "help_opened",
      }).catch(() => {});

      if (me.account_type === "individual") {
        setIsIndividualClient(true);
      } else if (foundChild.family_id) {
        const fams = await base44.entities.Family.filter({ id: foundChild.family_id }).catch(() => []);
        if (fams[0] && fams[0].account_type === "individual") setIsIndividualClient(true);
      }

      // Load profile, behavior plans, and documents through the authorized backend
      // so username+code client sessions (blocked by RLS) still see their data.
      const portalRes = await base44.functions.invoke('getClientPortalData', {
        child_id: foundChild.id,
        account_id: me.id,
        invite_token: me.invite_token,
      }).then(r => r?.data || {}).catch(() => null);
      const portal = portalRes || {};
      setPortalFailed(!portalRes || !!portal.error);
      const docs = portal.documents || [];
      setSourceDocuments(docs);
      const docsWithFiles = docs.filter(d => d.file_url || d.fileUrl);
      setDocsCount(docsWithFiles.length);

      const profiles = portal.profile ? [portal.profile] : [];
      if (profiles.length > 0) setProfile(profiles[0]);
      setBehaviorPlans(portal.plans || []);
      setLoading(false);

      if (scannedChildIdRef.current !== foundChild.id) {
        scannedChildIdRef.current = foundChild.id;
        const existingProfile = profiles[0];
        const scannedIds = new Set(existingProfile?.source_doc_ids || existingProfile?.sourceDocIds || []);
        const hasNewDocs = docsWithFiles.some(d => !scannedIds.has(d.id));
        const currentProfileBehaviors = Array.isArray(existingProfile?.behaviors) ? existingProfile.behaviors : [];
        const needsSupportRefresh = currentProfileBehaviors.some(
          (behavior) => Number(behavior?.support_content_version) !== CLIENT_SUPPORT_CONTENT_VERSION,
        );
        const needsBuild = !existingProfile || hasNewDocs || currentProfileBehaviors.length === 0 || needsSupportRefresh;
        if (needsBuild && docsWithFiles.length > 0) runBuild(foundChild);
      }
    };
    load();
  }, [childId, isLoadingAuth, user?.id]);

  const runBuild = async (foundChild) => {
    setScanning(true);
    setBuildFailed(false);
    try {
      await base44.functions.invoke("buildClientProfile", {
        child_id: foundChild.id,
        account_id: user?.id,
        invite_token: user?.invite_token,
      });
      const refreshed = await base44.functions.invoke("getClientPortalData", {
        child_id: foundChild.id,
        account_id: user?.id,
        invite_token: user?.invite_token,
      }).then(r => r?.data?.profile).catch(() => null);
      if (refreshed) setProfile(refreshed);
    } catch {
      setBuildFailed(true);
    }
    setScanning(false);
  };

  const handleSelectBehavior = (behavior) => {
    setSelectedBehavior({ ...behavior });
    // Information event only — viewing guidance does NOT log a behavior occurrence.
    // Actual behaviors are logged via the "Log This Behavior" button.
    if (child) {
      base44.entities.EngagementEvent.create({
        child_id: child.id,
        clinician_id: child.clinician_id,
        event_type: "behavior_viewed",
        topic: behavior.name,
      }).catch(() => {});
    }
    setStep("show_guidance");
  };

  const handleBack = () => {
    if (step === "show_guidance") {
      setStep("select_behavior");
      setSelectedBehavior(null);
    } else {
      navigate(-1);
    }
  };

  // Build behavior cards: prefer ClientProfile behaviors, fall back to BehaviorPlan records
  const profileBehaviors = Array.isArray(profile?.behaviors)
    ? profile.behaviors
    : Object.values(profile?.behaviors || {});
  const profileSourceDocIds = Array.isArray(profile?.sourceDocIds)
    ? profile.sourceDocIds
    : Array.isArray(profile?.source_doc_ids)
      ? profile.source_doc_ids
      : [];
  const documentDraftBehaviors = isIndividualClient && profileSourceDocIds.length > 0
    ? profileBehaviors.filter((behavior) =>
      Number(behavior?.support_content_version) === CLIENT_SUPPORT_CONTENT_VERSION,
    )
    : [];
  const fallbackBehaviors = behaviorPlans.map(bp => ({
    ...bp,
    name: bp.behavior_name,
    description: bp.behavior_description || '',
    triggers: bp.common_triggers ? bp.common_triggers.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean) : [],
    interventions: bp.strategy_steps ? bp.strategy_steps.split(/\n+/).map(s => s.trim()).filter(Boolean) : [],
    avoid: bp.avoid_actions ? bp.avoid_actions.split(/\n+/).map(s => s.trim()).filter(Boolean) : [],
    when_to_contact_clinician: '',
    linked_goals: [],
  }));
  const behaviors = [...profileBehaviors, ...fallbackBehaviors].filter((behavior) => {
    const clinicianApproved = hasCurrentClinicalApproval(behavior);
    const documentDraft = documentDraftBehaviors.includes(behavior);
    return (clinicianApproved || documentDraft)
    && (!isHighRiskBehavior(behavior) || (
      Boolean(behavior.planId ?? behavior.plan_id)
      && String(behavior.childId ?? behavior.child_id ?? "") === String(child?.id ?? "")
      && ["approved", "active"].includes(String(behavior.planStatus ?? behavior.plan_status ?? "").toLowerCase())
    ));
  });
  const hasProfile = behaviors.length > 0;
  const docsExist = docsCount > 0;
  const selectedBehaviorAppearance = selectedBehavior ? getBehaviorAppearance(selectedBehavior) : null;
  const selectedIsClinicianApproved = selectedBehavior ? hasCurrentClinicalApproval(selectedBehavior) : false;
  const selectedSourceLabel = selectedBehavior
    ? supportUploadSourceLabel(
      sourceDocuments,
      supportSourceDocumentIds(selectedBehavior, profileSourceDocIds),
      child?.clinician_id ?? child?.clinicianId,
      selectedBehavior.planId || selectedBehavior.plan_id || selectedIsClinicianApproved
        ? "Clinician-uploaded"
        : "Upload source unavailable",
    )
    : "Upload source unavailable";
  const selectedIsDocumentDraft = Boolean(
    selectedBehavior
    && isIndividualClient
    && !selectedIsClinicianApproved
    && profileSourceDocIds.length > 0
    && Number(selectedBehavior.support_content_version) === CLIENT_SUPPORT_CONTENT_VERSION,
  );
  const hiddenHighRiskDocumentDrafts = documentDraftBehaviors.filter(isHighRiskBehavior);
  const practiceSkillItems = selectedBehavior
    ? [
      ...(typeof selectedBehavior.practice_a_helpful_skill === "string" && selectedBehavior.practice_a_helpful_skill.trim()
        ? [selectedBehavior.practice_a_helpful_skill.trim()]
        : []),
      ...(Array.isArray(selectedBehavior.practice_skill_steps) ? selectedBehavior.practice_skill_steps : []),
    ]
    : [];

  // All treatment goal titles on file — used as a fallback so Goal Mapping always shows.
  const goalsForBehavior = [];
  const objectivesForBehavior = [];

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  // Child picker — shown when navigating to /HelpNow with no child_id and multiple children
  if (step === "child_select") {
    return (
      <div className="min-h-screen font-inter" style={{ background: "#f4f5f7" }}>
        <div className="sticky top-0 z-10 bg-red-600 px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} aria-label="Go back" className="text-white/80 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-white" />
            <h1 className="text-white font-bold text-base">I Need Help Now</h1>
          </div>
        </div>
        <div className="p-5 max-w-md mx-auto mt-4">
          <h2 className="text-lg font-bold text-foreground mb-1">Who do you need support for?</h2>
          <p className="text-sm text-muted-foreground mb-5">Select a child to see their personalized guidance.</p>
          <div className="space-y-3">
            {childrenForPicker.map(c => (
              <button
                key={c.id}
                onClick={() => {
                  try { localStorage.setItem(`np-family-child:${user?.id}`, c.id); } catch { /* Storage may be unavailable. */ }
                  navigate(`/HelpNow?child_id=${c.id}`, { replace: true });
                }}
                className="w-full flex items-center justify-between bg-card border-2 border-border hover:border-red-400 rounded-2xl p-4 text-left transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                    <span className="text-red-600 font-bold text-base">{c.child_name?.[0]?.toUpperCase() || "?"}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{c.child_name}</p>
                    {c.diagnosis && <p className="text-xs text-muted-foreground">{c.diagnosis}</p>}
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-red-500 transition-colors" />
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen font-inter" style={{ background: "#f4f5f7" }}>
      <div className="sticky top-0 z-10 bg-red-600 px-4 py-3 flex items-center gap-3">
        <button onClick={handleBack} aria-label="Go back" className="text-white/80 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <AlertTriangle className="w-5 h-5 text-white" />
          <h1 className="text-white font-bold text-base">I Need Help Now</h1>
        </div>
        {child && (
          <span className="text-white/80 text-xs bg-white/20 px-2 py-1 rounded-full">{child.child_name}</span>
        )}
      </div>

      <div className="p-5 max-w-2xl mx-auto">
        <AnimatePresence mode="wait">

          {step === "select_behavior" && (
            <motion.div key="select" initial={false} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
              {!child ? (
                <div className="text-center py-12 space-y-4">
                  <p className="text-muted-foreground text-sm">We couldn't load your profile. Please try again, or message your clinician if this keeps happening.</p>
                  <Button variant="outline" className="rounded-xl" onClick={() => window.location.reload()}>Try Again</Button>
                </div>
              ) : scanning ? (
                <div className="text-center py-12 space-y-4">
                  <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
                  <h2 className="font-bold text-foreground text-lg">Preparing Your Help Cards...</h2>
                  <p className="text-sm text-muted-foreground">Reading {child.child_name}'s clinical documents. This may take a moment.</p>
                </div>
              ) : !hasProfile ? (
                <div className="text-center py-12 space-y-4">
                  <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-5 text-left">
                    <p className="text-sm font-semibold text-yellow-800 mb-1">
                      {portalFailed
                        ? "We couldn't load the current plan."
                        : isIndividualClient
                          ? "No source-based help cards are available yet."
                          : "No current approved behavior steps are available."}
                    </p>
                    <p className="text-sm text-yellow-700">
                      {isIndividualClient
                        ? "After your document is scanned, source-based cards appear here as suggestions. Safety-sensitive behavior still requires an approved plan."
                        : "Draft, expired, or unreviewed guidance is not shown here. Check any saved safety plan below or contact your care team."}
                    </p>
                    {hiddenHighRiskDocumentDrafts.length > 0 && (
                      <p className="mt-3 text-sm font-medium text-amber-900" role="note">
                        Safety-sensitive concerns in unreviewed documents are not shown as individualized steps. Use the current approved safety plan or contact your care team.
                      </p>
                    )}
                    {Array.isArray(profile?.crisis_plan) && profile.crisis_plan.length > 0 && (
                      <div className="mt-4 rounded-xl bg-red-600 p-4 text-left text-white">
                        <p className="mb-2 flex items-center gap-2 text-sm font-bold"><ShieldAlert className="h-4 w-4" /> Saved safety plan</p>
                        {profile.crisis_plan.map((line, index) => <p className="text-sm" key={index}>{index + 1}. {line}</p>)}
                      </div>
                    )}
                    <p className="mt-4 text-sm font-semibold text-red-800">If anyone is in immediate danger, call 911 or local emergency services.</p>
                    {buildFailed && docsExist && (
                      <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3">
                        <p className="text-sm text-red-800 mb-2">We couldn't build your help cards from the uploaded documents.</p>
                        <Button variant="outline" className="w-full rounded-xl" onClick={() => runBuild(child)}>Try Again</Button>
                      </div>
                    )}
                  </div>
                  <Button variant="outline" className="w-full rounded-xl" onClick={() => navigate("/Messages")}>Contact Your Care Team</Button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mb-5 text-center">
                    What is happening right now? Select the situation.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {behaviors.map((behavior, i) => {
                      const appearance = getBehaviorAppearance(behavior, i);
                      const BehaviorIcon = appearance.Icon;
                      const sourceLabel = supportUploadSourceLabel(
                        sourceDocuments,
                        supportSourceDocumentIds(behavior, profileSourceDocIds),
                        child?.clinician_id ?? child?.clinicianId,
                        behavior.planId || behavior.plan_id || hasCurrentClinicalApproval(behavior)
                          ? "Clinician-uploaded"
                          : "Upload source unavailable",
                      );
                      const clinicianApproved = hasCurrentClinicalApproval(behavior);
                      return (
                        <button
                          key={behavior.id || i}
                          onClick={() => handleSelectBehavior(behavior)}
                          data-testid={`button-helpnow-behavior-${i}`}
                          className={`min-h-[88px] border-2 rounded-2xl p-4 text-left transition-all hover:scale-[1.02] active:scale-100 ${appearance.classes}`}
                        >
                          <span className="flex items-start gap-3">
                            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${appearance.iconClasses}`}>
                              <BehaviorIcon className="h-5 w-5" aria-hidden="true" />
                            </span>
                            <span className="min-w-0 flex-1 pt-1 text-sm font-semibold leading-snug">
                              {behavior.name}
                              <span className="mt-1 block text-xs font-normal text-muted-foreground">{sourceLabel}</span>
                              <span className="block text-xs font-normal text-muted-foreground">
                                {clinicianApproved ? "Clinician-approved" : "Not clinician-reviewed"}
                              </span>
                            </span>
                            <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0 opacity-60" aria-hidden="true" />
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <p className="text-xs text-muted-foreground text-center mt-4">
                    {documentDraftBehaviors.length > 0
                      ? "Document-based suggestions are not clinician-reviewed. Safety-sensitive behaviors remain limited to an approved plan."
                      : `Only showing behaviors from ${child.child_name}'s clinician-approved plans.`}
                  </p>
                  {hiddenHighRiskDocumentDrafts.length > 0 && (
                    <p className="mt-3 text-center text-sm font-medium text-amber-900" role="note">
                      Safety-sensitive concerns in unreviewed documents are not shown as individualized steps. Use the current approved safety plan or contact your care team.
                    </p>
                  )}

                </>
              )}
            </motion.div>
          )}

          {step === "show_guidance" && selectedBehavior && (
            <motion.div key="guidance" initial={false} animate={{ opacity: 1, y: 0 }}>

              <div className="bg-card border border-border rounded-2xl p-5 mb-5">
                <div className="flex items-center gap-3 mb-2">
                  {selectedBehaviorAppearance && (
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${selectedBehaviorAppearance.iconClasses}`} aria-hidden="true">
                      <selectedBehaviorAppearance.Icon className="h-5 w-5" />
                    </span>
                  )}
                  <div>
                    <h2 className="font-bold text-foreground text-lg">{selectedBehavior.name}</h2>
                    <p className="text-xs text-primary font-medium">
                      {selectedSourceLabel}
                    </p>
                    {!selectedIsClinicianApproved && (
                      <p className="text-xs text-muted-foreground">Not clinician-reviewed</p>
                    )}
                  </div>
                </div>
                {selectedBehavior.description && (
                  <p className="text-sm text-muted-foreground">{selectedBehavior.description}</p>
                )}
              </div>

              <Section
                title="Try one step"
                items={selectedBehavior.do_this_right_now}
                colorClass="bg-orange-50 border-orange-200 text-orange-800"
                emptyText="No first step is listed for this support card."
              />

              <Section
                title="Support strategies"
                items={selectedBehavior.interventions}
                colorClass="bg-green-50 border-green-200 text-green-800"
                emptyText="No support strategies are listed for this card."
              />

              <Section
                title="Steps to de-escalate"
                items={selectedBehavior.if_it_escalates}
                colorClass="bg-red-50 border-red-200 text-red-800"
                emptyText="No de-escalation steps are listed. Follow the current approved safety plan for urgent safety needs."
              />

              {selectedIsClinicianApproved && selectedBehavior.clinical_interventions && selectedBehavior.clinical_interventions.length > 0 && (
                <div className="mb-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Clinical Techniques In Use</h3>
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                    <p className="text-sm text-purple-800 mb-2">Your clinician is using these therapeutic approaches:</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedBehavior.clinical_interventions.map((ci, i) => (
                        <span key={i} className="text-xs bg-white border border-purple-200 text-purple-700 font-medium px-2.5 py-1 rounded-full">{ci}</span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="mb-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">What may be happening</h3>
                <div className="bg-card border border-border rounded-xl p-4">
                  <p className="text-sm text-foreground leading-relaxed">
                    {selectedBehavior.what_may_be_happening || "No explanation is listed for this support card."}
                  </p>
                </div>
              </div>

              {selectedBehavior.triggers && selectedBehavior.triggers.length > 0 && (
                <div className="mb-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Common situations</h3>
                  <div className="bg-card border border-border rounded-xl p-4">
                    <p className="text-sm text-muted-foreground mb-2">This behavior often occurs when:</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedBehavior.triggers.map((t, i) => (
                        <span key={i} className="text-xs bg-yellow-50 border border-yellow-200 text-yellow-800 font-medium px-2.5 py-1 rounded-full">{t}</span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <Section
                title="Things to avoid"
                items={selectedBehavior.avoid}
                colorClass="bg-red-50 border-red-200 text-red-800"
                emptyText="No specific things to avoid are listed for this card."
              />

              <Section
                title="Prevention ideas"
                items={selectedBehavior.prevention_tips}
                colorClass="bg-blue-50 border-blue-200 text-blue-800"
                emptyText="No prevention ideas are listed for this card."
              />

              <Section
                title="Encouragement"
                items={selectedBehavior.reinforcement_rewards}
                colorClass="bg-teal-50 border-teal-200 text-teal-800"
                emptyText="No encouragement information is listed for this card."
              />

              <Section
                title="Practice a helpful skill"
                items={practiceSkillItems}
                colorClass="bg-teal-50 border-teal-200 text-teal-800"
                emptyText="No practice skill is listed for this card."
              />
              <Section
                title="What to notice"
                items={selectedBehavior.what_to_notice}
                colorClass="bg-blue-50 border-blue-200 text-blue-800"
                emptyText="No observation details are listed for this card."
              />

              {goalsForBehavior.length > 0 && (
                <div className="mb-5 bg-primary/5 border border-primary/20 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="w-4 h-4 text-primary" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-primary">Goal Mapping</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Working through this behavior supports {isIndividualClient ? "your" : (child && child.child_name + "'s")} treatment goals:
                  </p>
                  <div className="space-y-1.5">
                    {goalsForBehavior.map((goal, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                        <p className="text-sm font-medium text-foreground">{goal}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {objectivesForBehavior.length > 0 && (
                <div className="mb-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Progress Being Tracked</h3>
                  <div className="space-y-2">
                    {objectivesForBehavior.map((obj, i) => (
                      <div key={i} className="bg-card border border-border rounded-xl p-4">
                        <p className="text-sm font-semibold text-foreground mb-1">{obj.target_behavior}</p>
                        <p className="text-sm text-muted-foreground">{obj.measurable_outcome}</p>
                        {obj.completion_criteria && obj.completion_criteria !== "Not specified in documentation" && (
                          <p className="text-xs text-muted-foreground mt-1.5"><span className="font-semibold">Success looks like:</span> {obj.completion_criteria}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {profile && profile.safety_procedures && profile.safety_procedures.length > 0 && (
                <div className="mb-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Safety Notes</h3>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-1.5">
                    {profile.safety_procedures.map((s, i) => (
                      <p key={i} className="text-sm text-emerald-800 flex items-start gap-2">
                        <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" /> {s}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {profile && profile.reinforcers && profile.reinforcers.length > 0 && (
                <div className="mb-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Reinforcers</h3>
                  <div className="flex flex-wrap gap-2">
                    {profile.reinforcers.map((r, i) => (
                      <span key={i} className="text-xs bg-blue-50 border border-blue-200 text-blue-700 font-medium px-2.5 py-1 rounded-full">{r}</span>
                    ))}
                  </div>
                </div>
              )}

              {profile && profile.crisis_plan && profile.crisis_plan.length > 0 && (
                <div className="mb-5">
                  <div className="bg-red-600 rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <ShieldAlert className="w-5 h-5 text-white" />
                      <p className="font-bold text-white text-sm">Crisis Protocol</p>
                    </div>
                    <div className="space-y-1">
                      {profile.crisis_plan.map((s, i) => (
                        <p key={i} className="text-white/90 text-sm flex items-start gap-2">
                          <span className="font-bold mt-0.5">{i + 1}.</span> {s}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {(selectedBehavior.when_to_contact_clinician || selectedIsDocumentDraft) && (
                <div className="mb-5 bg-amber-50 border border-amber-200 rounded-2xl p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-1">
                    {selectedIsDocumentDraft ? "When to contact your clinician" : "Contact Your Clinician If"}
                  </p>
                  <p className="text-sm text-amber-800">
                    {selectedBehavior.when_to_contact_clinician || "No contact guidance was stated in the scanned documents."}
                  </p>
                </div>
              )}

              <Button variant="outline" className="w-full rounded-xl gap-2" onClick={() => navigate("/Messages")}>
                <MessageSquare className="w-4 h-4" /> Message Your Clinician
              </Button>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}