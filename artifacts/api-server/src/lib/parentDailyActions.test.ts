import test from "node:test";
import assert from "node:assert/strict";
import {
  buildParentDailyActionDrafts,
  normalizeParentActionDate,
} from "./parentDailyActions";
import type { ParentPlanGoal } from "./parentDailyActions";
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
    childName: "Maya",
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
    "Skill practiced: Requests a break using the card",
    "Plan-listed reinforcement: Provide the planned break after the request",
  ]);
  assert.match(actions[0].whyItMayHelp, /Maya/);
  assert.match(actions[0].whyItMayHelp, /Independently requests a break during homework/);
  assert.match(actions[0].whyItMayHelp, /Requests a break using the card/);
});

test("daily actions round-robin across selected behaviors and cap the list at five plan activities", () => {
  const firstBehavior = selectedBehavior("task_refusal", "Task refusal");
  const secondBehavior = selectedBehavior("sleep_problems", "Sleep problems");
  const makeActivity = (title: string): ParentPlanActivity => ({
    ...breakRequestActivity,
    title,
    routineContext: `During ${title.toLowerCase()}`,
    sourceDocumentId: "clinician-plan-1",
    sourceType: "clinician_reviewed",
    reinforcement: null,
    sourceExcerpt: `The plan says to ${title.toLowerCase()} as a supported skill.`,
  });
  const firstCardActivities = [
    breakRequestActivity,
    makeActivity("Use a visual first-then card"),
    makeActivity("Practice the evening routine"),
  ];
  const secondCardActivities = [
    makeActivity("Prepare for lights out"),
    makeActivity("Practice asking for help"),
    makeActivity("Use the calming routine"),
  ];
  const actions = buildParentDailyActionDrafts({
    date: "2026-10-07",
    selectedBehaviors: [firstBehavior, secondBehavior],
    supportCards: [
      supportCard("task_refusal", "Task refusal", "parent_document", {
        dailyActivities: firstCardActivities,
      }),
      supportCard("sleep_problems", "Sleep problems", "clinician_reviewed", {
        sourceDocumentIds: ["clinician-plan-1"],
        dailyActivities: secondCardActivities,
      }),
    ],
    logs: [],
  });

  assert.equal(actions.length, 5);
  assert.deepEqual(actions.slice(0, 2).map((action) => action.behaviorName), ["Sleep problems", "Task refusal"]);
  assert.ok(actions.some((action) => action.sourceType === "clinician_reviewed"));
});

test("a selected goal creates varied task-refusal activities without copying parent notes", () => {
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
  assert.equal(actions.length, 3);
  assert.deepEqual(actions.map((action) => action.title), [
    "Ask for a Break Practice",
    "One-Step Start",
    "First-Then Choice",
  ]);
  assert.ok(actions.every((action) => action.sourceType === "starter_template"));
  assert.ok(actions.every((action) => /saved goal: Ask for a break/.test(action.whyItMayHelp)));
  assert.ok(actions.every((action) => action.sourceDocumentId === null));
  assert.ok(actions.every((action) => action.steps.some((step) => step.startsWith("If it gets hard:"))));
  assert.ok(actions.every((action) => !action.steps.some((step) => step.includes(repeatedNote))));
});

test("starter practice is behavior-specific and excludes unsafe rehearsal", () => {
  const makeActions = (behaviorKey: string, behaviorName: string) => buildParentDailyActionDrafts({
    date: "2026-10-07",
    selectedBehaviors: [selectedBehavior(behaviorKey, behaviorName)],
    supportCards: [makeStarterCard(behaviorKey, null, "Use a safe replacement")],
    logs: [],
  });
  const elopement = makeActions("elopement", "Elopement / Running Away");
  const selfInjury = makeActions("self_injury", "Self-Injury");
  assert.ok(elopement.some((action) => action.title === "Indoor Stop-and-Return Game"));
  assert.ok(selfInjury.some((action) => action.title === "Practice Asking for Help"));
  const puzzle = elopement.find((action) => action.title === "Puzzle Together");
  assert.ok(puzzle);
  assert.ok(puzzle.steps.some((step) => /familiar, easy puzzle/.test(step)));
  assert.ok(puzzle.steps.some((step) => /Positive reinforcement/.test(step)));
  assert.ok(puzzle.steps.some((step) => /never use the puzzle to prevent leaving/.test(step)));
  assert.notDeepEqual(elopement.map((action) => action.title), selfInjury.map((action) => action.title));
  assert.doesNotMatch(elopement.map((action) => `${action.title} ${action.description} ${action.steps.join(" ")}`).join(" "), /restraint|physical block|create a difficult situation/i);
  assert.doesNotMatch(selfInjury.map((action) => `${action.title} ${action.description} ${action.steps.join(" ")}`).join(" "), /restraint|physical block|create a difficult situation/i);
});

test("calm space tour gets steps for that activity, choice, and low-pressure participation", () => {
  const actions = buildParentDailyActionDrafts({
    date: "2026-10-07",
    selectedBehaviors: [selectedBehavior("meltdowns", "Meltdowns")],
    supportCards: [makeStarterCard("meltdowns", null, "Find a familiar calm space")],
    logs: [],
  });
  const tour = actions.find((action) => action.title === "Calm Space Tour");

  assert.ok(tour);
  assert.ok(tour.steps.some((step) => /familiar quiet space the child can enter and leave freely/.test(step)));
  assert.ok(tour.steps.some((step) => /child to choose one item/.test(step)));
  assert.ok(tour.steps.some((step) => /Positive reinforcement/.test(step)));
  assert.ok(tour.steps.some((step) => /do not assume physical touch is welcome/i.test(step)));
});

