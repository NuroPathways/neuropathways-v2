import type { DocumentExtractionRecord } from "@workspace/db";

export type ParentSafetyPlanSourceDocument = {
  id: string;
  childId: string;
  documentVersion: string | null;
  title: string;
  fileName: string;
  documentType: string;
  documentClassificationStatus: string;
  scanStatus: string;
  extractionStatus: string;
  clinicalReviewStatus: string;
  uploadedBy: "parent" | "clinician";
  createdAt: string;
};

export type ParentSafetyPlanWire = {
  childId: string;
  hasSafetyPlan: boolean;
  documents: Array<{
    id: string;
    title: string;
    documentType: string;
    documentClassificationStatus: string;
    scanStatus: string;
    extractionStatus: string;
    clinicalReviewStatus: string;
    uploadedBy: "parent" | "clinician";
    createdAt: string;
    hasInstructions: boolean;
  }>;
  instructions: Array<{
    id: string;
    contentKind: "source_excerpt" | "profile_extraction";
    documentId: string;
    sourceDocumentIds: string[];
    documentTitle: string;
    uploadedBy: "parent" | "clinician";
    uploadedAt: string;
    sourceExcerpt: string | null;
    profileNote: string | null;
    sourceSection: string | null;
    sourcePage: number | null;
    sourceExcerptVerified: boolean;
    sourceReviewRequired: boolean;
    clinicianApproved: boolean;
  }>;
};

export type ParentSafetyPlanLegacyProfile = {
  id: string;
  sourceDocumentIds: string[];
  safetyProcedures: unknown;
  createdAt: string | Date | null;
};

function profileStepText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const record = value as Record<string, unknown>;
  return profileStepText(record.text ?? record.step ?? record.procedure ?? record.description ?? record.title);
}

function profileSteps(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(profileStepText).filter(Boolean);
  if (typeof value === "string") {
    return value.split(/\r?\n/).map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim()).filter(Boolean);
  }
  return [];
}

