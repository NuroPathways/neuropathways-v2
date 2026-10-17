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
      sourceLabel: "General support · not individualized",
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

    expect(behaviors[0].sourceLabel).toBe("General support · not individualized");
    expect(behaviors[0].do_this_right_now).toEqual(["Use the safe starter step."]);
  });

  it("keeps safe plan discoveries available alongside the parent's saved behavior", () => {
    const behaviors = parentDirectBehaviors(
      { behaviorKey: "task_refusal", behaviorName: "Task refusal" },
      [
        { behaviorKey: "task_refusal", behaviorName: "Task refusal", source: "starter", conflict: false },
        { behaviorKey: "elopement", behaviorName: "Elopement", source: "parent_document", conflict: false },
      ],
      [],
    );

    expect(behaviors.map((behavior) => behavior.name)).toEqual(["Task refusal", "Elopement"]);
    expect(behaviors[1].sourceLabel).toBe("Source: Your uploaded plan · not clinician-reviewed");
  });

  it("preserves available plan strategies, escalation, prevention, and reinforcement details", () => {
    const behaviors = parentDirectBehaviors(
      { behaviorKey: "task_refusal", behaviorName: "Task refusal" },
      [{
        behaviorKey: "task_refusal",
        behaviorName: "Task refusal",
        source: "clinician_reviewed",
        conflict: false,
        interventions: ["Use the clinician's agreed prompt."],
        ifItEscalates: ["Pause and follow the safety plan."],
        prevention: ["Preview the transition."],
        reinforcementIdea: "Recognize the first step.",
      }],
      [],
    );

    expect(behaviors[0]).toMatchObject({
      interventions: ["Use the clinician's agreed prompt."],
      if_it_escalates: ["Pause and follow the safety plan."],
      prevention_tips: ["Preview the transition."],
      reinforcement_rewards: ["Recognize the first step."],
    });
  });
});
