import { useLayoutEffect, useRef, useState } from "react";
import { base44 } from '@/api/entities';
import { ArrowLeft, X, Phone, ArrowRight } from "lucide-react";
import { MenuRow } from "@workspace/neuropathways-foundations/components/ui/menu-row";
import { Disclosure } from "@workspace/neuropathways-foundations/components/ui/disclosure";
import { Button } from "@workspace/neuropathways-foundations/components/ui/button";
import { Input } from "@workspace/neuropathways-foundations/components/ui/input";
import { getBehaviorAppearance } from "./behaviorVisuals";
import {
  supportSourceDocumentIds,
  supportUploadIsFamilyOwned,
  supportUploadSourceLabel,
} from "./supportUploadSource";

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

function removeRepeatedSupportPhrases(value) {
  const sentenceSeen = new Set();
  let text = value.split(/(?<=[.!?])\s+/)
    .filter((sentence) => {
      const key = sentence.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      if (!key || sentenceSeen.has(key)) return false;
      sentenceSeen.add(key);
      return true;
    })
    .join(" ");
  const tokens = [...text.matchAll(/\S+/g)].map((match) => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
    normalized: match[0].toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""),
  }));
  const removed = new Set();
  const maxPhraseLength = Math.min(32, Math.floor(tokens.length / 2));

  for (let phraseLength = maxPhraseLength; phraseLength >= 7; phraseLength -= 1) {
    const seen = new Set();
    for (let start = 0; start + phraseLength <= tokens.length; start += 1) {
      const end = start + phraseLength;
      if (tokens.slice(start, end).some((_, offset) => removed.has(start + offset))) continue;
      const words = tokens.slice(start, end).map((token) => token.normalized);
      if (words.some((word) => !word)) continue;
      const key = words.join(" ");
      if (seen.has(key)) {
        for (let index = start; index < end; index += 1) removed.add(index);
      } else {
        seen.add(key);
      }
    }
  }

  const ranges = [];
  for (let index = 0; index < tokens.length;) {
    if (!removed.has(index)) {
      index += 1;
      continue;
    }
    const start = index;
    while (index + 1 < tokens.length && removed.has(index + 1)) index += 1;
    ranges.push({ start: tokens[start].start, end: tokens[index].end });
    index += 1;
  }
  for (const range of ranges.reverse()) {
    text = `${text.slice(0, range.start)} ${text.slice(range.end)}`;
  }
  return text.replace(/\s+([,.;:!?])/g, "$1").replace(/\s+/g, " ").trim();
}

function supportFactText(value) {
  const text = textValue(value);
  if (!text) return "";
  const unhelpfulGap = /\b(?:the (?:document|source|notes|record|report) (?:does not|doesn't|did not|didn't|never) (?:specify|state|mention|identify|describe|establish)|(?:frequency|intensity|duration|specific triggers?) (?:is not|isn't|was not|wasn't|are not|aren't|were not|weren't) (?:specified|stated|documented|identified)|no safe (?:general|document-informed|prevention|support|practice)|not enough evidence to|the source does not establish)\b/i;
  const aiSuggestionLabelCopy = /\b(?:AI[- ]generated|AI suggestions?|suggested by AI)\b/i;
  return removeRepeatedSupportPhrases(
    text.split(/(?<=[.!?])\s+/)
      .filter((sentence) => !unhelpfulGap.test(sentence) && !aiSuggestionLabelCopy.test(sentence))
      .join(" ")
      .trim(),
  );
}

function documentFactSummary(behavior) {
  return [...new Set([
    supportFactText(behavior.description),
    ...listItems(behavior.contexts).map((item) => `Documented context: ${supportFactText(item)}`),
    ...listItems(behavior.observations).map((item) => `Documented observation: ${supportFactText(item)}`),
  ].filter(Boolean))];
}

