import test from "node:test";
import assert from "node:assert/strict";
import { makeStarterCard, starterLibrary, type SupportCard } from "./parentStarterLibrary";
import {
  buildParentDocumentGenerationContent,
  canAccessParentDocument,
  deriveSupportProvenance,
  detectParentDocumentType,
  hasDuplicateParentDocumentHash,
  isSafeParentGuidance,
  orderSupportCardsForSelectedFocus,
  reconcileSupportCards,
} from "./parentDocumentPolicy";

function guidance(source: SupportCard["source"], id: string, instruction: string, reviewed = false): SupportCard {
  return {
    ...makeStarterCard("task_refusal", null, "Complete one small step"),
    id,
    source,
    sourceDocumentIds: source === "starter" ? [] : [id],
    sourceReferences: source === "starter" ? [] : [{ documentId: id, title: `${id} plan`, excerpt: null }],
    rightNow: [instruction],
    reviewedBy: reviewed ? "clinician-1" : null,
    reviewedAt: reviewed ? "2026-09-17T10:00:00.000Z" : null,
  };
}

test("six safe starter templates are complete, parent-readable, and never teach physical intervention", () => {
  assert.equal(starterLibrary.length, 6);
  for (const template of starterLibrary) {
    assert.ok(template.key);
    assert.ok(template.name);
    assert.ok(template.description);
    assert.ok(template.whatMayBeHappening);
    assert.ok(template.rightNow.length >= 3);
    assert.ok(template.avoid.length >= 3);
    assert.ok(template.prevention.length >= 3);
    assert.ok(template.replacementSkill);
    assert.ok(template.reinforcementIdea);
    assert.ok(template.seekHelp);
    assert.ok(template.track.length >= 3);
    assert.ok(template.relatedGoals.length >= 3);
    const allAdvice = [...template.rightNow, ...template.avoid, ...template.prevention].join(" ");
    assert.doesNotMatch(allAdvice, /\b(?:steps?|instructions?)\s+to\s+(?:restrain|hold|pin|seclude|immobilize)\b/i);
  }
});

test("starter cards preserve the exact supported behavior key and selected goal", () => {
  const card = makeStarterCard("elopement", null, "Stay near caregiver");
  assert.equal(card.behaviorKey, "elopement");
  assert.equal(card.goal, "Stay near caregiver");
  assert.equal(card.source, "starter");
  assert.deepEqual(card.sourceDocumentIds, []);
});

test("derived provenance keeps every generation input despite incomplete model citations", () => {
  const provenance = deriveSupportProvenance([
    { documentId: "private-parent-source", source: "parent_document" },
    { documentId: "clinician-source", source: "clinician_document" },
  ], ["clinician-source"]);

  assert.deepEqual(provenance.sourceDocumentIds, ["private-parent-source", "clinician-source"]);
  assert.equal(provenance.source, "clinician_document");

  const omittedClinicalCitation = deriveSupportProvenance([
    { documentId: "private-parent-source", source: "parent_document" },
    { documentId: "clinician-source", source: "clinician_document" },
  ], []);
  assert.deepEqual(omittedClinicalCitation.sourceDocumentIds, ["private-parent-source", "clinician-source"]);
  assert.equal(omittedClinicalCitation.source, "parent_document");
});

test("document B generation prompt excludes existing private card A content", () => {
  const existingPrivateCardA = {
    ...guidance("parent_document", "private-document-a", "Private support from document A."),
    whatMayBeHappening: "PRIVATE_CARD_A_PROMPT_SENTINEL",
  };
  const prompt = buildParentDocumentGenerationContent(
    [{
      id: "document-b",
      title: "Current document B",
      content: { type: "text", text: "Current document B support plan text." },
    }],
    "Task Refusal",
    "Complete one small step",
    ["document-b"],
  );
  const serializedPrompt = JSON.stringify(prompt);

  assert.ok(existingPrivateCardA.sourceDocumentIds.includes("private-document-a"));
  assert.match(serializedPrompt, /Current document B support plan text/);
  assert.match(serializedPrompt, /document-b/);
  assert.doesNotMatch(serializedPrompt, /PRIVATE_CARD_A_PROMPT_SENTINEL|private-document-a|Private support from document A/);
  assert.doesNotMatch(serializedPrompt, /Current support cards|Starter guidance for context/);
});

