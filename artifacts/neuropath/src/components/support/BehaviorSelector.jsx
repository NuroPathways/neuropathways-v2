import { useState } from "react";
import { base44 } from '@/api/entities';
import { ArrowLeft, X, Phone, ArrowRight } from "lucide-react";
import { MenuRow } from "@workspace/neuropathways-foundations/components/ui/menu-row";
import { Disclosure } from "@workspace/neuropathways-foundations/components/ui/disclosure";

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
    replacement_skill: textValue(raw.replacement_skill ?? raw.replacementSkill ?? raw.replacement_skill_description),
    track: listItems(raw.track ?? raw.what_to_track ?? raw.whatToTrack),
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

function EmergencyLine() {
  return (
    <p className="np-help-emergency" role="note">
      <Phone aria-hidden="true" />
      <span>If there is immediate danger, call 911 or emergency services.</span>
    </p>
  );
}

function SourceNote({ count }) {
  if (count >= 3) return null;
  return (
    <p className="np-help-muted">
      Only {count} source-grounded {count === 1 ? "item is" : "items are"} available in this section. No extra steps have been added.
    </p>
  );
}

// Non-urgent supporting information: collapsed by default via package Disclosure.
function Section({ title, items, testId }) {
  if (!items || items.length === 0) return null;
  const visibleItems = items.slice(0, 5);
  return (
    <Disclosure className="np-help-disclosure" title={title} data-testid={testId}>
      <ol className="np-help-steps">
        {visibleItems.map((item, i) => <li key={i}><span>{item}</span></li>)}
      </ol>
      <SourceNote count={visibleItems.length} />
    </Disclosure>
  );
}

function BehaviorCard({ behavior, child, isIndividual, onBack }) {
  const name = child?.child_name;
  const [stepIndex, setStepIndex] = useState(0);
  const [showSimpler, setShowSimpler] = useState(false);
  const immediateSteps = behavior.do_this_right_now?.length ? behavior.do_this_right_now : behavior.interventions || [];
  const simplerStep = behavior.if_it_escalates?.[0] || behavior.when_to_contact_clinician || "Pause the activity if you can do so safely. Offer a familiar, lower-demand option and give space.";
  const firstExplanation = behavior.what_may_be_happening ? behavior.what_may_be_happening.split(/[.!?]\s/)[0] : "";
  const hasOptional = Boolean(behavior.what_may_be_happening)
    || behavior.prevention_tips?.length > 0
    || behavior.reinforcement_rewards?.length > 0
    || Boolean(behavior.replacement_skill)
    || behavior.track?.length > 0;

  return (
    <div>
      <div className="np-help-bar">
        <button type="button" onClick={onBack} aria-label="Back to behavior list" data-testid="button-back-behaviors" className="np-help-icon-btn">
          <ArrowLeft aria-hidden="true" />
        </button>
        <div className="np-help-bar-title">
          <h2 data-testid="text-behavior-name">{behavior.name}</h2>
          <p>{behavior.sourceLabel || "Support guidance"}</p>
        </div>
      </div>

      <div className="np-help-body">
        <section className="np-help-active" aria-live="polite" data-testid="section-active-step">
          <p className="np-help-label">
            {showSimpler
              ? "A simpler supported step"
              : immediateSteps.length
                ? <>Try one step · Step {Math.min(stepIndex, immediateSteps.length - 1) + 1}</>
                : "Try one step"}
          </p>
          {showSimpler
            ? <p className="np-help-active-step" data-testid="text-simpler-step">{simplerStep}</p>
            : immediateSteps.length
              ? <>
                <p className="np-help-active-step" data-testid="text-active-step">{immediateSteps[Math.min(stepIndex, immediateSteps.length - 1)]}</p>
                <div className="np-help-step-nav">
                  <button type="button" disabled={stepIndex === 0} onClick={() => setStepIndex((value) => Math.max(0, value - 1))} data-testid="button-step-back" className="np-help-btn">Back</button>
                  <span aria-live="polite">Step {stepIndex + 1} of {immediateSteps.length}</span>
                  <button type="button" disabled={stepIndex >= immediateSteps.length - 1} onClick={() => setStepIndex((value) => Math.min(immediateSteps.length - 1, value + 1))} data-testid="button-step-next" data-variant="primary" className="np-help-btn">Next<ArrowRight aria-hidden="true" /></button>
                </div>
              </>
              : <p className="np-help-active-step">No immediate step is saved for this support area. Pause, reduce demands if possible, and use the safety information below.</p>}
          <button type="button" onClick={() => setShowSimpler((value) => !value)} data-testid="button-toggle-simpler" className="np-help-btn" style={{ justifySelf: "start" }}>
            {showSimpler ? "Return to saved step" : "This isn't working"}
          </button>
        </section>

        <p className="np-help-muted">
          {behavior.sourceLabel || "Source not available"}. Any explanation here is a possibility, not a conclusion. Use only what feels safe.
        </p>

        {(!behavior.do_this_right_now?.length && !behavior.interventions?.length) && (
          <div className="np-help-notice" data-tone="caution" role="status">
            <p className="np-help-text np-help-strong">No support steps are on file for this behavior.</p>
            <p className="np-help-text">Please contact your clinician for guidance.</p>
          </div>
        )}

        {behavior.if_it_escalates?.length > 0 && (
          <section className="np-help-group np-help-urgent-section" data-testid="section-escalation">
            <h3 className="np-help-label">If it escalates</h3>
            <ol className="np-help-steps">
              {behavior.if_it_escalates.map((instruction, index) => (
                <li key={index}><span>{instruction}</span></li>
              ))}
            </ol>
          </section>
        )}

        {behavior.avoid && behavior.avoid.length > 0 && (
          <section className="np-help-group np-help-urgent-section" data-testid="section-avoid">
            <h3 className="np-help-label">Things to Avoid</h3>
            <ul className="np-help-bullets">
              {behavior.avoid.slice(0, 5).map((a, i) => <li key={i}>{a}</li>)}
            </ul>
            {behavior.avoid.length < 3 && <p className="np-help-muted">Only {behavior.avoid.length} source-grounded {behavior.avoid.length === 1 ? "item is" : "items are"} available. No extra guidance has been added.</p>}
          </section>
        )}

        {behavior.when_to_contact_clinician && (
          <section className="np-help-group np-help-urgent-section" data-testid="section-contact-clinician">
            <h3 className="np-help-label">Contact Your Clinician If</h3>
            <p className="np-help-text">{behavior.when_to_contact_clinician}</p>
          </section>
        )}

        {hasOptional && (
          <div className="np-help-disclosures">
            {behavior.what_may_be_happening && (
              <Disclosure className="np-help-disclosure" title="One possible explanation" data-testid="disclosure-explanation">
                <p className="np-help-text">{firstExplanation}{/[.!?]$/.test(firstExplanation) ? "" : "."}</p>
              </Disclosure>
            )}
            {behavior.prevention_tips && behavior.prevention_tips.length > 0 && (
              <Section title="Prevention Ideas" items={behavior.prevention_tips} testId="disclosure-prevention" />
            )}
            {behavior.reinforcement_rewards && behavior.reinforcement_rewards.length > 0 && (
              <Section title="Encouragement" items={behavior.reinforcement_rewards} testId="disclosure-encouragement" />
            )}
            {(behavior.replacement_skill || behavior.reinforcement_rewards?.length > 0) && (
              <Section
                title="Practice a helpful skill"
                items={[behavior.replacement_skill, ...(behavior.reinforcement_rewards || [])].filter(Boolean)}
                testId="disclosure-skill"
              />
            )}
            {behavior.track?.length > 0 && (
              <Section title="What to notice" items={behavior.track} testId="disclosure-notice" />
            )}
          </div>
        )}

        <EmergencyLine />
      </div>
    </div>
  );
}

