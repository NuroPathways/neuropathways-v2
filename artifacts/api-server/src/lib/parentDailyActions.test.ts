import test from "node:test";
import assert from "node:assert/strict";
import {
  buildParentDailyActionDrafts,
  normalizeParentActionDate,
} from "./parentDailyActions";
import type { ParentBehavior } from "./parentAuth";
import { makeStarterCard, type ParentPlanActivity, type SupportCard } from "./parentStarterLibrary";

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

const breakRequestActivity: ParentPlanActivity = {
  title: "Practice requesting a break",
  routineContext: "During homework at the kitchen table",
  opportunity: "Before a short assignment, offer the familiar break card and wait",
  skill: "Requests a break using the card",
  reinforcement: "Provide the planned break after the request",
  sourceDocumentId: "parent-plan-1",
  sourceExcerpt: "During homework, practice requesting a break with the break card.",
  sourceType: "parent_uploaded_plan",
};

test("daily actions turn plan activities into concrete steps and keep their provenance", () => {
  const card = supportCard("task_refusal", "Task refusal", "parent_document", {
    planGoal: "Independently requests a break during homework.",
    dailyActivities: [breakRequestActivity],
  });
  const actions = buildParentDailyActionDrafts({
    date: "2026-10-07",
    selectedBehaviors: [selectedBehavior("task_refusal", "Task refusal")],
    supportCards: [card],
    logs: [],
  });

  assert.equal(actions.length, 1);
  assert.equal(actions[0].kind, "task");
  assert.equal(actions[0].sourceType, "parent_uploaded_plan");
  assert.equal(actions[0].sourceDocumentId, "parent-plan-1");
  assert.equal(actions[0].title, "Practice requesting a break");
  assert.deepEqual(actions[0].steps, [
    "In this routine: During homework at the kitchen table",
    "Offer this opportunity: Before a short assignment, offer the familiar break card and wait",
    "Notice this skill: Requests a break using the card",
    "Plan-listed reinforcement: Provide the planned break after the request",
  ]);
  assert.match(actions[0].whyItMayHelp, /Independently requests a break during homework/);
});

test("daily actions spread across selected behaviors and cap the list at four plan activities", () => {
  const firstBehavior = selectedBehavior("task_refusal", "Task refusal");
  const secondBehavior = selectedBehavior("sleep_problems", "Sleep problems");
  const anotherActivity: ParentPlanActivity = {
    ...breakRequestActivity,
    title: "Use a visual first-then card",
    routineContext: "During the evening routine",
    sourceDocumentId: "clinician-plan-1",
    sourceType: "clinician_reviewed",
    reinforcement: null,
  };
  const actions = buildParentDailyActionDrafts({
    date: "2026-10-07",
    selectedBehaviors: [firstBehavior, secondBehavior],
    supportCards: [
      supportCard("task_refusal", "Task refusal", "parent_document", {
        dailyActivities: [breakRequestActivity, anotherActivity, anotherActivity],
      }),
      supportCard("sleep_problems", "Sleep problems", "clinician_reviewed", {
        sourceDocumentIds: ["clinician-plan-1"],
        dailyActivities: [anotherActivity, anotherActivity, anotherActivity],
      }),
    ],
    logs: [],
  });

  assert.equal(actions.length, 4);
  assert.deepEqual(actions.slice(0, 2).map((action) => action.behaviorName), ["Sleep problems", "Task refusal"]);
  assert.ok(actions.some((action) => action.sourceType === "clinician_reviewed"));
});

test("starter cards, selected goals, and repeated notes do not become invented daily activities", () => {
  const repeatedNote = "Offer a visual break card.";
  const actions = buildParentDailyActionDrafts({
    date: "2026-10-07",
    selectedBehaviors: [selectedBehavior("task_refusal", "Task refusal")],
    supportCards: [makeStarterCard("task_refusal", null, "Ask for a break")],
    logs: [
      { behaviorKey: "task_refusal", customBehavior: null, whatHelped: repeatedNote, createdAt: new Date() },
      { behaviorKey: "task_refusal", customBehavior: null, whatHelped: repeatedNote, createdAt: new Date() },
    ],
  });
  assert.deepEqual(actions, []);
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
  assert.equal(actions.length, 1);
  assert.equal(actions[0].status, "needs_review");
  assert.deepEqual(actions[0].steps, []);
});

test("parent action dates accept real calendar days and reject malformed dates", () => {
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(normalizeParentActionDate("2024-02-29"), "2024-02-29");
  assert.equal(normalizeParentActionDate("not-a-date").match(/^\d{4}-\d{2}-\d{2}$/)?.[0] !== undefined, true);
  assert.equal(normalizeParentActionDate("2024-02-30"), today);
});