function toIsoDate(value: string | Date | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function isSafetyPlanDocument(document: ParentSafetyPlanSourceDocument): boolean {
  if (document.documentType.toLowerCase().replace(/[\s-]+/g, "_") === "safety_crisis_plan") return true;
  const text = `${document.documentType} ${document.title} ${document.fileName}`.toLowerCase();
  return /(?:safety|crisis)[\s_-]*(?:plan|protocol)|(?:plan|protocol)[\s_-]*(?:for[\s_-]*)?(?:safety|crisis)/i.test(text);
}

function needsSourceReview(record: DocumentExtractionRecord): boolean {
  return record.sourceExcerptVerified !== true ||
    record.reviewStatus === "needs_review" ||
    record.extractionStatus === "needs_review";
}

function isClinicianApproved(record: DocumentExtractionRecord): boolean {
  return record.reviewStatus === "approved" &&
    Boolean(record.approvedBy && record.approvedAt) &&
    record.sourceExcerptVerified === true &&
    record.extractionStatus === "extracted";
}

export function projectParentSafetyPlan(
  childId: string,
  sourceDocuments: ParentSafetyPlanSourceDocument[],
  records: DocumentExtractionRecord[],
  legacyProfile?: ParentSafetyPlanLegacyProfile | null,
): ParentSafetyPlanWire {
  const documentById = new Map(
    sourceDocuments
      .filter((document) => document.childId === childId)
      .map((document) => [document.id, document]),
  );
  const instructions: ParentSafetyPlanWire["instructions"] = records.flatMap((record): ParentSafetyPlanWire["instructions"] => {
    const document = documentById.get(record.documentId);
    if (
      !document ||
      record.childId !== childId ||
      record.category !== "safety_instruction" ||
      !document.documentVersion ||
      record.documentVersion !== document.documentVersion ||
      !record.sourceExcerpt.trim()
    ) return [];
    return [{
      id: record.id,
      contentKind: "source_excerpt",
      documentId: document.id,
      sourceDocumentIds: [document.id],
      documentTitle: document.title || document.fileName || "Safety document",
      uploadedBy: document.uploadedBy,
      uploadedAt: document.createdAt,
      sourceExcerpt: record.sourceExcerpt.trim(),
      profileNote: null,
      sourceSection: record.sourceSection || null,
      sourcePage: record.sourcePage,
      sourceExcerptVerified: record.sourceExcerptVerified === true,
      sourceReviewRequired: needsSourceReview(record),
      clinicianApproved: isClinicianApproved(record),
    }];
  });
  const legacySourceIds = [...new Set(legacyProfile?.sourceDocumentIds || [])];
  const legacySourceDocuments = legacySourceIds.map((id) => documentById.get(id)).filter(
    (document): document is ParentSafetyPlanSourceDocument => Boolean(document && document.scanStatus === "done"),
  );
  const profileNotes = profileSteps(legacyProfile?.safetyProcedures);
  const hasCurrentProfileInstruction = instructions.some((instruction) =>
    legacySourceIds.includes(instruction.documentId),
  );
  if (
    legacyProfile?.id &&
    legacySourceIds.length > 0 &&
    legacySourceDocuments.length === legacySourceIds.length &&
    profileNotes.length > 0 &&
    !hasCurrentProfileInstruction
  ) {
    const sourceDocumentIds = legacySourceDocuments.map((document) => document.id);
    const documentTitle = legacySourceDocuments
      .map((document) => document.title || document.fileName)
      .filter(Boolean)
      .join(", ") || "Linked clinical documents";
    for (const [index, profileNote] of profileNotes.entries()) {
      instructions.push({
        id: `legacy-safety-${legacyProfile.id}-${index}`,
        contentKind: "profile_extraction",
        documentId: sourceDocumentIds[0],
        sourceDocumentIds,
        documentTitle,
        uploadedBy: "clinician",
        uploadedAt: toIsoDate(legacyProfile.createdAt, legacySourceDocuments[0].createdAt),
        sourceExcerpt: null,
        profileNote,
        sourceSection: "Clinician profile extraction",
        sourcePage: null,
        sourceExcerptVerified: false,
        sourceReviewRequired: true,
        clinicianApproved: false,
      });
    }
  }
  const legacySourceIdSet = new Set(
    instructions
      .filter((instruction) => instruction.contentKind === "profile_extraction")
      .flatMap((instruction) => instruction.sourceDocumentIds),
  );
  const documentIdsWithInstructions = new Set(instructions.map((instruction) => instruction.documentId));
  const documents = sourceDocuments
    .filter((document) =>
      document.childId === childId &&
      (isSafetyPlanDocument(document) || documentIdsWithInstructions.has(document.id) || legacySourceIdSet.has(document.id)),
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((document) => ({
      id: document.id,
      title: document.title || document.fileName || "Safety document",
      documentType: document.documentType,
      documentClassificationStatus: document.documentClassificationStatus,
      scanStatus: document.scanStatus,
      extractionStatus: document.extractionStatus,
      clinicalReviewStatus: document.clinicalReviewStatus,
      uploadedBy: document.uploadedBy,
      createdAt: document.createdAt,
      hasInstructions: documentIdsWithInstructions.has(document.id) || legacySourceIdSet.has(document.id),
    }));
  const sortOrder = new Map(documents.map((document, index) => [document.id, index]));
  instructions.sort((left, right) =>
    (sortOrder.get(left.documentId) ?? Number.MAX_SAFE_INTEGER) -
      (sortOrder.get(right.documentId) ?? Number.MAX_SAFE_INTEGER) ||
    (left.sourcePage ?? 0) - (right.sourcePage ?? 0),
  );
  return {
    childId,
    hasSafetyPlan: documents.length > 0,
    documents,
    instructions,
  };
}
