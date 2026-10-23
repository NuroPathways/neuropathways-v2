type EvidenceRecord = {
  id: string;
  category: string;
  childId: string;
  documentId: string;
  documentTitle: string;
  documentVersion?: string;
  sourceSection?: string | null;
  sourcePage?: number | null;
  sourceExcerpt: string;
  sourceExcerptVerified: boolean;
  extractionStatus: string;
  reviewStatus: string;
  interpretation: Record<string, unknown>;
};

type ActivityLibraryItem = {
  id: string;
  title: string;
  description: string;
  routineContext?: string;
  skill: string;
  skillDomain?: string;
  estimatedMinutes?: number | null;
  materials?: string | string[];
  startAction?: string;
  steps?: string[];
  ending?: string;
  ifDifficult?: string;
  riskTier?: string;
  evidenceReferences?: unknown[];
  [key: string]: unknown;
};

export type ParentFamilyActivityPreferences = {
  favoriteActivities?: string[];
  favoriteThings?: string[];
  communicationMethods?: string[];
  comfortSensoryPreferences?: string[];
  dislikes?: string[];
};

type ExistingAssignment = {
  id?: string;
  libraryId?: string | null;
  title?: string;
  status?: string;
  recommendationId?: string | null;
};
type ApprovedDocumentActivity = {
  title: string;
  routineContext?: string;
  opportunity?: string;
  skill?: string;
  relatedGoal?: string | null;
  estimatedMinutes?: number | null;
  materials?: string[];
  startAction?: string;
  steps?: string[];
  ending?: string;
  pauseConditions?: string[];
  sourceDocumentId: string;
  sourceDocumentTitle: string;
  sourceExcerpt: string;
  sourcePage?: number | null;
  reviewedBy: string;
  reviewedAt: string;
  assignedAt?: string | null;
  readiness: string;
  sourceExcerptVerified: boolean;
};

export type ActivityRecommendationEvidence = {
  recordId: string;
  category: string;
  documentId: string;
  documentTitle: string;
  sourceSection: string | null;
  sourcePage: number | null;
  sourceExcerpt: string;
  reviewStatus: string;
};

export type ActivityRecommendation = {
  id: string;
  priorityTier: "clinician_approved_document_activity" | "document_activity_candidate" | "document_grounded_library";
  status: "approved_not_assigned" | "needs_details" | "needs_clinician_review" | "suggestion_only";
  title: string;
  description: string;
  routineContext?: string;
  skill: string;
  skillDomain?: string;
  estimatedMinutes: number | null;
  materials: string[];
  startAction: string;
  steps: string[];
  ending: string;
  pauseConditions: string[];
  matchReasons: string[];
  missingInformation: string[];
  relatedGoal: string | null;
  matchSource?: "documents" | "family_preferences" | "documents_and_preferences";
  matchedPreferences?: string[];
  riskClassification: string;
  evidence: ActivityRecommendationEvidence[];
  sourceClassification: "document_candidate" | "clinician_reviewed_document" | "research_informed_general_starter";
  researchReferences: unknown[];
  safetyReviewRequired: boolean;
};

export type ActivityRecommendationResult = {
  recommendations: ActivityRecommendation[];
  safetyEvidence: ActivityRecommendationEvidence[];
};

export type ParentDocumentActivitySuggestion = {
  id: string;
  title: string;
  description: string;
  category: string;
  skill: string;
  estimatedMinutes: number | null;
  materials: string[];
  startAction: string;
  steps: string[];
  ending: string;
  ifDifficult: string;
  relatedGoal: string | null;
  pauseConditions: string[];
  matchReasons: string[];
  matchSource: "documents" | "family_preferences" | "documents_and_preferences";
  matchedPreferences: string[];
  riskClassification: string;
  sourceEvidence: ActivityRecommendationEvidence[];
  relatedSupportAreas: string[];
  researchReferences: unknown[];
  researchLimitations: string[];
};

type ParentSupportAreaForActivityMatch = {
  name: string;
  description: string;
  contexts: string[];
  observations: string[];
  sourceDocumentIds: string[];
};

const SUPPORT_AREA_ACTIVITY_SIGNALS: Record<string, RegExp> = {
  "what-happens-next": /\b(direction|instruction|transition|routine|sequence|next step)\b/i,
  "familiar-aac-choice": /\b(communication|speech|express|request|help|break)\b/i,
  "familiar-help-signal": /\b(help|break|communication|request|signal)\b/i,
  "choose-between-familiar-activities": /\b(transition|choice|routine|preferred|interest)\b/i,
  "build-together": /\b(shared play|turn|building|play)\b/i,
  "one-small-routine-step": /\b(routine|task|daily living|hygiene|self-care)\b/i,
  "request-more-during-play": /\b(play|request|communication|more|continue)\b/i,
  "take-turns-with-familiar-toy": /\b(play|turn|social|toy)\b/i,
  "pause-and-notice-communication": /\b(communication|express|request|signal|language)\b/i,
};

