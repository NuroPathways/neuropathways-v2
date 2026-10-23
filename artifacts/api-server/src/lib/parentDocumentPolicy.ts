import path from "node:path";
import {
  getStarterTemplate,
  starterLibrary,
  type ParentPlanActivity,
  type ParentPlanActivitySource,
  type SupportCard,
  type SourceReference,
} from "./parentStarterLibrary";
import { DOCUMENT_PURPOSES } from "./documentTaxonomy";

const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const PARENT_DOCUMENT_MIME_BY_EXTENSION: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".txt": "text/plain",
};
const DOC_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const REVIEW_RECOMMENDATION = "Conflict detected. Clinician review recommended.";
const GOAL_REVIEW_RECOMMENDATION =
  "These support steps were reviewed for a different goal. The current goal has not been reviewed; ask your clinician whether the steps still fit.";
const MAX_REFERENCES = 8;

function safeName(value: string): string {
  const baseName = path.basename(value.replace(/\\/g, "/"));
  return baseName.replace(/[\u0000-\u001f\u007f]/g, "").replace(/[<>:"|?*]/g, "_").trim();
}

function isValidDocxZip(bytes: Buffer): boolean {
  if (
    bytes.length < 4 ||
    bytes[0] !== 0x50 ||
    bytes[1] !== 0x4b ||
    ![0x03, 0x05, 0x07].includes(bytes[2]) ||
    ![0x04, 0x06, 0x08].includes(bytes[3])
  ) return false;
  const zipText = bytes.toString("latin1");
  return zipText.includes("[Content_Types].xml") && zipText.includes("word/document.xml");
}

export function detectParentDocumentType(
  originalName: string,
  declaredMimeType: string,
  bytes: Buffer,
): { extension: string; mimeType: string } | null {
  if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES) return null;
  const extension = path.extname(safeName(originalName)).toLowerCase();
  const expectedMime = PARENT_DOCUMENT_MIME_BY_EXTENSION[extension];
  if (!expectedMime || declaredMimeType !== expectedMime) return null;

  let signatureValid = false;
  if (extension === ".pdf") signatureValid = bytes.length >= 5 && bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  if (extension === ".doc") signatureValid = bytes.length >= 8 && bytes.subarray(0, 8).equals(DOC_SIGNATURE);
  if (extension === ".docx") signatureValid = isValidDocxZip(bytes);
  if (extension === ".jpg" || extension === ".jpeg") {
    signatureValid = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (extension === ".png") signatureValid = bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE);
  if (extension === ".txt") {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      signatureValid = !bytes.includes(0);
    } catch {
      signatureValid = false;
    }
  }
  return signatureValid ? { extension, mimeType: expectedMime } : null;
}

export function normalizedParentText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function supportBehaviorIdentity(
  card: Pick<SupportCard, "behaviorKey" | "behaviorName">,
): string {
  const behaviorKey = normalizedParentText(card.behaviorKey);
  const behaviorName = normalizedParentText(card.behaviorName);
  return behaviorKey === "custom"
    ? `custom:${behaviorName}`
    : behaviorKey || behaviorName;
}

export function deriveSupportProvenance(
  generationSources: Array<{ documentId: string; source: "parent_document" | "clinician_document" }>,
  citedSourceIds: string[],
): { sourceDocumentIds: string[]; source: "parent_document" | "clinician_document" } {
  const sourceDocumentIds = [...new Set(generationSources.map((source) => source.documentId).filter(Boolean))];
  const citedIds = new Set(citedSourceIds.filter((id) => sourceDocumentIds.includes(id)));
  const source = generationSources.some((input) =>
    input.source === "clinician_document" && citedIds.has(input.documentId),
  ) ? "clinician_document" : "parent_document";
  return { sourceDocumentIds, source };
}

export type ParentDocumentGenerationPart = (
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: "image/jpeg" | "image/png"; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } }
) & { cache_control?: { type: "ephemeral" } };

export type ParentDocumentContent = ParentDocumentGenerationPart | ParentDocumentGenerationPart[];

