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
      sourceLabel: "General starter support — not individualized",
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

    expect(behaviors[0].sourceLabel).toBe("General starter support — not individualized");
    expect(behaviors[0].do_this_right_now).toEqual(["Use the safe starter step."]);
  });

  it("keeps safe plan discoveries available alongside the parent's saved behavior", () => {
    const behaviors = parentDirectBehaviors(
      { behaviorKey: "task_refusal", behaviorName: "Task refusal" },
      [
        { behaviorKey: "task_refusal", behaviorName: "Task refusal", source: "starter", conflict: false },
        {
          behaviorKey: "transitions",
          behaviorName: "Transition difficulty",
          source: "parent_document",
          sourceDocumentIds: ["doc-1"],
          sourceReferences: [{ documentId: "doc-1", title: "Plan", excerpt: "The plan says to offer a two-minute warning." }],
          conflict: false,
        },
      ],
      [{ key: "task_refusal", rightNow: ["Offer a brief, familiar choice."] }],
    );

    expect(behaviors.map((behavior) => behavior.name)).toEqual(["Task refusal", "Transition difficulty"]);
    expect(behaviors[1].sourceLabel).toBe("From your uploaded plan · not clinician-reviewed");
    expect(behaviors[1].documentReferencedOnly).toBe(true);
  });

  it("preserves approved plan strategies, escalation, prevention, and reinforcement details", () => {
    const behaviors = parentDirectBehaviors(
      { behaviorKey: "task_refusal", behaviorName: "Task refusal" },
      [{
        behaviorKey: "task_refusal",
        behaviorName: "Task refusal",
        source: "clinician_reviewed",
        reviewedBy: "clinician-1",
        reviewedAt: "2026-10-20T12:00:00.000Z",
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
      sourceLabel: "Clinician-approved support",
    });
  });

  it("does not populate Help Now with generic cards when no behavior was selected", () => {
    const behaviors = parentDirectBehaviors(
      { behaviors: [] },
      [
        { behaviorKey: "elopement", behaviorName: "Elopement", source: "starter" },
        { behaviorKey: "task_refusal", behaviorName: "Task refusal", source: "clinician_document" },
      ],
      [{ key: "elopement", rightNow: ["Generic safety step"] }],
    );

    expect(behaviors).toEqual([]);
  });

  it("does not show clinician guidance without current review metadata", () => {
    const behaviors = parentDirectBehaviors(
      { behaviors: [] },
      [{
        behaviorKey: "transitions",
        behaviorName: "Transition difficulty",
        source: "clinician_reviewed",
        rightNow: ["Use the agreed visual cue."],
      }],
      [],
    );

    expect(behaviors).toEqual([]);
  });

  it("shows only a verified low-risk excerpt from a parent-uploaded document", () => {
    const behaviors = parentDirectBehaviors(
      { behaviors: [] },
      [{
        id: "parent-plan",
        behaviorKey: "transitions",
        behaviorName: "Transition difficulty",
        source: "parent_document",
        sourceDocumentIds: ["doc-1"],
        sourceReferences: [{
          documentId: "doc-1",
          title: "Family notes",
          excerpt: "The plan says to offer a two-minute warning before changing activities.",
        }],
        rightNow: ["AI-generated instruction that should not be used."],
        prevention: ["Another generated instruction."],
      }],
      [],
    );

    expect(behaviors).toHaveLength(1);
    expect(behaviors[0]).toMatchObject({
      documentReferencedOnly: true,
      documentExcerpt: "The plan says to offer a two-minute warning before changing activities.",
      sourceLabel: "From your uploaded plan · not clinician-reviewed",
      do_this_right_now: [],
      interventions: [],
      prevention_tips: [],
    });
  });

  it("restricts higher-risk general support to emergency information", () => {
    const behaviors = parentDirectBehaviors(
      {
        behaviors: [{
          behaviorKey: "elopement",
          behaviorName: "Elopement",
          goal: "Stay near an adult",
        }],
      },
      [],
      [{ key: "elopement", rightNow: ["Detailed generic steps"], prevention: ["Practice boundary skills"] }],
    );

    expect(behaviors).toHaveLength(1);
    expect(behaviors[0]).toMatchObject({
      emergencyOnly: true,
      sourceLabel: "Safety information only — not individualized",
      do_this_right_now: [],
      interventions: [],
      prevention_tips: [],
      when_to_contact_clinician: "",
    });
  });

  it("does not expose higher-risk document instructions without clinician approval", () => {
    const behaviors = parentDirectBehaviors(
      { behaviors: [] },
      [{
        behaviorKey: "self_injury",
        behaviorName: "Self-injury",
        source: "parent_document",
        sourceDocumentIds: ["doc-2"],
        sourceReferences: [{ documentId: "doc-2", title: "Notes", excerpt: "The family notes mention self-injury during loud events." }],
        rightNow: ["Unreviewed instruction"],
      }],
      [],
    );

    expect(behaviors).toHaveLength(1);
    expect(behaviors[0]).toMatchObject({
      emergencyOnly: true,
      documentExcerpt: "",
      do_this_right_now: [],
      sourceLabel: "Safety information only — not individualized",
    });
  });
});
