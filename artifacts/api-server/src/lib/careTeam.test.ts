import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readableGoalTitle, resolveAssignment, careGoalWire } from "./careTeam";
import { careTeamActivityLibrary } from "./parentDailyActions";

describe("care-team source and clinical progress boundaries", () => {
  it("uses meaningful saved titles/descriptions without writing invented clinical objectives", () => {
    assert.equal(readableGoalTitle({ goalTitle: "F4 goal 13:32:51", goalDescription: "Ask using the existing break signal. During calm practice." }), "Ask using the existing break signal");
    assert.equal(readableGoalTitle({ goalTitle: "F4 goal 13:32:51", goalName: "Ask for a Break" }), "Ask for a Break");
    assert.equal(readableGoalTitle({ goalTitle: "F4 goal 13:32:51" }), "Goal — title needs review");
    assert.equal(readableGoalTitle({ goalTitle: "Goal 2: Asking for help" }), "Goal 2: Asking for help");
  });
  it("resolves library assignments from the original stable reference", () => {
    const library = careTeamActivityLibrary().find(a => a.id === "break-request")!;
    const activity = resolveAssignment({ libraryId: library.id, libraryVersion: 1 });
    assert.deepEqual(activity.steps, library.steps);
    assert.throws(() => resolveAssignment({ libraryId: library.id, libraryVersion: 99 }), /unavailable/);
  });
  it("never creates missing custom instructions or generic explanations", () => {
    const activity = resolveAssignment({ title: "Existing title" });
    assert.deepEqual(activity.steps, []);
    assert.equal(activity.whyItMayHelp, "");
  });
  it("does not create a clinical percentage for observation-only goals", () => {
    const goal = careGoalWire({
      id: "goal", childId: "child", goalTitle: "Ask for help", goalDescription: "Use a familiar request",
      goalDetails: { measurement: "observation", target: null }, goalVersion: 1, goalVersions: [],
      createdByClinician: true, publicationStatus: "published", source: "care_team",
      progress: 0, target: 10,
    } as any);
    assert.equal(goal.progress, null); assert.equal(goal.target, null);
    assert.equal(goal.version, 1);
  });
  it("does not label starter-library content as clinician-reviewed", () => {
    assert.equal(careTeamActivityLibrary().every(a => a.steps.length > 0 && !/reviewed/i.test(a.source)), true);
    assert.equal(new Set(careTeamActivityLibrary().map(a => a.id)).size, careTeamActivityLibrary().length);
  });
});