export function buildParentDocumentGenerationContent(
  documents: Array<{ id: string; title: string; content: ParentDocumentContent }>,
  behaviorName: string,
  goal: string | null,
  allowedSourceIds: string[],
): ParentDocumentGenerationPart[] {
  const content: ParentDocumentGenerationPart[] = [];
  for (const document of documents) {
    content.push(
      { type: "text", text: `[Document: ${document.title}; id=${document.id}]` },
      ...(Array.isArray(document.content) ? document.content : [document.content]),
    );
  }
  // The source prefix is identical for every target. Keep the changing behavior
  // instruction outside the cache breakpoint, without dropping original pages.
  if (content.length) {
    content[content.length - 1] = { ...content[content.length - 1], cache_control: { type: "ephemeral" } };
  }
  content.push({
    type: "text",
    text: `Create safe, plain-language support for the selected behavior "${behaviorName}"${goal ? ` with goal "${goal}"` : ""}.

Allowed source document IDs: ${JSON.stringify(allowedSourceIds)}

Write for a caregiver who needs quick steps: use everyday words, short direct sentences, and one clear action per list item. Aim for one or two short lines per item and keep each list item under 90 characters. Return no more than four items in right_now, avoid, prevention, and track. Keep what_may_be_happening to one short sentence and each other text field to one short sentence. Do not drop a safety condition or escalation instruction to make the text shorter; if it cannot be summarized safely, tell the caregiver to follow the individualized plan and contact the child’s clinician.

Use only source document IDs provided above. Choose IDs that directly support the guidance. If the documents explicitly state a goal for this selected behavior, return its exact wording in selected_goal; otherwise return an empty string. Never invent a goal.

Create daily_activities only when a source supports a real, low-risk activity in an ordinary routine. Each candidate must include an action-focused title, routine_context, materials (use an empty list only when no materials are needed), start_action, two to five concrete steps, a clear ending, pause_conditions, duration_minutes, a skill, and one source_document_id with a short exact source_excerpt. Include related_goal only when the source directly supports it and reinforcement only when the source specifies it. The server verifies the excerpt against searchable source text. If required details are missing, return the candidate with empty fields so the server can classify it as Needs Details; if the source or citation requires human verification, classify it Needs Clinician Review. Never fill gaps with a typical routine, assumed prompt, invented reinforcement, or general behavior advice. Return at most three candidates. Do not turn a goal or milestone into an activity, or turn crisis response, restraint, punishment, extinction, or other emergency/safety procedures into daily practice. Immediate help remains separate from daily practice.

For safety or medical uncertainty, say to follow an existing individualized plan and contact the child’s clinician. If immediate danger is described, recommend emergency services. Do not invent that a clinician reviewed or approved anything.`,
  });
  return content;
}

const PLAN_ACTIVITY_UNSAFE = /\b(restraint|seclusion|pin(?:ning)?|hold(?:ing)? (?:down|still)|physical block(?:ing)?|punish(?:ment)?|extinction|force them|ignore (?:all|the) safety)\b/i;
const GOAL_ONLY_ACTIVITY = /^(?:practice\s+(?:goal\s*#?\s*\d+|reducing|decreasing|improving|increasing|anxiety symptoms|functional communication|reassurance seeking)|work on\b|use an opportunity to practice|practice goal\b)/i;
const GENERIC_ACTIVITY_PLACEHOLDER = /^(?:try (?:one )?(?:low[- ]pressure )?practice opportunity|follow (?:the|your) (?:existing )?plan|offer a chance to practice|practice this skill|do the activity)$/i;

function boundedActivityText(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";
}

function boundedActivityList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const text = boundedActivityText(item, maxLength);
    return text ? [text] : [];
  }).slice(0, maxItems);
}