function normalizeBehavior(value, index) {
  const raw = isRecord(value) ? value : { name: typeof value === "string" ? value : "" };
  const behaviorKey = textValue(raw.behaviorKey ?? raw.behavior_key ?? raw.key);
  const name = supportFactText(raw.name ?? raw.behaviorName ?? raw.behavior_name ?? raw.title) || `Behavior ${index + 1}`;

  return {
    ...raw,
    id: textValue(raw.id ?? raw.behaviorId ?? raw.behavior_id) || `${behaviorKey || "behavior"}-${name}`,
    behaviorKey,
    name,
    sourceLabel: textValue(raw.sourceLabel ?? raw.source_label),
    what_may_be_happening: textValue(raw.what_may_be_happening ?? raw.whatMayBeHappening ?? raw.context),
    contextLabels: listItems(raw.triggers ?? raw.contextTags ?? raw.context_tags),
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

function normalizeBehaviorRows(value, profile) {
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
  if (!Array.isArray(rows)) return [];
  const sourceDocuments = Array.isArray(profile?.sourceDocuments) ? profile.sourceDocuments : [];
  const profileSourceDocIds = supportSourceDocumentIds(profile);
  const clinicianId = profile?.child?.clinicianId ?? profile?.child?.clinician_id;
  return rows.map(normalizeBehavior).filter((behavior) => behavior.name.trim()).map((behavior) => {
    const ids = supportSourceDocumentIds(behavior, profileSourceDocIds);
    const fallback = /^clinician-uploaded\b/i.test(behavior.sourceLabel)
      ? "Clinician-uploaded"
      : "Upload source unavailable";
    return {
      ...behavior,
      sourceLabel: supportUploadSourceLabel(sourceDocuments, ids, clinicianId, fallback),
    };
  });
}

function normalizeDocumentConcernRows(value, sourceDocuments = [], clinicianId = null) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!isRecord(row) || typeof row.id !== "string" || typeof row.behaviorName !== "string") return [];
    const sourceReferences = Array.isArray(row.sourceReferences)
      ? row.sourceReferences.filter((reference) => isRecord(reference)
        && typeof reference.title === "string"
        && typeof reference.excerpt === "string")
        .slice(0, 20)
      : [];
    if (!sourceReferences.length) return [];
    const safetySensitiveTopic = row.safetySensitiveTopic === true;
    const sourceReferencesWithOwner = sourceReferences.map((reference) => {
      const sourceDocument = sourceDocuments.find((document) =>
        String(document?.id ?? "") === String(reference.documentId ?? ""),
      );
      const uploadedBy = reference.uploadedBy ?? sourceDocument?.uploadedBy ?? sourceDocument?.uploaded_by;
      return {
        ...reference,
        uploadedBy,
        familyUploaded: supportUploadIsFamilyOwned({ uploadedBy }),
        title: supportFactText(reference.title) || "Uploaded document",
        section: supportFactText(reference.section),
        excerpt: supportFactText(reference.excerpt),
      };
    });
    const allSourcesFamilyUploaded = sourceReferencesWithOwner.length > 0 &&
      sourceReferencesWithOwner.every((reference) => reference.familyUploaded);
    const sourceReviewRequired = !allSourcesFamilyUploaded &&
      (row.sourceReviewRequired === true || row.reviewStatus === "needs_review");
    const generalSupportSuggestions = safetySensitiveTopic || sourceReviewRequired
      ? []
      : listItems(row.generalSupportSuggestions).map(supportFactText).filter(Boolean).slice(0, 5);
    return [{
      ...row,
      id: row.id,
      name: supportFactText(row.displayName) || supportFactText(row.behaviorName) || "Document support area",
      originalName: supportFactText(row.behaviorName) || "Document support area",
      description: supportFactText(row.description),
      contexts: listItems(row.contexts).map(supportFactText).filter(Boolean),
      observations: listItems(row.observations).map(supportFactText).filter(Boolean),
      uncertainty: listItems(row.uncertainty).map(supportFactText).filter(Boolean),
      generalSupportSuggestions,
      supportSections: safetySensitiveTopic || sourceReviewRequired
        ? {
          tryOneSteps: [],
          simplerStep: "",
          thingsToAvoid: [],
          whatMayBeHappening: [],
          preventionIdeas: [],
          encouragement: [],
          practiceSkill: [],
          whatToNotice: [],
        }
        : {
          tryOneSteps: listItems(row.supportSections?.tryOneSteps).map(supportFactText).filter(Boolean).slice(0, 5)
            .concat(listItems(row.supportSections?.tryOneSteps).length ? [] : generalSupportSuggestions).slice(0, 5),
          simplerStep: supportFactText(row.supportSections?.simplerStep),
          thingsToAvoid: listItems(row.supportSections?.thingsToAvoid).map(supportFactText).filter(Boolean).slice(0, 5),
          whatMayBeHappening: listItems(row.supportSections?.whatMayBeHappening).map(supportFactText).filter(Boolean).slice(0, 4),
          preventionIdeas: listItems(row.supportSections?.preventionIdeas).map(supportFactText).filter(Boolean).slice(0, 5),
          encouragement: listItems(row.supportSections?.encouragement).map(supportFactText).filter(Boolean).slice(0, 5),
          practiceSkill: listItems(row.supportSections?.practiceSkill).map(supportFactText).filter(Boolean).slice(0, 5),
          whatToNotice: listItems(row.supportSections?.whatToNotice).map(supportFactText).filter(Boolean).slice(0, 5),
        },
      safetySensitiveTopic,
      sourceReviewRequired,
      sourceReferences: sourceReferencesWithOwner,
      missingClinicalInformation: listItems(row.missingClinicalInformation)
        .map(supportFactText)
        .filter(Boolean)
        .filter((item) => !allSourcesFamilyUploaded ||
          !/source excerpts? (?:still )?need review|excerpts have not been verified|suggestions are withheld until the source is reviewed|review the source before relying/i.test(item)),
      documentInformed: true,
      sourceLabel: supportUploadSourceLabel(
        sourceReferencesWithOwner.map((reference) => ({
          id: reference.documentId,
          uploadedBy: reference.uploadedBy,
        })),
        supportSourceDocumentIds(row, sourceReferences.map((reference) => reference.documentId)),
        clinicianId,
      ),
      reviewLabel: allSourcesFamilyUploaded
        ? "Self-uploaded document"
        : sourceReviewRequired ? "Needs source review" : "Not clinician-reviewed",
    }];
  });
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
function Section({ title, items = [], testId, tone = "default", emptyText, showSourceNote = true }) {
  const visibleItems = items.slice(0, 5);
  if (visibleItems.length === 0 && !emptyText) return null;
  return (
    <Disclosure className={`np-help-disclosure np-help-disclosure--${tone}`} title={title} data-testid={testId}>
      {visibleItems.length > 0 ? (
        <ol className="np-help-steps">
          {visibleItems.map((item, i) => <li key={i}><span>{item}</span></li>)}
        </ol>
      ) : (
        <p className="np-help-muted" data-testid={`${testId}-empty`}>{emptyText}</p>
      )}
      {visibleItems.length > 0 && showSourceNote && <SourceNote count={visibleItems.length} />}
    </Disclosure>
  );
}

