import test from "node:test";
import assert from "node:assert/strict";
import {
  buildParentDailyActionDrafts,
  normalizeParentActionDate,
} from "./parentDailyActions";
import type { ParentBehavior } from "./parentAuth";
import type { SupportCard } from "./parentStarterLibrary";

function selectedBehavior(behaviorKey: string, behaviorName: string): ParentBehavior {
  return {
    behaviorKey,
    customBehavior: null,
    behaviorName,
    goal: "Ask for a break",
  } as ParentBehavior;
}

function supportCard(
  behaviorKey: string,
  behaviorName: string,
  source: SupportCard["source"],
  overrides: Partial<SupportCard> = {},
): SupportCard {
  return {
    id: `${source}-${behaviorKey}`,
    behaviorKey,
    behaviorName,
    source,
    sourceDocumentIds: source === "parent_document" ? ["parent-plan-1"] : [],
    prevention: [
      "Give a short transition warning.",
      "Show a simple visual checklist.",
      "Offer a small choice.",
    ],
    rightNow: ["Reduce extra words and noise.", "Use one calm, short phrase."],
    replacementSkill: "Ask for a break.",
    conflict: false,
    ...overrides,
  } as SupportCard;
}

test("daily action drafts prioritize reviewed sources and preserve every selected behavior", () => {
  const selected = [
    selectedBehavior("task_refusal", "Task refusal"),
    selectedBehavior("sleep_problems", "Sleep problems"),
  ];
  const actions = buildParentDailyActionDrafts({
    date: "2026-10-07",
    selectedBehaviors: selected,
    supportCards: [
      supportCard("sleep_problems", "Sleep problems", "parent_document"),
      supportCard("task_refusal", "Task refusal", "clinician_reviewed"),
      supportCard("elopement", "Elopement", "starter"),
    ],
    logs: [],
  });

  const tasks = actions.filter((action) => action.kind === "task");
  const activities = actions.filter((action) => action.kind === "activity");
  const practice = actions.filter((action) => action.kind === "practice");
  assert.equal(tasks.length, 2);
  assert.equal(activities.length, 2);
  assert.equal(practice.length, 1);
  assert.equal(tasks[0].sourceType, "clinician_reviewed");
  assert.equal(tasks[1].sourceType, "parent_uploaded_plan");
  assert.deepEqual(
    new Set(actions.map((action) => action.behaviorName)),
    new Set(["Task refusal", "Sleep problems"]),
  );
  assert.equal(tasks[1].sourceDocumentId, "parent-plan-1");
});

test("fallback daily actions still cover multiple parent-selected behaviors without support cards", () => {
  const selected = [
    selectedBehavior("task_refusal", "Task refusal"),
    selectedBehavior("sleep_problems", "Sleep problems"),
  ];
  const actions = buildParentDailyActionDrafts({
    date: "2026-10-07",
    selectedBehaviors: selected,
    supportCards: [],
    logs: [],
  });

  assert.deepEqual(
    new Set(actions.filter((action) => action.kind === "task").map((action) => action.behaviorName)),
    new Set(["Task refusal", "Sleep problems"]),
  );
  assert.deepEqual(
    new Set(actions.filter((action) => action.kind === "activity").map((action) => action.behaviorName)),
    new Set(["Task refusal", "Sleep problems"]),
  );
});

test("repeated helpful parent notes can add a clearly labeled task without replacing plan guidance", () => {
  const behavior = selectedBehavior("task_refusal", "Task refusal");
  const repeatedNote = "Offer a visual break card.";
  const actions = buildParentDailyActionDrafts({
    date: "2026-10-07",
    selectedBehaviors: [behavior],
    supportCards: [supportCard("task_refusal", "Task refusal", "starter")],
    logs: [
      { behaviorKey: "task_refusal", customBehavior: null, whatHelped: repeatedNote, createdAt: new Date() },
      { behaviorKey: "task_refusal", customBehavior: null, whatHelped: repeatedNote, createdAt: new Date() },
    ],
  });

  const pattern = actions.find((action) => action.sourceType === "recent_log_pattern");
  assert.ok(pattern);
  assert.equal(pattern?.title, "Try what helped before");
  assert.equal(pattern?.description, repeatedNote);
  assert.ok(actions.some((action) => action.sourceType === "starter_template"));
});

test("conflicting plan guidance is marked for review rather than presented as a ready activity", () => {
  const actions = buildParentDailyActionDrafts({
    date: "2026-10-07",
    selectedBehaviors: [selectedBehavior("task_refusal", "Task refusal")],
    supportCards: [
      supportCard("task_refusal", "Task refusal", "parent_document", {
        conflict: true,
        conflictMessage: "The uploaded plan has conflicting steps.",
      }),
    ],
    logs: [],
  });
  const planActions = actions.filter((action) => action.sourceType === "parent_uploaded_plan");
  assert.ok(planActions.length > 0);
  assert.ok(planActions.every((action) => action.status === "needs_review"));
  assert.ok(planActions.every((action) => action.steps.length === 0));
});

test("parent action dates accept real calendar days and reject malformed dates", () => {
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(normalizeParentActionDate("2024-02-29"), "2024-02-29");
  assert.equal(normalizeParentActionDate("not-a-date").match(/^\d{4}-\d{2}-\d{2}$/)?.[0] !== undefined, true);
  assert.equal(normalizeParentActionDate("2024-02-30"), today);
});
