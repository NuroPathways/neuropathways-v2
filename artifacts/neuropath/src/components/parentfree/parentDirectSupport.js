import { getParentBehaviors, parentBehaviorIdentity } from "@workspace/api-client-react";

const sourceLabel = (source) => {
  switch (source) {
    case "clinician_reviewed":
    case "clinician_document":
    case "parent_document":
      return "Source: Behavior plan";
    case "starter":
      return "Source: Pre-programmed library";
    default:
      return "Source: Behavior plan";
  }
};

const genericStarter = {
  whatMayBeHappening: "There may be many reasons this behavior happens. Notice what is going on and ask your child’s clinician for individualized guidance.",
  rightNow: ["Use a calm voice, make space, and focus on keeping everyone safe.", "If someone is in immediate danger, contact emergency services."],
  avoid: ["Avoid punishment, threats, or unfamiliar physical safety techniques."],
  prevention: ["Notice patterns and prepare one small, predictable support."],
  replacementSkill: "Practice a safe way to ask for help or a break when calm.",
  reinforcementIdea: "Notice safe communication and small steps toward the goal.",
  seekHelp: "Ask your child’s clinician for individualized support. Contact emergency services for immediate danger.",
};

export function parentDirectBehaviors(child, supportCards, starterLibrary) {
  const cards = Array.isArray(supportCards)
    ? supportCards.filter((card) => card && typeof card === "object" && !Array.isArray(card))
    : [];
  const templates = Array.isArray(starterLibrary) ? starterLibrary : [];

  const selections = getParentBehaviors(child || {});
  const selectedIds = new Set(selections.map(parentBehaviorIdentity));

  const toBehavior = (base, identity, name, source) => ({
    ...base,
    id: base?.id || identity,
    behaviorKey: base?.behaviorKey,
    name,
    parentDirectEligible: true,
    sourceLabel: sourceLabel(source),
    what_may_be_happening: base?.what_may_be_happening || base?.whatMayBeHappening || base?.context || "",
    do_this_right_now: base?.do_this_right_now || base?.doThisRightNow || base?.rightNow || base?.right_now || [],
    interventions: base?.interventions || base?.clinicianApprovedSteps || base?.clinician_approved_strategies || base?.strategies || [],
    if_it_escalates: base?.if_it_escalates || base?.ifItEscalates || base?.escalationSteps || base?.escalation_steps || [],
    avoid: base?.avoid || base?.thingsToAvoid || base?.things_to_avoid || [],
    prevention_tips: base?.prevention_tips || base?.preventionTips || base?.prevention || [],
    reinforcement_rewards: base?.reinforcement_rewards || base?.reinforcementRewards || base?.reinforcement || (base?.reinforcementIdea ? [base.reinforcementIdea] : []),
    when_to_contact_clinician: base?.when_to_contact_clinician || base?.whenToContactClinician || base?.seekHelp || "",
  });

  const active = selections.map((selection) => {
    const identity = parentBehaviorIdentity(selection);
    const existingCard = cards.find((card) => parentBehaviorIdentity(card) === identity);
    const card = existingCard && existingCard.conflict !== true ? existingCard : null;
    const template = templates.find((item) => item.key === selection.behaviorKey) || genericStarter;

    return toBehavior(
      card || template,
      identity,
      selection.behaviorName,
      card?.source || "starter",
    );
  });

  const discoveries = cards
    .filter((card) =>
      card.source !== "starter" &&
      card.conflict !== true &&
      !selectedIds.has(parentBehaviorIdentity(card)),
    )
    .map((card) => toBehavior(
      card,
      parentBehaviorIdentity(card),
      card.behaviorName || card.name || "Plan behavior",
      card.source,
    ));

  return [...active, ...discoveries];
}