test("explicitly avoiding physical restraint is safe while teaching a restraint technique is rejected", () => {
  const avoidMention = guidance("parent_document", "plan", "Offer a calm choice.");
  avoidMention.avoid = ["Avoid arguing or physical restraint."];
  assert.equal(isSafeParentGuidance(avoidMention), true);

  const technique = guidance("parent_document", "plan", "Use a physical restraint hold.");
  assert.equal(isSafeParentGuidance(technique), false);
  technique.rightNow = ["How to apply a restraint: hold the child in this position."];
  assert.equal(isSafeParentGuidance(technique), false);
});

test("dedup merges repeated same guidance once, retaining unique document IDs and references", () => {
  const first = guidance("parent_document", "doc-1", "Use one clear first step.");
  const duplicate = guidance("parent_document", "doc-2", "Use one clear first step.");
  const result = reconcileSupportCards([first], [duplicate]);
  assert.equal(result.length, 1);
  assert.deepEqual(new Set(result[0].sourceDocumentIds), new Set(["doc-1", "doc-2"]));
  assert.equal(result[0].sourceReferences.length, 2);
  assert.equal(result[0].conflict, false);
});

test("reviewed > clinician document > parent document > starter and conflicts never replace higher-priority guidance", () => {
  const starter = guidance("starter", "starter", "Use a calm voice.");
  const parent = guidance("parent_document", "parent-plan", "Remove all preferred activities.");
  const clinician = guidance("clinician_document", "clinician-plan", "Offer a small, clear choice.");
  const reviewed = guidance("clinician_reviewed", "shared-plan", "Follow the reviewed first-then routine.", true);

  const starterAndParent = reconcileSupportCards([starter], [parent])[0];
  assert.equal(starterAndParent.source, "parent_document");
  assert.equal(starterAndParent.conflict, true);
  assert.equal(starterAndParent.rightNow[0], "Remove all preferred activities.");

  const parentAndClinician = reconcileSupportCards([parent], [clinician])[0];
  assert.equal(parentAndClinician.source, "clinician_document");
  assert.equal(parentAndClinician.conflict, true);
  assert.equal(parentAndClinician.rightNow[0], "Offer a small, clear choice.");
  assert.deepEqual(parentAndClinician.sourceDocumentIds, ["clinician-plan"]);
  assert.deepEqual(parentAndClinician.sourceReferences.map((reference) => reference.documentId), ["clinician-plan"]);

  const reviewedAndLaterParent = reconcileSupportCards([reviewed], [parent])[0];
  assert.equal(reviewedAndLaterParent.source, "clinician_reviewed");
  assert.equal(reviewedAndLaterParent.rightNow[0], "Follow the reviewed first-then routine.");
  assert.equal(reviewedAndLaterParent.reviewedBy, "clinician-1");
  assert.equal(reviewedAndLaterParent.conflict, true);
  assert.deepEqual(reviewedAndLaterParent.sourceDocumentIds, ["shared-plan"]);
});

test("selected focus is first even when another behavior has a higher-priority source", () => {
  const selectedStarter = makeStarterCard("task_refusal", null, "Start one small step");
  const selectedDocument = {
    ...guidance("parent_document", "task-plan", "Offer one clear choice."),
    behaviorKey: "task_refusal",
    goal: "Old document goal",
  };
  const unrelatedReviewed = {
    ...guidance("clinician_reviewed", "elopement-plan", "Use the reviewed safety phrase.", true),
    behaviorKey: "elopement",
  };
  const result = orderSupportCardsForSelectedFocus(
    [unrelatedReviewed, selectedDocument],
    selectedStarter,
    "Start one small step",
  );

  assert.equal(result[0].behaviorKey, "task_refusal");
  assert.equal(result[0].source, "parent_document");
  assert.equal(result[0].goal, "Start one small step");
  assert.equal(result[1].behaviorKey, "elopement");
  assert.equal(result[1].source, "clinician_reviewed");
});