export function normalizeParentPlanActivities(
  value: unknown,
  allowedSourceIds: string[],
  sourceTypeForDocument: (documentId: string) => ParentPlanActivitySource,
  sourceTextByDocumentId: Map<string, string>,
): ParentPlanActivity[] {
  if (!Array.isArray(value)) return [];
  const allowedIds = new Set(allowedSourceIds);
  const seen = new Set<string>();
  const activities: ParentPlanActivity[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Record<string, unknown>;
    const sourceDocumentId = boundedActivityText(candidate.source_document_id, 160);
    const title = boundedActivityText(candidate.title, 100);
    const routineContext = boundedActivityText(candidate.routine_context, 180);
    const opportunity = boundedActivityText(candidate.opportunity, 320);
    const skill = boundedActivityText(candidate.skill, 240);
    const reinforcement = boundedActivityText(candidate.reinforcement, 320) || null;
    const sourceExcerpt = boundedActivityText(candidate.source_excerpt, 420);
    const startAction = boundedActivityText(candidate.start_action, 320);
    const stepsProvidedCount = Array.isArray(candidate.steps) ? candidate.steps.length : 0;
    const steps = boundedActivityList(candidate.steps, 5, 320);
    const ending = boundedActivityText(candidate.ending, 320);
    const pauseConditions = boundedActivityList(candidate.pause_conditions, 5, 320);
    const observationPrompts = boundedActivityList(candidate.observation_prompts, 5, 240);
    const materialsProvided = Array.isArray(candidate.materials);
    const materials = boundedActivityList(candidate.materials, 8, 160);
    const durationMinutes = typeof candidate.duration_minutes === "number" && Number.isInteger(candidate.duration_minutes)
      ? candidate.duration_minutes
      : null;
    const searchableSource = sourceTextByDocumentId.get(sourceDocumentId) || "";
    const relatedGoalCandidate = boundedActivityText(candidate.related_goal, 320);
    const normalizedSource = normalizedParentText(searchableSource);
    const relatedGoal = relatedGoalCandidate &&
      normalizedSource.includes(normalizedParentText(relatedGoalCandidate))
      ? relatedGoalCandidate
      : null;
    const normalizedExcerpt = normalizedParentText(sourceExcerpt);
    if (!allowedIds.has(sourceDocumentId) || !title) continue;
    const sourceExcerptVerified = normalizedExcerpt.length >= 24 &&
      normalizedParentText(searchableSource).includes(normalizedExcerpt);
    const fullText = [
      title, routineContext, opportunity, skill, reinforcement || "", startAction,
      ...steps, ending, ...pauseConditions,
    ].join(" ");
    if (PLAN_ACTIVITY_UNSAFE.test(fullText)) continue;
    const detailsNeeded: string[] = [];
    if (!routineContext) detailsNeeded.push("Add the specific routine or context.");
    if (!materialsProvided) detailsNeeded.push("Specify the materials, or confirm none are needed.");
    if (!startAction || GOAL_ONLY_ACTIVITY.test(startAction) || GENERIC_ACTIVITY_PLACEHOLDER.test(startAction)) {
      detailsNeeded.push("Add a clear starting action.");
    }
    if (
      steps.length < 2 ||
      steps.length > 5 ||
      stepsProvidedCount > 5 ||
      steps.length !== stepsProvidedCount ||
      steps.some((step) => GOAL_ONLY_ACTIVITY.test(step) || GENERIC_ACTIVITY_PLACEHOLDER.test(step))
    ) {
      detailsNeeded.push("Provide two to five concrete activity steps.");
    }
    if (!ending) detailsNeeded.push("Explain how the activity ends.");
    if (!pauseConditions.length) detailsNeeded.push("Add conditions for pausing or stopping.");
    if (!durationMinutes || durationMinutes < 1 || durationMinutes > 60) {
      detailsNeeded.push("Add a realistic duration from 1 to 60 minutes.");
    }
    if (!opportunity) detailsNeeded.push("Describe an opportunity the caregiver can offer safely.");
    if (!skill || GOAL_ONLY_ACTIVITY.test(skill)) detailsNeeded.push("Name the specific skill to practice or notice.");
    if (
      GOAL_ONLY_ACTIVITY.test(title) ||
      GOAL_ONLY_ACTIVITY.test(opportunity) ||
      GENERIC_ACTIVITY_PLACEHOLDER.test(title) ||
      GENERIC_ACTIVITY_PLACEHOLDER.test(opportunity)
    ) {
      detailsNeeded.push("Replace goal-only wording with an activity the family can do.");
    }
    const needsClinicianSourceCheck = !sourceExcerptVerified;
    if (needsClinicianSourceCheck) detailsNeeded.push("The supporting source excerpt could not be verified.");
    const requiredDetailsMissing = detailsNeeded.some((reason) =>
      !reason.startsWith("The supporting source excerpt"),
    );
    const readiness = requiredDetailsMissing
      ? "needs_details" as const
      : needsClinicianSourceCheck
        ? "needs_clinician_review" as const
      : sourceTypeForDocument(sourceDocumentId) === "clinician_uploaded_plan"
        ? "needs_clinician_review" as const
        : "ready" as const;
    if (readiness === "needs_clinician_review" && sourceTypeForDocument(sourceDocumentId) === "clinician_uploaded_plan") {
      detailsNeeded.push("A clinician must review and assign this plan activity before family practice.");
    }
    const identity = `${sourceDocumentId}:${normalizedParentText(`${title} ${routineContext} ${opportunity}`)}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    activities.push({
      title,
      routineContext,
      opportunity,
      skill,
      reinforcement,
      relatedGoal,
      estimatedMinutes: durationMinutes,
      materials,
      startAction,
      steps,
      ending,
      pauseConditions,
      observationPrompts,
      sourceDocumentId,
      sourceExcerpt: sourceExcerptVerified ? sourceExcerpt : "",
      sourceType: sourceTypeForDocument(sourceDocumentId),
      readiness,
      readinessReasons: detailsNeeded,
      sourceExcerptVerified,
    });
    if (activities.length >= 3) break;
  }
  return activities;
}

export function isValidParentPlanActivity(value: unknown): value is ParentPlanActivity {
  if (!value || typeof value !== "object") return false;
  const activity = value as Partial<ParentPlanActivity>;
  const basicFields = typeof activity.title === "string" &&
    typeof activity.routineContext === "string" &&
    typeof activity.opportunity === "string" &&
    typeof activity.skill === "string" &&
    (typeof activity.reinforcement === "string" || activity.reinforcement === null) &&
    typeof activity.sourceDocumentId === "string" &&
    typeof activity.sourceExcerpt === "string" &&
    ["clinician_reviewed", "clinician_uploaded_plan", "parent_uploaded_plan"].includes(activity.sourceType || "");
  if (!basicFields) return false;
  const safeSteps = Array.isArray(activity.steps)
    ? activity.steps.filter((step): step is string => typeof step === "string")
    : [];
  const text = [
    activity.title, activity.routineContext, activity.opportunity, activity.skill,
    activity.reinforcement || "", activity.startAction || "", ...safeSteps,
    activity.ending || "", ...(Array.isArray(activity.pauseConditions) ? activity.pauseConditions : []),
  ].join(" ");
  if (PLAN_ACTIVITY_UNSAFE.test(text)) return false;
  if (activity.readiness !== "ready") {
    return activity.readiness === undefined ||
      (["needs_details", "needs_clinician_review"].includes(activity.readiness) &&
        Array.isArray(activity.readinessReasons));
  }
  return Boolean(
    activity.routineContext!.trim() &&
    activity.opportunity!.trim() &&
    activity.skill!.trim() &&
    Number.isInteger(activity.estimatedMinutes) &&
    activity.estimatedMinutes! >= 1 &&
    activity.estimatedMinutes! <= 60 &&
    Array.isArray(activity.materials) &&
    typeof activity.startAction === "string" &&
    activity.startAction.trim() &&
    Array.isArray(activity.steps) &&
    activity.steps.length >= 2 &&
    activity.steps.length <= 5 &&
    typeof activity.ending === "string" &&
    activity.ending.trim() &&
    Array.isArray(activity.pauseConditions) &&
    activity.pauseConditions.length > 0 &&
    activity.sourceExcerptVerified === true &&
    activity.sourceExcerpt!.trim().length >= 24 &&
    !GOAL_ONLY_ACTIVITY.test(activity.title!) &&
    !GOAL_ONLY_ACTIVITY.test(activity.opportunity!) &&
    !GENERIC_ACTIVITY_PLACEHOLDER.test(activity.title!) &&
    !GENERIC_ACTIVITY_PLACEHOLDER.test(activity.opportunity!) &&
    !GOAL_ONLY_ACTIVITY.test(activity.startAction!) &&
    !GENERIC_ACTIVITY_PLACEHOLDER.test(activity.startAction!) &&
    activity.steps.every((step) =>
      typeof step === "string" &&
      !GOAL_ONLY_ACTIVITY.test(step) &&
      !GENERIC_ACTIVITY_PLACEHOLDER.test(step),
    )
  );
}

export type DiscoveredParentTarget = {
  behaviorKey: string;
  behaviorName: string;
  goal: string | null;
};

/** Discovery is deliberately independent of saved/generated cards: its only evidence is fetched source text. */
export function buildParentDocumentDiscoveryContent(
  documents: Array<{ id: string; title: string; fileName?: string; content: ParentDocumentContent }>,
  allowedSourceIds: string[],
): ParentDocumentGenerationPart[] {
  const content: ParentDocumentGenerationPart[] = [];
  for (const document of documents) {
    content.push(
      { type: "text", text: `[Document: ${document.title}; filename=${document.fileName || "not provided"}; id=${document.id}]` },
      ...(Array.isArray(document.content) ? document.content : [document.content]),
    );
  }
  content.push({
    type: "text",
    text: `For every source document, classify its actual purpose from its contents and available metadata. Use exactly one of these document_type values: ${DOCUMENT_PURPOSES.join(", ")}. A filename or title is only a clue and must never be the sole basis. Add one document_metadata extraction for each source, with its exact source_document_id, a verbatim source_excerpt of at least 12 characters that supports the type, and interpretation.document_type set to the chosen value. If the contents do not support a more specific type, use other_clinical_document. If the file is unreadable, do not guess from its filename.

Extract type-specific facts without inventing or changing clinical meaning:
- Intake assessment: documented background, strengths, interests, communication or sensory preferences, concerns, functional difficulties, family context, and relevant history. Do not require or invent a formal behavior intervention.
- Treatment plan: explicit goals, skill targets, actual behavior targets, strategies, measurement, home practice, and restrictions.
- Session note: goals addressed, activities, strategies used, client responses, barriers, recommendations, and follow-up as clinical_observation facts. Do not create a new goal from an issue mentioned in a session note; record goal references as goals_addressed unless the note explicitly establishes a formal goal.
- Progress note: documented progress, response, barriers, recommendations, and follow-up as clinical_observation facts; do not infer a new goal.
- Behavior intervention plan: explicitly named target behaviors, antecedents, strategies, replacement communication, reinforcement, escalation guidance, and safety restrictions.
- Safety/crisis plan: extract safety instructions separately; never convert them into routine activities.
- Assessment, review, and other clinical documents: extract only facts their contents actually establish.

Also extract a separate support_concern candidate when a source describes an observable difficulty or support area in narrative text, even if it is not formally named as a target behavior. Use a plain, nonjudgmental name and describe only the source-supported facts. Set evidence_level to documented_concern only if the source itself characterizes it as a concern; otherwise use possible_support_area. Include source-stated contexts and observations when available, plus only the uncertainty the source warrants. These candidates are not formal behavior targets, diagnoses, explanations of function or intent, clinician-approved interventions, or authorization to create a card. Do not add them to targets or the behavior category unless the source separately identifies an actual target for support. Do not infer a pattern from one event.

Keep document metadata, profile facts, clinical observations, support_concern candidates, formal goals, formal behavior targets, strategies, safety instructions, and potential home activities separate. An empty target list and an empty activity-candidate list are valid; neither makes a readable document a failure. A goal is not an activity. Do not create an activity just because a goal exists. Every fact or candidate needs an exact source document id and a verbatim excerpt from that source.

Find target behaviors explicitly identified in the supplied source documents. For each target, return its canonical behavior_key only if it clearly matches one of these supported keys: ${starterLibrary.map((item) => item.key).join(", ")}. Otherwise use behavior_key "custom" and provide the exact, concise target label in behavior_name. Return only behaviors described as actual targets for support, not behaviors merely mentioned as examples, historical context, possible risks, negated targets, or items the plan says are not concerns. Do not infer a target from a strategy, diagnosis, or general discussion. Include a goal only when the source explicitly assigns a concrete goal to that same target; otherwise use an empty string. Preserve the exact source wording of an explicit goal; do not paraphrase it. Never invent a goal. Keep goals concise and within 500 characters. Return at most 20 targets and no source IDs that are not listed below.

Also classify each explicit fact or cautious support-area candidate separately in extractions. Use only these categories: document_metadata, profile_information, clinical_observation, support_concern, behavior, goal, support_strategy, safety_instruction, potential_home_activity. Profile fields, observations, support concerns, formal behaviors, goals, strategies, safety instructions, and activities must remain separate. Do not infer a behavior function, diagnosis, intent, preference, risk, approval, or missing instruction. For each item, include source_document_id from the supplied list, an exact source_excerpt of at least 12 characters, and the category-specific interpretation fields. Use source_section and source_page only when available; otherwise use empty string and 0. Return [] for formal targets or activity candidates when none are explicit, while retaining any other source-grounded facts and support_concern candidates.

Allowed source document IDs: ${JSON.stringify(allowedSourceIds)}`,
  });
  return content;
}

/** Bounds and canonicalizes model output before it can become a support-card identity. */
export function normalizeDiscoveredParentTargets(value: unknown, limit = 20): DiscoveredParentTarget[] {
  if (!Array.isArray(value) || limit <= 0) return [];
  const seen = new Set<string>();
  const targets: DiscoveredParentTarget[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.behavior_key !== "string" || typeof candidate.behavior_name !== "string") continue;
    const rawKey = candidate.behavior_key.trim().slice(0, 100);
    const rawName = candidate.behavior_name.replace(/[\u0000-\u001f\u007f]/g, "").trim().replace(/\s+/g, " ").slice(0, 120);
    const template = getStarterTemplate(rawKey);
    let behaviorKey: string;
    let behaviorName: string;
    if (rawKey.toLowerCase() === "custom") {
      if (!rawName) continue;
      behaviorKey = "custom";
      behaviorName = rawName;
    } else {
      // An unrecognized model-supplied key must not be silently promoted to a custom target.
      if (!template) continue;
      behaviorKey = template.key;
      behaviorName = template.name;
    }
    const identity = supportBehaviorIdentity({ behaviorKey, behaviorName });
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    const normalizedGoal = typeof candidate.goal === "string"
      ? candidate.goal.replace(/[\u0000-\u001f\u007f]/g, "").trim()
      : "";
    const goal = normalizedGoal.length <= 500 ? normalizedGoal : "";
    targets.push({ behaviorKey, behaviorName, goal: goal || null });
    if (targets.length >= Math.max(0, Math.min(20, limit))) break;
  }
  return targets;
}

/** Use a lossless custom-name component for the card ID; slugging can collapse distinct labels. */
export function documentSupportCardId(documentId: string, behaviorKey: string, behaviorName: string): string {
  const identity = behaviorKey === "custom"
    ? behaviorName.normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ")
    : behaviorKey;
  return `document:${documentId}:${Buffer.from(identity, "utf8").toString("base64url")}`;
}

export function discoveredTargetsForScan(
  selected: Array<Pick<DiscoveredParentTarget, "behaviorKey" | "behaviorName">>,
  discovered: DiscoveredParentTarget[],
  totalLimit = 20,
): DiscoveredParentTarget[] {
  const limit = Math.max(0, Math.min(20, totalLimit));
  const selectedIdentities = new Set(selected.map(supportBehaviorIdentity));
  const seen = new Set(selectedIdentities);
  const remaining = Math.max(0, limit - Math.min(limit, selected.length));
  if (remaining === 0) return [];
  const candidates: DiscoveredParentTarget[] = [];
  for (const target of discovered) {
    const identity = supportBehaviorIdentity(target);
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    candidates.push(target);
    if (candidates.length >= remaining) break;
  }
  return candidates;
}

export function guidanceFingerprint(card: SupportCard): string {
  return [
    card.whatMayBeHappening,
    ...card.rightNow,
    ...card.avoid,
    ...card.prevention,
    card.replacementSkill,
    card.reinforcementIdea,
    card.seekHelp,
    ...(Array.isArray(card.dailyActivities) ? card.dailyActivities : []).flatMap((activity) => [
      activity.title,
      activity.routineContext,
      activity.opportunity,
      activity.skill,
      activity.reinforcement || "",
    ]),
  ].map(normalizedParentText).filter(Boolean).sort().join("|");
}

const SOURCE_PRIORITY: Record<SupportCard["source"], number> = {
  starter: 1,
  parent_document: 2,
  clinician_document: 3,
  clinician_reviewed: 4,
};

export function sourcePriority(source: SupportCard["source"]): number {
  return SOURCE_PRIORITY[source];
}

export function hasDuplicateParentDocumentHash(existingHashes: string[], candidateHash: string): boolean {
  return existingHashes.includes(candidateHash);
}

export function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalizedParentText(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function isSafeParentGuidance(card: SupportCard): boolean {
  const text = [
    card.whatMayBeHappening,
    ...card.rightNow,
    ...card.avoid.map((item) => `Avoid ${item}`),
    ...card.prevention,
    card.replacementSkill,
    card.reinforcementIdea,
    card.seekHelp,
  ].filter(Boolean).join("\n");
  const actionableText = text.replace(
    /\b(?:do not|don't|never|avoid)\b[^.!?;\n]{0,50}?\b(?:restraint|restrain\w*|hold(?:ing)?|pin(?:ning)?|seclusion|seclude\w*|physical(?:ly)?[ \t]+block(?:ing)?|wrap|immobiliz\w*)\b(?:[ \t]+(?:and|or|nor)[ \t]+(?:restraint|restrain\w*|hold(?:ing)?|pin(?:ning)?|seclusion|seclude\w*|physical(?:ly)?[ \t]+block(?:ing)?|wrap|immobiliz\w*)\b)*/gi,
    "",
  );
  return !/\b(?:how to|steps? to|instructions? for|apply|perform|use|do|try|wrap)\b[^.!?;\n]{0,50}\b(?:restraint|hold(?:ing)?|pin(?:ning)?|seclusion|physical block|wrap|immobiliz\w*)\b/i.test(actionableText) &&
    !/\b(?:hold|pin|restrain|seclude|immobiliz\w*|physically[ \t]+block)[ \t]+(?:a |the |your )?(?:child|person|them|him|her)\b/i.test(actionableText) &&
    !/\b(?:restraint|hold|pin(?:ning)?|seclusion|physical block|wrap|immobiliz)\b[^.!?;\n]{0,40}\b(?:step|technique|method|position|grip|instruction)\b/i.test(actionableText);
}

export function partitionParentGuidanceBySafety(cards: SupportCard[]): {
  safeCards: SupportCard[];
  omittedUnsafeCount: number;
} {
  const safeCards: SupportCard[] = [];
  let omittedUnsafeCount = 0;
  for (const card of cards) {
    if (isSafeParentGuidance(card)) safeCards.push(card);
    else omittedUnsafeCount++;
  }
  return { safeCards, omittedUnsafeCount };
}

function mergeReferences(...groups: SourceReference[][]): SourceReference[] {
  const seen = new Set<string>();
  const references: SourceReference[] = [];
  for (const reference of groups.flat()) {
    if (!reference?.documentId || !reference.title) continue;
    const key = `${reference.documentId}:${normalizedParentText(reference.excerpt || "")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    references.push({ documentId: reference.documentId, title: reference.title, excerpt: reference.excerpt || null });
    if (references.length >= MAX_REFERENCES) return references;
  }
  return references;
}

function validCard(value: unknown): value is SupportCard {
  if (!value || typeof value !== "object") return false;
  const card = value as Partial<SupportCard>;
  return typeof card.behaviorKey === "string" &&
    typeof card.behaviorName === "string" &&
    ["starter", "parent_document", "clinician_document", "clinician_reviewed"].includes(card.source || "") &&
    Array.isArray(card.rightNow) &&
    Array.isArray(card.avoid) &&
    Array.isArray(card.prevention) &&
    (card.dailyActivities === undefined ||
      (Array.isArray(card.dailyActivities) && card.dailyActivities.every(isValidParentPlanActivity)));
}

/** Highest-priority guidance wins; reviewed instructions are retained and conflicts are surfaced. */
export function reconcileSupportCards(existingCards: unknown[], incomingCards: SupportCard[]): SupportCard[] {
  const input = [...existingCards.filter(validCard), ...incomingCards];
  const groups = new Map<string, SupportCard[]>();
  for (const card of input) {
    const groupKey = supportBehaviorIdentity(card);
    const group = groups.get(groupKey) || [];
    group.push(card);
    groups.set(groupKey, group);
  }

  const result: SupportCard[] = [];
  for (const [groupKey, group] of groups.entries()) {
    const ordered = group.sort((left, right) => {
      const priority = SOURCE_PRIORITY[right.source] - SOURCE_PRIORITY[left.source];
      if (priority) return priority;
      const leftReviewed = left.source === "clinician_reviewed" && left.reviewedAt ? 1 : 0;
      const rightReviewed = right.source === "clinician_reviewed" && right.reviewedAt ? 1 : 0;
      if (leftReviewed !== rightReviewed) return rightReviewed - leftReviewed;
      return Number(incomingCards.includes(right)) - Number(incomingCards.includes(left));
    });
    const winner = { ...ordered[0] };
    const explicitPlanGoal = [...incomingCards].reverse().find((card) =>
      supportBehaviorIdentity(card) === groupKey &&
      typeof card.planGoal === "string" &&
      card.planGoal.trim().length > 0,
    );
    if (explicitPlanGoal) {
      winner.planGoal = explicitPlanGoal.planGoal;
      winner.planGoalSourceDocumentIds = [...new Set(explicitPlanGoal.planGoalSourceDocumentIds || [])];
      winner.planGoalSourceReferences = mergeReferences(explicitPlanGoal.planGoalSourceReferences || []);
    } else {
      const retainedPlanGoal = ordered.find((card) => typeof card.planGoal === "string" && card.planGoal.trim());
      winner.planGoal = retainedPlanGoal?.planGoal || null;
      winner.planGoalSourceDocumentIds = [...new Set(retainedPlanGoal?.planGoalSourceDocumentIds || [])];
      winner.planGoalSourceReferences = mergeReferences(retainedPlanGoal?.planGoalSourceReferences || []);
    }
    const hasDifferentGuidance = ordered.slice(1).some((card) =>
      guidanceFingerprint(card) !== guidanceFingerprint(winner),
    );
    const conflict = ordered.some((card) => card.conflict) || hasDifferentGuidance;
    const activitySources = hasDifferentGuidance ? [winner] : ordered;
    const activitySeen = new Set<string>();
    winner.dailyActivities = activitySources.flatMap((card) => card.dailyActivities || [])
      .filter((activity) => {
        const key = `${activity.sourceDocumentId}:${normalizedParentText(`${activity.title} ${activity.routineContext} ${activity.opportunity}`)}`;
        if (activitySeen.has(key)) return false;
        activitySeen.add(key);
        return true;
      })
      .slice(0, 8);
    if (!hasDifferentGuidance) {
      winner.sourceDocumentIds = [...new Set(ordered.flatMap((card) => card.sourceDocumentIds || []))];
      winner.sourceReferences = mergeReferences(...ordered.map((card) => card.sourceReferences || []));
    } else {
      winner.sourceDocumentIds = [...new Set(winner.sourceDocumentIds || [])];
      winner.sourceReferences = mergeReferences(winner.sourceReferences || []);
    }
    winner.relatedGoals = hasDifferentGuidance
      ? uniqueStrings(winner.relatedGoals || [])
      : uniqueStrings(ordered.flatMap((card) => card.relatedGoals || []));
    winner.conflict = conflict;
    winner.conflictMessage = conflict
      ? (hasDifferentGuidance ? winner.conflictMessage : ordered.map((card) => card.conflictMessage).find(Boolean)) ||
        REVIEW_RECOMMENDATION
      : null;
    result.push(winner);
  }
  return result.sort((left, right) => SOURCE_PRIORITY[right.source] - SOURCE_PRIORITY[left.source]);
}

/** Clear document-derived goal fields unless every contributing source is visible to the clinician. */
export function filterPlanGoalForVisibleSources<T extends SupportCard>(
  card: T,
  visibleDocumentIds: Iterable<string>,
): T {
  const sourceIds = [...new Set(card.planGoalSourceDocumentIds || [])];
  const visible = new Set(visibleDocumentIds);
  const referenceIds = new Set((card.planGoalSourceReferences || []).map((reference) => reference.documentId));
  const fullyVisible = Boolean(
    card.planGoal?.trim() &&
    sourceIds.length &&
    sourceIds.every((id) => visible.has(id) && referenceIds.has(id)),
  );
  if (fullyVisible) return card;
  return {
    ...card,
    planGoal: null,
    planGoalSourceDocumentIds: [],
    planGoalSourceReferences: [],
  };
}

/** Pin the selected behavior first and overlay only its current goal without rewriting stored approvals. */
export function orderSupportCardsForSelectedFocus(
  cards: SupportCard[],
  selectedStarter: SupportCard,
  currentGoal: string | null,
): SupportCard[] {
  const selectedIdentity = supportBehaviorIdentity(selectedStarter);
  const matchesSelectedBehavior = (card: SupportCard) =>
    supportBehaviorIdentity(card) === selectedIdentity;
  const selected = cards.find(matchesSelectedBehavior);
  const primary = selected ? { ...selected } : { ...selectedStarter };
  const selectedGoal = currentGoal?.trim() || null;
  const goalChangedAfterReview = primary.source === "clinician_reviewed" &&
    normalizedParentText(primary.goal || "") !== normalizedParentText(selectedGoal || "");

  primary.goal = selectedGoal;
  if (goalChangedAfterReview) {
    primary.conflict = true;
    primary.conflictMessage = uniqueStrings([
      ...(primary.conflictMessage ? [primary.conflictMessage] : []),
      GOAL_REVIEW_RECOMMENDATION,
    ]).join(" ");
  }

  const otherCards = cards
    .filter((card) => !matchesSelectedBehavior(card))
    .sort((left, right) => sourcePriority(right.source) - sourcePriority(left.source));
  return [primary, ...otherCards];
}

export function canAccessParentDocument(input: {
  parentId: string;
  workspaceId: string;
  childParentId: string | null;
  childWorkspaceId: string | null;
  childClinicianId: string | null;
  sharedClinicianId: string | null;
  documentTenantId: string | null;
  actorParentId?: string | null;
  actorClinicianId?: string | null;
  authorizedLegacyChildSession?: boolean;
  authorizedMobileChildSession?: boolean;
}): boolean {
  if (input.actorParentId === input.parentId) {
    return input.childParentId === input.parentId;
  }
  const explicitlySharedToCurrentClinician = Boolean(
    input.sharedClinicianId &&
    input.childClinicianId === input.sharedClinicianId &&
    input.documentTenantId === input.sharedClinicianId,
  );
  if (!explicitlySharedToCurrentClinician) return false;
  if (input.actorClinicianId) return input.actorClinicianId === input.sharedClinicianId;
  return input.authorizedLegacyChildSession === true || input.authorizedMobileChildSession === true;
}