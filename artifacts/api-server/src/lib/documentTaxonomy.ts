export const DOCUMENT_PURPOSES = [
  "intake_assessment",
  "treatment_plan",
  "behavior_intervention_plan",
  "session_note",
  "progress_note",
  "safety_crisis_plan",
  "assessment",
  "review",
  "other_clinical_document",
] as const;

export type DocumentPurpose = (typeof DOCUMENT_PURPOSES)[number];
export type DocumentClassificationStatus = "not_classified" | "verified" | "needs_review";

const PURPOSE_SET = new Set<string>(DOCUMENT_PURPOSES);

export function isDocumentPurpose(value: unknown): value is DocumentPurpose {
  return typeof value === "string" && PURPOSE_SET.has(value);
}