test("an unselected conflicted plan does not become a family-facing review activity", () => {
  const actions = buildParentDailyActionDrafts({
    date: "2026-10-07",
    selectedBehaviors: [],
    supportCards: [
      supportCard("meltdowns", "Meltdowns", "parent_document", {
        conflict: true,
        conflictMessage: "Conflict detected. Clinician review recommended.",
      }),
    ],
    logs: [],
  });

  assert.deepEqual(actions, []);
});

test("a plan-discovered goal creates a sourced daily activity even when the behavior is not selected", () => {
  const card = supportCard("custom", "Requesting breaks", "parent_document", {
    sourceDocumentIds: ["parent-plan-1"],
    planGoal: "Request a break independently during homework.",
    planGoalSourceDocumentIds: ["parent-plan-1"],
    dailyActivities: [],
  });
  const actions = buildParentDailyActionDrafts({
    date: "2026-10-07",
    childName: "Maya",
    selectedBehaviors: [],
    supportCards: [card],
    logs: [],
  });

  assert.equal(actions.length, 1);
  assert.equal(actions[0].sourceType, "parent_uploaded_plan");
  assert.equal(actions[0].sourceDocumentId, "parent-plan-1");
  assert.match(actions[0].whyItMayHelp, /Maya's plan goal: Request a break independently during homework/);
  assert.match(actions[0].description, /communication signal/);
  assert.match(actions[0].steps[0], /^Skill practiced:/);
});

test("clinician report goals and explicit milestones generate distinct daily practice actions", () => {
  const goal: ParentPlanGoal = {
    id: "report-goal-1",
    title: "Request a break during homework",
    description: "Ask to pause before leaving the work area.",
    milestones: [
      "Use the break card before the first homework task.",
      "Return to the next task after the planned break.",
    ],
    sourceType: "clinician_uploaded_plan",
  };
  const actions = buildParentDailyActionDrafts({
    date: "2026-10-07",
    childName: "Maya",
    selectedBehaviors: [],
    supportCards: [],
    planGoals: [goal],
    logs: [],
  });

  assert.equal(actions.length, 2);
  assert.ok(actions.every((action) => action.sourceType === "clinician_uploaded_plan"));
  assert.ok(actions.every((action) => action.supportCardId === null));
  assert.ok(actions.every((action) => action.sourceDocumentId === null));
  assert.deepEqual(actions.map((action) => action.steps[0]), goal.milestones.map((milestone) => `Skill practiced: ${milestone}`));
  assert.ok(actions.every((action) => action.whyItMayHelp.includes("Maya's plan goal")));
  assert.notEqual(actions[0].actionKey, actions[1].actionKey);
});

test("unsafe instructions in a document goal never become a daily activity", () => {
  const actions = buildParentDailyActionDrafts({
    date: "2026-10-07",
    selectedBehaviors: [],
    supportCards: [],
    planGoals: [{
      id: "unsafe-goal",
      title: "Practice restraint",
      description: "Use restraint during transitions.",
      milestones: ["Hold the child down until they comply."],
      sourceType: "clinician_uploaded_plan",
    }],
    logs: [],
  });

  assert.deepEqual(actions, []);
});

test("clinical-sounding placeholder goals are rendered in parent-friendly language", () => {
  const actions = buildParentDailyActionDrafts({
    date: "2026-10-07",
    selectedBehaviors: [],
    supportCards: [],
    planGoals: [{
      id: "parent-facing-goal",
      title: "No aversive behaviors",
      description: "",
      milestones: [],
      sourceType: "parent_uploaded_plan",
    }],
    logs: [],
  });
  assert.equal(actions[0]?.title, "Practice: Use safe hands and safe objects");
  assert.match(actions[0]?.whyItMayHelp || "", /Use safe hands and safe objects/);
});

test("conflicted plan guidance falls back to safe library support for an active behavior", () => {
  const behavior = { ...selectedBehavior("task_refusal", "Task refusal"), goal: null };
  const actions = buildParentDailyActionDrafts({
    date: "2026-10-07",
    selectedBehaviors: [behavior],
    supportCards: [
      supportCard("task_refusal", "Task refusal", "parent_document", {
        conflict: true,
        conflictMessage: "Conflict detected. Clinician review recommended.",
        replacementSkill: "Use restraint when the task is refused.",
        prevention: ["Follow the disputed plan step."],
      }),
    ],
    logs: [],
  });

  assert.equal(actions.length, 3);
  assert.ok(actions.every((action) => action.status === "not_started"));
  assert.ok(actions.every((action) => action.sourceType === "starter_template"));
  assert.ok(actions.every((action) => action.sourceDocumentId === null));
  assert.ok(actions.every((action) => /Behavior Support Library|starter support/i.test(action.whyItMayHelp)));
  assert.ok(actions.every((action) => !/conflict|clinician review|restraint|disputed/i.test(`${action.title} ${action.description}`)));
  assert.ok(actions.every((action) => !action.steps.some((step) => /restraint|disputed plan/i.test(step))));
});

test("parent action dates accept real calendar days and reject malformed dates", () => {
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(normalizeParentActionDate("2024-02-29"), "2024-02-29");
  assert.equal(normalizeParentActionDate("not-a-date").match(/^\d{4}-\d{2}-\d{2}$/)?.[0] !== undefined, true);
  assert.equal(normalizeParentActionDate("2024-02-30"), today);
});