test("selected custom focus receives a starter fallback when only other behaviors have document cards", () => {
  const selectedStarter = makeStarterCard(null, "Throws toys at dinner", "Keep dinner items on the table");
  const otherBehavior = {
    ...guidance("parent_document", "other-plan", "Offer one calm choice."),
    behaviorKey: "task_refusal",
  };
  const previousCustomBehavior = {
    ...guidance("clinician_reviewed", "old-custom-plan", "Use the previously reviewed support.", true),
    behaviorKey: "custom",
    behaviorName: "Old custom behavior",
  };
  const result = orderSupportCardsForSelectedFocus(
    [otherBehavior, previousCustomBehavior],
    selectedStarter,
    "Keep dinner items on the table",
  );

  assert.equal(result[0].behaviorKey, "custom");
  assert.equal(result[0].behaviorName, "Throws toys at dinner");
  assert.equal(result[0].source, "starter");
  assert.equal(result[0].goal, "Keep dinner items on the table");
  assert.equal(result[1].behaviorName, "Old custom behavior");
  assert.equal(result[1].source, "clinician_reviewed");
  assert.equal(result[2].behaviorKey, "task_refusal");
});

test("reconciliation keeps distinct custom behaviors separate and focus selects the matching plan", () => {
  const selectedStarter = makeStarterCard(null, "Throws toys at dinner", "Keep dinner items on the table");
  const previouslyReviewedCustom = {
    ...guidance("clinician_reviewed", "old-custom-plan", "Use the previously reviewed support.", true),
    behaviorKey: "custom",
    behaviorName: "Clothing discomfort",
  };
  const selectedCustomDocument = {
    ...guidance("parent_document", "selected-custom-plan", "Offer one calm dinner choice."),
    behaviorKey: "custom",
    behaviorName: "THROWS toys at dinner!",
    goal: "Old goal from the selected document",
  };

  const reconciled = reconcileSupportCards([previouslyReviewedCustom], [selectedCustomDocument]);
  assert.equal(reconciled.length, 2);
  assert.ok(reconciled.some((card) => card.id === previouslyReviewedCustom.id));
  assert.ok(reconciled.some((card) => card.id === selectedCustomDocument.id));

  const projected = orderSupportCardsForSelectedFocus(
    reconciled,
    selectedStarter,
    "Keep dinner items on the table",
  );
  assert.equal(projected[0].id, selectedCustomDocument.id);
  assert.equal(projected[0].source, "parent_document");
  assert.equal(projected[0].goal, "Keep dinner items on the table");
  assert.equal(projected[1].id, previouslyReviewedCustom.id);
  assert.equal(projected[1].source, "clinician_reviewed");
});

test("goal edits overlay selected document cards without resetting from stored document goals", () => {
  const selectedStarter = makeStarterCard("task_refusal", null, "Current manually edited goal");
  const selectedDocument = {
    ...guidance("parent_document", "task-plan", "Offer one clear choice."),
    behaviorKey: "task_refusal",
    goal: "Stale goal from the source document",
  };
  const firstRead = orderSupportCardsForSelectedFocus(
    [selectedDocument],
    selectedStarter,
    "Current manually edited goal",
  );
  const secondRead = orderSupportCardsForSelectedFocus(
    [selectedDocument],
    selectedStarter,
    "Current manually edited goal",
  );

  assert.equal(firstRead[0].goal, "Current manually edited goal");
  assert.equal(secondRead[0].goal, "Current manually edited goal");
  assert.equal(selectedDocument.goal, "Stale goal from the source document");
  assert.equal(firstRead[0].conflict, false);
});

test("reviewed instructions stay unchanged when the current goal changes and disclose the review mismatch", () => {
  const selectedStarter = makeStarterCard("task_refusal", null, "New parent-selected goal");
  const reviewed = {
    ...guidance("clinician_reviewed", "reviewed-plan", "Keep the reviewed first-then routine.", true),
    behaviorKey: "task_refusal",
    goal: "Original reviewed goal",
  };
  const result = orderSupportCardsForSelectedFocus(
    [reviewed],
    selectedStarter,
    "New parent-selected goal",
  );

  assert.equal(result[0].source, "clinician_reviewed");
  assert.deepEqual(result[0].rightNow, reviewed.rightNow);
  assert.equal(result[0].goal, "New parent-selected goal");
  assert.equal(result[0].conflict, true);
  assert.match(result[0].conflictMessage || "", /current goal has not been reviewed/i);
  assert.match(result[0].conflictMessage || "", /support steps were reviewed for a different goal/i);
});

