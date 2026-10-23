import assert from "node:assert/strict";
import test from "node:test";
import type { DocumentExtractionRecord } from "@workspace/db";
import {
  projectParentSafetyPlan,
  type ParentSafetyPlanLegacyProfile,
  type ParentSafetyPlanSourceDocument,
} from "./parentSafetyPlan";

function source(overrides: Partial<ParentSafetyPlanSourceDocument> = {}): ParentSafetyPlanSourceDocument {
  return {
    id: "safety-doc-1",
    childId: "child-1",
    documentVersion: "version-1",
    title: "Safety Plan",
    fileName: "safety-plan.pdf",
    documentType: "safety_crisis_plan",
    documentClassificationStatus: "verified",
    scanStatus: "done",
    extractionStatus: "completed",
    clinicalReviewStatus: "not_reviewed",
    uploadedBy: "parent",
    createdAt: "2026-10-22T12:00:00.000Z",
    ...overrides,
  };
}

function instruction(overrides: Partial<DocumentExtractionRecord> = {}): DocumentExtractionRecord {
  return {
    id: "instruction-1",
    category: "safety_instruction",
    childId: "child-1",
    documentId: "safety-doc-1",
    documentVersion: "version-1",
    documentType: "safety_crisis_plan",
    sourceSection: "Safety Steps",
    sourcePage: 2,
    sourceExcerpt: "Move to the quiet room and call the listed caregiver.",
    sourceExcerptVerified: true,
    interpretation: {
      instruction: "Move to the quiet room and call the listed caregiver.",
      trigger: "When the child asks for space.",
    },
    extractionStatus: "extracted",
    ambiguityReason: null,
    reviewStatus: "unreviewed",
    approvedBy: null,
    approvedAt: null,
    createdAt: "2026-10-23T12:00:00.000Z",
    updatedAt: "2026-10-23T12:00:00.000Z",
    ...overrides,
  };
}

test("parent safety plan projection shows exact current child source excerpts and accurate upload/review status", () => {
  const plan = projectParentSafetyPlan(
    "child-1",
    [source()],
    [instruction()],
  );
  assert.equal(plan.childId, "child-1");
  assert.equal(plan.hasSafetyPlan, true);
  assert.equal(plan.documents.length, 1);
  assert.equal(plan.instructions.length, 1);
  assert.equal(plan.instructions[0].sourceExcerpt, "Move to the quiet room and call the listed caregiver.");
  assert.equal(plan.instructions[0].uploadedBy, "parent");
  assert.equal(plan.instructions[0].sourceReviewRequired, false);
  assert.equal(plan.instructions[0].clinicianApproved, false);
});

test("clinician approval is reported only when the cited source record is verified and explicitly approved", () => {
  const plan = projectParentSafetyPlan(
    "child-1",
    [source({ uploadedBy: "clinician" })],
    [instruction({
      reviewStatus: "approved",
      approvedBy: "clinician-1",
      approvedAt: "2026-10-23T12:00:00.000Z",
    })],
  );
  assert.equal(plan.instructions[0].clinicianApproved, true);

  const unverified = projectParentSafetyPlan(
    "child-1",
    [source({ uploadedBy: "clinician" })],
    [instruction({
      reviewStatus: "approved",
      approvedBy: "clinician-1",
      approvedAt: "2026-10-23T12:00:00.000Z",
      sourceExcerptVerified: false,
    })],
  );
  assert.equal(unverified.instructions[0].clinicianApproved, false);
  assert.equal(unverified.instructions[0].sourceReviewRequired, true);
});

test("safety projection excludes another child and stale document versions", () => {
  const plan = projectParentSafetyPlan(
    "child-1",
    [
      source(),
      source({
        id: "other-child-doc",
        childId: "child-2",
      }),
    ],
    [
      instruction(),
      instruction({
        id: "stale-instruction",
        documentVersion: "old-version",
      }),
      instruction({
        id: "other-child-instruction",
        childId: "child-2",
        documentId: "other-child-doc",
      }),
    ],
  );
  assert.deepEqual(plan.documents.map((document) => document.id), ["safety-doc-1"]);
  assert.deepEqual(plan.instructions.map((item) => item.id), ["instruction-1"]);
});

test("a clearly identified safety-plan upload remains visible when extraction has not produced steps", () => {
  const plan = projectParentSafetyPlan("child-1", [source({ extractionStatus: "not_started" })], []);
  assert.equal(plan.hasSafetyPlan, true);
  assert.equal(plan.documents[0].hasInstructions, false);
  assert.deepEqual(plan.instructions, []);
});

test("source safety instructions are included even when the document was not named as a safety plan", () => {
  const plan = projectParentSafetyPlan(
    "child-1",
    [source({ documentType: "other_clinical_document", title: "Session note", fileName: "note.pdf" })],
    [instruction()],
  );
  assert.equal(plan.hasSafetyPlan, true);
  assert.equal(plan.documents[0].title, "Session note");
  assert.equal(plan.instructions.length, 1);
});

test("legacy clinician profile safety notes require current visible source documents and stay unapproved", () => {
  const linkedDocument = source({
    id: "clinical-plan-1",
    documentType: "other_clinical_document",
    title: "Clinical plan",
    fileName: "clinical-plan.pdf",
    uploadedBy: "clinician",
  });
  const legacyProfile: ParentSafetyPlanLegacyProfile = {
    id: "profile-1",
    sourceDocumentIds: ["clinical-plan-1"],
    safetyProcedures: ["Use the existing caregiver contact sequence."],
    createdAt: "2026-10-22T12:00:00.000Z",
  };
  const plan = projectParentSafetyPlan("child-1", [linkedDocument], [], legacyProfile);
  assert.equal(plan.hasSafetyPlan, true);
  assert.equal(plan.documents[0].hasInstructions, true);
  assert.equal(plan.instructions[0].contentKind, "profile_extraction");
  assert.equal(plan.instructions[0].profileNote, "Use the existing caregiver contact sequence.");
  assert.equal(plan.instructions[0].sourceExcerpt, null);
  assert.equal(plan.instructions[0].sourceReviewRequired, true);
  assert.equal(plan.instructions[0].clinicianApproved, false);

  const unavailableSource = projectParentSafetyPlan("child-1", [], [], legacyProfile);
  assert.equal(unavailableSource.hasSafetyPlan, false);
  assert.deepEqual(unavailableSource.instructions, []);

  const unscannedSource = projectParentSafetyPlan(
    "child-1",
    [source({ id: "clinical-plan-1", scanStatus: "pending" })],
    [],
    legacyProfile,
  );
  assert.equal(unscannedSource.hasSafetyPlan, true);
  assert.deepEqual(unscannedSource.instructions, []);
});
