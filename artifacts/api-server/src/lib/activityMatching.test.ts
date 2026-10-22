import test from "node:test";
import assert from "node:assert/strict";
import { buildChildActivityRecommendations, canExposeActivityRecommendations } from "./activityMatching";
import { careTeamActivityLibrary } from "./parentDailyActions";

const childId = "child-a";
const clinicianId = "clinician-a";

function record(overrides: Record<string, unknown> = {}) {
  const base = {
    id: "record-1",
    category: "profile_information",
    childId,
    documentId: "doc-1",
    documentTitle: "Current support plan",
    sourceSection: "Preferences",
    sourcePage: 2,
    sourceExcerpt: "The source explicitly records the child's preference.",
    sourceExcerptVerified: true,
    extractionStatus: "extracted",
    reviewStatus: "unreviewed",
    interpretation: { field: "interests", value: "building with blocks" },
  };
  return { ...base, ...overrides };
}

function libraryItem(id: string, riskTier = "low") {
  return {
    id,
    title: id,
    description: "A general starter activity.",
    skill: "Communication",
    skillDomain: "communication",
    estimatedMinutes: 5,
    materials: ["familiar materials"],
    steps: ["Offer a choice.", "Pause for a response."],
    ifDifficult: "Pause if the child shows they are finished.",
    riskTier,
    evidenceReferences: [{ key: "source", title: "General source", limitation: "Not an activity-specific trial." }],
  };
}

function match(records: any[], library: any[], extra: Record<string, unknown> = {}) {
  return buildChildActivityRecommendations({
    childId,
    clinicianId,
    records,
    library,
    ...extra,
  } as any);
}

test("matches different child evidence to different low-risk library suggestions", () => {
  const buildingChild = match([
    record(),
    record({
      id: "goal-build",
      category: "goal",
      sourceSection: "Goals",
      sourceExcerpt: "Practice shared play with familiar building materials.",
      interpretation: { title: "Share play", skill_domain: "social_play" },
    }),
  ], [libraryItem("build-together"), libraryItem("familiar-aac-choice")]);

  const aacChild = match([
    record({
      id: "aac-method",
      interpretation: { field: "aac_method", value: "AAC device" },
      sourceExcerpt: "The child uses an AAC device to communicate.",
    }),
    record({
      id: "goal-communication",
      category: "goal",
      sourceSection: "Goals",
      sourceExcerpt: "Increase communication during daily routines.",
      interpretation: { title: "Communication", skill_domain: "communication" },
    }),
  ], [libraryItem("build-together"), libraryItem("familiar-aac-choice")]);

  assert.deepEqual(buildingChild.recommendations.map((item) => item.id), ["library:build-together"]);
  assert.deepEqual(aacChild.recommendations.map((item) => item.id), ["library:familiar-aac-choice"]);
  assert.match(buildingChild.recommendations[0].evidence[0].sourceExcerpt, /preference/);
  assert.equal(buildingChild.recommendations[0].status, "suggestion_only");
});

test("uses real eligible library entries and reserves recommendations for clinician workspaces", () => {
  const realLibrary = careTeamActivityLibrary();
  const matched = match([record()], realLibrary);
  assert.ok(realLibrary.some((item) => item.id === "build-together" && item.riskTier === "low"));
  assert.ok(matched.recommendations.some((item) => item.id === "library:build-together"));
  assert.equal(matched.recommendations.some((item) => item.priorityTier === "document_grounded_library" &&
    realLibrary.find((activity) => `library:${activity.id}` === item.id)?.riskTier !== "low"), false);
  assert.equal(canExposeActivityRecommendations(clinicianId), true);
  assert.equal(canExposeActivityRecommendations(clinicianId, "parent-a"), false);
  assert.equal(canExposeActivityRecommendations(null), false);
});

test("a goal alone never creates a personalized starter activity", () => {
  const result = match([
    record({
      id: "goal-coping",
      category: "goal",
      sourceSection: "Goals",
      sourceExcerpt: "Increase independent use of coping skills.",
      interpretation: { title: "Use coping skills", skill_domain: "coping" },
    }),
  ], [libraryItem("familiar-coping-choice-card"), libraryItem("one-small-routine-step")]);
  assert.deepEqual(result.recommendations, []);
});

test("unverified, rejected, wrong-child, and non-extracted records cannot support a match", () => {
  const base = record();
  const invalid = [
    record({ sourceExcerptVerified: false }),
    record({ reviewStatus: "rejected" }),
    record({ childId: "another-child" }),
    record({ extractionStatus: "needs_review" }),
  ];
  const result = match([...invalid, base], [libraryItem("build-together")]);
  assert.equal(result.recommendations.length, 1);
  assert.deepEqual(result.recommendations[0].evidence.map((item) => item.recordId), ["record-1"]);
});

