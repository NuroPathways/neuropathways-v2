import test from "node:test";
import assert from "node:assert/strict";
import {
  buildParentDailyActionDrafts,
  careTeamActivityLibrary,
  normalizeParentActionDate,
  parentDailyActionActivityDetails,
  parentDailyActionInstructionCount,
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
  relatedGoal: "Independently requests a break during homework",
  reinforcement: "Provide the planned break after the request",
  estimatedMinutes: 5,
  materials: ["Familiar break card"],
  startAction: "Place the familiar break card beside the homework.",
  steps: [
    "Point to the card before starting one short homework item.",
    "Pause so the child can use the card or decline to practice.",
  ],
  ending: "End after one request or when the child signals they are done.",
  pauseConditions: ["Pause the homework if the child becomes distressed."],
  observationPrompts: ["Notice whether the card was offered before the task."],
  sourceDocumentId: "parent-plan-1",
  sourceExcerpt: "During homework, practice requesting a break with the break card.",
  sourceType: "parent_uploaded_plan",
  readiness: "ready",
  readinessReasons: [],
  sourceExcerptVerified: true,
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

  assert.equal(actions.length, 5);
  assert.equal(actions[0].kind, "task");
  assert.equal(actions[0].sourceType, "parent_uploaded_plan");
  assert.equal(actions[0].sourceDocumentId, "parent-plan-1");
  assert.equal(actions[0].title, "Practice requesting a break");
  assert.deepEqual(actions[0].steps, [
    "Start: Place the familiar break card beside the homework.",
    "Activity step 1: Point to the card before starting one short homework item.",
    "Activity step 2: Pause so the child can use the card or decline to practice.",
    "Skill practiced: Requests a break using the card",
    "Related goal: Independently requests a break during homework",
    "Finish: End after one request or when the child signals they are done.",
    "Pause or stop if: Pause the homework if the child becomes distressed.",
    "Materials: Familiar break card",
    "Optional observation: Notice whether the card was offered before the task.",
    "Plan-listed reinforcement: Provide the planned break after the request",
  ]);
  assert.match(actions[0].whyItMayHelp, /Maya/);
  assert.match(actions[0].whyItMayHelp, /Independently requests a break during homework/);
  assert.match(actions[0].steps.join(" "), /Requests a break using the card/);
  assert.ok(actions.slice(1).every((action) => action.sourceType === "starter_template"));
});

