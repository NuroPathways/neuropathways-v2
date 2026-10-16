import { useState } from "react";
import { base44 } from '@/api/entities';
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, X, AlertCircle, ShieldAlert, Phone, ChevronRight } from "lucide-react";

const BEHAVIOR_COLORS = [
  { bg: "bg-red-50", border: "border-red-200", text: "text-red-800", badge: "bg-red-100 text-red-700" },
  { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-800", badge: "bg-orange-100 text-orange-700" },
  { bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-800", badge: "bg-yellow-100 text-yellow-700" },
  { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-800", badge: "bg-purple-100 text-purple-700" },
  { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-800", badge: "bg-blue-100 text-blue-700" },
  { bg: "bg-teal-50", border: "border-teal-200", text: "text-teal-800", badge: "bg-teal-100 text-teal-700" },
  { bg: "bg-pink-50", border: "border-pink-200", text: "text-pink-800", badge: "bg-pink-100 text-pink-700" },
  { bg: "bg-indigo-50", border: "border-indigo-200", text: "text-indigo-800", badge: "bg-indigo-100 text-indigo-700" },
];

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function textValue(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (isRecord(value)) {
    return textValue(value.text ?? value.step ?? value.description ?? value.label ?? value.title ?? "");
  }
  return "";
}

function listItems(value) {
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((item) => item.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
      .filter(Boolean);
  }
  if (isRecord(value)) {
    const nested = value.items ?? value.steps ?? value.procedures ?? value.guidance;
    return nested === undefined ? [] : listItems(nested);
  }
  return [];
}

function normalizeBehavior(value, index) {
  const raw = isRecord(value) ? value : { name: typeof value === "string" ? value : "" };
  const behaviorKey = textValue(raw.behaviorKey ?? raw.behavior_key ?? raw.key);
  const name = textValue(raw.name ?? raw.behaviorName ?? raw.behavior_name ?? raw.title) || `Behavior ${index + 1}`;

  return {
    ...raw,
    id: textValue(raw.id ?? raw.behaviorId ?? raw.behavior_id) || `${behaviorKey || "behavior"}-${name}`,
    behaviorKey,
    name,
    sourceLabel: textValue(raw.sourceLabel ?? raw.source_label),
    what_may_be_happening: textValue(raw.what_may_be_happening ?? raw.whatMayBeHappening ?? raw.context),
    do_this_right_now: listItems(raw.do_this_right_now ?? raw.doThisRightNow ?? raw.rightNow ?? raw.right_now ?? raw.immediate_steps),
    interventions: listItems(raw.interventions ?? raw.clinicianApprovedSteps ?? raw.clinician_approved_strategies ?? raw.strategies),
    if_it_escalates: listItems(raw.if_it_escalates ?? raw.ifItEscalates ?? raw.escalationSteps ?? raw.escalation_steps),
    avoid: listItems(raw.avoid ?? raw.thingsToAvoid ?? raw.things_to_avoid ?? raw.avoid_this),
    prevention_tips: listItems(raw.prevention_tips ?? raw.preventionTips ?? raw.prevention),
    reinforcement_rewards: listItems(raw.reinforcement_rewards ?? raw.reinforcementRewards ?? raw.reinforcement),
    when_to_contact_clinician: textValue(raw.when_to_contact_clinician ?? raw.whenToContactClinician ?? raw.seekHelp),
  };
}

function hasCurrentClinicalApproval(behavior) {
  const status = textValue(behavior.reviewStatus ?? behavior.review_status ?? behavior.approvalStatus ?? behavior.approval_status).toLowerCase();
  const reviewer = textValue(behavior.reviewer ?? behavior.reviewerName ?? behavior.reviewer_name ?? behavior.approvedBy ?? behavior.approved_by);
  const credentials = textValue(behavior.reviewerCredentials ?? behavior.reviewer_credentials ?? behavior.reviewerCredential ?? behavior.reviewer_credential);
  const reviewedAt = textValue(behavior.reviewedAt ?? behavior.reviewed_at ?? behavior.reviewDate ?? behavior.review_date);
  const scope = textValue(behavior.approvalScope ?? behavior.approval_scope);
  const renewalAt = textValue(behavior.renewalDate ?? behavior.renewal_date ?? behavior.reviewExpiresAt ?? behavior.review_expires_at);
  const version = textValue(behavior.version ?? behavior.contentVersion ?? behavior.content_version);
  const renewalTime = Date.parse(renewalAt);
  return status === "approved"
    && reviewer.length > 0
    && credentials.length > 0
    && reviewedAt.length > 0
    && scope.length > 0
    && version.length > 0
    && Number.isFinite(renewalTime)
    && renewalTime >= Date.now()
    && behavior.publishable === true
    && (behavior.productionEligible === true || behavior.production_eligible === true);
}

function requiresPlanBinding(behavior) {
  return /\b(aggression|hitting|biting|self[- ]?injury|self[- ]?harm|elopement|wandering|leaving the area)\b/i.test(textValue(behavior.name))
    || ["high", "high_risk", "high-risk"].includes(textValue(behavior.riskTier ?? behavior.risk_tier).toLowerCase());
}

function normalizeBehaviorRows(value) {
  let rows = value;
  if (typeof rows === "string") {
    try { rows = JSON.parse(rows); } catch { return []; }
  }
  if (isRecord(rows)) {
    if (Array.isArray(rows.items)) rows = rows.items;
    else if (["name", "behaviorName", "behavior_name", "behaviorKey", "behavior_key", "key"].some((key) => key in rows)) {
      rows = [rows];
    } else {
      rows = Object.entries(rows).map(([name, item]) =>
        isRecord(item)
          ? { ...item, name: item.name ?? item.behaviorName ?? name }
          : { name, do_this_right_now: item },
      );
    }
  }
  return Array.isArray(rows)
    ? rows.map(normalizeBehavior).filter((behavior) => behavior.name.trim())
    : [];
}

function Section({ title, items, colorClass }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mb-4">
      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">{title}</h4>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className={`flex items-start gap-2.5 p-3 rounded-xl border ${colorClass}`}>
            <span className="text-xs font-bold mt-0.5 flex-shrink-0">{i + 1}</span>
            <p className="text-sm leading-snug">{item}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function BehaviorCard({ behavior, child, isIndividual, onBack }) {
  const name = child?.child_name;

  return (
    <div>
      <div className="sticky top-0 bg-background border-b border-border px-5 py-4 flex items-center gap-3 z-10">
        <button type="button" onClick={onBack} className="min-w-[40px] min-h-[40px] flex items-center justify-center text-muted-foreground hover:text-foreground rounded-xl hover:bg-muted transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <p className="font-bold text-foreground text-sm">{behavior.name}</p>
          <p className="text-xs text-primary font-medium">{behavior.sourceLabel || "Support guidance"}</p>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Starter support is general guidance, not a clinician-approved treatment plan. Uploaded-plan support is not clinician-reviewed unless a review is explicitly identified.
        </p>
        {behavior.what_may_be_happening && (
          <div className="bg-card border border-border rounded-xl p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Why This May Be Happening</h4>
            <p className="text-sm text-foreground leading-relaxed">{behavior.what_may_be_happening}</p>
          </div>
        )}

        {behavior.do_this_right_now && behavior.do_this_right_now.length > 0 && (
          <Section title="Do This Right Now" items={behavior.do_this_right_now} colorClass="bg-orange-50 border-orange-200 text-orange-800" />
        )}

        {behavior.interventions && behavior.interventions.length > 0 && (
          <Section title="Clinician-Approved Strategies" items={behavior.interventions} colorClass="bg-green-50 border-green-200 text-green-800" />
        )}

        {behavior.if_it_escalates && behavior.if_it_escalates.length > 0 && (
          <Section title="If It Escalates" items={behavior.if_it_escalates} colorClass="bg-red-50 border-red-200 text-red-800" />
        )}

        {behavior.prevention_tips && behavior.prevention_tips.length > 0 && (
          <Section title="Prevention Ideas" items={behavior.prevention_tips} colorClass="bg-blue-50 border-blue-200 text-blue-800" />
        )}

        {behavior.reinforcement_rewards && behavior.reinforcement_rewards.length > 0 && (
          <Section title="Encouragement" items={behavior.reinforcement_rewards} colorClass="bg-teal-50 border-teal-200 text-teal-800" />
        )}

        {behavior.avoid && behavior.avoid.length > 0 && (
          <div className="mb-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Things to Avoid</h4>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-1">
              {behavior.avoid.map((a, i) => (
                <p key={i} className="text-sm text-red-800 flex items-start gap-2">
                  <span className="text-red-500 font-bold mt-0.5 flex-shrink-0">✕</span> {a}
                </p>
              ))}
            </div>
          </div>
        )}

        {behavior.when_to_contact_clinician && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-1">Contact Your Clinician If</p>
            <p className="text-sm text-amber-800">{behavior.when_to_contact_clinician}</p>
          </div>
        )}

        {(!behavior.do_this_right_now?.length && !behavior.interventions?.length) && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-yellow-800">No support steps are on file for this behavior.</p>
              <p className="text-sm text-yellow-700 mt-1">Please contact your clinician for guidance.</p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3 mt-2">
          <Phone className="w-4 h-4 text-red-600 flex-shrink-0" />
          <p className="text-xs text-red-700 font-medium">If there is immediate danger, call 911 or emergency services.</p>
        </div>
      </div>
    </div>
  );
}

export default function BehaviorSelector({ child, profile, loadingProfile, profileLoadError, onBack, onOpenSafety, onDismiss, isIndividual, parentDirect = false, logEngagement = true }) {
  const [selectedBehavior, setSelectedBehavior] = useState(null);

  const behaviors = normalizeBehaviorRows(profile?.behaviors).filter((behavior) => {
    if (parentDirect) return behavior.parentDirectEligible === true;
    return hasCurrentClinicalApproval(behavior)
      && (!requiresPlanBinding(behavior)
        || (
          textValue(behavior.planId ?? behavior.plan_id).length > 0
          && textValue(behavior.childId ?? behavior.child_id) === textValue(child?.id)
          && ["approved", "active"].includes(textValue(behavior.planStatus ?? behavior.plan_status).toLowerCase())
        ));
  });

  const handleSelectBehavior = (behavior) => {
    if (logEngagement && child) {
      base44.entities.EngagementEvent.create({
        child_id: child.id,
        clinician_id: child.clinician_id,
        event_type: "behavior_viewed",
        topic: behavior.name,
      }).catch(() => {});
    }
    setSelectedBehavior(behavior);
  };

  if (selectedBehavior) {
    return <BehaviorCard behavior={selectedBehavior} child={child} isIndividual={isIndividual} onBack={() => setSelectedBehavior(null)} />;
  }

  return (
    <div>
      <div className="sticky top-0 bg-background border-b border-border px-5 py-4 flex items-center gap-3 z-10">
        <button type="button" onClick={onBack} className="min-w-[40px] min-h-[40px] flex items-center justify-center text-muted-foreground hover:text-foreground rounded-xl hover:bg-muted transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <p className="font-bold text-foreground text-sm">Help With a Behavior</p>
          {child && <p className="text-xs text-muted-foreground">{child.child_name} · available support guidance</p>}
        </div>
        <button type="button" onClick={onDismiss} className="min-w-[40px] min-h-[40px] flex items-center justify-center text-muted-foreground hover:text-foreground rounded-xl hover:bg-muted transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-5">
        {loadingProfile ? (
          <div className="py-12 text-center">
            <div className="w-10 h-10 border-4 border-border border-t-primary rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Loading {child?.child_name}'s plans...</p>
          </div>
        ) : profileLoadError ? (
          <div role="alert" className="bg-red-50 border border-red-200 rounded-2xl p-5">
            <p className="text-sm font-semibold text-red-800 mb-1">Could not load this support information.</p>
            <p className="text-sm text-red-700">Return to the support menu and try again.</p>
          </div>
        ) : behaviors.length === 0 ? (
          <div className="py-8 space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-5">
              <p className="text-sm font-semibold text-yellow-800 mb-1">
                {parentDirect ? "No active support behaviors are available yet." : "No current approved behavior steps are available."}
              </p>
              <p className="text-sm text-yellow-700">
                {parentDirect
                  ? "Return to the dashboard to add a behavior or upload a support plan. Only active, non-conflicting support guidance appears here."
                  : "This screen only shows guidance with current clinical review details. It will not use draft, expired, or unreviewed guidance. You can still check the safety plan or contact your care team."}
              </p>
              {!parentDirect && (
                <button type="button" onClick={onOpenSafety || onBack} className="mt-4 min-h-11 rounded-xl border border-yellow-300 bg-white px-4 text-sm font-semibold text-yellow-900">
                  Open safety plan
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4">What is happening right now? Select the situation.</p>
            <div className="grid grid-cols-2 gap-3">
              {behaviors.map((behavior, i) => {
                const colors = BEHAVIOR_COLORS[i % BEHAVIOR_COLORS.length];
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSelectBehavior(behavior)}
                    className={`${colors.bg} border-2 ${colors.border} rounded-2xl p-4 text-left transition-all hover:scale-[1.02] active:scale-100`}
                  >
                    <p className={`text-sm font-semibold leading-snug ${colors.text}`}>{behavior.name}</p>
                    {behavior.sourceLabel && <span className="text-[11px] font-medium text-muted-foreground">{behavior.sourceLabel}</span>}
                    <ChevronRight className={`w-4 h-4 mt-1 opacity-60 ${colors.text}`} />
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground text-center mt-4">
              Only showing support information available for {child?.child_name}.
            </p>
          </>
        )}
      </div>
    </div>
  );
}