function TryOneStepPanel({ steps = [], simplerStep, tone = "immediate", emptyText, emptyLabel, strategyLabel, showStepList = false }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [showSimpler, setShowSimpler] = useState(false);
  const visibleSteps = Array.isArray(steps) ? steps : [];
  return (
    <section className="np-help-active" data-testid="section-active-step" data-tone={tone}>
      {strategyLabel && <p className="np-help-label" data-testid="label-strategy-source">{strategyLabel}</p>}
      <p className="np-help-label">
        {showSimpler
          ? "A simpler supported step"
          : visibleSteps.length
            ? <>Try one step · Step {Math.min(stepIndex, visibleSteps.length - 1) + 1}</>
            : emptyLabel || "Try one step"}
      </p>
      {showSimpler
        ? <p className="np-help-active-step" data-testid="text-simpler-step">{simplerStep}</p>
        : visibleSteps.length
          ? <>
            {showStepList
              ? <ol className="np-help-steps" data-tone={tone}>
                {visibleSteps.map((instruction, index) => (
                  <li key={index} aria-current={index === stepIndex ? "step" : undefined}>
                    <span data-testid={index === stepIndex ? "text-active-step" : undefined} aria-live={index === stepIndex ? "polite" : undefined}>
                      {instruction}
                    </span>
                  </li>
                ))}
              </ol>
              : <p className="np-help-active-step" data-testid="text-active-step" aria-live="polite">
                {visibleSteps[Math.min(stepIndex, visibleSteps.length - 1)]}
              </p>}
            <div className="np-help-step-nav">
              <button type="button" disabled={stepIndex === 0} onClick={() => setStepIndex((value) => Math.max(0, value - 1))} data-testid="button-step-back" className="np-help-btn">Back</button>
              <span aria-live="polite">Step {stepIndex + 1} of {visibleSteps.length}</span>
              <button type="button" disabled={stepIndex >= visibleSteps.length - 1} onClick={() => setStepIndex((value) => Math.min(visibleSteps.length - 1, value + 1))} data-testid="button-step-next" data-variant="primary" className="np-help-btn">Next<ArrowRight aria-hidden="true" /></button>
            </div>
          </>
          : <p className="np-help-active-step" data-testid="document-support-try-one-step-empty">{emptyText}</p>}
      <button type="button" onClick={() => setShowSimpler((value) => !value)} data-testid="button-toggle-simpler" className="np-help-btn" style={{ justifySelf: "start" }}>
        {showSimpler ? "Return to saved step" : "This isn't working"}
      </button>
    </section>
  );
}