export default function BehaviorSelector({ child, profile, loadingProfile, profileLoadError, onBack, onOpenSafety, onDismiss, isIndividual, parentDirect = false, logEngagement = true }) {
  const [selectedBehavior, setSelectedBehavior] = useState(null);

  const behaviors = normalizeBehaviorRows(profile?.behaviors).filter((behavior) => {
    if (behavior.conflict === true || Boolean(textValue(behavior.conflictMessage ?? behavior.conflict_message))) return false;
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
      <div className="np-help-bar">
        <button type="button" onClick={onBack} aria-label="Back to support options" data-testid="button-back-support" className="np-help-icon-btn">
          <ArrowLeft aria-hidden="true" />
        </button>
        <div className="np-help-bar-title">
          <h2>Help With a Behavior</h2>
          {child && <p>{child.child_name} · available support guidance</p>}
        </div>
        <button type="button" onClick={onDismiss} aria-label="Close support" data-testid="button-close-support" className="np-help-icon-btn">
          <X aria-hidden="true" />
        </button>
      </div>

      <div className="np-help-body">
        {loadingProfile ? (
          <div className="np-help-group" aria-busy="true">
            <p role="status" className="np-help-muted">Loading {child?.child_name}'s saved support guidance…</p>
            <div role="alert" className="np-help-notice" data-tone="urgent">
              <p className="np-help-text np-help-strong">Emergency help is available now.</p>
              <p className="np-help-text">If anyone is in immediate danger or hurt, call your local emergency number.</p>
              <button type="button" onClick={onOpenSafety || onBack} data-testid="button-open-safety-loading" data-variant="urgent" className="np-help-btn">Open safety information</button>
            </div>
          </div>
        ) : profileLoadError ? (
          <div role="alert" className="np-help-notice" data-tone="urgent">
            <p className="np-help-text np-help-strong">Could not load this support information.</p>
            <p className="np-help-text">Return to the support menu and try again.</p>
          </div>
        ) : behaviors.length === 0 ? (
          <div className="np-help-notice" data-tone="caution">
            <p className="np-help-text np-help-strong">
              {parentDirect ? "No active support behaviors are available yet." : "No current approved behavior steps are available."}
            </p>
            <p className="np-help-text">
              {parentDirect
                ? "Return to the dashboard to add a behavior or upload a support plan. Only active, non-conflicting support guidance appears here."
                : "This screen only shows guidance with current clinical review details. It will not use draft, expired, or unreviewed guidance. You can still check the safety plan or contact your care team."}
            </p>
            {!parentDirect && (
              <button type="button" onClick={onOpenSafety || onBack} data-testid="button-open-safety-plan" data-variant="urgent" className="np-help-btn">
                Open safety plan
              </button>
            )}
          </div>
        ) : (
          <div className="np-help-group">
            <p className="np-help-text">What is happening right now? Select the situation.</p>
            <div className="np-help-options">
              {behaviors.map((behavior, i) => (
                <MenuRow
                  key={i}
                  onClick={() => handleSelectBehavior(behavior)}
                  data-testid={`button-behavior-${i}`}
                  className="np-help-option"
                  label={behavior.name}
                  description={behavior.sourceLabel || "Source not available"}
                />
              ))}
            </div>
            <p className="np-help-muted">
              Only showing support information available for {child?.child_name}.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