const MAX_RECOMMENDATIONS = 12;
const UNSAFE_ACTIVITY_TEXT =
  /\b(?:restraint|seclusion|pinning|physical blocking|punishment|extinction|force(?:d)? compliance|exposure(?: therapy)?|response prevention|withhold(?:ing)? reassurance|deny(?:ing)? reassurance)\b/i;
const GENERIC_INTEREST_WORDS = new Set([
  "activity", "activities", "play", "playing", "toys", "toy", "things", "stuff", "games", "game",
  "favorite", "favourite", "preferred", "interest", "interests",
]);

function text(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function list(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(text).filter(Boolean);
}

function normalized(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function uniqueEvidence(records: EvidenceRecord[]): ActivityRecommendationEvidence[] {
  const seen = new Set<string>();
  return records.flatMap((record) => {
    if (!record.id || !record.documentId || !record.sourceExcerpt) return [];
    const key = `${record.id}:${record.documentId}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      recordId: record.id,
      category: record.category,
      documentId: record.documentId,
      documentTitle: record.documentTitle || "Support document",
      sourceSection: record.sourceSection || null,
      sourcePage: record.sourcePage || null,
      sourceExcerpt: record.sourceExcerpt,
      reviewStatus: record.reviewStatus,
    }];
  }).slice(0, 4);
}

function usableRecords(childId: string, records: EvidenceRecord[]): EvidenceRecord[] {
  return records.filter((record) =>
    record.childId === childId &&
    record.documentId &&
    record.sourceExcerptVerified === true &&
    record.extractionStatus === "extracted" &&
    ["unreviewed", "approved"].includes(record.reviewStatus) &&
    text(record.sourceExcerpt).length >= 12 &&
    record.interpretation && typeof record.interpretation === "object",
  );
}

export function canExposeActivityRecommendations(clinicianId: string | null, parentId?: string): boolean {
  return Boolean(clinicianId) && !parentId;
}

function profileRecords(records: EvidenceRecord[], field: string): EvidenceRecord[] {
  return records.filter((record) =>
    record.category === "profile_information" &&
    text(record.interpretation.field) === field &&
    Boolean(text(record.interpretation.value)),
  );
}

function interestsFrom(records: EvidenceRecord[]): string[] {
  return [...profileRecords(records, "interests"), ...profileRecords(records, "preferences")]
    .flatMap((record) => text(record.interpretation.value).split(/\s*(?:,|;|\band\b|\n)\s*/i))
    .map((item) => item.trim())
    .filter((item) => item && !GENERIC_INTEREST_WORDS.has(normalized(item)));
}

function goalDomainMatches(records: EvidenceRecord[], domain: string): EvidenceRecord[] {
  return records.filter((record) =>
    record.category === "goal" &&
    normalized(text(record.interpretation.skill_domain)) === normalized(domain),
  );
}

function signalEvidence(records: EvidenceRecord[], predicate: (value: string, record: EvidenceRecord) => boolean): EvidenceRecord[] {
  return records.filter((record) => {
    if (record.category === "profile_information") {
      return predicate(`${text(record.interpretation.value)} ${text(record.interpretation.details)}`, record);
    }
    if (record.category === "support_strategy") {
      const i = record.interpretation;
      const value = [
        text(i.applies_to), text(i.strategy), text(i.context), text(i.communication_support),
        ...list(i.materials), ...list(i.preconditions), ...list(i.limitations),
      ].join(" ");
      return predicate(value, record);
    }
    return false;
  });
}

type ExplicitTemplateMatch = {
  evidence: EvidenceRecord[];
  reasons: string[];
  matchedPreferences: string[];
};
type ExplicitTemplateRuleResult = Omit<ExplicitTemplateMatch, "matchedPreferences"> & {
  matchedPreferences?: string[];
};

function preferenceTokens(value: string): string[] {
  const stopWords = new Set(["a", "an", "the", "and", "or", "not", "does", "dont", "doesnt", "dislike", "dislikes", "avoid", "avoids", "prefer", "prefers", "favorite", "favourite", "likes", "like", "with", "for"]);
  return normalized(value).split(" ")
    .map((word) => word.replace(/s$/, ""))
    .filter((word) => word.length >= 4 && !stopWords.has(word));
}

function uniqueTexts(values: string[]): string[] {
  const seen = new Set<string>();
  return values.map((value) => text(value).slice(0, 100)).filter((value) => {
    const key = normalized(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

function explicitTemplateSignals(
  activityId: string,
  records: EvidenceRecord[],
  familyPreferences: ParentFamilyActivityPreferences = {},
): ExplicitTemplateMatch | null {
  const interests = interestsFrom(records);
  const interestText = interests.join(" ");
  const comm = [
    ...profileRecords(records, "communication_preferences"),
    ...profileRecords(records, "aac_method"),
  ];
  const strategies = records.filter((record) => record.category === "support_strategy");
  const favoriteValues = uniqueTexts([
    ...list(familyPreferences.favoriteActivities),
    ...list(familyPreferences.favoriteThings),
  ]);
  const communicationValues = uniqueTexts(list(familyPreferences.communicationMethods));
  const comfortValues = uniqueTexts(list(familyPreferences.comfortSensoryPreferences));
  const dislikes = uniqueTexts(list(familyPreferences.dislikes));
  const dislikedTokens = new Set(dislikes.flatMap(preferenceTokens));
  const familyInterests = favoriteValues.filter((value) =>
    !preferenceTokens(value).some((token) => dislikedTokens.has(token)),
  );
  const familyCommunication = communicationValues.filter((value) =>
    !preferenceTokens(value).some((token) => dislikedTokens.has(token)),
  );
  const familyComfort = comfortValues.filter((value) =>
    !preferenceTokens(value).some((token) => dislikedTokens.has(token)),
  );
  const preferencesMatching = (values: string[], pattern: RegExp) => values.filter((value) => pattern.test(value));
  const documentInterestEvidence = (pattern: RegExp) => profileRecords(records, "interests")
    .concat(profileRecords(records, "preferences"))
    .filter((record) => pattern.test(`${text(record.interpretation.value)} ${text(record.interpretation.details)}`));
  const rules: Record<string, () => ExplicitTemplateRuleResult | null> = {
    "familiar-aac-choice": () => {
      const aac = profileRecords(records, "aac_method");
      const communication = profileRecords(records, "communication_preferences")
        .filter((record) => /\b(?:aac|augmentative|communication device|communication board|picture exchange)\b/i.test(
          `${text(record.interpretation.value)} ${text(record.interpretation.details)}`,
        ));
      const evidence = [...aac, ...communication];
      const preferenceMatches = preferencesMatching(familyCommunication, /\b(?:aac|augmentative|communication device|communication board|picture exchange|picture card)\b/i);
      return evidence.length || preferenceMatches.length
        ? {
            evidence,
            matchedPreferences: preferenceMatches,
            reasons: [evidence.length
              ? "The child's existing AAC method is explicitly documented."
              : "The family recorded an existing AAC or picture-based communication method."],
          }
        : null;
    },
    "familiar-help-signal": () => {
      const helpSignal = comm.filter((record) =>
        /\b(?:help|break|request|signal|more)\b/i.test(
          `${text(record.interpretation.value)} ${text(record.interpretation.details)} ${text(record.sourceExcerpt)}`,
        ),
      );
      const preferenceMatches = preferencesMatching(familyCommunication, /\b(?:help|break|request|signal|more|aac|gesture|button)\b/i);
      return helpSignal.length || preferenceMatches.length
        ? {
            evidence: helpSignal,
            matchedPreferences: preferenceMatches,
            reasons: [helpSignal.length
              ? "The source explicitly describes a familiar way to ask for help, a break, or more."
              : "The family recorded a communication method used for help, breaks, or requests."],
          }
        : null;
    },
    "choose-between-familiar-activities": () => interests.length >= 2 || familyInterests.length >= 2
      ? {
          evidence: [...profileRecords(records, "interests"), ...profileRecords(records, "preferences")],
          matchedPreferences: familyInterests,
          reasons: [interests.length >= 2
            ? "At least two interests are explicitly recorded in the child's documents; confirm both options are available and currently welcome."
            : "The family saved at least two favorite activities or items; confirm both options are available and currently welcome."],
        }
      : null,
    "puzzle-together": () => {
      const pattern = /\b(?:puzzle|jigsaw)\b/i;
      const evidence = documentInterestEvidence(pattern);
      const preferenceMatches = preferencesMatching(familyInterests, pattern);
      return evidence.length || preferenceMatches.length
        ? {
            evidence,
            matchedPreferences: preferenceMatches,
            reasons: [evidence.length
              ? "A documented child interest mentions puzzles."
              : "A family-selected favorite mentions puzzles; confirm it is still welcome."],
          }
        : null;
    },
    "matching-pairs": () => {
      const pattern = /\b(?:matching|match game|matching game|pairs|memory cards?)\b/i;
      const evidence = documentInterestEvidence(pattern);
      const preferenceMatches = preferencesMatching(familyInterests, pattern);
      return evidence.length || preferenceMatches.length
        ? {
            evidence,
            matchedPreferences: preferenceMatches,
            reasons: [evidence.length
              ? "A documented child interest mentions matching games or cards."
              : "A family-selected favorite mentions matching games or cards; confirm it is still welcome."],
          }
        : null;
    },
    "build-together": () => /\b(?:blocks?|building|construction|lego|magnetic tiles)\b/i.test(interestText)
      ? {
          evidence: documentInterestEvidence(/\b(?:blocks?|building|construction|lego|magnetic tiles)\b/i),
          matchedPreferences: preferencesMatching(familyInterests, /\b(?:blocks?|building|construction|lego|magnetic tiles)\b/i),
          reasons: ["A documented interest specifically matches familiar building materials."],
        }
      : preferencesMatching(familyInterests, /\b(?:blocks?|building|construction|lego|magnetic tiles)\b/i).length
        ? {
            evidence: [],
            matchedPreferences: preferencesMatching(familyInterests, /\b(?:blocks?|building|construction|lego|magnetic tiles)\b/i),
            reasons: ["A family-selected favorite specifically matches familiar building materials."],
          }
        : null,
    "child-led-play": () => interests.length || familyInterests.length
      ? {
          evidence: [...profileRecords(records, "interests"), ...profileRecords(records, "preferences")],
          matchedPreferences: familyInterests,
          reasons: ["A familiar activity or item is explicitly documented or saved by the family; follow the child's lead."],
        }
      : null,
    "what-happens-next": () => {
      const visualProfile = signalEvidence(records, (value) =>
        /\b(?:visual schedule|picture sequence|visual cue)\b/i.test(value) &&
        /\b(?:familiar|accepted|already uses|already used)\b/i.test(value),
      );
      const visualStrategy = strategies.filter((record) => {
        const i = record.interpretation;
        const value = [text(i.context), text(i.strategy), ...list(i.preconditions)].join(" ");
        return /\b(?:visual schedule|picture sequence|visual cue)\b/i.test(value) &&
          /\b(?:familiar|accepted|already uses|already used)\b/i.test(value);
      });
      const evidence = [...visualProfile, ...visualStrategy];
      const preferenceMatches = preferencesMatching(
        [...familyCommunication, ...familyComfort],
        /\b(?:visual schedule|picture sequence|visual cue|picture schedule)\b/i,
      );
      return evidence.length || preferenceMatches.length
        ? {
            evidence,
            matchedPreferences: preferenceMatches,
            reasons: [evidence.length
              ? "The source documents a familiar or accepted visual cue for a routine."
              : "The family recorded a familiar visual or picture-based routine cue."],
          }
        : null;
    },
    "review-familiar-morning-routine": () => {
      const routine = signalEvidence(records, (value) => /\bmorning routine\b/i.test(value));
      const preferenceMatches = preferencesMatching(
        [...familyInterests, ...familyComfort],
        /\b(?:morning routine|getting ready|before school)\b/i,
      );
      return routine.length || preferenceMatches.length
        ? {
            evidence: routine,
            matchedPreferences: preferenceMatches,
            reasons: [routine.length ? "A morning routine is explicitly documented." : "The family described a familiar morning routine."],
          }
        : null;
    },
    "one-small-routine-step": () => {
      const routine = strategies.filter((record) =>
        /\b(?:routine|morning|bedtime|mealtime|dressing|handwashing)\b/i.test([
          text(record.interpretation.context), text(record.interpretation.strategy), ...list(record.interpretation.preconditions),
        ].join(" ")),
      );
      const dailyLivingGoals = goalDomainMatches(records, "daily_living");
      return routine.length && dailyLivingGoals.length
        ? {
            evidence: [...routine, ...dailyLivingGoals],
            matchedPreferences: [],
            reasons: ["A source documents both a daily-living goal and a specific routine context."],
          }
        : null;
    },
    "familiar-coping-choice-card": () => {
      const familiarStrategies = strategies.filter((record) => {
        const i = record.interpretation;
        const textValue = [
          text(i.applies_to), text(i.strategy), text(i.context), text(i.communication_support),
          ...list(i.materials), ...list(i.preconditions), ...list(i.limitations),
        ].join(" ");
        return /\b(?:coping|calm|comfort|regulation|break)\b/i.test(textValue) &&
          /\b(?:familiar|already uses|already used|accepted|known|available)\b/i.test(textValue);
      });
      const familySupports = preferencesMatching(
        [...familyComfort, ...familyCommunication],
        /\b(?:familiar coping|known coping|calm choice|comfort item already used|familiar break)\b/i,
      );
      return familiarStrategies.length || familySupports.length
        ? {
            evidence: familiarStrategies,
            matchedPreferences: familySupports,
            reasons: [familiarStrategies.length
              ? "A source names an already-familiar, accepted coping support; the activity only reviews existing options."
              : "The family recorded an already-familiar coping or comfort option; no new strategy is introduced."],
          }
        : null;
    },
    "pause-and-notice-communication": () => comm.length
      ? { evidence: comm, matchedPreferences: [], reasons: ["The child's communication method or preference is explicitly documented."] }
      : familyCommunication.length
        ? {
            evidence: [],
            matchedPreferences: familyCommunication,
            reasons: ["The family recorded a communication method or preference to keep available."],
          }
        : null,
    "request-more-during-play": () => {
      const continueSignal = comm.filter((record) =>
        /\b(?:more|continue|again|finished|all done)\b/i.test(
          `${text(record.interpretation.value)} ${text(record.interpretation.details)} ${text(record.sourceExcerpt)}`,
        ),
      );
      const playInterest = profileRecords(records, "interests").filter((record) =>
        /\b(?:play|toy|game|blocks?|building|train|music|drawing)\b/i.test(
          `${text(record.interpretation.value)} ${text(record.interpretation.details)}`,
        ),
      );
      const familyContinueSignal = preferencesMatching(familyCommunication, /\b(?:more|continue|again|finished|all done)\b/i);
      const familyPlayInterest = preferencesMatching(familyInterests, /\b(?:play|toy|game|blocks?|building|train|music|drawing|puzzle)\b/i);
      return (continueSignal.length || familyContinueSignal.length) &&
        (playInterest.length || familyPlayInterest.length)
        ? {
            evidence: [...continueSignal, ...playInterest],
            matchedPreferences: [...familyContinueSignal, ...familyPlayInterest],
            reasons: ["A familiar play interest and a way to communicate continuing or being finished are available; do not pause or withhold the activity to prompt a request."],
          }
        : null;
    },
    "take-turns-with-familiar-toy": () => {
      const playGoal = goalDomainMatches(records, "social_play");
      const playInterest = profileRecords(records, "interests").filter((record) =>
        /\b(?:toy|game|blocks?|building|train|puzzle)\b/i.test(
          `${text(record.interpretation.value)} ${text(record.interpretation.details)}`,
        ),
      );
      const familyPlayInterest = preferencesMatching(familyInterests, /\b(?:toy|game|blocks?|building|train|puzzle)\b/i);
      return playGoal.length && (playInterest.length || familyPlayInterest.length)
        ? {
            evidence: [...playGoal, ...playInterest],
            matchedPreferences: familyPlayInterest,
            reasons: ["A social-play goal and a matching documented or family-selected play interest are both present."],
          }
        : null;
    },
  };
  const matched = rules[activityId]?.() || null;
  if (!matched) return null;
  const matchedPreferences = uniqueTexts(matched.matchedPreferences || []);
  return {
    evidence: matched.evidence,
    reasons: matched.reasons,
    matchedPreferences,
  };
}

function hasUnsafeInstruction(value: string): boolean {
  return UNSAFE_ACTIVITY_TEXT.test(value);
}

function isCompleteDocumentActivity(record: EvidenceRecord): boolean {
  const i = record.interpretation;
  return Boolean(
    text(i.title) &&
    text(i.description) &&
    text(i.skill) &&
    text(i.suggested_context) &&
    text(i.start_action) &&
    Array.isArray(i.steps) && i.steps.length >= 2 && i.steps.length <= 5 &&
    text(i.end_condition) &&
    Array.isArray(i.pause_conditions) && i.pause_conditions.length > 0,
  );
}

function documentActivityRecommendation(record: EvidenceRecord): ActivityRecommendation | null {
  const i = record.interpretation;
  const title = text(i.title);
  if (!title) return null;
  const steps = list(i.steps).slice(0, 5);
  const missingInformation = [
    !text(i.description) ? "Description" : null,
    !text(i.skill) ? "Related skill" : null,
    !text(i.suggested_context) ? "Appropriate context" : null,
    !text(i.start_action) ? "How to begin" : null,
    steps.length < 2 ? "At least two parent-facing steps" : null,
    !text(i.end_condition) ? "How to finish" : null,
    list(i.pause_conditions).length === 0 ? "Pause or stop conditions" : null,
  ].filter((item): item is string => Boolean(item));
  const content = [
    title, text(i.description), text(i.skill), text(i.suggested_context),
    text(i.start_action), ...steps, text(i.end_condition), ...list(i.pause_conditions),
  ].join(" ");
  if (hasUnsafeInstruction(content)) return null;
  const complete = isCompleteDocumentActivity(record);
  const approved = record.reviewStatus === "approved" && complete;
  return {
    id: `document-activity:${record.id}`,
    priorityTier: approved ? "clinician_approved_document_activity" : "document_activity_candidate",
    status: approved ? "approved_not_assigned" : complete ? "needs_clinician_review" : "needs_details",
    title,
    description: text(i.description),
    routineContext: text(i.suggested_context),
    skill: text(i.skill),
    estimatedMinutes: typeof i.duration_minutes === "number" && i.duration_minutes > 0 ? i.duration_minutes : null,
    materials: list(i.materials),
    startAction: text(i.start_action),
    steps,
    ending: text(i.end_condition),
    pauseConditions: list(i.pause_conditions),
    matchReasons: [approved
      ? "This complete activity candidate has a current clinician-approved extraction record."
      : complete
        ? "A complete activity candidate is explicitly described in a source document, but it has not been clinician-approved."
        : "A source document mentions this activity, but required instructions are missing; complete details before considering it."],
    missingInformation,
    relatedGoal: text(i.related_goal) || null,
    riskClassification: approved
      ? "Clinician-reviewed source activity"
      : "Not yet assessed; clinician review required",
    evidence: uniqueEvidence([record]),
    sourceClassification: "document_candidate",
    researchReferences: [],
    safetyReviewRequired: false,
  };
}

function approvedActivityRecommendation(
  activity: ApprovedDocumentActivity,
  clinicianId: string,
): ActivityRecommendation | null {
  if (
    !activity.title ||
    activity.reviewedBy !== clinicianId ||
    !activity.reviewedAt ||
    activity.assignedAt ||
    activity.readiness !== "ready" ||
    activity.sourceExcerptVerified !== true ||
    !activity.sourceDocumentId ||
    !activity.sourceExcerpt
  ) return null;
  const textToCheck = [
    activity.title, activity.routineContext, activity.opportunity, activity.skill,
    activity.startAction, ...(activity.steps || []), activity.ending, ...(activity.pauseConditions || []),
  ].join(" ");
  if (hasUnsafeInstruction(textToCheck)) return null;
  return {
    id: `reviewed-document-activity:${activity.sourceDocumentId}:${normalized(activity.title)}`,
    priorityTier: "clinician_approved_document_activity",
    status: "approved_not_assigned",
    title: activity.title,
    description: [activity.routineContext, activity.opportunity].filter(Boolean).join(" · "),
    routineContext: activity.routineContext || "",
    skill: activity.skill || "",
    estimatedMinutes: typeof activity.estimatedMinutes === "number" ? activity.estimatedMinutes : null,
    materials: list(activity.materials),
    startAction: activity.startAction || "",
    steps: list(activity.steps),
    ending: activity.ending || "",
    pauseConditions: list(activity.pauseConditions),
    matchReasons: ["This source-derived activity is complete, source-verified, and individually reviewed by the clinician; it is not yet assigned."],
    missingInformation: [],
    relatedGoal: activity.relatedGoal || null,
    riskClassification: "Clinician-reviewed source activity; recheck current fit and safety",
    evidence: [{
      recordId: `parent-support-activity:${activity.sourceDocumentId}:${normalized(activity.title)}`,
      category: "potential_home_activity",
      documentId: activity.sourceDocumentId,
      documentTitle: activity.sourceDocumentTitle || "Shared support document",
      sourceSection: null,
      sourcePage: activity.sourcePage || null,
      sourceExcerpt: activity.sourceExcerpt,
      reviewStatus: "approved",
    }],
    sourceClassification: "clinician_reviewed_document",
    researchReferences: [],
    safetyReviewRequired: false,
  };
}

export function buildChildActivityRecommendations(input: {
  childId: string;
  clinicianId: string;
  records: EvidenceRecord[];
  library: ActivityLibraryItem[];
  existingAssignments?: ExistingAssignment[];
  approvedDocumentActivities?: ApprovedDocumentActivity[];
  familyPreferences?: ParentFamilyActivityPreferences;
}): ActivityRecommendationResult {
  const records = usableRecords(input.childId, input.records);
  const safetyEvidence = uniqueEvidence(input.records.filter((record) =>
    record.childId === input.childId &&
    record.sourceExcerptVerified === true &&
    record.extractionStatus === "extracted" &&
    record.reviewStatus !== "rejected" &&
    (record.category === "safety_instruction" ||
      (record.category === "profile_information" && record.interpretation?.field === "safety_considerations")),
  ));
  const assignedLibraryIds = new Set((input.existingAssignments || [])
    .filter((assignment) => !["rejected", "archived", "superseded"].includes(assignment.status || ""))
    .map((assignment) => assignment.libraryId)
    .filter((id): id is string => Boolean(id)));
  const assignedTitles = new Set((input.existingAssignments || [])
    .filter((assignment) => !["rejected", "archived", "superseded"].includes(assignment.status || ""))
    .map((assignment) => normalized(text(assignment.title)))
    .filter(Boolean));
  const recommendations: ActivityRecommendation[] = [];
  const seen = new Set<string>();
  const reviewedRecommendationIds = new Set((input.existingAssignments || [])
    .map((assignment) => assignment.recommendationId)
    .filter((id): id is string => Boolean(id)));

  for (const activity of input.approvedDocumentActivities || []) {
    const candidate = approvedActivityRecommendation(activity, input.clinicianId);
    if (!candidate || reviewedRecommendationIds.has(candidate.id) || assignedTitles.has(normalized(candidate.title))) continue;
    const key = normalized(candidate.title);
    if (seen.has(key)) continue;
    seen.add(key);
    recommendations.push(candidate);
  }

  const directActivityRecords = input.records.filter((candidate) =>
    candidate.childId === input.childId &&
    candidate.category === "potential_home_activity" &&
    candidate.sourceExcerptVerified === true &&
    candidate.extractionStatus === "extracted" &&
    ["unreviewed", "approved"].includes(candidate.reviewStatus) &&
    text(candidate.sourceExcerpt).length >= 12 &&
    candidate.interpretation && typeof candidate.interpretation === "object",
  );
  for (const record of directActivityRecords) {
    const candidate = documentActivityRecommendation(record);
    if (!candidate || reviewedRecommendationIds.has(candidate.id) || assignedTitles.has(normalized(candidate.title)) || seen.has(normalized(candidate.title))) continue;
    seen.add(normalized(candidate.title));
    recommendations.push(candidate);
  }

  for (const activity of input.library) {
    if (activity.riskTier !== "low" || assignedLibraryIds.has(activity.id) || assignedTitles.has(normalized(activity.title))) continue;
    const matched = explicitTemplateSignals(activity.id, records, input.familyPreferences);
    if (!matched) continue;
    const safetyText = safetyEvidence.map((evidence) => evidence.sourceExcerpt).join(" ");
    const content = `${activity.title} ${activity.description} ${activity.skill} ${list(activity.steps).join(" ")}`;
    if (hasUnsafeInstruction(content)) continue;
    const evidence = uniqueEvidence(matched.evidence);
    if (!evidence.length && !matched.matchedPreferences.length) continue;
    const matchedInterests = uniqueTexts([
      ...matched.matchedPreferences,
      ...interestsFrom(matched.evidence),
    ]);
    const dislikedTokens = new Set(list(input.familyPreferences?.dislikes).flatMap(preferenceTokens));
    if (matchedInterests.some((interest) =>
      preferenceTokens(interest).some((token) => dislikedTokens.has(token)),
    )) continue;
    const matchSource = evidence.length
      ? matched.matchedPreferences.length ? "documents_and_preferences" as const : "documents" as const
      : "family_preferences" as const;
    const relatedGoalRecord = matched.evidence.find((record) => record.category === "goal");
    const relatedGoal = relatedGoalRecord
      ? text(relatedGoalRecord.interpretation.title) ||
        text(relatedGoalRecord.interpretation.goal_title) ||
        text(relatedGoalRecord.interpretation.goal)
      : null;
    const baseMaterials = typeof activity.materials === "string" ? [activity.materials] : list(activity.materials);
    let materials = baseMaterials;
    if (activity.id === "choose-between-familiar-activities" && matchedInterests.length >= 2) {
      materials = [`Two options to consider: ${matchedInterests.slice(0, 2).join(" and ")}. Confirm both are available, safe, and currently welcome.`];
    } else if (activity.id === "puzzle-together" && matchedInterests.length) {
      materials = [`A familiar puzzle related to ${matchedInterests[0]}; confirm it is currently welcome and appropriate.`];
    } else if (activity.id === "matching-pairs" && matchedInterests.length) {
      materials = [`A familiar matching game or cards related to ${matchedInterests[0]}; confirm it is currently welcome and appropriate.`];
    } else if (activity.id === "build-together" && matchedInterests.length) {
      materials = [`Familiar, safe building materials related to ${matchedInterests[0]}; let the child choose whether to use them.`];
    } else if (activity.id === "child-led-play" && matchedInterests.length) {
      materials = [`A familiar activity or item listed as ${matchedInterests[0]}; confirm it is available, safe, and currently welcome.`];
    }
    const key = `library:${activity.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    recommendations.push({
      id: key,
      priorityTier: "document_grounded_library",
      status: safetyEvidence.length ? "needs_clinician_review" : "suggestion_only",
      title: activity.title,
      description: activity.description,
      skill: activity.skill,
      skillDomain: activity.skillDomain,
      estimatedMinutes: typeof activity.estimatedMinutes === "number" ? activity.estimatedMinutes : null,
      materials,
      startAction: text(activity.startAction),
      steps: list(activity.steps),
      ending: text(activity.ending),
      pauseConditions: activity.ifDifficult ? [activity.ifDifficult] : [],
      matchReasons: matched.reasons,
      missingInformation: [],
      relatedGoal,
      matchSource,
      matchedPreferences: matched.matchedPreferences,
      riskClassification: safetyEvidence.length
        ? "Low-risk starter; child-specific safety review required"
        : "General starter; confirm current fit, familiarity, and safety",
      evidence,
      sourceClassification: "research_informed_general_starter",
      researchReferences: Array.isArray(activity.evidenceReferences) ? activity.evidenceReferences : [],
      safetyReviewRequired: Boolean(safetyText),
    });
  }

  const priority = {
    clinician_approved_document_activity: 1,
    document_activity_candidate: 2,
    document_grounded_library: 3,
  } as const;
  recommendations.sort((left, right) =>
    priority[left.priorityTier] - priority[right.priorityTier] ||
    left.title.localeCompare(right.title),
  );
  return { recommendations: recommendations.slice(0, MAX_RECOMMENDATIONS), safetyEvidence };
}

export function buildParentDocumentActivitySuggestions(input: {
  childId: string;
  records: EvidenceRecord[];
  library: ActivityLibraryItem[];
  supportAreas?: ParentSupportAreaForActivityMatch[];
  existingActivities?: ExistingAssignment[];
  familyPreferences?: ParentFamilyActivityPreferences;
}): ParentDocumentActivitySuggestion[] {
  const { recommendations } = buildChildActivityRecommendations({
    childId: input.childId,
    clinicianId: "",
    records: input.records,
    library: input.library,
    existingAssignments: input.existingActivities,
    familyPreferences: input.familyPreferences,
  });
  return recommendations.flatMap((recommendation) => {
    if (
      recommendation.priorityTier !== "document_grounded_library" ||
      recommendation.status !== "suggestion_only" ||
      recommendation.safetyReviewRequired
    ) return [];
    const libraryId = recommendation.id.replace(/^library:/, "");
    const concernSignal = SUPPORT_AREA_ACTIVITY_SIGNALS[libraryId];
    const evidenceDocumentIds = new Set(recommendation.evidence.map((evidence) => evidence.documentId));
    const relatedSupportAreas = (input.supportAreas || [])
      .filter((area) =>
        concernSignal &&
        area.sourceDocumentIds.some((documentId) => evidenceDocumentIds.has(documentId)) &&
        concernSignal.test([
          area.name,
          area.description,
          ...area.contexts,
          ...area.observations,
        ].join(" ")),
      )
      .map((area) => text(area.name))
      .filter(Boolean)
      .filter((name, index, all) => all.indexOf(name) === index)
      .slice(0, 4);
    const researchLimitations = recommendation.researchReferences.flatMap((reference) => {
      if (!reference || typeof reference !== "object" || Array.isArray(reference)) return [];
      const limitation = text((reference as Record<string, unknown>).limitation);
      return limitation ? [limitation] : [];
    }).filter((limitation, index, all) => all.indexOf(limitation) === index).slice(0, 4);
    const categoryByDomain: Record<string, string> = {
      communication: "Communication",
      social_play: "Playing Together",
      transitions: "Transitions",
      daily_living: "Daily Routines",
      coping: "Calm & Coping",
      parent_preparation: "Parent Preparation",
    };
    return [{
      id: recommendation.id,
      title: recommendation.title,
      description: recommendation.description,
      category: categoryByDomain[recommendation.skillDomain || ""] || recommendation.skill,
      skill: recommendation.skill,
      estimatedMinutes: recommendation.estimatedMinutes,
      materials: recommendation.materials,
      startAction: recommendation.startAction,
      steps: recommendation.steps,
      ending: recommendation.ending,
      ifDifficult: recommendation.pauseConditions.join(" "),
      relatedGoal: recommendation.relatedGoal,
      pauseConditions: recommendation.pauseConditions,
      matchReasons: recommendation.matchReasons,
      matchSource: recommendation.matchSource || "documents",
      matchedPreferences: recommendation.matchedPreferences || [],
      riskClassification: "General educational idea; check that it is familiar, welcome, and safe for your child.",
      sourceEvidence: recommendation.evidence,
      relatedSupportAreas,
      researchReferences: recommendation.researchReferences,
      researchLimitations,
    }];
  }).slice(0, MAX_RECOMMENDATIONS);
}