test("recognized file types require matching extension, MIME, signatures, UTF-8, and size limit", () => {
  assert.deepEqual(
    detectParentDocumentType("care.pdf", "application/pdf", Buffer.from("%PDF-1.7")),
    { extension: ".pdf", mimeType: "application/pdf" },
  );
  assert.equal(detectParentDocumentType("care.pdf", "text/plain", Buffer.from("%PDF-1.7")), null);
  assert.equal(detectParentDocumentType("care.pdf", "", Buffer.from("%PDF-1.7")), null);
  assert.equal(detectParentDocumentType("care.pdf", "application/pdf", Buffer.from("not a pdf")), null);
  assert.equal(detectParentDocumentType("care.jpg", "image/jpeg", Buffer.from([0x89, 0x50, 0x4e, 0x47])), null);
  assert.equal(detectParentDocumentType("care.txt", "text/plain", Buffer.from([0xc3, 0x28])), null);
  assert.equal(detectParentDocumentType("care.txt", "text/plain", Buffer.from([0x61, 0x00, 0x62])), null);
  assert.equal(detectParentDocumentType("care.exe", "application/pdf", Buffer.from("%PDF-1.7")), null);

  const oleDoc = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]);
  assert.equal(detectParentDocumentType("plan.doc", "application/msword", oleDoc)?.extension, ".doc");
  const docx = Buffer.from("PK\u0003\u0004[Content_Types].xml word/document.xml");
  assert.equal(
    detectParentDocumentType("plan.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", docx)?.extension,
    ".docx",
  );
  assert.equal(detectParentDocumentType("too-large.txt", "text/plain", Buffer.alloc(20 * 1024 * 1024 + 1, 0x61)), null);
});

test("same-parent same-child hashes are deduplicated without treating another child as a duplicate", () => {
  assert.equal(hasDuplicateParentDocumentHash(["abc123", "def456"], "abc123"), true);
  assert.equal(hasDuplicateParentDocumentHash(["abc123"], "other-child:abc123"), false);
});

const privateDoc = {
  parentId: "parent-a",
  workspaceId: "workspace-a",
  childParentId: "parent-a",
  childWorkspaceId: "workspace-a",
  childClinicianId: "clinician-new",
  sharedClinicianId: null,
  documentTenantId: "workspace-a",
};

test("private document is denied to clinician and legacy invited child membership alone", () => {
  assert.equal(canAccessParentDocument({ ...privateDoc, actorClinicianId: "clinician-new" }), false);
  assert.equal(canAccessParentDocument({ ...privateDoc, authorizedLegacyChildSession: true }), false);
  assert.equal(canAccessParentDocument({ ...privateDoc, authorizedMobileChildSession: true }), false);
});

test("only explicit current-clinician sharing grants clinician and invited-child document reads", () => {
  const shared = {
    ...privateDoc,
    sharedClinicianId: "clinician-new",
    documentTenantId: "clinician-new",
  };
  assert.equal(canAccessParentDocument({ ...shared, actorClinicianId: "clinician-new" }), true);
  assert.equal(canAccessParentDocument({ ...shared, authorizedLegacyChildSession: true }), true);
  assert.equal(canAccessParentDocument({ ...shared, authorizedMobileChildSession: true }), true);
  assert.equal(
    canAccessParentDocument({
      ...shared,
      documentTenantId: "workspace-a",
      authorizedMobileChildSession: true,
    }),
    false,
  );
  assert.equal(canAccessParentDocument({ ...shared, actorClinicianId: "clinician-old" }), false);
  assert.equal(
    canAccessParentDocument({
      ...shared,
      childClinicianId: "clinician-reassigned",
      actorClinicianId: "clinician-new",
    }),
    false,
  );
});

test("owner access stays scoped to the matching parent-child relationship", () => {
  assert.equal(canAccessParentDocument({ ...privateDoc, actorParentId: "parent-a" }), true);
  assert.equal(canAccessParentDocument({ ...privateDoc, actorParentId: "parent-b" }), false);
  assert.equal(canAccessParentDocument({ ...privateDoc, childParentId: "parent-b", actorParentId: "parent-a" }), false);
});