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
  steps?: string[];
  ifDifficult?: string;
  riskTier?: string;
  evidenceReferences?: unknown[];
  [key: string]: unknown;
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
  skill: string;
  estimatedMinutes: number | null;
  materials: string[];
  steps: string[];
  pauseConditions: string[];
  matchReasons: string[];
  riskClassification: string;
  sourceEvidence: ActivityRecommendationEvidence[];
  relatedSupportAreas: string[];
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
  return profileRecords(records, "interests")
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

function explicitTemplateSignals(activityId: string, records: EvidenceRecord[]): {
  evidence: EvidenceRecord[];
  reasons: string[];
} | null {
  const interests = interestsFrom(records);
  const interestText = interests.join(" ");
  const comm = [
    ...profileRecords(records, "communication_preferences"),
    ...profileRecords(records, "aac_method"),
  ];
  const strategies = records.filter((record) => record.category === "support_strategy");
  const rules: Record<string, () => { evidence: EvidenceRecord[]; reasons: string[] } | null> = {
    "familiar-aac-choice": () => {
      const aac = profileRecords(records, "aac_method");
      const communication = profileRecords(records, "communication_preferences")
        .filter((record) => /\b(?:aac|augmentative|communication device|communication board|picture exchange)\b/i.test(
          `${text(record.interpretation.value)} ${text(record.interpretation.details)}`,
        ));
      const evidence = [...aac, ...communication];
      return evidence.length
        ? { evidence, reasons: ["The child's existing AAC method is explicitly documented."] }
        : null;
    },
    "familiar-help-signal": () => {
      const helpSignal = comm.filter((record) =>
        /\b(?:help|break|request|signal|more)\b/i.test(
          `${text(record.interpretation.value)} ${text(record.interpretation.details)} ${text(record.sourceExcerpt)}`,
        ),
      );
      return helpSignal.length
        ? { evidence: helpSignal, reasons: ["The source explicitly describes a familiar way to ask for help, a break, or more."] }
        : null;
    },
    "choose-between-familiar-activities": () => interests.length >= 2
      ? {
          evidence: profileRecords(records, "interests"),
          reasons: ["At least two child interests are explicitly documented; the options still need clinician/family confirmation as familiar and currently welcome."],
        }
      : null,
    "build-together": () => /\b(?:blocks?|building|construction|lego|magnetic tiles)\b/i.test(interestText)
      ? {
          evidence: profileRecords(records, "interests"),
          reasons: ["A documented interest specifically matches building materials."],
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
      return evidence.length
        ? { evidence, reasons: ["The source documents a familiar or accepted visual cue for a routine."] }
        : null;
    },
    "review-familiar-morning-routine": () => {
      const routine = signalEvidence(records, (value) => /\bmorning routine\b/i.test(value));
      return routine.length ? { evidence: routine, reasons: ["A morning routine is explicitly documented."] } : null;
    },
    "one-small-routine-step": () => {
      const routine = strategies.filter((record) =>
        /\b(?:routine|morning|bedtime|mealtime|dressing|handwashing)\b/i.test([
          text(record.interpretation.context), text(record.interpretation.strategy), ...list(record.interpretation.preconditions),
        ].join(" ")),
      );
      const dailyLivingGoals = goalDomainMatches(records, "daily_living");
      return routine.length && dailyLivingGoals.length
        ? { evidence: [...routine, ...dailyLivingGoals], reasons: ["A source documents both a daily-living goal and a specific routine context."] }
        : null;
    },
    "pause-and-notice-communication": () => comm.length
      ? { evidence: comm, reasons: ["The child's communication method or preference is explicitly documented."] }
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
      return continueSignal.length && playInterest.length
        ? { evidence: [...continueSignal, ...playInterest], reasons: ["The source documents both a familiar way to communicate continuing/finished and an activity interest."] }
        : null;
    },
    "take-turns-with-familiar-toy": () => {
      const playGoal = goalDomainMatches(records, "social_play");
      const playInterest = profileRecords(records, "interests").filter((record) =>
        /\b(?:toy|game|blocks?|building|train|puzzle)\b/i.test(
          `${text(record.interpretation.value)} ${text(record.interpretation.details)}`,
        ),
      );
      return playGoal.length && playInterest.length
        ? { evidence: [...playGoal, ...playInterest], reasons: ["A social-play goal and a matching documented play interest are both present."] }
        : null;
    },
  };
  return rules[activityId]?.() || null;
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
    const matched = explicitTemplateSignals(activity.id, records);
    if (!matched) continue;
    const safetyText = safetyEvidence.map((evidence) => evidence.sourceExcerpt).join(" ");
    const content = `${activity.title} ${activity.description} ${activity.skill} ${list(activity.steps).join(" ")}`;
    if (hasUnsafeInstruction(content)) continue;
    const evidence = uniqueEvidence(matched.evidence);
    if (!evidence.length) continue;
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
      materials: typeof activity.materials === "string" ? [activity.materials] : list(activity.materials),
      startAction: "",
      steps: list(activity.steps),
      ending: "",
      pauseConditions: activity.ifDifficult ? [activity.ifDifficult] : [],
      matchReasons: matched.reasons,
      missingInformation: [],
      relatedGoal: null,
      riskClassification: safetyEvidence.length
        ? "Low-risk starter; child-specific safety review required"
        : "Low-risk starter; clinician must confirm current fit",
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
}): ParentDocumentActivitySuggestion[] {
  const { recommendations } = buildChildActivityRecommendations({
    childId: input.childId,
    clinicianId: "",
    records: input.records,
    library: input.library,
    existingAssignments: input.existingActivities,
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
    return [{
      id: recommendation.id,
      title: recommendation.title,
      description: recommendation.description,
      skill: recommendation.skill,
      estimatedMinutes: recommendation.estimatedMinutes,
      materials: recommendation.materials,
      steps: recommendation.steps,
      pauseConditions: recommendation.pauseConditions,
      matchReasons: recommendation.matchReasons,
      riskClassification: "General educational idea; check that it is familiar, welcome, and safe for your child.",
      sourceEvidence: recommendation.evidence,
      relatedSupportAreas,
      researchLimitations,
    }];
  }).slice(0, MAX_RECOMMENDATIONS);
}
