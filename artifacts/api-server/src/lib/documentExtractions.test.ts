import test from "node:test";
import assert from "node:assert/strict";
import {
  extractionStatusForDocument,
  normalizeDocumentExtractions,
} from "./documentExtractions";

const source = {
  childId: "synthetic-child",
  documentId: "synthetic-document",
  documentVersion: "a".repeat(64),
  documentType: "text/plain",
  searchableText: [
    "Uses a picture card to ask for a break.",
    "When asked to switch tasks, walks toward the doorway.",
    "Request a pause before leaving the work area.",
    "Offer the familiar break card before homework begins.",
    "If the child reaches the driveway, call the caregiver.",
    "Before homework, invite the child to choose a reading book.",
  ].join("\n"),
};

const syntheticDocumentRecords = [
  {
    category: "profile_information",
    source_document_id: source.documentId,
    source_section: "Communication",
    source_page: 1,
    source_excerpt: "Uses a picture card to ask for a break.",
    ambiguous: false,
    ambiguity_reason: "",
    interpretation: { field: "communication_preferences", value: "Uses a picture card to ask for a break." },
  },
  {
    category: "behavior",
    source_document_id: source.documentId,
    source_section: "Transitions",
    source_page: 1,
    source_excerpt: "When asked to switch tasks, walks toward the doorway.",
    ambiguous: false,
    ambiguity_reason: "",
    interpretation: { name: "Leaving the work area", observable_description: "Walks toward the doorway when asked to switch tasks." },
  },
  {
    category: "goal",
    source_document_id: source.documentId,
    source_section: "Goals",
    source_page: 2,
    source_excerpt: "Request a pause before leaving the work area.",
    ambiguous: false,
    ambiguity_reason: "",
    interpretation: { title: "Request a pause before leaving", description: "Request a pause before leaving the work area.", skill_domain: "Communication" },
  },
  {
    category: "support_strategy",
    source_document_id: source.documentId,
    source_section: "Strategies",
    source_page: 2,
    source_excerpt: "Offer the familiar break card before homework begins.",
    ambiguous: false,
    ambiguity_reason: "",
    interpretation: { applies_to: "Homework transitions", strategy: "Offer the familiar break card before homework begins." },
  },
  {
    category: "safety_instruction",
    source_document_id: source.documentId,
    source_section: "Safety",
    source_page: 3,
    source_excerpt: "If the child reaches the driveway, call the caregiver.",
    ambiguous: false,
    ambiguity_reason: "",
    interpretation: { applies_to: "Leaving the work area", instruction: "If the child reaches the driveway, call the caregiver." },
  },
  {
    category: "potential_home_activity",
    source_document_id: source.documentId,
    source_section: "Home practice",
    source_page: 3,
    source_excerpt: "Before homework, invite the child to choose a reading book.",
    ambiguous: false,
    ambiguity_reason: "",
    interpretation: {
      title: "Choose a reading book",
      skill: "Make a choice",
      suggested_context: "Before homework",
      start_action: "Invite the child to choose a reading book.",
    },
  },
];

test("one synthetic document yields six distinct, source-linked extraction categories", () => {
  const result = normalizeDocumentExtractions(syntheticDocumentRecords, [source], new Date("2026-10-21T12:00:00Z"));

  assert.equal(result.rawCount, 6);
  assert.equal(result.rejectedCount, 0);
  assert.equal(result.records.length, 6);
  assert.deepEqual(
    result.records.map((record) => record.category).sort(),
    ["behavior", "goal", "potential_home_activity", "profile_information", "safety_instruction", "support_strategy"],
  );
  assert.ok(result.records.every((record) =>
    record.documentId === source.documentId &&
    record.documentVersion === source.documentVersion &&
    record.childId === source.childId &&
    record.sourceExcerptVerified &&
    record.reviewStatus === "unreviewed" &&
    record.approvedBy === null &&
    record.approvedAt === null,
  ));
  assert.equal(result.records.find((record) => record.category === "goal")?.sourcePage, 2);
  assert.equal(
    extractionStatusForDocument({ ...result, forcePartial: false }),
    "completed",
  );
});

test("a source quote that cannot be verified is retained only as a review-required item", () => {
  const result = normalizeDocumentExtractions([{
    ...syntheticDocumentRecords[0],
    source_excerpt: "The document says the child prefers a new treatment.",
  }], [source]);

  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].sourceExcerptVerified, false);
  assert.equal(result.records[0].extractionStatus, "needs_review");
  assert.equal(result.records[0].reviewStatus, "needs_review");
  assert.match(result.records[0].ambiguityReason || "", /could not be verified/i);
});

test("image-derived excerpts without searchable text remain unapproved and require source review", () => {
  const result = normalizeDocumentExtractions(
    [syntheticDocumentRecords[1]],
    [{ ...source, documentType: "image/png", searchableText: "" }],
  );

  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].sourceExcerptVerified, false);
  assert.equal(result.records[0].reviewStatus, "needs_review");
});

test("empty classifications are distinct from malformed or rejected classifications", () => {
  const empty = normalizeDocumentExtractions([], [source]);
  assert.equal(
    extractionStatusForDocument({ ...empty, forcePartial: false }),
    "no_relevant_content",
  );

  const missing = normalizeDocumentExtractions(undefined, [source]);
  assert.equal(
    extractionStatusForDocument({ ...missing, forcePartial: false }),
    "partial",
  );
});

test("repeated identical source citations do not create duplicate extraction records", () => {
  const result = normalizeDocumentExtractions(
    [syntheticDocumentRecords[2], syntheticDocumentRecords[2]],
    [source],
  );
  assert.equal(result.rawCount, 2);
  assert.equal(result.records.length, 1);
});
