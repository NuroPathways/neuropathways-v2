import path from "node:path";
import type { SupportCard, SourceReference } from "./parentStarterLibrary";

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

export function guidanceFingerprint(card: SupportCard): string {
  return [
    card.whatMayBeHappening,
    ...card.rightNow,
    ...card.avoid,
    ...card.prevention,
    card.replacementSkill,
    card.reinforcementIdea,
    card.seekHelp,
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
    ...card.avoid,
    ...card.prevention,
    card.replacementSkill,
    card.reinforcementIdea,
    card.seekHelp,
  ].join(" ");
  const actionableText = text.replace(
    /\b(?:do not|don't|never|avoid)\b.{0,50}\b(?:restraint|hold(?:ing)?|pin(?:ning)?|seclusion|physical block|wrap|immobiliz\w*)\b/gi,
    "",
  );
  return !/\b(?:how to|steps? to|instructions? for|apply|perform|use|do|try|wrap)\b.{0,50}\b(?:restraint|hold(?:ing)?|pin(?:ning)?|seclusion|physical block|wrap|immobiliz\w*)\b/i.test(actionableText) &&
    !/\b(?:hold|pin|restrain|seclude|immobiliz\w*|physically block)\s+(?:a |the |your )?(?:child|person|them|him|her)\b/i.test(actionableText) &&
    !/\b(?:restraint|hold|pin(?:ning)?|seclusion|physical block|wrap|immobiliz)\b.{0,40}\b(?:step|technique|method|position|grip|instruction)\b/i.test(actionableText);
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
    Array.isArray(card.prevention);
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
  for (const group of groups.values()) {
    const ordered = group.sort((left, right) => {
      const priority = SOURCE_PRIORITY[right.source] - SOURCE_PRIORITY[left.source];
      if (priority) return priority;
      const leftReviewed = left.source === "clinician_reviewed" && left.reviewedAt ? 1 : 0;
      const rightReviewed = right.source === "clinician_reviewed" && right.reviewedAt ? 1 : 0;
      if (leftReviewed !== rightReviewed) return rightReviewed - leftReviewed;
      return Number(incomingCards.includes(right)) - Number(incomingCards.includes(left));
    });
    const winner = { ...ordered[0] };
    const hasDifferentGuidance = ordered.slice(1).some((card) =>
      guidanceFingerprint(card) !== guidanceFingerprint(winner),
    );
    const conflict = ordered.some((card) => card.conflict) || hasDifferentGuidance;
    if (!hasDifferentGuidance) {
      winner.sourceDocumentIds = [...new Set(ordered.flatMap((card) => card.sourceDocumentIds || []))];
      winner.sourceReferences = mergeReferences(...ordered.map((card) => card.sourceReferences || []));
    } else {
      winner.sourceDocumentIds = [...new Set(winner.sourceDocumentIds || [])];
      winner.sourceReferences = mergeReferences(winner.sourceReferences || []);
    }
    winner.relatedGoals = uniqueStrings(ordered.flatMap((card) => card.relatedGoals || []));
    winner.conflict = conflict;
    winner.conflictMessage = conflict
      ? ordered.map((card) => card.conflictMessage).find(Boolean) || REVIEW_RECOMMENDATION
      : null;
    result.push(winner);
  }
  return result.sort((left, right) => SOURCE_PRIORITY[right.source] - SOURCE_PRIORITY[left.source]);
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