import test from "node:test";
import assert from "node:assert/strict";
import { buildParentDocumentActivitySuggestions } from "./activityMatching";
import { careTeamActivityLibrary } from "./parentDailyActions";

const childId = "child-a";

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: "visual-profile",
    category: "profile_information",
    childId,
    documentId: "doc-1",
    documentTitle: "Current intake",
    documentVersion: "version-1",
    sourceSection: "Communication supports",
    sourcePage: 3,
    sourceExcerpt: "The child already uses a familiar visual schedule.",
    sourceExcerptVerified: true,
    extractionStatus: "extracted",
    reviewStatus: "unreviewed",
    interpretation: { field: "communication_preferences", value: "familiar visual schedule" },
    ...overrides,
  };
}

const supportArea = {
  name: "Difficulty with directions",
  description: "Several spoken directions may be hard to follow.",
  contexts: ["schoolwork"],
  observations: ["Needs time after a direction."],
  sourceDocumentIds: ["doc-1"],
};

function suggest(records: any[], supportAreas = [supportArea], existingActivities: any[] = []) {
  return buildParentDocumentActivitySuggestions({
    childId,
    records,
    library: careTeamActivityLibrary(),
    supportAreas,
    existingActivities,
  });
}

test("matches an existing low-risk activity to verified familiar skills and a related source concern", () => {
  const result = suggest([record()]);
  const match = result.find((suggestion) => suggestion.id === "library:what-happens-next");
  assert.ok(match);
  assert.equal(match.title, "What Happens Next?");
  assert.equal(match.relatedSupportAreas[0], supportArea.name);
  assert.equal(match.sourceEvidence[0].documentTitle, "Current intake");
  assert.equal(match.sourceEvidence[0].sourceExcerpt, record().sourceExcerpt);
  assert.match(match.riskClassification, /not clinician-approved|general educational/i);
  assert.ok(match.steps.length >= 2);
});

test("does not turn an inferred concern or goal alone into an activity", () => {
  const concernOnly = record({
    category: "support_concern",
    interpretation: {
      name: "Difficulty with directions",
      description: "Several spoken directions may be hard to follow.",
      contexts: ["schoolwork"],
      observations: ["Needs time after a direction."],
      evidence_level: "documented_concern",
      uncertainty: "The source does not explain why.",
    },
  });
  const goalOnly = record({
    id: "goal-1",
    category: "goal",
    interpretation: { title: "Follow directions", skill_domain: "communication" },
    sourceExcerpt: "The child will follow multi-step instructions.",
  });
  assert.deepEqual(suggest([concernOnly]), []);
  assert.deepEqual(suggest([goalOnly]), []);
});

test("filters unsafe safety-sensitive matches, unverified evidence, and duplicate daily activities", () => {
  const safety = record({
    id: "safety-1",
    category: "safety_instruction",
    sourceExcerpt: "The current safety plan requires clinician review.",
    interpretation: { instruction: "Follow the verified safety plan." },
  });
  assert.deepEqual(suggest([safety]), []);
  assert.equal(suggest([record(), safety]).some((item) => item.id === "library:what-happens-next"), false);
  assert.deepEqual(suggest([record({ sourceExcerptVerified: false })]), []);
  assert.equal(
    suggest([record()], [supportArea], [{ title: "What Happens Next?" }]).some((item) => item.id === "library:what-happens-next"),
    false,
  );
});

test("keeps the support-area association child-source linked and evidence-limited", () => {
  const unrelated = {
    ...supportArea,
    name: "Unrelated play concern",
    sourceDocumentIds: ["other-doc"],
  };
  const result = suggest([record()], [unrelated]);
  const match = result.find((suggestion) => suggestion.id === "library:what-happens-next");
  assert.ok(match);
  assert.deepEqual(match.relatedSupportAreas, []);
  assert.ok(match.researchLimitations.length > 0);
});
