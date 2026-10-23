export type DocumentProcessingStatus = "uploaded" | "processing" | "processed" | "failed";
export type DocumentExtractionStatus =
  | "not_started"
  | "processing"
  | "completed"
  | "partial"
  | "no_relevant_content"
  | "failed";
export type DocumentClinicalReviewStatus =
  | "not_assessed"
  | "no_review_required"
  | "not_reviewed"
  | "needs_review"
  | "reviewed";

type ExtractionRecordReview = {
  category?: string | null;
  extractionStatus?: string | null;
  reviewStatus?: string | null;
  sourceExcerptVerified?: boolean;
};

type ExtractionRunReview = {
  scanStatus?: string | null;
  records?: ExtractionRecordReview[] | null;
} | null | undefined;

export function documentProcessingStatus(status: unknown): DocumentProcessingStatus {
  const normalized = String(status || "").toLowerCase();
  if (["done", "scanned", "complete", "completed", "ready", "needs_review", "needs-review", "needs review"].includes(normalized)) {
    return "processed";
  }
  if (["error", "failed"].includes(normalized)) return "failed";
  if (["processing", "scanning"].includes(normalized)) return "processing";
  return "uploaded";
}

export function documentExtractionStatus(runStatus: unknown, isCurrent = true): DocumentExtractionStatus {
  if (!isCurrent || !runStatus) return "not_started";
  const normalized = String(runStatus).toLowerCase();
  if (["processing", "completed", "partial", "no_relevant_content", "failed"].includes(normalized)) {
    return normalized as DocumentExtractionStatus;
  }
  return "not_started";
}

export function documentClinicalReviewStatus(
  run: ExtractionRunReview,
  documentReviewed: boolean,
  documentScanStatus?: unknown,
): DocumentClinicalReviewStatus {
  const legacyStatus = String(documentScanStatus || "").toLowerCase();
  const legacyNeedsReview = ["needs_review", "needs-review", "needs review"].includes(legacyStatus);
  if (!run) return legacyNeedsReview ? "needs_review" : documentReviewed ? "reviewed" : "not_assessed";
  const runStatus = String(run.scanStatus || "").toLowerCase();
  const records = Array.isArray(run.records) ? run.records : [];
  const clinicalRecords = records.filter((record) => record.category !== "document_metadata");

  if (
    legacyNeedsReview ||
    ["partial", "failed", "processing"].includes(runStatus) ||
    clinicalRecords.some((record) =>
      record.reviewStatus === "needs_review" ||
      record.extractionStatus === "needs_review" ||
      record.sourceExcerptVerified === false,
    )
  ) {
    return "needs_review";
  }

  if (clinicalRecords.some((record) => record.reviewStatus === "unreviewed")) return "not_reviewed";
  if (clinicalRecords.length > 0 && clinicalRecords.every((record) =>
    record.reviewStatus === "approved" || record.reviewStatus === "rejected",
  )) {
    return "reviewed";
  }
  if (documentReviewed) return "reviewed";
  if (runStatus === "no_relevant_content" && clinicalRecords.length === 0) return "no_review_required";
  if (runStatus === "completed" && clinicalRecords.length === 0) return "no_review_required";
  if (runStatus === "completed" || runStatus === "no_relevant_content") return "no_review_required";
  return "not_assessed";
}
