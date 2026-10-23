import test from "node:test";
import assert from "node:assert/strict";
import {
  documentClassificationForRun,
  documentExtractionsToolProperty,
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

function typedSource(documentId: string, documentType: string, searchableText: string) {
  return { ...source, documentId, documentType, searchableText };
}

function purposeRecord(documentId: string, documentType: string, excerpt: string) {
  return {
    category: "document_metadata",
    source_document_id: documentId,
    source_section: "Document heading",
    source_page: 1,
    source_excerpt: excerpt,
    ambiguous: false,
    ambiguity_reason: "",
    interpretation: { document_type: documentType },
  };
}

function statusFor(result: ReturnType<typeof normalizeDocumentExtractions>, documentId: string) {
  return extractionStatusForDocument({
    records: result.records.filter((record) => record.documentId === documentId),
    rawCount: result.rawCountByDocument[documentId] || 0,
    rejectedCount: result.rejectedCountByDocument[documentId] || 0,
    hasRecordsArray: result.hasRecordsArray,
  });
}

test("intake facts process successfully without a behavior target", () => {
  const intakeSource = typedSource(
    "intake-source",
    "intake_assessment",
    "Intake Assessment dated August 2026. The child enjoys drawing and uses picture cards to ask for breaks.",
  );
  const result = normalizeDocumentExtractions([
    purposeRecord("intake-source", "intake_assessment", "Intake Assessment dated August 2026."),
    {
      category: "profile_information",
      source_document_id: "intake-source",
      source_section: "Strengths",
      source_page: 1,
      source_excerpt: "The child enjoys drawing",
      ambiguous: false,
      ambiguity_reason: "",
      interpretation: { field: "strengths", value: "Enjoys drawing." },
    },
  ], [intakeSource]);

  assert.equal(statusFor(result, "intake-source"), "completed");
  assert.equal(result.records.some((record) => record.category === "behavior"), false);
  assert.equal(
    documentClassificationForRun({
      documentType: "intake_assessment",
      scanStatus: "completed",
      records: result.records,
    }).status,
    "verified",
  );
});

test("descriptive intake concerns become source-linked candidates without creating formal targets", () => {
  const searchableText = [
    "Intake Assessment.",
    "The intake describes difficulty following instructions when several steps are spoken at once.",
    "During independent assignments, the student became visibly frustrated and asked to stop.",
  ].join(" ");
  const intakeSource = typedSource("descriptive-intake", "intake_assessment", searchableText);
  const result = normalizeDocumentExtractions([
    purposeRecord("descriptive-intake", "intake_assessment", "Intake Assessment."),
    {
      category: "support_concern",
      source_document_id: "descriptive-intake",
      source_section: "Communication",
      source_page: 1,
      source_excerpt: "The intake describes difficulty following instructions when several steps are spoken at once.",
      ambiguous: false,
      ambiguity_reason: "",
      interpretation: {
        name: "Difficulty following multi-step spoken instructions",
        description: "The intake describes difficulty following instructions when several steps are spoken at once.",
        observations: ["Difficulty following spoken instructions with several steps."],
        contexts: ["When several instruction steps are spoken at once."],
        evidence_level: "documented_concern",
        uncertainty: "The source does not explain why this is difficult.",
      },
    },
    {
      category: "support_concern",
      source_document_id: "descriptive-intake",
      source_section: "Assignments",
      source_page: 1,
      source_excerpt: "During independent assignments, the student became visibly frustrated and asked to stop.",
      ambiguous: false,
      ambiguity_reason: "",
      interpretation: {
        name: "Frustration during independent assignments",
        description: "The student became visibly frustrated and asked to stop during independent assignments.",
        observations: ["Became visibly frustrated and asked to stop."],
        contexts: ["During independent assignments."],
        evidence_level: "possible_support_area",
        uncertainty: "The source describes an episode but does not establish its cause or frequency.",
      },
    },
  ], [intakeSource]);

  const concerns = result.records.filter((record) => record.category === "support_concern");
  assert.equal(statusFor(result, "descriptive-intake"), "completed");
  assert.equal(concerns.length, 2);
  assert.ok(concerns.every((record) =>
    record.documentId === "descriptive-intake" &&
    record.documentVersion === intakeSource.documentVersion &&
    record.sourceExcerptVerified &&
    record.reviewStatus === "unreviewed",
  ));
  assert.deepEqual(concerns.map((record) => record.interpretation.evidence_level), [
    "documented_concern",
    "possible_support_area",
  ]);
  assert.equal(result.records.some((record) => record.category === "behavior" || record.category === "goal"), false);
});

test("session note observations are retained without becoming new goals or behavior targets", () => {
  const sessionSource = typedSource(
    "session-source",
    "session_note",
    "Session Note dated August 18. During the session, Sam used the break card to request a pause. When presented with several spoken steps, Sam became frustrated and asked to pause. Follow-up: practice the existing card routine.",
  );
  const result = normalizeDocumentExtractions([
    purposeRecord("session-source", "session_note", "Session Note dated August 18."),
    {
      category: "clinical_observation",
      source_document_id: "session-source",
      source_section: "Session response",
      source_page: 1,
      source_excerpt: "During the session, Sam used the break card to request a pause.",
      ambiguous: false,
      ambiguity_reason: "",
      interpretation: {
        observation: "Sam used the break card to request a pause.",
        goals_addressed: ["Request a pause using the existing card."],
        activities_performed: ["Practice the existing card routine."],
      },
    },
    {
      category: "support_concern",
      source_document_id: "session-source",
      source_section: "Response to instructions",
      source_page: 1,
      source_excerpt: "When presented with several spoken steps, Sam became frustrated and asked to pause.",
      ambiguous: false,
      ambiguity_reason: "",
      interpretation: {
        name: "Frustration when several spoken steps are presented",
        description: "Sam became frustrated and asked to pause when presented with several spoken steps.",
        observations: ["Became frustrated and asked to pause."],
        contexts: ["When presented with several spoken steps."],
        evidence_level: "possible_support_area",
        uncertainty: "The note does not establish a reason for this response.",
      },
    },
  ], [sessionSource]);

  assert.equal(statusFor(result, "session-source"), "completed");
  assert.equal(result.records.some((record) => record.category === "clinical_observation"), true);
  assert.equal(result.records.some((record) => record.category === "support_concern"), true);
  assert.equal(result.records.some((record) => record.category === "goal" || record.category === "behavior"), false);
});

test("support-concern extraction schema distinguishes candidates from formal behavior targets", () => {
  const schema = documentExtractionsToolProperty();
  const categories = schema.items.properties.category.enum;
  const interpretation = schema.items.properties.interpretation.properties;

  assert.ok(categories.includes("support_concern"));
  assert.deepEqual(interpretation.evidence_level.enum, ["documented_concern", "possible_support_area"]);
  assert.match(interpretation.name.description, /do not imply a confirmed target/i);
  assert.match(interpretation.evidence_level.description, /Neither is a diagnosis, function, intent/i);
});

test("support-concern candidates with unsupported certainty labels are rejected", () => {
  const concernSource = typedSource(
    "uncertain-concern",
    "intake_assessment",
    "The intake describes difficulty following spoken instructions.",
  );
  const result = normalizeDocumentExtractions([{
    category: "support_concern",
    source_document_id: "uncertain-concern",
    source_section: "Communication",
    source_page: 1,
    source_excerpt: "difficulty following spoken instructions",
    ambiguous: false,
    ambiguity_reason: "",
    interpretation: {
      name: "Task refusal",
      description: "The child refuses to comply.",
      observations: ["Difficulty following spoken instructions."],
      evidence_level: "confirmed_behavior",
    },
  }], [concernSource]);

  assert.equal(result.records.some((record) => record.category === "support_concern"), false);
  assert.equal(result.rejectedCountByDocument["uncertain-concern"], 1);
});

test("explicit treatment-plan goals and behavior-plan strategies remain separately extractable", () => {
  const treatmentSource = typedSource(
    "treatment-source",
    "treatment_plan",
    "Treatment Plan: Goal: Independently request a break using a card.",
  );
  const bipSource = typedSource(
    "bip-source",
    "behavior_intervention_plan",
    "Behavior Intervention Plan. Strategy: Offer the familiar break card before homework begins.",
  );
  const result = normalizeDocumentExtractions([
    purposeRecord("treatment-source", "treatment_plan", "Treatment Plan: Goal:"),
    {
      category: "goal",
      source_document_id: "treatment-source",
      source_section: "Goals",
      source_page: 1,
      source_excerpt: "Independently request a break using a card.",
      ambiguous: false,
      ambiguity_reason: "",
      interpretation: { title: "Independently request a break using a card." },
    },
    purposeRecord("bip-source", "behavior_intervention_plan", "Behavior Intervention Plan."),
    {
      category: "support_strategy",
      source_document_id: "bip-source",
      source_section: "Strategies",
      source_page: 1,
      source_excerpt: "Offer the familiar break card before homework begins.",
      ambiguous: false,
      ambiguity_reason: "",
      interpretation: { strategy: "Offer the familiar break card before homework begins." },
    },
  ], [treatmentSource, bipSource]);

  assert.equal(statusFor(result, "treatment-source"), "completed");
  assert.equal(statusFor(result, "bip-source"), "completed");
  assert.equal(result.records.find((record) => record.documentId === "treatment-source" && record.category === "goal")?.interpretation.title,
    "Independently request a break using a card.");
  assert.equal(result.records.find((record) => record.documentId === "bip-source" && record.category === "support_strategy")?.interpretation.strategy,
    "Offer the familiar break card before homework begins.");
});

test("a document purpose without verifiable content evidence is flagged for classification review", () => {
  const unverifiedSource = typedSource("unverified-source", "session_note", "");
  const result = normalizeDocumentExtractions([
    purposeRecord("unverified-source", "session_note", "Session Note from the file name."),
  ], [unverifiedSource]);
  const classification = documentClassificationForRun({
    documentType: "session_note",
    scanStatus: "no_relevant_content",
    records: result.records,
  });

  assert.equal(classification.documentType, "session_note");
  assert.equal(classification.status, "needs_review");
  assert.equal(statusFor(result, "unverified-source"), "no_relevant_content");
});