test("direct document activity candidates retain their exact source and show missing details", () => {
  const source = record({
    id: "activity-record",
    category: "potential_home_activity",
    sourceSection: "Home practice",
    sourceExcerpt: "Offer the familiar music choice during the afternoon routine.",
    interpretation: {
      title: "Choose familiar music",
      description: "Offer one familiar music choice.",
      skill: "Communication",
      suggested_context: "During the afternoon routine.",
      start_action: "",
      steps: ["Offer the choice."],
      end_condition: "",
      pause_conditions: [],
      materials: ["music player"],
    },
  });
  const result = match([source], []);
  assert.equal(result.recommendations.length, 1);
  assert.equal(result.recommendations[0].status, "needs_details");
  assert.equal(result.recommendations[0].evidence[0].sourceExcerpt, source.sourceExcerpt);
  assert.equal(result.recommendations[0].evidence[0].sourcePage, 2);
});

test("does not recommend exposure or reassurance-withholding activities", () => {
  const exposure = record({
    id: "exposure-activity",
    category: "potential_home_activity",
    sourceExcerpt: "The plan describes a gradual exposure practice for reassurance seeking.",
    interpretation: {
      title: "Gradual exposure practice",
      skill: "Coping",
      suggested_context: "During a calm routine.",
      start_action: "Withhold reassurance and begin exposure.",
      steps: ["Begin exposure.", "Continue response prevention."],
      end_condition: "End after the exposure.",
      pause_conditions: ["Pause if distress increases."],
    },
  });
  assert.deepEqual(match([exposure], []).recommendations, []);
});

test("existing assignments suppress duplicate library suggestions", () => {
  const result = match([record()], [libraryItem("build-together")], {
    existingAssignments: [{ id: "assignment-1", libraryId: "build-together", status: "published", title: "Build together" }],
  });
  assert.deepEqual(result.recommendations, []);
});

test("a suggestion already in clinician review is not offered a second time", () => {
  const result = match([record()], [libraryItem("build-together")], {
    existingAssignments: [{
      id: "assignment-review",
      recommendationId: "library:build-together",
      libraryId: "build-together",
      status: "needs_review",
      title: "Build together",
    }],
  });
  assert.deepEqual(result.recommendations, []);
});

test("reviewed source activities rank ahead of document candidates and starter suggestions", () => {
  const candidate = record({
    id: "activity-record",
    category: "potential_home_activity",
    sourceExcerpt: "Offer the child's familiar music choice during free play.",
    interpretation: {
      title: "Choose music",
      description: "Offer a familiar choice.",
      skill: "Communication",
      suggested_context: "During free play.",
      start_action: "Offer two known songs.",
      steps: ["Offer the choice.", "Pause for a response."],
      end_condition: "Stop when the child is finished.",
      pause_conditions: ["Pause if the child turns away."],
    },
  });
  const approved = {
    title: "Reviewed routine activity",
    skill: "Communication",
    sourceDocumentId: "doc-2",
    sourceDocumentTitle: "Shared plan",
    sourceExcerpt: "The clinician-reviewed source supports a familiar choice.",
    reviewedBy: clinicianId,
    reviewedAt: "2026-01-01T00:00:00.000Z",
    readiness: "ready",
    sourceExcerptVerified: true,
  };
  const result = match([
    candidate,
    record({ id: "interest", interpretation: { field: "interests", value: "building blocks" } }),
  ], [libraryItem("build-together")], { approvedDocumentActivities: [approved] });
  assert.deepEqual(result.recommendations.map((item) => item.priorityTier), [
    "clinician_approved_document_activity",
    "document_activity_candidate",
    "document_grounded_library",
  ]);
});

test("already assigned or unverified reviewed-source activities are not repeated", () => {
  const source = {
    title: "Reviewed routine activity",
    sourceDocumentId: "doc-2",
    sourceDocumentTitle: "Shared plan",
    sourceExcerpt: "The clinician-reviewed source supports a familiar choice.",
    reviewedBy: clinicianId,
    reviewedAt: "2026-01-01T00:00:00.000Z",
    readiness: "ready",
    sourceExcerptVerified: true,
  };
  const result = match([], [], {
    approvedDocumentActivities: [
      { ...source, assignedAt: "2026-01-02T00:00:00.000Z" },
      { ...source, title: "Not source verified", sourceExcerptVerified: false },
    ],
  });
  assert.deepEqual(result.recommendations, []);
});

test("safety excerpts are surfaced as a review warning, never as positive match evidence", () => {
  const safety = record({
    id: "safety-record",
    category: "safety_instruction",
    reviewStatus: "needs_review",
    sourceExcerpt: "Pause and check the current safety plan if the child moves toward the door.",
    interpretation: { instruction: "Pause and check the current safety plan." },
  });
  const result = match([record(), safety], [libraryItem("build-together")]);
  assert.equal(result.recommendations[0].safetyReviewRequired, true);
  assert.equal(result.safetyEvidence[0].recordId, "safety-record");
  assert.deepEqual(result.recommendations[0].evidence.map((item) => item.recordId), ["record-1"]);
});