function BehaviorCard({ behavior, child, isIndividual, parentDirect, onBack, onOpenSafety }) {
  const directSteps = behavior.do_this_right_now || [];
  const strategies = behavior.interventions || [];
  const immediateSteps = directSteps.length ? directSteps : strategies;
  const strategyIsClinicallyApproved = hasCurrentClinicalApproval(behavior);
  const activeTone = directSteps.length ? "immediate" : "strategy";
  const appearance = getBehaviorAppearance(behavior);
  const BehaviorIcon = appearance.Icon;
  const simplerStep = behavior.if_it_escalates?.[0] || behavior.when_to_contact_clinician || "Pause the activity if you can do so safely. Offer a familiar, lower-demand option and give space.";
  const firstExplanation = behavior.what_may_be_happening ? behavior.what_may_be_happening.split(/[.!?]\s/)[0] : "";
  const hasOptional = Boolean(behavior.what_may_be_happening)
    || behavior.contextLabels?.length > 0
    || behavior.prevention_tips?.length > 0
    || behavior.reinforcement_rewards?.length > 0
    || Boolean(behavior.replacement_skill)
    || behavior.track?.length > 0;

  if (behavior.emergencyOnly || behavior.documentReferencedOnly) {
    return (
      <div>
        <div className="np-help-bar">
          <button type="button" onClick={onBack} aria-label="Back to behavior list" data-testid="button-back-behaviors" className="np-help-icon-btn">
            <ArrowLeft aria-hidden="true" />
          </button>
          <div className="np-help-bar-title">
            <h2 data-testid="text-behavior-name">
              <span className={`np-help-guidance-icon ${appearance.iconClasses}`} aria-hidden="true"><BehaviorIcon /></span>
              {behavior.name}
            </h2>
            <p>{behavior.sourceLabel || "Upload source unavailable"}</p>
          </div>
        </div>
        <div className="np-help-body">
          {behavior.emergencyOnly ? (
            <div className="np-help-notice" data-tone="urgent" data-testid="notice-emergency-only">
              <p className="np-help-text np-help-strong">No individualized support steps are available for this situation yet.</p>
              <p className="np-help-text">Follow the child’s current written safety plan, if available. If anyone is in immediate danger or hurt, call 911 or local emergency services.</p>
            </div>
          ) : (
            <div className="np-help-notice" data-tone="caution" data-testid="notice-document-excerpt">
              <p className="np-help-text np-help-strong">From your uploaded plan: {behavior.documentTitle || "Document excerpt"}</p>
              <blockquote className="np-help-text" data-testid="text-source-excerpt">{behavior.documentExcerpt}</blockquote>
              <p className="np-help-text">This excerpt is shown as written. It has not been reviewed by your clinician, and no new strategy has been added.</p>
              <p className="np-help-text">If anyone is in immediate danger, call 911 or local emergency services.</p>
            </div>
          )}
          <button type="button" onClick={onOpenSafety || onBack} data-testid="button-open-safety-restricted" data-variant="urgent" className="np-help-btn">
            Open safety information
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="np-help-bar">
        <button type="button" onClick={onBack} aria-label="Back to behavior list" data-testid="button-back-behaviors" className="np-help-icon-btn">
          <ArrowLeft aria-hidden="true" />
        </button>
        <div className="np-help-bar-title">
          <h2 data-testid="text-behavior-name">
            <span className={`np-help-guidance-icon ${appearance.iconClasses}`} aria-hidden="true"><BehaviorIcon /></span>
            {behavior.name}
          </h2>
          <p>{behavior.sourceLabel || "Upload source unavailable"}</p>
        </div>
      </div>

      <div className="np-help-body">
        <TryOneStepPanel
          steps={immediateSteps}
          simplerStep={simplerStep}
          tone={activeTone}
          emptyText="No immediate step is saved for this support area. Pause, reduce demands if possible, and use the safety information below."
          strategyLabel={!directSteps.length && strategies.length > 0
            ? strategyIsClinicallyApproved ? "Clinician-approved strategies" : "Saved support strategies"
            : undefined}
          showStepList={!directSteps.length}
        />

        {directSteps.length > 0 && strategies.length > 0 && (
          <section className="np-help-group np-help-guidance-section" data-tone="strategy" data-testid="section-clinical-strategies">
            <h3 className="np-help-label">
              {strategyIsClinicallyApproved ? "Clinician-approved strategies" : "Saved support strategies"}
            </h3>
            <ol className="np-help-steps" data-tone="strategy">
              {strategies.map((strategy, index) => <li key={index}><span>{strategy}</span></li>)}
            </ol>
          </section>
        )}

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
            <ol className="np-help-steps" data-tone="urgent">
              {behavior.if_it_escalates.map((instruction, index) => (
                <li key={index}><span>{instruction}</span></li>
              ))}
            </ol>
          </section>
        )}

        {behavior.avoid && behavior.avoid.length > 0 && (
          <section className="np-help-group np-help-urgent-section" data-testid="section-avoid">
            <h3 className="np-help-label">Things to Avoid</h3>
            <ul className="np-help-bullets" data-tone="urgent">
              {behavior.avoid.slice(0, 5).map((a, i) => <li key={i}>{a}</li>)}
            </ul>
            {behavior.avoid.length < 3 && <p className="np-help-muted">Only {behavior.avoid.length} source-grounded {behavior.avoid.length === 1 ? "item is" : "items are"} available. No extra guidance has been added.</p>}
          </section>
        )}

        {behavior.when_to_contact_clinician && (
          <section className="np-help-group np-help-urgent-section" data-tone="urgent" data-testid="section-contact-clinician">
            <h3 className="np-help-label">Contact Your Clinician If</h3>
            <p className="np-help-text">{behavior.when_to_contact_clinician}</p>
          </section>
        )}

        {hasOptional && (
          <div className="np-help-disclosures">
            {behavior.what_may_be_happening && (
              <Disclosure className="np-help-disclosure np-help-disclosure--context" title="What may be happening" data-testid="disclosure-explanation">
                <p className="np-help-text">{firstExplanation}{/[.!?]$/.test(firstExplanation) ? "" : "."}</p>
                {behavior.contextLabels?.length > 0 && (
                  <div className="np-help-context-chips" aria-label="Context labels from the saved support information">
                    {behavior.contextLabels.map((label, index) => <span key={index} className="np-help-context-chip">{label}</span>)}
                  </div>
                )}
              </Disclosure>
            )}
            {!behavior.what_may_be_happening && behavior.contextLabels?.length > 0 && (
              <section className="np-help-disclosure np-help-disclosure--context" aria-label="What may be happening">
                <p className="np-help-label">What may be happening</p>
                <div className="np-help-context-chips" aria-label="Context labels from the saved support information">
                  {behavior.contextLabels.map((label, index) => <span key={index} className="np-help-context-chip">{label}</span>)}
                </div>
              </section>
            )}
            {behavior.prevention_tips && behavior.prevention_tips.length > 0 && (
              <Section title="Prevention Ideas" items={behavior.prevention_tips} testId="disclosure-prevention" tone="prevention" />
            )}
            {behavior.reinforcement_rewards && behavior.reinforcement_rewards.length > 0 && (
              <Section title="Encouragement" items={behavior.reinforcement_rewards} testId="disclosure-encouragement" tone="encouragement" />
            )}
            {(behavior.replacement_skill || behavior.reinforcement_rewards?.length > 0) && (
              <Section
                title="Practice a helpful skill"
                items={[behavior.replacement_skill, ...(behavior.reinforcement_rewards || [])].filter(Boolean)}
                testId="disclosure-skill"
                tone="skill"
              />
            )}
            {behavior.track?.length > 0 && (
              <Section title="What to notice" items={behavior.track} testId="disclosure-notice" tone="context" />
            )}
          </div>
        )}

        <EmergencyLine />
      </div>
    </div>
  );
}

