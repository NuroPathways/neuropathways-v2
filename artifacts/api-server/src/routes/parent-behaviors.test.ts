import assert from "node:assert/strict";
import { test } from "node:test";
import { makeStarterCard } from "../lib/parentStarterLibrary";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/parent-behavior-tests";
const {
  applyLegacyBehaviorEdits,
  completeBehaviorSelections,
  starterCardsAfterEdit,
  validateChildInput,
} = await import("./parent.js");

test("custom behavior cards have distinct stable identities", () => {
  const first = makeStarterCard("custom", "Bed time", "Keep a calm routine");
  const second = makeStarterCard("custom", "Bed_time", "Ask before changing activities");
  assert.notEqual(first.id, second.id);
  assert.equal(first.id, makeStarterCard("custom", "  BED   TIME  ", "A different goal").id);
  assert.equal(validateChildInput({ name: "Synthetic", behaviorKey: "unknown" }, "create").ok, false);
});

test("validates non-empty, bounded multi-behavior setup and normalized custom identities", () => {
  const valid = validateChildInput({
    name: "Child",
    behaviors: [
      { behaviorKey: "task_refusal", goal: "Start one step" },
      { behaviorKey: "custom", customBehavior: "Morning clothing discomfort", goal: null },
    ],
  }, "create");
  assert.equal(valid.ok, true);
  if (!valid.ok) return;
  assert.equal(completeBehaviorSelections(valid.input.behaviors).length, 2);

  assert.equal(validateChildInput({ name: "Child", behaviors: [] }, "create").ok, false);
  assert.equal(validateChildInput({
    name: "Child",
    behaviors: Array.from({ length: 21 }, (_, index) => ({
      behaviorKey: "custom",
      customBehavior: `Behavior ${index}`,
    })),
  }, "create").ok, false);
  assert.equal(validateChildInput({
    name: "Child",
    behaviors: [
      { behaviorKey: "custom", customBehavior: "Morning clothing discomfort" },
      { behaviorKey: "custom", customBehavior: " MORNING   CLOTHING DISCOMFORT " },
    ],
  }, "create").ok, false);
  assert.equal(validateChildInput({
    name: "Child",
    behaviors: [{ behaviorKey: "custom" }],
  }, "create").ok, false);
});

test("legacy scalar goal edits affect only the primary and replacing selections can remove one behavior", () => {
  const current = completeBehaviorSelections([
    { behaviorKey: "task_refusal", goal: "Start one step" },
    { behaviorKey: "custom", customBehavior: "Morning clothing discomfort", goal: "Choose one item" },
  ]);
  const goalInput = validateChildInput({ goal: "Do one small task" }, "patch");
  assert.equal(goalInput.ok, true);
  if (!goalInput.ok) return;
  const edited = applyLegacyBehaviorEdits(current, goalInput.input, { goal: "Do one small task" });
  assert.deepEqual(edited.map(({ behaviorKey, goal }) => ({ behaviorKey, goal })), [
    { behaviorKey: "task_refusal", goal: "Do one small task" },
    { behaviorKey: "custom", goal: "Choose one item" },
  ]);

  const removalInput = validateChildInput({
    behaviors: [{ behaviorKey: "custom", customBehavior: "Morning clothing discomfort", goal: "Choose one item" }],
  }, "patch");
  assert.equal(removalInput.ok, true);
  if (!removalInput.ok) return;
  const removed = applyLegacyBehaviorEdits(current, removalInput.input, { behaviors: removalInput.input.behaviors });
  assert.equal(removed.length, 1);
  assert.equal(removed[0].behaviorKey, "custom");
  assert.equal(removed[0].goal, "Choose one item");
});

test("behavior regeneration keeps all document and clinician-reviewed support cards", () => {
  const documentCard = {
    ...makeStarterCard("task_refusal", null, "Start one step"),
    id: "parent-document-card",
    source: "parent_document",
    sourceDocumentIds: ["parent-doc"],
  };
  const reviewedCard = {
    ...makeStarterCard("aggression", null, "Use a safe replacement"),
    id: "reviewed-card",
    source: "clinician_reviewed",
    sourceDocumentIds: ["clinic-doc"],
    reviewedBy: "clinician-1",
  };
  const selections = completeBehaviorSelections([
    { behaviorKey: "task_refusal", goal: "Start one step" },
    { behaviorKey: "custom", customBehavior: "Morning clothing discomfort", goal: "Choose one item" },
  ]);
  const cards = starterCardsAfterEdit([documentCard, reviewedCard], selections);
  assert.ok(cards.some((card) => card.id === documentCard.id && card.source === "parent_document"));
  assert.ok(cards.some((card) => card.id === reviewedCard.id && card.source === "clinician_reviewed"));
  assert.equal(cards.filter((card) => card.source === "starter").length, 2);
});