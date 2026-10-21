import { getParentBehaviors, parentBehaviorIdentity } from "@workspace/api-client-react";

const sourceLabel = (source) => {
  switch (source) {
    case "starter": return "General starter support — not individualized";
    case "clinician_reviewed": return "Clinician-approved support";
    case "parent_document": return "From your uploaded plan · not clinician-reviewed";
    default: return "Source not available";
  }
};

const HIGH_RISK_BEHAVIOR = /\b(aggression|hitting|biting|injury|self[- ]?harm|elopement|wandering|leaving the area|crisis|unsafe|medical|seizure|choking|breathing|overdose|suicid)\b/i;

export function isHighRiskSupportArea(value) {
  if (typeof value === "object" && value && /^(high|urgent|critical)$/i.test(String(value.riskTier ?? value.risk_tier ?? ""))) return true;
  const name = typeof value === "string"
    ? value
    : [value?.name, value?.behaviorName, value?.behavior_name, value?.behaviorKey, value?.behavior_key, value?.key, value?.riskTier, value?.risk_tier]
      .filter(Boolean)
      .join(" ");
  return HIGH_RISK_BEHAVIOR.test(name);
}

function hasCurrentClinicianReview(card) {
  return card?.source === "clinician_reviewed"
    && typeof card.reviewedBy === "string" && card.reviewedBy.trim().length > 0
    && typeof card.reviewedAt === "string" && card.reviewedAt.trim().length > 0
    && card.conflict !== true;
}

function verifiedDocumentExcerpt(card) {
  const documentIds = new Set(Array.isArray(card?.sourceDocumentIds) ? card.sourceDocumentIds : []);
  if (!documentIds.size || !Array.isArray(card?.sourceReferences)) return null;
  return card.sourceReferences.find((reference) =>
    reference && documentIds.has(reference.documentId) &&
    typeof reference.excerpt === "string" && reference.excerpt.trim().length > 0,
  ) || null;
}

function emptyGuidance(card) {
  return {
    ...card,
    whatMayBeHappening: "",
    rightNow: [],
    avoid: [],
    prevention: [],
    replacementSkill: "",
    reinforcementIdea: "",
    seekHelp: "",
    track: [],
    do_this_right_now: [],
    interventions: [],
    if_it_escalates: [],
    prevention_tips: [],
    reinforcement_rewards: [],
    when_to_contact_clinician: "",
  };
}

export function projectHelpNowCard(card, explicitlySelected = false) {
  if (!card || typeof card !== "object" || Array.isArray(card) || card.conflict === true) return null;

  const highRisk = isHighRiskSupportArea(card);
  if (hasCurrentClinicianReview(card)) {
    return {
      ...card,
      parentDirectEligible: true,
      helpNowSourceLabel: "Clinician-approved support",
    };
  }

  if (card.source === "parent_document") {
    const excerpt = verifiedDocumentExcerpt(card);
    if (!excerpt) return null;
    const referenced = {
      ...emptyGuidance(card),
      parentDirectEligible: true,
      documentReferencedOnly: true,
      documentExcerpt: excerpt.excerpt.trim(),
      documentTitle: typeof excerpt.title === "string" ? excerpt.title : "Your uploaded plan",
      helpNowSourceLabel: "From your uploaded plan · not clinician-reviewed",
    };
    if (!highRisk) return referenced;
    return {
      ...emptyGuidance(referenced),
      emergencyOnly: true,
      documentReferencedOnly: false,
      documentExcerpt: "",
      helpNowSourceLabel: "Safety information only — not individualized",
    };
  }

  if (card.source === "starter" && explicitlySelected) {
    if (!highRisk) {
      return {
        ...card,
        source: "starter",
        parentDirectEligible: true,
        helpNowSourceLabel: sourceLabel("starter"),
      };
    }
    return {
      ...emptyGuidance(card),
      source: "starter",
      parentDirectEligible: true,
      emergencyOnly: true,
      helpNowSourceLabel: "Safety information only — not individualized",
    };
  }

  return null;
}

export function parentDirectBehaviors(child, supportCards, starterLibrary) {
  const cards = Array.isArray(supportCards)
    ? supportCards.filter((card) => card && typeof card === "object" && !Array.isArray(card))
    : [];
  const templates = Array.isArray(starterLibrary) ? starterLibrary : [];

  const selections = getParentBehaviors(child || {})
    .filter((selection) => selection?.selectionSource !== "clinician_plan_discovery");
  const selectedIds = new Set(selections.map(parentBehaviorIdentity));

  const toBehavior = (base, identity, name, source) => ({
    ...base,
    id: base?.id || identity,
    behaviorKey: base?.behaviorKey || base?.behavior_key || base?.key,
    behaviorName: name,
    name,
    parentDirectEligible: true,
    sourceLabel: base?.helpNowSourceLabel || sourceLabel(source),
    what_may_be_happening: base?.what_may_be_happening || base?.whatMayBeHappening || base?.context || "",
    do_this_right_now: base?.do_this_right_now || base?.doThisRightNow || base?.rightNow || base?.right_now || [],
    interventions: base?.interventions || base?.clinicianApprovedSteps || base?.clinician_approved_strategies || base?.strategies || [],
    if_it_escalates: base?.if_it_escalates || base?.ifItEscalates || base?.escalationSteps || base?.escalation_steps || [],
    avoid: base?.avoid || base?.thingsToAvoid || base?.things_to_avoid || [],
    prevention_tips: base?.prevention_tips || base?.preventionTips || base?.prevention || [],
    reinforcement_rewards: base?.reinforcement_rewards || base?.reinforcementRewards || base?.reinforcement || (base?.reinforcementIdea ? [base.reinforcementIdea] : []),
    when_to_contact_clinician: base?.when_to_contact_clinician || base?.whenToContactClinician || base?.seekHelp || "",
  });

  const active = selections.flatMap((selection) => {
    const identity = parentBehaviorIdentity(selection);
    const existingCard = cards.find((card) => parentBehaviorIdentity(card) === identity);
    const authorizedCard = projectHelpNowCard(existingCard, false);
    if (authorizedCard) {
      return [toBehavior(authorizedCard, identity, selection.behaviorName, authorizedCard.source)];
    }

    const template = templates.find((item) => item.key === selection.behaviorKey);
    if (!template) return [];
    const starter = projectHelpNowCard({ ...template, source: "starter" }, true);
    return starter ? [toBehavior(starter, identity, selection.behaviorName, "starter")] : [];
  });

  const discoveries = cards.flatMap((card) => {
    if (selectedIds.has(parentBehaviorIdentity(card))) return [];
    const projected = projectHelpNowCard(card, false);
    if (!projected) return [];
    return [toBehavior(
      projected,
      parentBehaviorIdentity(card),
      card.behaviorName || card.name || "Plan behavior",
      projected.source,
    )];
  });

  return [...active, ...discoveries];
}