function DocumentInformedBehaviorCard({ behavior, child, parentDirect, onBack, onOpenSafety, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(behavior.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const appearance = getBehaviorAppearance({ name: behavior.name });
  const BehaviorIcon = appearance.Icon;
  const documentedFacts = documentFactSummary(behavior);
  const tryOneSteps = behavior.supportSections.tryOneSteps.length
    ? behavior.supportSections.tryOneSteps
    : behavior.generalSupportSuggestions;
  const sourceSummary = documentedFacts[0] || behavior.observations[0] || behavior.contexts[0] || "";

  const update = async (action, nextLabel) => {
    setSaving(true);
    setError("");
    try {
      const updated = await onUpdate?.(behavior.id, {
        action,
        ...(action === "rename" ? { label: nextLabel } : {}),
      });
      if (!updated) throw new Error("The suggestion could not be updated. Please try again.");
      if (action === "rename") {
        setLabel(updated.displayName || nextLabel);
        setEditing(false);
      } else if (action === "dismiss") {
        onBack();
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The suggestion could not be updated.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="np-help-bar">
        <button type="button" onClick={onBack} aria-label="Back to behavior list" data-testid="button-back-behaviors" className="np-help-icon-btn">
          <ArrowLeft aria-hidden="true" />
        </button>
        <div className="np-help-bar-title">
          <h2 data-testid="text-behavior-name">
            <span className={`np-help-guidance-icon ${appearance.iconClasses}`} aria-hidden="true"><BehaviorIcon /></span>
            {behavior.name}
          </h2>
          <p>{behavior.sourceLabel}</p>
        </div>
      </div>
      <div className="np-help-body" data-testid="document-informed-support-card">
        {behavior.reviewLabel !== behavior.sourceLabel && (
          <p className="np-help-label" data-testid="label-document-informed-status">{behavior.reviewLabel}</p>
        )}
        {behavior.sourceReviewRequired && (
          <div className="np-help-notice" data-tone="caution" role="note" data-testid="notice-source-review">
            <p className="np-help-text np-help-strong">Review the source before relying on this information.</p>
            <p className="np-help-text">One or more excerpts have not been verified. Suggestions are withheld until the source is reviewed.</p>
          </div>
        )}

        <TryOneStepPanel
          steps={tryOneSteps}
          simplerStep={behavior.supportSections.simplerStep || tryOneSteps[0] || sourceSummary}
          tone="immediate"
          emptyText={sourceSummary}
          emptyLabel="From the document"
        />

        {behavior.supportSections.thingsToAvoid.length > 0 && (
          <section className="np-help-group np-help-urgent-section" data-testid="section-avoid">
            <h3 className="np-help-label">Things to Avoid</h3>
            <ul className="np-help-bullets" data-tone="urgent">
              {behavior.supportSections.thingsToAvoid.map((item, index) => <li key={index}>{item}</li>)}
            </ul>
          </section>
        )}

        <div className="np-help-disclosures">
          <Disclosure className="np-help-disclosure np-help-disclosure--context" title="What may be happening" data-testid="disclosure-explanation">
            {behavior.supportSections.whatMayBeHappening.map((item, index) => <p className="np-help-text" key={index}>{item}</p>)}
            {documentedFacts.length > 0 && (
              <div className="np-help-context-chips" aria-label="Facts extracted from the uploaded document">
                {documentedFacts.map((item, index) => <span key={index} className="np-help-context-chip">{item}</span>)}
              </div>
            )}
          </Disclosure>
          <Section
            title="Prevention Ideas"
            items={behavior.supportSections.preventionIdeas}
            testId="disclosure-prevention"
            tone="prevention"
            showSourceNote={false}
          />
          <Section
            title="Encouragement"
            items={behavior.supportSections.encouragement}
            testId="disclosure-encouragement"
            tone="encouragement"
            showSourceNote={false}
          />
          <Section
            title="Practice a helpful skill"
            items={behavior.supportSections.practiceSkill}
            testId="disclosure-skill"
            tone="skill"
            showSourceNote={false}
          />
          <Section
            title="What to notice"
            items={[...new Set([...behavior.supportSections.whatToNotice, ...behavior.observations])]}
            testId="disclosure-notice"
            tone="context"
            showSourceNote={false}
          />
        </div>

        {behavior.safetySensitiveTopic && (
          <div className="np-help-notice" data-tone="urgent" role="note" data-testid="notice-document-safety">
            <p className="np-help-text np-help-strong">This concern is documented, but no individualized crisis or physical-intervention instructions are provided here.</p>
            <p className="np-help-text">Use the child’s current verified safety plan if available. If anyone is in immediate danger or hurt, call 911 or local emergency services.</p>
            <button type="button" onClick={onOpenSafety} data-testid="button-open-safety-for-document-concern" data-variant="urgent" className="np-help-btn">
              Open safety plan
            </button>
          </div>
        )}

        {behavior.missingClinicalInformation.length > 0 && (
          <Disclosure title="Review status and missing information" className="np-help-disclosure" data-testid="disclosure-document-review">
            <ul className="np-help-bullets">
              {behavior.missingClinicalInformation.map((item, index) => <li key={index}>{item}</li>)}
            </ul>
          </Disclosure>
        )}

        <section className="np-help-group" aria-label="Sources from uploaded documents">
          <h3 className="np-help-label">From your documents</h3>
          {behavior.sourceReferences.map((reference, index) => (
            <article className="np-help-notice" data-tone={reference.excerptVerified === false && !reference.familyUploaded ? "caution" : "context"} key={`${reference.documentId}-${index}`} data-testid="document-concern-source">
              <p className="np-help-text np-help-strong">{reference.title}</p>
              {reference.section && <p className="np-help-muted">{reference.section}{reference.page ? ` · Page ${reference.page}` : ""}</p>}
              {reference.excerptVerified === false && !reference.familyUploaded && <p className="np-help-text">Source excerpt needs review</p>}
              <blockquote className="np-help-text">{reference.excerpt}</blockquote>
            </article>
          ))}
        </section>

        {parentDirect && (
          <section className="np-help-group" aria-label="Correct this suggestion">
            {editing ? (
              <form onSubmit={(event) => { event.preventDefault(); void update("rename", label.trim()); }} className="np-help-group">
                <label className="np-help-label" htmlFor={`document-support-label-${behavior.id}`}>Correct support area name</label>
                <Input
                  id={`document-support-label-${behavior.id}`}
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  maxLength={160}
                  required
                />
                <p className="np-help-muted">This only changes the label shown to your family. It does not change the source documents or clinical review status.</p>
                <div className="np-help-step-nav">
                  <Button type="submit" disabled={saving || !label.trim()}>{saving ? "Saving…" : "Save label"}</Button>
                  <Button type="button" variant="outline" disabled={saving} onClick={() => { setLabel(behavior.name); setEditing(false); }}>Cancel</Button>
                </div>
              </form>
            ) : (
              <div className="np-help-step-nav">
                <Button type="button" variant="outline" onClick={() => setEditing(true)} data-testid="button-correct-support-label">Correct label</Button>
                <Button type="button" variant="outline" disabled={saving} onClick={() => void update("dismiss")} data-testid="button-dismiss-document-support">Dismiss suggestion</Button>
              </div>
            )}
            {error && <p className="np-help-notice" data-tone="urgent" role="alert">{error}</p>}
          </section>
        )}
        <EmergencyLine />
      </div>
    </div>
  );
}

export default function BehaviorSelector({ child, profile, loadingProfile, profileLoadError, onBack, onOpenSafety, onDismiss, isIndividual, parentDirect = false, logEngagement = true, onUpdateDocumentSupportCard }) {
  const [selectedBehavior, setSelectedBehavior] = useState(null);
  const viewRef = useRef(null);
  useLayoutEffect(() => {
    const dialog = viewRef.current?.closest(".np-help-dialog");
    if (dialog) dialog.scrollTop = 0;
  }, [selectedBehavior]);

  const behaviors = normalizeBehaviorRows(profile?.behaviors, { ...profile, child }).filter((behavior) => {
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
  const documentConcernCards = parentDirect
    ? normalizeDocumentConcernRows(profile?.documentSupportCards, profile?.sourceDocuments, child?.clinician_id ?? child?.clinicianId)
    : [];
  const activeDocumentConcernCards = documentConcernCards.filter((card) => !card.dismissed);
  const dismissedDocumentConcernCards = documentConcernCards.filter((card) => card.dismissed);
  const [documentCardUpdateError, setDocumentCardUpdateError] = useState("");

  const restoreDocumentConcern = async (cardId) => {
    setDocumentCardUpdateError("");
    try {
      await onUpdateDocumentSupportCard?.(cardId, { action: "restore" });
    } catch (error) {
      setDocumentCardUpdateError(error instanceof Error ? error.message : "The suggestion could not be restored.");
    }
  };

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
    if (selectedBehavior.documentInformed) {
      return (
        <div ref={viewRef}>
          <DocumentInformedBehaviorCard
            behavior={selectedBehavior}
            child={child}
            parentDirect={parentDirect}
            onBack={() => setSelectedBehavior(null)}
            onOpenSafety={onOpenSafety}
            onUpdate={async (cardId, update) => {
              const card = await onUpdateDocumentSupportCard?.(cardId, update);
              if (card) {
                const normalized = normalizeDocumentConcernRows([card])[0];
                if (normalized) setSelectedBehavior(normalized);
              }
              return card;
            }}
          />
        </div>
      );
    }
    return (
      <div ref={viewRef}>
        <BehaviorCard behavior={selectedBehavior} child={child} isIndividual={isIndividual} parentDirect={parentDirect} onBack={() => setSelectedBehavior(null)} onOpenSafety={onOpenSafety} />
      </div>
    );
  }

  return (
    <div ref={viewRef}>
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
        ) : behaviors.length === 0 && activeDocumentConcernCards.length === 0 && dismissedDocumentConcernCards.length === 0 ? (
          <div className="np-help-notice" data-tone="caution">
            <p className="np-help-text np-help-strong">
              {parentDirect ? "No individualized support steps are available for this situation yet." : "No current approved behavior steps are available."}
            </p>
            <p className="np-help-text">
              {parentDirect
                ? "Open the Support Library to choose general starter support, review an uploaded document, or contact your care team."
                : "This screen only shows guidance with current clinical review details. It will not use draft, expired, or unreviewed guidance. You can still check the safety plan or contact your care team."}
            </p>
            <p className="np-help-text">If anyone is in immediate danger or hurt, call 911 or local emergency services.</p>
            <button type="button" onClick={onOpenSafety || onBack} data-testid="button-open-safety-plan" data-variant="urgent" className="np-help-btn">
              Open safety plan
            </button>
          </div>
        ) : (
          <div className="np-help-group">
            {behaviors.length > 0 && (
              <section>
                <p className="np-help-text">What is happening right now? Select the situation.</p>
                <div className="np-help-behavior-grid">
                  {behaviors.map((behavior, i) => {
                    const appearance = getBehaviorAppearance(behavior, i);
                    const BehaviorIcon = appearance.Icon;
                    return (
                      <MenuRow
                        key={behavior.id || i}
                        onClick={() => handleSelectBehavior(behavior)}
                        data-testid={`button-behavior-${i}`}
                        data-tone={appearance.tone}
                        className="np-help-option"
                        icon={<BehaviorIcon aria-hidden="true" />}
                        label={behavior.name}
                        description={behavior.sourceLabel || "Source not available"}
                      />
                    );
                  })}
                </div>
                <p className="np-help-muted">
                  Only showing support information available for {child?.child_name}.
                </p>
              </section>
            )}
            {activeDocumentConcernCards.length > 0 && (
              <section className="np-help-group" aria-labelledby="document-informed-support-heading" data-testid="section-document-informed-support">
                <h3 className="np-help-label" id="document-informed-support-heading">Document support cards</h3>
                <div className="np-help-behavior-grid">
                  {activeDocumentConcernCards.map((behavior, index) => {
                    const appearance = getBehaviorAppearance({ name: behavior.name }, index);
                    const BehaviorIcon = appearance.Icon;
                    return (
                      <MenuRow
                        key={behavior.id}
                        onClick={() => setSelectedBehavior(behavior)}
                        data-testid={`button-document-concern-${index}`}
                        data-tone={appearance.tone}
                        className="np-help-option"
                        icon={<BehaviorIcon aria-hidden="true" />}
                        label={behavior.name}
                        description={behavior.sourceLabel || "Upload source unavailable"}
                      />
                    );
                  })}
                </div>
              </section>
            )}
            {profile?.documentSupportCardsLoadError && (
              <p className="np-help-notice" data-tone="urgent" role="alert" data-testid="document-support-load-error">
                Document-informed suggestions could not be loaded. Close support and try again.
              </p>
            )}
            {dismissedDocumentConcernCards.length > 0 && (
              <Disclosure title={`Dismissed document suggestions (${dismissedDocumentConcernCards.length})`} className="np-help-disclosure" data-testid="disclosure-dismissed-document-support">
                <div className="np-help-group">
                  {dismissedDocumentConcernCards.map((card) => (
                    <div className="np-help-step-nav" key={card.id}>
                      <span className="np-help-text">{card.name}</span>
                      <Button type="button" size="sm" variant="outline" onClick={() => void restoreDocumentConcern(card.id)}>Restore</Button>
                    </div>
                  ))}
                </div>
              </Disclosure>
            )}
            {documentCardUpdateError && <p className="np-help-notice" data-tone="urgent" role="alert">{documentCardUpdateError}</p>}
            {behaviors.length === 0 && activeDocumentConcernCards.length === 0 && (
              <p className="np-help-text">No active behavior guidance is available. You can still open safety information or restore a dismissed suggestion.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
