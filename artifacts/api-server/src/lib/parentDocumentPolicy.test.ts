import test from "node:test";
import assert from "node:assert/strict";
import { makeStarterCard, starterLibrary, type SupportCard } from "./parentStarterLibrary";
import {
  buildParentDocumentGenerationContent,
  buildParentDocumentDiscoveryContent,
  canAccessParentDocument,
  deriveSupportProvenance,
  detectParentDocumentType,
  discoveredTargetsForScan,
  documentSupportCardId,
  filterPlanGoalForVisibleSources,
  hasDuplicateParentDocumentHash,
  isSafeParentGuidance,
  normalizeDiscoveredParentTargets,
  normalizeParentPlanActivities,
  orderSupportCardsForSelectedFocus,
  partitionParentGuidanceBySafety,
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

test("document generation asks for brief, one-action caregiver steps without dropping safety instructions", () => {
  const prompt = buildParentDocumentGenerationContent(
    [{
      id: "brief-plan",
      title: "Brief plan",
      content: { type: "text", text: "Use the child's established support plan." },
    }],
    "Task Refusal",
    null,
    ["brief-plan"],
  );
  const serializedPrompt = JSON.stringify(prompt);

  assert.match(serializedPrompt, /everyday words, short direct sentences, and one clear action per list item/);
  assert.match(serializedPrompt, /one or two short lines per item/);
  assert.match(serializedPrompt, /no more than four items/);
  assert.match(serializedPrompt, /Do not drop a safety condition or escalation instruction/);
  assert.match(serializedPrompt, /Create daily_activities only when a source gives enough detail/);
  assert.match(serializedPrompt, /never fill gaps with a typical routine, assumed prompt, invented reinforcement/);
});

test("daily plan activities require a routine, caregiver opportunity, skill, evidence, and an allowed source", () => {
  const activities = normalizeParentPlanActivities([
    {
      title: "Practice requesting a break",
      routine_context: "During homework at the kitchen table",
      opportunity: "Before a short assignment, offer the familiar break card and wait",
      skill: "Requests a break using the card",
      reinforcement: "Provide the planned break after the request",
      source_document_id: "plan-1",
      source_excerpt: "During homework, practice requesting a break with the break card.",
    },
    {
      title: "Assumed bedtime activity",
      routine_context: "At bedtime",
      opportunity: "Offer a visual schedule",
      skill: "Follows a bedtime routine",
      reinforcement: "",
      source_document_id: "plan-1",
      source_excerpt: "An unrelated source excerpt.",
    },
    {
      title: "Unsupported activity",
      routine_context: "During dinner",
      opportunity: "Offer a prompt",
      skill: "Uses a communication card",
      reinforcement: "",
      source_document_id: "not-allowed",
      source_excerpt: "An unapproved document.",
    },
    {
      title: "Unsafe activity",
      routine_context: "During homework",
      opportunity: "Hold the child still",
      skill: "Requests a break",
      reinforcement: "",
      source_document_id: "plan-1",
      source_excerpt: "An unsafe procedure.",
    },
  ], ["plan-1"], () => "parent_uploaded_plan", new Map([
    ["plan-1", "During homework, practice requesting a break with the break card."],
  ]));

  assert.equal(activities.length, 1);
  assert.equal(activities[0].sourceType, "parent_uploaded_plan");
  assert.equal(activities[0].sourceDocumentId, "plan-1");
  assert.equal(activities[0].routineContext, "During homework at the kitchen table");
});

test("discovery prompt uses only fetched documents and never receives prior document-derived cards", () => {
  const priorCardSentinel = guidance("parent_document", "prior-private-plan", "PRIOR_CARD_PRIVATE_SENTINEL");
  const prompt = buildParentDocumentDiscoveryContent(
    [{
      id: "current-plan",
      title: "Current plan",
      content: { type: "text", text: "Target behavior: bedtime routine stalling. Goal: Start after one reminder." },
    }],
    ["current-plan"],
  );
  const serialized = JSON.stringify(prompt);
  assert.ok(priorCardSentinel.sourceDocumentIds.includes("prior-private-plan"));
  assert.match(serialized, /bedtime routine stalling/);
  assert.match(serialized, /current-plan/);
  assert.doesNotMatch(serialized, /PRIOR_CARD_PRIVATE_SENTINEL|prior-private-plan/);
  assert.match(serialized, /negated targets/);
  assert.match(serialized, /explicitly assigns a concrete goal/);
  assert.match(serialized, /Preserve the exact source wording.*do not paraphrase/i);
  assert.doesNotMatch(serialized, /excluding behaviors already selected/);
});

test("discovery accepts only supported starter keys or named custom targets, canonicalizes, and deduplicates", () => {
  const targets = normalizeDiscoveredParentTargets([
    { behavior_key: "TASK REFUSAL", behavior_name: "ignored model label", goal: "Start one step" },
    { behavior_key: "task_refusal", behavior_name: "Task refusal", goal: "Start one step" },
    { behavior_key: "custom", behavior_name: "Morning clothing discomfort", goal: "Choose one item" },
    { behavior_key: "custom", behavior_name: "MORNING_CLOTHING   DISCOMFORT", goal: "Different wording" },
    { behavior_key: "unsupported_key", behavior_name: "Made up category", goal: "Invented" },
    { behavior_key: "custom", behavior_name: "  ", goal: "Missing behavior" },
    { behavior_key: "elopement", behavior_name: "Whatever", goal: "x".repeat(1200) },
  ]);
  assert.deepEqual(targets.map(({ behaviorKey, behaviorName }) => [behaviorKey, behaviorName]), [
    ["task_refusal", "Task Refusal"],
    ["custom", "Morning clothing discomfort"],
    ["elopement", "Elopement / Running Away"],
  ]);
  assert.equal(targets[1].goal, "Choose one item");
  assert.equal(targets[2].goal, null, "overlong source goals are omitted rather than returned as inexact truncated wording");
  assert.equal(normalizeDiscoveredParentTargets(
    Array.from({ length: 24 }, (_, i) => ({
      behavior_key: "custom",
      behavior_name: `New target ${i}`,
      goal: "",
    })),
  ).length, 20);
});

test("document card IDs preserve distinct custom-name distinctions without collapsing identity", () => {
  const bedtime = documentSupportCardId("doc", "custom", "Bed time");
  const hyphenated = documentSupportCardId("doc", "custom", "Bed-time");
  assert.notEqual(bedtime, hyphenated);
  assert.equal(
    documentSupportCardId("doc", "custom", " BED   TIME "),
    bedtime,
    "case and whitespace canonicalization remains stable",
  );
});

test("discovery adds only new targets that fit the combined 20-behavior scan limit", () => {
  const selected = Array.from({ length: 19 }, (_, index) => ({
    behaviorKey: "custom",
    behaviorName: `Selected ${index}`,
  }));
  const discovered = [
    { behaviorKey: "custom", behaviorName: "Selected 0", goal: "duplicate" },
    { behaviorKey: "custom", behaviorName: "New target", goal: "explicit goal" },
    { behaviorKey: "elopement", behaviorName: "Elopement / Running Away", goal: "second new target" },
  ];
  assert.deepEqual(discoveredTargetsForScan(selected, discovered).map((target) => target.behaviorName), ["New target"]);
  assert.deepEqual(discoveredTargetsForScan([...selected, { behaviorKey: "custom", behaviorName: "Selected 19" }], discovered), []);
});

test("explicitly avoiding physical restraint is safe while teaching a restraint technique is rejected", () => {
  const fieldAwareAvoidance = guidance("parent_document", "field-aware-plan", "Use a calm voice.");
  fieldAwareAvoidance.avoid = ["Physical restraint", "Holding the child"];
  fieldAwareAvoidance.prevention = ["Show a checklist"];
  assert.equal(isSafeParentGuidance(fieldAwareAvoidance), true);

  const directAction = guidance("parent_document", "right-now-action", "Hold the child.");
  assert.equal(isSafeParentGuidance(directAction), false);

  const harmlessProhibitions = [
    "Avoid arguing or physical restraint.",
    "Never restrain your child.",
    "Do not physically block the child.",
    "Never seclude them.",
    "Do not use restraint.",
    "Avoid holding the child.",
    "Don't pin the child.",
    "Do not wrap or immobilize the child.",
  ];
  for (const instruction of harmlessProhibitions) {
    const card = guidance("parent_document", "plan", "Offer a calm choice.");
    card.avoid = [instruction];
    assert.equal(isSafeParentGuidance(card), true, `direct prohibition should be safe: ${instruction}`);
  }

  const unsafeInstructions = [
    "Use a physical restraint hold.",
    "Restrain your child.",
    "Physically block the child.",
    "Seclude them.",
    "Hold the child.",
    "Pin the child.",
    "How to apply a restraint: hold the child in this position.",
  ];
  for (const instruction of unsafeInstructions) {
    const card = guidance("parent_document", "plan", instruction);
    assert.equal(isSafeParentGuidance(card), false, `positive physical-intervention instruction should be rejected: ${instruction}`);
  }

  for (const boundary of [".", "!", "?", ";", "\n"]) {
    const contrast = guidance("parent_document", "plan", "Offer a calm choice.");
    contrast.avoid = [`Do not use restraint${boundary} Instead hold the child.`];
    assert.equal(
      isSafeParentGuidance(contrast),
      false,
      `a prohibition must not mask a later positive instruction across ${JSON.stringify(boundary)}`,
    );
  }
});

test("unsafe generated guidance is omitted without discarding safe guidance from the same plan", () => {
  const safe = guidance("parent_document", "safe-plan", "Offer a calm choice.");
  const unsafe = guidance("parent_document", "unsafe-plan", "Hold the child.");
  const result = partitionParentGuidanceBySafety([safe, unsafe]);

  assert.deepEqual(result.safeCards.map((card) => card.id), ["safe-plan"]);
  assert.equal(result.omittedUnsafeCount, 1);
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

test("an explicitly empty saved goal stays empty while unselected document candidate goals remain intact", () => {
  const selectedStarter = makeStarterCard("task_refusal", null, null);
  const selectedDocument = {
    ...guidance("parent_document", "selected-plan", "Offer one clear choice."),
    behaviorKey: "task_refusal",
    goal: "Private document goal that must not become the saved goal",
    planGoal: "Explicit source plan goal",
    planGoalSourceDocumentIds: ["selected-plan"],
    planGoalSourceReferences: [{ documentId: "selected-plan", title: "Selected plan", excerpt: null }],
  };
  const unselectedCandidate = {
    ...guidance("parent_document", "candidate-plan", "Use a short written answer."),
    behaviorKey: "custom",
    behaviorName: "Repetitive questioning",
    goal: "Ask once, then use the answer card",
    planGoal: "Ask a question once, then use the written answer card",
    planGoalSourceDocumentIds: ["candidate-plan"],
    planGoalSourceReferences: [{ documentId: "candidate-plan", title: "Candidate plan", excerpt: null }],
  };

  const projected = orderSupportCardsForSelectedFocus(
    [selectedDocument, unselectedCandidate],
    selectedStarter,
    null,
  );
  assert.equal(projected[0].goal, null, "the selected behavior must reflect its empty saved goal, not a scanned goal");
  assert.equal(projected[0].planGoal, "Explicit source plan goal");
  assert.equal(projected[1].goal, "Ask once, then use the answer card", "unselected candidate compatibility is preserved");
  assert.equal(projected[1].planGoal, unselectedCandidate.planGoal);
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

test("explicit plan goals reconcile independently of manual goals and preserve reviewed guidance", () => {
  const reviewed = {
    ...guidance("clinician_reviewed", "clinical-plan", "Follow the approved first-then routine.", true),
    goal: "Clinician-approved goal",
    relatedGoals: ["Clinician-approved related goal"],
  };
  const scanned = {
    ...guidance("parent_document", "private-plan", "Use a different worksheet routine."),
    goal: "Parent-saved manual goal",
    relatedGoals: ["PRIVATE_RELATED_GOAL_MARKER"],
    conflict: true,
    conflictMessage: "PRIVATE_CONFLICT_MESSAGE_MARKER",
    planGoal: "Start the worksheet within two minutes after one reminder.",
    planGoalSourceDocumentIds: ["private-plan"],
    planGoalSourceReferences: [{ documentId: "private-plan", title: "Private plan", excerpt: null }],
  };

  const reconciled = reconcileSupportCards([reviewed], [scanned])[0];
  assert.equal(reconciled.source, "clinician_reviewed");
  assert.equal(reconciled.rightNow[0], reviewed.rightNow[0]);
  assert.equal(reconciled.goal, "Clinician-approved goal");
  assert.equal(reconciled.planGoal, scanned.planGoal);
  assert.deepEqual(reconciled.planGoalSourceDocumentIds, ["private-plan"]);
  assert.equal(reconciled.conflict, true);
  assert.deepEqual(reconciled.relatedGoals, ["Clinician-approved related goal"]);
  assert.equal(reconciled.conflictMessage, "Conflict detected. Clinician review recommended.");

  const rescanned = {
    ...scanned,
    planGoal: "Start the worksheet after one reminder.",
  };
  const updated = reconcileSupportCards([reconciled], [rescanned])[0];
  assert.equal(updated.source, "clinician_reviewed");
  assert.equal(updated.goal, "Clinician-approved goal");
  assert.equal(updated.planGoal, "Start the worksheet after one reminder.");
  assert.deepEqual(updated.relatedGoals, ["Clinician-approved related goal"]);
  assert.doesNotMatch(updated.conflictMessage || "", /PRIVATE_CONFLICT_MESSAGE_MARKER/);

  const clinicianProjection = filterPlanGoalForVisibleSources(updated, ["clinical-plan"]);
  const serializedProjection = JSON.stringify(clinicianProjection);
  assert.equal(clinicianProjection.planGoal, null);
  assert.equal(clinicianProjection.source, "clinician_reviewed");
  assert.equal(clinicianProjection.reviewedBy, "clinician-1");
  assert.match(clinicianProjection.rightNow[0], /approved first-then routine/);
  assert.doesNotMatch(serializedProjection, /PRIVATE_RELATED_GOAL_MARKER|PRIVATE_CONFLICT_MESSAGE_MARKER|Start the worksheet after one reminder/);
});

test("clinician plan-goal projection requires consent for every contributing document", () => {
  const card = {
    ...guidance("clinician_reviewed", "clinical-plan", "Use the approved support.", true),
    goal: "Clinician-approved goal",
    planGoal: "Private explicit parent-plan goal",
    planGoalSourceDocumentIds: ["private-parent-plan", "clinical-plan"],
    planGoalSourceReferences: [
      { documentId: "private-parent-plan", title: "Parent plan", excerpt: null },
      { documentId: "clinical-plan", title: "Clinical plan", excerpt: null },
    ],
  };

  const beforeSharing = filterPlanGoalForVisibleSources(card, ["clinical-plan"]);
  assert.equal(beforeSharing.planGoal, null);
  assert.deepEqual(beforeSharing.planGoalSourceDocumentIds, []);
  assert.deepEqual(beforeSharing.planGoalSourceReferences, []);
  assert.equal(beforeSharing.goal, "Clinician-approved goal");
  assert.equal(beforeSharing.source, "clinician_reviewed");

  const afterSharing = filterPlanGoalForVisibleSources(card, ["private-parent-plan", "clinical-plan"]);
  assert.equal(afterSharing.planGoal, "Private explicit parent-plan goal");
  assert.deepEqual(afterSharing.planGoalSourceDocumentIds, ["private-parent-plan", "clinical-plan"]);

  const afterRevocation = filterPlanGoalForVisibleSources(card, ["clinical-plan"]);
  assert.equal(afterRevocation.planGoal, null);
  assert.deepEqual(afterRevocation.planGoalSourceDocumentIds, []);
  assert.equal(afterRevocation.goal, "Clinician-approved goal");
  assert.equal(afterRevocation.source, "clinician_reviewed");
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