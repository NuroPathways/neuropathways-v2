import test from "node:test";
import assert from "node:assert/strict";
import {
  documentClinicalReviewStatus,
  documentExtractionStatus,
  documentProcessingStatus,
} from "./documentStatuses";

test("document reading status does not depend on an informational or safety note", () => {
  assert.equal(documentProcessingStatus("done"), "processed");
  assert.equal(documentProcessingStatus("processing"), "processing");
  assert.equal(documentProcessingStatus("error"), "failed");
  assert.equal(documentProcessingStatus("pending"), "uploaded");
});

test("extraction status is independent from successful document processing", () => {
  assert.equal(documentExtractionStatus("partial"), "partial");
  assert.equal(documentExtractionStatus("completed"), "completed");
  assert.equal(documentExtractionStatus("no_relevant_content"), "no_relevant_content");
  assert.equal(documentExtractionStatus(null), "not_started");
  assert.equal(documentExtractionStatus("completed", false), "not_started");
});

test("partial extraction and item-level review flags require clinical review", () => {
  assert.equal(documentClinicalReviewStatus({ scanStatus: "partial", records: [] }, false), "needs_review");
  assert.equal(documentClinicalReviewStatus(undefined, false, "needs_review"), "needs_review");
  assert.equal(documentClinicalReviewStatus({
    scanStatus: "completed",
    records: [{ reviewStatus: "needs_review", extractionStatus: "extracted" }],
  }, false), "needs_review");
});

test("reviewed and unreviewed clinical content remain distinct from processing", () => {
  assert.equal(documentClinicalReviewStatus({ scanStatus: "completed", records: [] }, true), "reviewed");
  assert.equal(documentClinicalReviewStatus({
    scanStatus: "completed",
    records: [{ reviewStatus: "unreviewed", extractionStatus: "extracted" }],
  }, false), "not_reviewed");
  assert.equal(documentClinicalReviewStatus({
    scanStatus: "completed",
    records: [{ reviewStatus: "unreviewed", extractionStatus: "extracted" }],
  }, true), "not_reviewed");
  assert.equal(documentClinicalReviewStatus({ scanStatus: "completed", records: [] }, false), "no_review_required");
  assert.equal(documentClinicalReviewStatus(undefined, false), "not_assessed");
});

test("a completed no-content classification does not become a clinical review failure", () => {
  assert.equal(documentClinicalReviewStatus({
    scanStatus: "no_relevant_content",
    records: [],
  }, false), "no_review_required");
});

test("document-purpose metadata does not create an unrelated clinical review requirement", () => {
  assert.equal(documentClinicalReviewStatus({
    scanStatus: "no_relevant_content",
    records: [{
      category: "document_metadata",
      reviewStatus: "unreviewed",
      extractionStatus: "extracted",
      sourceExcerptVerified: true,
    }],
  }, false), "no_review_required");
});