test("daily actions round-robin across selected behaviors and cap the list at five plan activities", () => {
  const firstBehavior = selectedBehavior("task_refusal", "Task refusal");
  const secondBehavior = selectedBehavior("sleep_problems", "Sleep problems");
  const makeActivity = (title: string): ParentPlanActivity => ({
    ...breakRequestActivity,
    title,
    routineContext: `During ${title.toLowerCase()}`,
    opportunity: `Offer ${title.toLowerCase()} during a familiar activity`,
    startAction: `Set up the familiar materials for ${title.toLowerCase()}.`,
    steps: [
      `Offer one voluntary step for ${title.toLowerCase()}.`,
      "Wait for the child to respond, and follow their lead.",
    ],
    ending: "End after one turn or when the child signals they are done.",
    pauseConditions: ["Pause if the child becomes distressed."],
    sourceDocumentId: "clinician-plan-1",
    sourceType: "clinician_reviewed",
    reinforcement: null,
    relatedGoal: null,
    readiness: "ready",
    readinessReasons: [],
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

test("general starter activities are practical and do not derive from selected behavior or goal", () => {
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
  const noBehavior = buildParentDailyActionDrafts({
    date: "2026-10-07",
    selectedBehaviors: [],
    supportCards: [],
    logs: [],
  });
  assert.equal(actions.length, 5);
  assert.deepEqual(actions.map((action) => action.title), noBehavior.map((action) => action.title));
  assert.deepEqual(actions.map((action) => action.actionKey), noBehavior.map((action) => action.actionKey));
  assert.deepEqual(actions.map((action) => action.title), [
    "Puzzle Together",
    "Find the Matching Pairs",
    "Choose Between Two Activities",
    "Finished Basket",
    "Five Minutes of Child-Led Play",
  ]);
  assert.ok(actions.every((action) => action.sourceType === "starter_template"));
  assert.ok(actions.every((action) => action.behaviorKey === null));
  assert.ok(actions.every((action) => action.behaviorName === "General activity"));
  assert.ok(actions.every((action) => action.supportCardId === null));
  assert.ok(actions.every((action) => action.whyItMayHelp === ""));
  assert.ok(actions.every((action) => action.sourceDocumentId === null));
  assert.ok(actions.every((action) => action.steps.some((step) => step.startsWith("Pause or stop if:"))));
  assert.ok(actions.every((action) => !action.steps.some((step) => step.includes(repeatedNote))));
  assert.ok(actions.every((action) => !action.steps.some((step) => step.startsWith("Related goal:"))));
});

test("general starter activities have complete simple directions, materials, endings, and research limitations", () => {
  const actions = buildParentDailyActionDrafts({
    date: "2026-10-07",
    selectedBehaviors: [],
    supportCards: [],
    logs: [],
  });

  assert.equal(actions.length, 5);
  for (const action of actions) {
    assert.ok(action.title.length > 4);
    assert.match(action.description, /Optional general activity/);
    assert.ok(action.steps.some((step) => step.startsWith("Start: ")));
    assert.equal(action.steps.filter((step) => /^Activity step \d+:/.test(step)).length, 3);
    assert.ok(action.steps.some((step) => step.startsWith("Skill practiced: ")));
    assert.ok(action.steps.some((step) => step.startsWith("Finish: ")));
    assert.ok(action.steps.some((step) => step.startsWith("Pause or stop if: ")));
    assert.equal(action.sourceType, "starter_template");
    assert.equal(action.sourceDocumentId, null);
    assert.doesNotMatch(`${action.title} ${action.steps.join(" ")}`, /^Practice:|Practice goal \d/i);
    const details = parentDailyActionActivityDetails(action);
    assert.ok(details);
    assert.equal(details.steps.length, 3);
    assert.equal(parentDailyActionInstructionCount(action), 3);
    assert.ok(details.materials.length > 0);
    assert.ok(details.ending.length > 10);
    assert.ok(details.ifDifficult.length > 10);
    assert.equal(details.relatedGoal, null);
    assert.match(details.researchNote, /do not show that this individual activity is an effective treatment/i);
    assert.ok(details.evidenceReferences.length > 0);
    for (const step of details.steps) {
      assert.ok(step.split(/[.!?]/).filter(Boolean).length <= 2, `${action.title} has a long multi-sentence step`);
    }
  }
});

test("starter activities remain the same across behavior types and never create a safety drill", () => {
  const makeActions = (behaviorKey: string, behaviorName: string) => buildParentDailyActionDrafts({
    date: "2026-10-07",
    selectedBehaviors: [selectedBehavior(behaviorKey, behaviorName)],
    supportCards: [makeStarterCard(behaviorKey, null, "Use a safe replacement")],
    logs: [],
  });
  const elopement = makeActions("elopement", "Elopement / Running Away");
  const selfInjury = makeActions("self_injury", "Self-Injury");
  assert.deepEqual(elopement.map((action) => action.title), selfInjury.map((action) => action.title));
  const content = elopement.map((action) => `${action.title} ${action.description} ${action.steps.join(" ")}`).join(" ");
  assert.doesNotMatch(content, /stop-and-return|rehearsal|exit practice|restraint|physical block|create a difficult situation/i);
});

test("an unselected conflicted plan stays out of family-facing activities while general ideas remain available", () => {
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

  assert.equal(actions.length, 5);
  assert.ok(actions.every((action) => action.sourceType === "starter_template"));
  assert.ok(actions.every((action) => action.sourceDocumentId === null));
  assert.ok(actions.every((action) => !/conflict|clinician review/i.test(`${action.title} ${action.description}`)));
});

test("an unselected plan-discovered goal is not turned into an activity", () => {
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

  assert.equal(actions.length, 5);
  assert.ok(actions.every((action) => action.sourceType === "starter_template"));
  assert.ok(actions.every((action) => !/Requesting breaks|Request a break independently/i.test(`${action.title} ${action.description} ${action.steps.join(" ")}`)));
});

test("unselected plan activity stays out of Practice unless a clinician explicitly assigns it", () => {
  const unselected = supportCard("task_refusal", "Task refusal", "parent_document", {
    dailyActivities: [breakRequestActivity],
  });
  const unselectedActions = buildParentDailyActionDrafts({
    date: "2026-10-07",
    selectedBehaviors: [],
    supportCards: [unselected],
    logs: [],
  });
  assert.equal(unselectedActions.length, 5);
  assert.ok(unselectedActions.every((action) => action.sourceType === "starter_template"));
  assert.ok(unselectedActions.every((action) => action.title !== breakRequestActivity.title));

  const assignedActivity: ParentPlanActivity = {
    ...breakRequestActivity,
    sourceType: "clinician_uploaded_plan",
    assignedBy: "clinician-1",
    assignedAt: "2026-10-07T09:00:00.000Z",
  };
  const assigned = buildParentDailyActionDrafts({
    date: "2026-10-07",
    selectedBehaviors: [],
    supportCards: [
      supportCard("task_refusal", "Task refusal", "clinician_document", {
        sourceDocumentIds: ["parent-plan-1"],
        dailyActivities: [assignedActivity],
      }),
    ],
    logs: [],
  });
  assert.equal(assigned.length, 5);
  assert.equal(assigned[0].title, breakRequestActivity.title);
  assert.equal(assigned[0].sourceType, "clinician_uploaded_plan");
  assert.ok(assigned.slice(1).every((action) => action.sourceType === "starter_template"));
});

test("clinician goals and milestones remain separate from general starter activities", () => {
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

  assert.equal(actions.length, 5);
  assert.ok(actions.every((action) => action.sourceType === "starter_template"));
  assert.ok(actions.every((action) => !/Request a break during homework|Use the break card before/i.test(`${action.title} ${action.description} ${action.steps.join(" ")}`)));
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

  assert.equal(actions.length, 5);
  assert.ok(actions.every((action) => !/restraint|hold the child down|comply/i.test(`${action.title} ${action.description} ${action.steps.join(" ")}`)));
});

test("clinical-sounding placeholder goals are not turned into practice activities", () => {
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
  assert.equal(actions.length, 5);
  assert.ok(actions.every((action) => !/No aversive behaviors|Use safe hands and safe objects/i.test(`${action.title} ${action.description} ${action.steps.join(" ")}`)));
});

test("conflicted plan guidance never generates behavior-specific practice", () => {
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

  assert.equal(actions.length, 5);
  assert.ok(actions.every((action) => action.status === "not_started"));
  assert.ok(actions.every((action) => action.sourceType === "starter_template"));
  assert.ok(actions.every((action) => action.sourceDocumentId === null));
  assert.ok(actions.every((action) => action.behaviorKey === null));
  assert.ok(actions.every((action) => action.behaviorName === "General activity"));
  assert.ok(actions.every((action) => !/conflict|clinician review|restraint|disputed/i.test(`${action.title} ${action.description}`)));
  assert.ok(actions.every((action) => !action.steps.some((step) => /restraint|disputed plan/i.test(step))));
});

test("parent action dates accept real calendar days and reject malformed dates", () => {
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(normalizeParentActionDate("2024-02-29"), "2024-02-29");
  assert.equal(normalizeParentActionDate("not-a-date").match(/^\d{4}-\d{2}-\d{2}$/)?.[0] !== undefined, true);
  assert.equal(normalizeParentActionDate("2024-02-30"), today);
});

test("curated clinician activity library includes research and safety metadata across all requested domains", () => {
  const library = careTeamActivityLibrary();
  assert.ok(library.length >= 35);
  assert.equal(new Set(library.map((item) => item.id)).size, library.length);
  assert.deepEqual(
    new Set(library.map((item) => item.skillDomain)),
    new Set(["communication", "transitions", "daily_living", "social_play", "coping", "parent_preparation"]),
  );
  for (const item of library) {
    assert.ok(item.appropriateContexts.length > 0, `${item.id} needs a use context`);
    assert.ok(item.requiredInformation.length > 0, `${item.id} needs prerequisites`);
    assert.ok(item.materials.trim(), `${item.id} needs materials guidance`);
    assert.ok(item.steps.length > 0, `${item.id} needs concrete steps`);
    assert.ok(item.stopConditions.length > 0, `${item.id} needs stop conditions`);
    assert.ok(item.evidenceReferences.length > 0, `${item.id} needs research context`);
    assert.ok(item.exclusionCriteria.length > 0, `${item.id} needs exclusions`);
    assert.ok(item.personalizationFields.length > 0, `${item.id} needs personalization fields`);
    assert.equal(item.sourceClassification, "general_starter");
    assert.doesNotMatch(`${item.source} ${item.description}`, /licensed curriculum|clinician-approved plan/i);
  }
  assert.ok(library.some((item) => item.title === "Choose Between Two Activities"));
  assert.ok(library.some((item) => item.title === "Use a Familiar AAC Choice"));
  assert.ok(library.some((item) => item.title === "Gather Familiar Supports"));
  const safetyRehearsal = library.find((item) => item.id === "indoor-stop-and-return");
  assert.equal(safetyRehearsal?.riskTier, "requires_authorized_plan");
  assert.equal(safetyRehearsal?.requiresClinicianConfirmation, true);
});

test("general parent starter suggestions do not include activities requiring a child-specific plan", () => {
  const actions = buildParentDailyActionDrafts({
    date: "2026-10-07",
    selectedBehaviors: [selectedBehavior("elopement", "Elopement")],
    supportCards: [makeStarterCard("elopement", null, "Use a safe replacement")],
    logs: [],
  });
  assert.ok(actions.length > 0);
  assert.ok(actions.every((action) => action.sourceType === "starter_template"));
  assert.doesNotMatch(actions.map((action) => `${action.title} ${action.steps.join(" ")}`).join(" "), /stop-and-return|rehearsal|exit practice/i);
});
