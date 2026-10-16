import { describe, expect, it } from "vitest";
import { parentDirectBehaviors } from "./parentDirectSupport";

describe("parentDirectBehaviors", () => {
  it("includes a preset behavior selected during setup, even if its card is missing", () => {
    const behaviors = parentDirectBehaviors(
      {
        behaviors: [{
          behaviorKey: "task_refusal",
          customBehavior: null,
          behaviorName: "Task refusal",
          goal: "Start one small step",
        }],
      },
      [],
      [{ key: "task_refusal", rightNow: ["Offer a brief, familiar choice."] }],
    );

    expect(behaviors).toHaveLength(1);
    expect(behaviors[0]).toMatchObject({
      name: "Task refusal",
      parentDirectEligible: true,
      sourceLabel: "Starter support",
      do_this_right_now: ["Offer a brief, familiar choice."],
    });
  });

  it("uses starter guidance rather than conflicting plan content for a selected behavior", () => {
    const behaviors = parentDirectBehaviors(
      { behaviorKey: "task_refusal", behaviorName: "Task refusal" },
      [{
        id: "conflicted",
        behaviorKey: "task_refusal",
        behaviorName: "Task refusal",
        source: "parent_document",
        conflict: true,
        rightNow: ["Conflicting plan instruction"],
      }],
      [{ key: "task_refusal", rightNow: ["Use the safe starter step."] }],
    );

    expect(behaviors[0].sourceLabel).toBe("Starter support");
    expect(behaviors[0].do_this_right_now).toEqual(["Use the safe starter step."]);
  });

  it("does not add plan discoveries that the parent has not selected", () => {
    const behaviors = parentDirectBehaviors(
      { behaviorKey: "task_refusal", behaviorName: "Task refusal" },
      [
        { behaviorKey: "task_refusal", behaviorName: "Task refusal", source: "starter", conflict: false },
        { behaviorKey: "elopement", behaviorName: "Elopement", source: "parent_document", conflict: false },
      ],
      [],
    );

    expect(behaviors.map((behavior) => behavior.name)).toEqual(["Task refusal"]);
  });
});
