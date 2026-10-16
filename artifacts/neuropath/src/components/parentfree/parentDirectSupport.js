import { getParentBehaviors, parentBehaviorIdentity } from "@workspace/api-client-react";

const sourceLabel = (source) => {
  switch (source) {
    case "clinician_reviewed": return "Clinician reviewed";
    case "clinician_document": return "Clinician-uploaded plan";
    case "parent_document": return "Based on your uploaded plan · not clinician-reviewed";
    case "starter":
      return "Starter support";
    default: return "Source not available";
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

  return getParentBehaviors(child || {}).map((selection) => {
    const identity = parentBehaviorIdentity(selection);
    const existingCard = cards.find((card) => parentBehaviorIdentity(card) === identity);
    const card = existingCard && existingCard.conflict !== true ? existingCard : null;
    const template = templates.find((item) => item.key === selection.behaviorKey) || genericStarter;

    return {
      id: card?.id || identity,
      name: selection.behaviorName,
      parentDirectEligible: true,
      sourceLabel: card ? sourceLabel(card.source) : "Starter support",
      what_may_be_happening: card?.whatMayBeHappening || template.whatMayBeHappening,
      do_this_right_now: card?.rightNow || template.rightNow,
      avoid: card?.avoid || template.avoid,
      prevention_tips: card?.prevention || template.prevention,
      reinforcement_rewards: [card?.reinforcementIdea || template.reinforcementIdea].filter(Boolean),
      when_to_contact_clinician: card?.seekHelp || template.seekHelp,
    };
  });
}
