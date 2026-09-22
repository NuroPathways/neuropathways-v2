import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from '@/api/entities';
import { useAuth } from "@/lib/AuthContext";
import { ArrowLeft, AlertTriangle, ChevronRight, CheckCircle2, ShieldAlert, Loader2, MessageSquare, Target, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import HelpFeedback from "@/components/help/HelpFeedback";

const BEHAVIOR_COLORS = [
  "bg-red-50 border-red-200 text-red-700",
  "bg-orange-50 border-orange-200 text-orange-700",
  "bg-yellow-50 border-yellow-200 text-yellow-700",
  "bg-purple-50 border-purple-200 text-purple-700",
  "bg-blue-50 border-blue-200 text-blue-700",
  "bg-teal-50 border-teal-200 text-teal-700",
  "bg-pink-50 border-pink-200 text-pink-700",
  "bg-indigo-50 border-indigo-200 text-indigo-700",
];

function Section({ title, items, colorClass }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mb-5">
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">{title}</h3>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className={"flex items-start gap-3 p-3 rounded-xl border " + colorClass}>
            <span className="text-xs font-bold mt-0.5 flex-shrink-0">{i + 1}</span>
            <p className="text-sm leading-snug">{item}</p>
          </div>
        ))}
      </div>
    </div>
  );
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
  const [childrenForPicker, setChildrenForPicker] = useState([]);

  const childId = new URLSearchParams(window.location.search).get("child_id");
  const hasScannedRef = useRef(false);

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

      // No child_id in URL + multiple children → show picker first
      if (!childId && allChildren.length > 1) {
        setChildrenForPicker(allChildren);
        setStep("child_select");
        setLoading(false);
        return;
      }

      const foundChild = childId ? allChildren.find(c => c.id === childId) : allChildren[0];
      if (!foundChild) { setLoading(false); return; }
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
      setDocsCount((portal.documents || []).filter(d => d.file_url).length);

      const profiles = portal.profile ? [portal.profile] : [];
      if (profiles.length > 0) setProfile(profiles[0]);
      setBehaviorPlans(portal.plans || []);
      const docs = portal.documents || [];

      setLoading(false);

      // Build the profile from documents using the backend (single source of truth).
      // Only rebuild when there's no profile yet, new docs were added, or the profile is empty.
      if (!hasScannedRef.current) {
        hasScannedRef.current = true;
        const existingProfile = profiles[0];
        const docsWithFiles = docs.filter(d => d.file_url);
        const scannedIds = new Set((existingProfile?.source_doc_ids) || []);
        const hasNewDocs = docsWithFiles.some(d => !scannedIds.has(d.id));
        const needsBuild = !existingProfile || hasNewDocs || !(existingProfile.behaviors?.length > 0);
        if (needsBuild && docsWithFiles.length > 0) {
          runBuild(foundChild);
        }
      }
    };
    load();
  }, [childId, isLoadingAuth, user?.id]);

  // Build the profile via the backend buildClientProfile function, then reload it.
  const runBuild = async (foundChild) => {
    setScanning(true);
    try {
      await base44.functions.invoke("buildClientProfile", {
        child_id: foundChild.id,
        account_id: user?.id,
        invite_token: user?.invite_token,
      });
      const refreshed = await base44.functions.invoke('getClientPortalData', {
        child_id: foundChild.id,
        account_id: user?.id,
        invite_token: user?.invite_token,
      }).then(r => r?.data?.profile).catch(() => null);
      if (refreshed) setProfile(refreshed);
    } catch (e) {
      setBuildFailed(true);
    }
    setScanning(false);
  };

  const handleSelectBehavior = (behavior) => {
    setSelectedBehavior(behavior);
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
  const profileBehaviors = (profile && profile.behaviors) || [];
  const fallbackBehaviors = behaviorPlans.map(bp => ({
    name: bp.behavior_name,
    emoji: bp.behavior_name?.toLowerCase().includes('aggress') ? '👊'
      : bp.behavior_name?.toLowerCase().includes('tantrum') || bp.behavior_name?.toLowerCase().includes('meltdown') ? '😡'
      : bp.behavior_name?.toLowerCase().includes('anxi') ? '😰'
      : bp.behavior_name?.toLowerCase().includes('refus') ? '🚫'
      : bp.behavior_name?.toLowerCase().includes('transition') ? '🔄'
      : '📋',
    description: bp.behavior_description || '',
    triggers: bp.common_triggers ? bp.common_triggers.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean) : [],
    interventions: bp.strategy_steps ? bp.strategy_steps.split(/\n+/).map(s => s.trim()).filter(Boolean) : [],
    avoid: bp.avoid_actions ? bp.avoid_actions.split(/\n+/).map(s => s.trim()).filter(Boolean) : [],
    when_to_contact_clinician: '',
    linked_goals: [],
  }));
  const behaviors = profileBehaviors.length > 0 ? profileBehaviors : fallbackBehaviors;
  const hasProfile = behaviors.length > 0;

  // All treatment goal titles on file — used as a fallback so Goal Mapping always shows.
  const allGoalTitles = ((profile && profile.goals) || []).map(g => g && g.title).filter(Boolean);
  const goalsForBehavior = (selectedBehavior && selectedBehavior.linked_goals && selectedBehavior.linked_goals.length > 0)
    ? selectedBehavior.linked_goals
    : allGoalTitles;
  const docsExist = docsCount > 0;

  // Measurable objectives related to the selected behavior (loose name match)
  const objectivesForBehavior = (selectedBehavior && profile && profile.objectives)
    ? profile.objectives.filter(o => {
        const t = (o.target_behavior || "").toLowerCase();
        const n = (selectedBehavior.name || "").toLowerCase();
        return t && (n.includes(t) || t.includes(n) || n.split(" ").some(w => w.length > 4 && t.includes(w)));
      })
    : [];

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  // Child picker — shown when navigating to /HelpNow with no child_id and multiple children
  if (step === "child_select") {
    return (
      <div className="min-h-screen bg-background font-inter">
        <div className="sticky top-0 z-10 bg-red-600 px-4 py-4 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-white/80 hover:text-white">
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
                onClick={() => navigate(`/HelpNow?child_id=${c.id}`, { replace: true })}
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
    <div className="min-h-screen bg-background font-inter">
      <div className="sticky top-0 z-10 bg-red-600 px-4 py-4 flex items-center gap-3">
        <button onClick={handleBack} className="text-white/80 hover:text-white">
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
            <motion.div key="select" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
              {!child ? (
                <div className="text-center py-12 space-y-4">
                  <p className="text-muted-foreground text-sm">We couldn't load your profile. Please try again, or message your clinician if this keeps happening.</p>
                  <Button variant="outline" className="rounded-xl" onClick={() => window.location.reload()}>Try Again</Button>
                </div>
              ) : scanning ? (
                <div className="text-center py-12 space-y-4">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  </div>
                  <h2 className="font-bold text-foreground text-lg">Preparing Your Help Cards...</h2>
                  <p className="text-sm text-muted-foreground">Reading {child.child_name}'s clinical documents. This takes about 30 seconds.</p>
                </div>
              ) : !hasProfile ? (
                <div className="text-center py-12 space-y-4">
                  {portalFailed ? (
                    <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-left">
                      <p className="text-sm font-semibold text-red-800 mb-1">We couldn't load your help cards.</p>
                      <p className="text-sm text-red-700">Please sign out and sign back in, then try again. If this keeps happening, message your clinician.</p>
                      <Button variant="outline" className="w-full rounded-xl mt-3" onClick={() => window.location.reload()}>Try Again</Button>
                    </div>
                  ) : !docsExist ? (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-5 text-left">
                      <p className="text-sm font-semibold text-yellow-800 mb-1">No documents uploaded yet.</p>
                      <p className="text-sm text-yellow-700">Once your clinician uploads treatment plans or behavior protocols for {child.child_name}, personalized help cards will appear here automatically.</p>
                    </div>
                  ) : buildFailed ? (
                    <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-left">
                      <p className="text-sm font-semibold text-red-800 mb-1">We couldn't build your help cards.</p>
                      <p className="text-sm text-red-700 mb-3">The document scan didn't complete. This can happen if documents are still processing. Try again or message your clinician.</p>
                      <Button variant="outline" className="w-full rounded-xl" onClick={() => { setBuildFailed(false); runBuild(child); }}>Try Again</Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Loading your help cards... please wait a moment.</p>
                  )}
                  <Button variant="outline" className="w-full rounded-xl" onClick={() => navigate("/Messages")}>
                    Message Your Clinician
                  </Button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mb-5 text-center">
                    What is happening right now? Select the situation.
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    {behaviors.map((behavior, i) => (
                      <button
                        key={i}
                        onClick={() => handleSelectBehavior(behavior)}
                        className={"border-2 rounded-2xl p-4 text-left transition-all hover:scale-[1.02] active:scale-100 " + BEHAVIOR_COLORS[i % BEHAVIOR_COLORS.length]}
                      >
                        <div className="text-3xl mb-2">{behavior.emoji || "📋"}</div>
                        <p className="text-sm font-semibold leading-snug">{behavior.name}</p>
                        <ChevronRight className="w-4 h-4 mt-1 opacity-60" />
                      </button>
                    ))}
                  </div>

                  <p className="text-xs text-muted-foreground text-center mt-4">
                    Only showing behaviors from {child.child_name}'s clinician-approved plans.
                  </p>

                  {profile && profile.diagnoses && profile.diagnoses.length > 0 && (
                    <div className="mt-5 bg-card border border-border rounded-2xl p-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Diagnoses on File</p>
                      <div className="flex flex-wrap gap-2">
                        {profile.diagnoses.map((d, i) => (
                          <span key={i} className="text-xs bg-primary/10 text-primary font-medium px-2.5 py-1 rounded-full">{d}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          )}

          {step === "show_guidance" && selectedBehavior && (
            <motion.div key="guidance" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>

              <div className="bg-card border border-border rounded-2xl p-5 mb-5">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-3xl">{selectedBehavior.emoji || "📋"}</span>
                  <div>
                    <h2 className="font-bold text-foreground text-lg">{selectedBehavior.name}</h2>
                    <p className="text-xs text-primary font-medium">Clinician-approved guidance</p>
                  </div>
                </div>
                {selectedBehavior.description && (
                  <p className="text-sm text-muted-foreground">{selectedBehavior.description}</p>
                )}
              </div>

              <Section
                title="Do This Right Now"
                items={selectedBehavior.do_this_right_now}
                colorClass="bg-orange-50 border-orange-200 text-orange-800"
              />

              {selectedBehavior.interventions && selectedBehavior.interventions.length > 0 ? (
                <Section
                  title="Clinician-Approved Strategies"
                  items={selectedBehavior.interventions}
                  colorClass="bg-green-50 border-green-200 text-green-800"
                />
              ) : (
                <div className="mb-5 bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle className="w-4 h-4 text-yellow-700" />
                    <p className="text-sm font-semibold text-yellow-800">No clinician-approved strategy was found for this behavior.</p>
                  </div>
                  <p className="text-sm text-yellow-700">Please contact your clinician for guidance.</p>
                </div>
              )}

              <Section
                title="If It Escalates"
                items={selectedBehavior.if_it_escalates}
                colorClass="bg-red-50 border-red-200 text-red-800"
              />

              {selectedBehavior.clinical_interventions && selectedBehavior.clinical_interventions.length > 0 && (
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

              {selectedBehavior.what_may_be_happening && (
                <div className="mb-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Why This Is Happening</h3>
                  <div className="bg-card border border-border rounded-xl p-4">
                    <p className="text-sm text-foreground leading-relaxed">{selectedBehavior.what_may_be_happening}</p>
                  </div>
                </div>
              )}

              {selectedBehavior.triggers && selectedBehavior.triggers.length > 0 && (
                <div className="mb-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Common Triggers</h3>
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

              {selectedBehavior.avoid && selectedBehavior.avoid.length > 0 && (
                <div className="mb-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Things to Avoid</h3>
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-1">
                    {selectedBehavior.avoid.map((a, i) => (
                      <p key={i} className="text-sm text-red-800 flex items-start gap-2">
                        <span className="text-red-500 font-bold mt-0.5">x</span> {a}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {selectedBehavior.prevention_tips && selectedBehavior.prevention_tips.length > 0 && (
                <div className="mb-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Prevention Tips</h3>
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-1.5">
                    {selectedBehavior.prevention_tips.map((p, i) => (
                      <p key={i} className="text-sm text-blue-800 flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" /> {p}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {selectedBehavior.reinforcement_rewards && selectedBehavior.reinforcement_rewards.length > 0 && (
                <div className="mb-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Reinforcement &amp; Rewards</h3>
                  <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 space-y-1.5">
                    {selectedBehavior.reinforcement_rewards.map((r, i) => (
                      <p key={i} className="text-sm text-teal-800 flex items-start gap-2">
                        <span className="flex-shrink-0 mt-0.5">⭐</span> {r}
                      </p>
                    ))}
                  </div>
                </div>
              )}

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

              {selectedBehavior.when_to_contact_clinician && (
                <div className="mb-5 bg-amber-50 border border-amber-200 rounded-2xl p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-1">Contact Your Clinician If</p>
                  <p className="text-sm text-amber-800">{selectedBehavior.when_to_contact_clinician}</p>
                </div>
              )}

              <HelpFeedback child={child} topic={selectedBehavior.name} />

              <Button
                className="w-full rounded-xl gap-2 mb-3"
                onClick={() => navigate("/LogBehavior?child_id=" + (child && child.id) + "&behavior=" + selectedBehavior.name)}
              >
                <CheckCircle2 className="w-4 h-4" /> Log This Behavior
              </Button>
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