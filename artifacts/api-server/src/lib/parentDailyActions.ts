import crypto from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  parentDailyActionLogsTable,
  parentDailyActionsTable,
  rewardTokensTable,
  type ParentDailyAction,
  type ParentDailyActionKind,
  type ParentDailyActionLog,
  type ParentDailyActionSource,
} from "@workspace/db";
import { parentBehaviorIdentity, type ParentBehavior } from "./parentAuth";
import { makeStarterCard, type SupportCard } from "./parentStarterLibrary";
import type { ParentPlanActivity } from "./parentStarterLibrary";

type ParentLogInput = {
  behaviorKey: string | null;
  customBehavior: string | null;
  whatHelped: string | null;
  createdAt: string | Date;
};

type DailyActionDraft = {
  actionDate: string;
  actionKey: string;
  kind: ParentDailyActionKind;
  behaviorKey: string | null;
  behaviorName: string;
  supportCardId: string | null;
  sourceType: ParentDailyActionSource;
  sourceDocumentId: string | null;
  title: string;
  description: string;
  whyItMayHelp: string;
  steps: string[];
  estimatedMinutes: number;
  status: "not_started" | "needs_review";
};

export type ParentPlanGoal = {
  id: string;
  title: string;
  description: string;
  milestones: string[];
  sourceType: "clinician_uploaded_plan" | "parent_uploaded_plan" | "selected_behavior";
};

const UNSAFE_PLAN_PRACTICE =
  /\b(restraint|seclusion|pin(?:ning)?|hold(?:ing)?\s+(?:down|still)|physical block(?:ing)?|punish(?:ment)?|extinction|force them)\b/i;

type PracticeActivity = {
  id: string;
  title: string;
  description: string;
  skill: string;
  minutes: number;
  ifHard: string;
};

const STARTER_PRACTICE_ACTIVITIES: Record<string, PracticeActivity[]> = {
  elopement: [
    { id: "stay-together-puzzle", title: "Puzzle Together", description: "Choose a small puzzle and work on it together at a table or on the floor. Notice staying in the same safe area.", skill: "Staying near a caregiver in one safe area", minutes: 5, ifHard: "Pause the activity and move to a calmer, safer place." },
    { id: "indoor-stop-and-return", title: "Indoor Stop-and-Return Game", description: "In a familiar room away from exits, take a few steps apart. Practice a familiar “stop” or “come back” cue once, then praise returning.", skill: "Responding to a familiar safety cue", minutes: 3, ifHard: "Skip the game and review the child’s existing safety plan." },
    { id: "stay-together-game", title: "Board Game at the Table", description: "Play a short matching or board game together at the table. Notice staying nearby; stop whenever either of you is ready.", skill: "Staying in one safe location", minutes: 5, ifHard: "Choose a shorter activity in a safer, familiar space." },
  ],
  task_refusal: [
    { id: "one-small-step", title: "One-Step Start", description: "Choose one tiny part of a familiar task, such as putting away one toy or writing one word. Offer help and notice any attempt.", skill: "Starting one manageable task step", minutes: 3, ifHard: "Make the step smaller or offer a break; do not insist on continuing." },
    { id: "first-then-choice", title: "First-Then Choice", description: "Offer two acceptable ways to begin one small task step, then say what comes next using a familiar first-then phrase.", skill: "Choosing how to start and understanding what comes next", minutes: 3, ifHard: "Pause and offer a break or help instead of repeating the request." },
    { id: "break-request", title: "Ask for a Break Practice", description: "Before an easy task, show the child’s familiar break signal or communication tool. Model it once and let them choose whether to practice.", skill: "Asking for a break using a familiar communication method", minutes: 3, ifHard: "Accept communication in any familiar form and pause the task." },
  ],
  meltdowns: [
    { id: "calm-space-tour", title: "Calm Space Tour", description: "During a calm moment, visit a familiar quiet space together and let your child choose one item they may want there.", skill: "Finding a familiar calm space and choosing a support", minutes: 3, ifHard: "Keep it brief; do not require your child to stay in the space." },
    { id: "feelings-match", title: "Feelings Match", description: "Look at a few familiar feeling pictures or words together. Invite your child to point to one, with no need to explain.", skill: "Noticing or communicating a feeling", minutes: 3, ifHard: "Put the cards away and return to a preferred, quiet activity." },
    { id: "calm-choice", title: "Choose a Calming Option", description: "Offer two calming options your child already knows, such as quiet time or a familiar sensory item. Let them choose or decline.", skill: "Communicating a calming preference", minutes: 3, ifHard: "Reduce demands and give space; do not press for a choice." },
  ],
  aggression: [
    { id: "help-signal", title: "Practice a Help Signal", description: "During an easy shared activity, model the child’s familiar way to ask for help. Pause so they can try it if they want.", skill: "Asking for help before frustration builds", minutes: 3, ifHard: "Offer help directly and pause the activity." },
    { id: "space-request", title: "Ask for Space Practice", description: "When everyone is calm, practice a familiar word, gesture, or communication button for asking for space.", skill: "Communicating a need for space", minutes: 3, ifHard: "Give space and stop the practice; do not move closer or prompt repeatedly." },
    { id: "safe-object", title: "Gentle Object Practice", description: "During a calm preferred activity, use a soft toy or pillow and model placing or touching it gently. Keep the practice optional.", skill: "Handling a soft object safely", minutes: 3, ifHard: "Put the object away and switch to a familiar calming option." },
  ],
  self_injury: [
    { id: "familiar-help-request", title: "Practice Asking for Help", description: "During an easy routine, model the child’s familiar way to ask for help or a break. Let them try once if they choose.", skill: "Communicating a need for help or a break", minutes: 3, ifHard: "Pause the routine and use only familiar supports from the child’s safety plan." },
    { id: "safe-sensory-choice", title: "Choose a Familiar Sensory Tool", description: "During a calm moment, offer two safe sensory options already used by your child and let them choose or decline.", skill: "Choosing a familiar calming support", minutes: 3, ifHard: "Remove the options and follow the child’s existing safety plan." },
    { id: "calm-space-tour", title: "Calm Space Tour", description: "When your child is calm, visit a familiar quiet space and identify one support they already use there.", skill: "Finding a familiar calm space", minutes: 3, ifHard: "Keep the visit brief and optional." },
  ],
  transition_difficulty: [
    { id: "timer-transition", title: "Timer Transition Practice", description: "For an easy change between two familiar activities, give a short warning and use a familiar timer or visual cue.", skill: "Preparing for a change in activity", minutes: 5, ifHard: "Offer more time or a familiar transition support; do not force the change for practice." },
    { id: "first-then-transition", title: "First-Then Routine", description: "Show a familiar first-then cue for one small routine, such as “first put away one toy, then snack.”", skill: "Understanding what comes next", minutes: 3, ifHard: "Simplify the next step or pause the transition." },
    { id: "transition-object", title: "Carry a Transition Object", description: "Let your child choose a small, safe item to carry while moving between two familiar activities.", skill: "Moving between familiar activities", minutes: 3, ifHard: "Stay with the current activity and try another time." },
  ],
  property_destruction: [
    { id: "put-down-practice", title: "Put It Down Practice", description: "During a calm moment, practice picking up one safe household item and placing it gently on a surface.", skill: "Handling and putting down objects safely", minutes: 3, ifHard: "Stop and move breakable items out of reach; offer a break." },
    { id: "ask-help-object", title: "Ask for Help With a Tricky Item", description: "Choose an easy toy or task together. Model the child’s familiar help signal if it becomes frustrating.", skill: "Asking for help before frustration builds", minutes: 3, ifHard: "Put the item away and pause the task." },
    { id: "soft-object-practice", title: "Practice With a Soft Object", description: "Use a soft toy or pillow in a calm activity and practice placing it down gently.", skill: "Using safe objects and gentle handling", minutes: 3, ifHard: "End the activity and choose a familiar calming option." },
  ],
  daily_living: [
    { id: "toothbrush-step", title: "One Toothbrush Step", description: "Practice one optional step in the familiar toothbrushing routine, such as picking up the toothbrush or putting it back.", skill: "Participating in one hygiene routine step", minutes: 3, ifHard: "Stop at the first sign of distress and try a smaller step another time." },
    { id: "shoes-step", title: "One Shoes Step", description: "Offer one small step in the familiar shoes routine, such as opening the shoe or placing it by the door.", skill: "Participating in one dressing routine step", minutes: 3, ifHard: "Offer help or pause; do not force the routine." },
    { id: "handwashing-step", title: "One Handwashing Step", description: "When it naturally fits, practice one familiar handwashing step, such as turning on the tap or rubbing hands together.", skill: "Participating in one handwashing step", minutes: 3, ifHard: "Pause and try a smaller step later." },
  ],
};

const CUSTOM_PRACTICE_ACTIVITIES: PracticeActivity[] = [
  { id: "familiar-help-signal", title: "Practice a Familiar Help Signal", description: "During an easy, preferred activity, model one communication signal your child already uses for help, a break, or more.", skill: "Communicating a need using a familiar method", minutes: 3, ifHard: "Stop prompting and continue with the preferred activity." },
  { id: "shared-preferred-activity", title: "Short Shared Activity", description: "Choose a familiar activity your child enjoys and spend a few minutes doing it together, following their lead.", skill: "Joining a familiar activity and communicating choices", minutes: 5, ifHard: "Give space or end the activity if it stops feeling comfortable." },
  { id: "one-small-routine-step", title: "One Small Routine Step", description: "Choose one easy step from a familiar daily routine and offer help or a choice about how to begin.", skill: "Starting one manageable routine step", minutes: 3, ifHard: "Pause and make the step smaller." },
];

type ActivityGuidance = { steps: string[]; reinforcementTarget: string };

const ACTIVITY_GUIDANCE: Record<string, ActivityGuidance> = {
  "stay-together-puzzle": {
    steps: ["Choose a familiar, easy puzzle in a child-approved safe area; keep exits clear and never use the puzzle to prevent leaving.", "Offer one or two pieces, model one turn, then pause and follow your child's lead.", "A familiar visual timer may show the activity's end, but do not require staying until it rings."],
    reinforcementTarget: "voluntarily joining, offering a piece, communicating, or returning by choice",
  },
  "indoor-stop-and-return": {
    steps: ["Only practice in a child-safe indoor area away from exits, stairs, and other hazards, and only if this fits the existing safety plan.", "When calm, invite one small movement toward a familiar object and use the child's familiar safety cue once.", "Notice a response or communication; never block, chase, or repeat the cue as a drill."],
    reinforcementTarget: "responding to the familiar cue or communicating a need",
  },
  "stay-together-game": {
    steps: ["Set out a short, familiar game in a safe place the child can freely leave.", "Take one brief turn, then offer the next turn or a break as a choice.", "End while the game is still comfortable rather than testing how long the child will stay."],
    reinforcementTarget: "choosing a turn, staying nearby by choice, or asking for a break",
  },
  "one-small-step": {
    steps: ["Pick one small part of a familiar task and put only the needed materials within reach.", "Offer help or a choice about how to begin; wait without repeating the request.", "Stop after the one step or when the child asks for a break."],
    reinforcementTarget: "starting, attempting, asking for help, or requesting a break",
  },
  "first-then-choice": {
    steps: ["Choose one easy task step and two acceptable ways to do it.", "State the familiar first-then sequence once, showing the next activity if that cue is already familiar.", "Let the child choose, request help, or decline; do not withhold a needed break."],
    reinforcementTarget: "making a choice, communicating, or trying the first step",
  },
  "break-request": {
    steps: ["Before an easy task, place the child's familiar break signal or communication tool within reach.", "Model the signal once, then pause; accept any familiar communication that means break.", "Honor the break promptly so the communication remains useful."],
    reinforcementTarget: "using any familiar break signal or communication",
  },
  "calm-space-tour": {
    steps: ["During a calm moment, identify a familiar quiet space the child can enter and leave freely.", "Invite the child to choose one item they already know or want there; do not add unfamiliar sensory items without caregiver approval.", "Explore briefly together, then let the child decide whether to stay, leave, or return later."],
    reinforcementTarget: "choosing an item, exploring the space, or communicating a preference",
  },
  "feelings-match": {
    steps: ["Choose two or three familiar feeling pictures or words and sit beside the child.", "Invite a point, look, gesture, or word; do not require an explanation or correction.", "Accept no response and put the materials away if the child is done."],
    reinforcementTarget: "noticing, pointing to, or communicating a feeling in any familiar way",
  },
  "calm-choice": {
    steps: ["Offer two calming options the child already knows and can safely use.", "Pause so the child can choose, communicate another option, or decline.", "Make the selected option available without requiring the child to demonstrate distress first."],
    reinforcementTarget: "choosing, communicating, or declining an option",
  },
  "help-signal": {
    steps: ["Begin an easy shared activity the child has chosen.", "Show the child's familiar help signal once, then pause long enough for them to respond if they want.", "Provide help when requested; do not create frustration to prompt the signal."],
    reinforcementTarget: "using a familiar help signal or asking for help",
  },
  "space-request": {
    steps: ["When everyone is calm, identify the child's familiar word, gesture, or communication button for space.", "Model it once from a comfortable distance, then pause.", "Honor the request by giving space; do not prompt repeatedly or move closer."],
    reinforcementTarget: "communicating a need for space or a break",
  },
  "safe-object": {
    steps: ["Choose a soft, familiar object during a calm, preferred activity.", "Model placing or touching it gently once, then let the child choose whether to try.", "Put it away and switch activities if either person is uncomfortable."],
    reinforcementTarget: "choosing the object or handling it safely by choice",
  },
  "familiar-help-request": {
    steps: ["During an easy routine, make the child's familiar help or break communication available.", "Model the signal once and pause; do not wait for distress or self-injury.", "Respond to the communication promptly and use only supports already in the safety plan."],
    reinforcementTarget: "using a familiar help or break signal",
  },
  "safe-sensory-choice": {
    steps: ["Offer two safe sensory options the child already uses and tolerates.", "Let the child choose, communicate another option, or decline.", "Keep the selected option available only while it remains comfortable and safe."],
    reinforcementTarget: "communicating a sensory preference or choosing to participate",
  },
  "timer-transition": {
    steps: ["Choose an easy transition between two familiar activities, not a difficult or urgent one.", "Give the familiar warning and show the timer or visual cue only if the child already uses it comfortably.", "Offer extra time, help, or a pause; do not force the transition for practice."],
    reinforcementTarget: "noticing the cue, communicating, or taking a voluntary transition step",
  },
  "first-then-transition": {
    steps: ["Choose one small transition the child already knows.", "Show or say the familiar first-then cue once and allow processing time.", "Offer help or a break if the child does not move on; do not repeat demands."],
    reinforcementTarget: "communicating about the transition or taking a voluntary next step",
  },
  "transition-object": {
    steps: ["Offer a small, safe familiar item the child may carry between two known activities.", "Let the child choose the item, another support, or no item.", "Move only when the child is ready and the transition is safe."],
    reinforcementTarget: "choosing a transition support or moving when ready",
  },
  "put-down-practice": {
    steps: ["During a calm moment, choose one safe, non-breakable household item.", "Model placing it gently on a nearby surface, then offer the child a turn without pressure.", "Stop if the child becomes uncomfortable; do not introduce breakable objects."],
    reinforcementTarget: "choosing to handle or put down the safe item gently",
  },
  "ask-help-object": {
    steps: ["Choose an easy, familiar toy or task together; avoid items that are likely to cause frustration.", "Make the child's familiar help signal available and model it once if useful.", "Respond to a help request promptly and put the item away if it becomes difficult."],
    reinforcementTarget: "asking for help or choosing to continue",
  },
  "soft-object-practice": {
    steps: ["Choose a familiar soft toy or pillow during a calm activity.", "Model placing it down gently; invite, but do not require, a turn.", "End the practice if the child is no longer comfortable."],
    reinforcementTarget: "choosing to handle or place the soft object gently",
  },
  "toothbrush-step": {
    steps: ["Use the familiar toothbrush routine and offer one optional step, such as picking up or putting away the brush.", "Offer help or a choice; do not move the brush into the child's mouth.", "Stop at any sign of discomfort and try a smaller step another time."],
    reinforcementTarget: "choosing or attempting the one optional routine step",
  },
  "shoes-step": {
    steps: ["Use the child's familiar shoes and offer one small step, such as opening a shoe or placing it by the door.", "Let the child choose help, another step, or to stop.", "Finish after the chosen step; do not require wearing the shoes for practice."],
    reinforcementTarget: "choosing or attempting one dressing step",
  },
  "handwashing-step": {
    steps: ["When handwashing naturally fits, offer one familiar step, such as turning on the tap or rubbing hands together.", "Model once or offer help if the child accepts it.", "Pause or stop if the water, sound, or routine is uncomfortable."],
    reinforcementTarget: "choosing or attempting one familiar handwashing step",
  },
  "familiar-help-signal": {
    steps: ["Start a familiar activity the child enjoys and keep the help, break, or more signal accessible.", "Model the signal once during a natural pause, then wait.", "Respond to the signal right away; do not turn the activity into a test."],
    reinforcementTarget: "using a familiar signal or communicating a choice",
  },
  "shared-preferred-activity": {
    steps: ["Offer a familiar activity the child enjoys and ask or observe how they want to begin.", "Join their play by copying or taking a simple turn, following their lead.", "Pause when they communicate, shift activities, or show they are finished."],
    reinforcementTarget: "initiating, sharing a turn, or communicating a preference",
  },
  "one-small-routine-step": {
    steps: ["Choose one easy step from a familiar routine, not a new or difficult task.", "Offer help or two acceptable ways to begin, then wait.", "Stop after that step or sooner if the child asks for a break."],
    reinforcementTarget: "choosing, starting, or asking for help with the step",
  },
};

function practiceActivitiesFor(behavior: Pick<ParentBehavior, "behaviorKey" | "behaviorName">): PracticeActivity[] {
  const identity = `${behavior.behaviorKey || ""} ${behavior.behaviorName || ""}`.normalize("NFKC").toLowerCase();
  if (identity.includes("elopement") || identity.includes("running away")) return STARTER_PRACTICE_ACTIVITIES.elopement;
  if (identity.includes("self_injury") || identity.includes("self-injury") || identity.includes("self injury")) return STARTER_PRACTICE_ACTIVITIES.self_injury;
  if (identity.includes("aggression")) return STARTER_PRACTICE_ACTIVITIES.aggression;
  if (identity.includes("meltdown") || identity.includes("dysregulation")) return STARTER_PRACTICE_ACTIVITIES.meltdowns;
  if (identity.includes("task_refusal") || identity.includes("task refusal")) return STARTER_PRACTICE_ACTIVITIES.task_refusal;
  if (identity.includes("transition")) return STARTER_PRACTICE_ACTIVITIES.transition_difficulty;
  if (identity.includes("property_destruction") || identity.includes("property destruction")) return STARTER_PRACTICE_ACTIVITIES.property_destruction;
  if (identity.includes("daily_living") || identity.includes("daily living") || identity.includes("hygiene")) return STARTER_PRACTICE_ACTIVITIES.daily_living;
  return CUSTOM_PRACTICE_ACTIVITIES;
}

function parseGoalMilestones(notes: string | null | undefined): string[] {
  if (typeof notes !== "string") return [];
  return notes.split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]\s*)/, "").trim())
    .filter((line) => line && !/^(?:plan milestones\b|no (?:explicit )?milestones\b)/i.test(line))
    .filter((line) => !UNSAFE_PLAN_PRACTICE.test(line))
    .map((line) => line.slice(0, 400))
    .slice(0, 8);
}

function parentFacingGoalText(goal: string): string {
  const normalized = goal.trim().replace(/[.!?]+$/g, "").toLocaleLowerCase();
  if (normalized === "no aversive behaviors") return "Use safe hands and safe objects";
  if (normalized === "reduce maladaptive behavior") return "Use a safer way to ask for help";
  if (normalized === "increase compliance") return "Complete one small step";
  return goal.trim();
}

export async function getParentPlanGoals(childId: string, ownerId?: string): Promise<ParentPlanGoal[]> {
  const rows = await db.select().from(rewardTokensTable).where(and(
    eq(rewardTokensTable.childId, childId),
    inArray(rewardTokensTable.source, ["document", "parent_document"]),
  )).orderBy(desc(rewardTokensTable.createdDate));
  const seen = new Set<string>();
  return rows.flatMap((row) => {
    if (ownerId?.startsWith("legacy-family:") && row.source === "parent_document" && row.parentId !== ownerId) return [];
    const title = row.goalTitle?.trim().slice(0, 500) || "";
    const key = title.normalize("NFKC").toLowerCase().replace(/\s+/g, " ");
    if (!title || seen.has(key)) return [];
    seen.add(key);
    return [{
      id: row.id,
      title,
      description: UNSAFE_PLAN_PRACTICE.test(`${title} ${row.goalDescription || ""}`)
        ? ""
        : row.goalDescription?.trim().slice(0, 3000) || "",
      milestones: parseGoalMilestones(row.milestoneNotes),
      sourceType: row.source === "document" ? "clinician_uploaded_plan" as const : "parent_uploaded_plan" as const,
    }];
  });
}

const SOURCE_PRIORITY: Record<ParentDailyActionSource, number> = {
  clinician_reviewed: 0,
  clinician_uploaded_plan: 1,
  parent_uploaded_plan: 2,
  recent_log_pattern: 3,
  selected_behavior: 4,
  starter_template: 5,
};

export function normalizeParentActionDate(requested?: string | null) {
  if (requested && /^\d{4}-\d{2}-\d{2}$/.test(requested)) {
    const parsed = new Date(`${requested}T00:00:00.000Z`);
    if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === requested) {
      return requested;
    }
  }
  return new Date().toISOString().slice(0, 10);
}

function sourceTypeFor(card: SupportCard): ParentDailyActionSource {
  switch (card.source) {
    case "clinician_reviewed": return "clinician_reviewed";
    case "clinician_document": return "clinician_uploaded_plan";
    case "parent_document": return "parent_uploaded_plan";
    default: return "starter_template";
  }
}

function identityForCard(card: Pick<SupportCard, "behaviorKey" | "behaviorName">) {
  return parentBehaviorIdentity({
    behaviorKey: card.behaviorKey,
    customBehavior: card.behaviorKey === "custom" ? card.behaviorName : null,
    behaviorName: card.behaviorName,
  });
}

function actionKey(kind: ParentDailyActionKind, behaviorIdentity: string, slot: string) {
  const stableIdentity = behaviorIdentity
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 170);
  return `${kind}:${stableIdentity || "selected"}:${slot}`.slice(0, 255);
}

function cleanSteps(values: Array<string | null | undefined>, limit = 3) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const step = typeof value === "string" ? value.trim() : "";
    const identity = step.toLocaleLowerCase();
    if (!step || seen.has(identity)) continue;
    seen.add(identity);
    result.push(step.slice(0, 600));
    if (result.length === limit) break;
  }
  return result;
}

function shortTitle(text: string, fallback: string) {
  const firstSentence = text.trim().split(/(?<=[.!?])\s+/)[0]?.replace(/[.!?]+$/g, "").trim();
  if (!firstSentence) return fallback;
  return firstSentence.length <= 78 ? firstSentence : `${firstSentence.slice(0, 75).trimEnd()}…`;
}

function cardDraft(
  card: SupportCard,
  date: string,
  kind: ParentDailyActionKind,
  slot: string,
  title: string,
  description: string,
  steps: string[],
  estimatedMinutes: number,
  status: "not_started" | "needs_review" = "not_started",
): DailyActionDraft {
  const sourceType = sourceTypeFor(card);
  return {
    actionDate: date,
    actionKey: actionKey(kind, identityForCard(card), slot),
    kind,
    behaviorKey: card.behaviorKey || null,
    behaviorName: card.behaviorName,
    supportCardId: card.id || null,
    sourceType,
    sourceDocumentId: card.sourceDocumentIds?.[0] || null,
    title,
    description,
    whyItMayHelp: `This step uses saved guidance for ${card.behaviorName}. Notice whether it fits your child and the situation; it may not help every time.`,
    steps,
    estimatedMinutes,
    status,
  };
}

function planActivityDraft(
  card: SupportCard,
  activity: ParentPlanActivity,
  date: string,
  childName: string,
): DailyActionDraft {
  const activityKey = crypto.createHash("sha256")
    .update([
      activity.sourceDocumentId,
      activity.title,
      activity.routineContext,
      activity.opportunity,
      activity.skill,
      activity.reinforcement || "",
    ].join("|"))
    .digest("hex")
    .slice(0, 20);
  const steps = cleanSteps([
    `In this routine: ${activity.routineContext}`,
    `Offer this opportunity: ${activity.opportunity}`,
    `Skill practiced: ${activity.skill}`,
    activity.reinforcement
      ? `Plan-listed reinforcement: ${activity.reinforcement}`
      : null,
  ], 4);
  return {
    actionDate: date,
    actionKey: actionKey("task", identityForCard(card), `plan-${activityKey}`),
    kind: "task",
    behaviorKey: card.behaviorKey || null,
    behaviorName: card.behaviorName,
    supportCardId: card.id || null,
    sourceType: activity.sourceType || sourceTypeFor(card),
    sourceDocumentId: activity.sourceDocumentId,
    title: activity.title,
    description: `${activity.routineContext}: ${activity.opportunity}`,
    whyItMayHelp: card.planGoal
      ? `This gives ${childName} a chance to practice ${activity.skill} during ${activity.routineContext}, supporting the plan goal: ${card.planGoal}`
      : `This gives ${childName} a chance to practice ${activity.skill} during ${activity.routineContext}, as described in the linked plan.`,
    steps,
    estimatedMinutes: 5,
    status: "not_started",
  };
}

function cardActivity(card: SupportCard, date: string, slot: string, activityText?: string): DailyActionDraft {
  if (card.conflict) {
    return cardDraft(
      card,
      date,
      "activity",
      slot,
      "Review the plan before trying an activity",
      card.conflictMessage || "The uploaded guidance needs review before you use plan-specific activities.",
      [],
      2,
      "needs_review",
    );
  }

  const step = activityText || cleanSteps(card.prevention, 1)[0];
  const reinforcement = card.reinforcementIdea?.trim();
  const title = step
    ? `Try: ${shortTitle(step, `an activity for ${card.behaviorName}`)}`
    : `Review support for ${card.behaviorName}`;
  const steps = cleanSteps([
    step,
    reinforcement ? `Notice and support this response: ${reinforcement}` : null,
  ]);
  return cardDraft(
    card,
    date,
    "activity",
    slot,
    title,
    step
      ? `Try this saved ${card.behaviorName} guidance in an ordinary routine. Do not create or provoke a difficult situation to practice it.`
      : `This support card does not include a specific activity step. Open the card to review its guidance for ${card.behaviorName}.`,
    steps,
    5,
  );
}

function cardPractice(card: SupportCard, date: string): DailyActionDraft {
  if (card.conflict) {
    return cardDraft(
      card,
      date,
      "practice",
      "practice-skill",
      "Review this skill with your clinician",
      card.conflictMessage || "The uploaded guidance needs review before you use plan-specific steps.",
      [],
      2,
      "needs_review",
    );
  }
  const skill = card.replacementSkill?.trim();
  if (!skill) {
    return cardDraft(
      card,
      date,
      "practice",
      "practice-skill",
      `Review a skill for ${card.behaviorName}`,
      `This support card does not include a specific replacement skill for ${card.behaviorName}.`,
      [],
      2,
      "needs_review",
    );
  }
  return cardDraft(
    card,
    date,
    "practice",
    "practice-skill",
    `Practice: ${shortTitle(skill, card.behaviorName)}`,
    `Practice this skill for ${card.behaviorName} during a calm moment, using only communication supports already familiar to your child.`,
    cleanSteps([skill], 1),
    3,
  );
}

function planGuidedPracticeDraft(
  card: SupportCard,
  selectedBehavior: ParentBehavior | undefined,
  date: string,
  childName: string,
): DailyActionDraft | null {
  const sourceDocumentId =
    card.planGoalSourceDocumentIds?.[0] || card.sourceDocumentIds?.[0] || null;
  const skill = cleanSteps([card.replacementSkill, ...card.prevention], 1)[0];
  if (!sourceDocumentId || !skill) return null;

  const activity = practiceActivitiesFor(card).find((candidate) =>
    /\b(break|help|communicat|signal|request)\b/i.test(skill)
      ? /break|help|signal|communication/i.test(`${candidate.title} ${candidate.skill}`)
      : /\b(stay|near|stop|boundary|return)\b/i.test(skill)
        ? /stay|stop|return|safe area/i.test(`${candidate.title} ${candidate.skill}`)
        : /\b(transition|move|next activity|warning)\b/i.test(skill)
          ? /transition|next|move/i.test(`${candidate.title} ${candidate.skill}`)
          : false,
  ) || practiceActivitiesFor(card)[0];
  if (!activity) return null;
  const goal = card.planGoal?.trim() || selectedBehavior?.goal?.trim() || "";
  const fingerprint = crypto.createHash("sha256")
    .update(`${sourceDocumentId}|${goal}|${skill}|${activity.id}`)
    .digest("hex")
    .slice(0, 20);
  return {
    actionDate: date,
    actionKey: actionKey("task", identityForCard(card), `plan-practice-${fingerprint}`),
    kind: "task",
    behaviorKey: card.behaviorKey || null,
    behaviorName: card.behaviorName,
    supportCardId: card.id || null,
    sourceType: sourceTypeFor(card),
    sourceDocumentId,
    title: activity.title,
    description: activity.description,
    whyItMayHelp: goal
      ? `Practices ${skill} and connects to ${childName}'s ${card.planGoal?.trim() ? "plan goal" : "saved goal"}: ${goal}`
      : `Practices the plan-listed skill: ${skill}`,
    steps: cleanSteps([
      `Skill practiced: ${skill}`,
      card.prevention?.[0] ? `Plan support: ${card.prevention[0]}` : null,
      card.reinforcementIdea ? `Plan-supported reinforcement: ${card.reinforcementIdea}` : null,
      `If it gets hard: ${activity.ifHard}`,
    ]),
    estimatedMinutes: activity.minutes,
    status: "not_started",
  };
}

function selectedGoalPracticeDraft(
  behavior: ParentBehavior,
  card: SupportCard,
  date: string,
  childName: string,
): DailyActionDraft[] {
  const savedGoal = behavior.goal?.trim() || "";
  const safeGoal = savedGoal && !UNSAFE_PLAN_PRACTICE.test(savedGoal) ? savedGoal : "";
  const displayGoal = safeGoal ? parentFacingGoalText(safeGoal) : "";
  const activities = practiceActivitiesFor(behavior);
  const goalTerms = safeGoal.toLocaleLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3);
  const ordered = [...activities].sort((left, right) => {
    const score = (activity: PracticeActivity) => goalTerms.filter((word) =>
      `${activity.title} ${activity.skill}`.toLocaleLowerCase().includes(word),
    ).length;
    return score(right) - score(left);
  });
  const seen = new Set<string>();
  return ordered.filter((activity) => {
    if (seen.has(activity.id)) return false;
    seen.add(activity.id);
    return true;
  }).map((activity) => ({
    actionDate: date,
    actionKey: actionKey("task", parentBehaviorIdentity(behavior), `starter-practice-${activity.id}`),
    kind: "task",
    behaviorKey: behavior.behaviorKey,
    behaviorName: behavior.behaviorName,
    supportCardId: card.id || null,
    sourceType: "starter_template",
    sourceDocumentId: null,
    title: activity.title,
    description: activity.description,
    whyItMayHelp: safeGoal
      ? `Practices ${activity.skill} and connects to ${childName}'s saved goal: ${displayGoal}`
      : `Practices ${activity.skill} during a familiar activity. This is starter support, not an individualized plan.`,
    steps: cleanSteps([
      ...(ACTIVITY_GUIDANCE[activity.id]?.steps || [
        `Set up the activity as described: ${activity.description}`,
        `Offer one voluntary chance to practice ${activity.skill.toLocaleLowerCase()}.`,
      ]),
      `Skill practiced: ${activity.skill}`,
      card.source !== "starter"
        ? card.reinforcementIdea?.trim()
          ? `Positive reinforcement from the support plan: ${card.reinforcementIdea.trim()}`
          : null
        : `Positive reinforcement: after your child ${ACTIVITY_GUIDANCE[activity.id]?.reinforcementTarget || `practices ${activity.skill.toLocaleLowerCase()}`}, give immediate, behavior-specific praise and, if you know it is welcome, a preferred item or activity. Do not assume physical touch is welcome or withhold breaks or communication.`,
      card.source === "starter" && card.prevention?.[0]
        ? `Starter support: ${card.prevention[0]}`
        : null,
      `If it gets hard: ${activity.ifHard}`,
    ], 7),
    estimatedMinutes: activity.minutes,
    status: "not_started",
  }));
}

function documentGoalDrafts(goal: ParentPlanGoal, date: string, childName: string): DailyActionDraft[] {
  const goalText = goal.title.trim();
  const displayGoal = parentFacingGoalText(goalText);
  const steps = goal.milestones.length
    ? goal.milestones
    : [goal.description.trim() || displayGoal];
  return steps.flatMap((step, index) => {
    const cleanStep = step.trim().slice(0, 400);
    if (!cleanStep || UNSAFE_PLAN_PRACTICE.test(`${goalText} ${cleanStep}`)) return [];
    const fingerprint = crypto.createHash("sha256")
      .update(`${goal.id}|${goalText}|${cleanStep}`)
      .digest("hex")
      .slice(0, 20);
    return [{
      actionDate: date,
      actionKey: actionKey("task", `plan-goal:${goal.id}`, `milestone-${index}-${fingerprint}`),
      kind: "task",
      behaviorKey: null,
      behaviorName: goalText,
      supportCardId: null,
      sourceType: goal.sourceType,
      sourceDocumentId: null,
      title: `Practice: ${shortTitle(cleanStep === goalText ? displayGoal : cleanStep, displayGoal)}`,
      description: goal.sourceType === "selected_behavior"
        ? "This activity supports a saved goal. Participation does not establish clinical mastery. Try one small step during a calm, safe, naturally occurring opportunity."
        : goal.milestones.length
        ? `This is a milestone read from the plan. Try it only in a calm, naturally occurring opportunity; do not create a difficult situation to practice.`
        : `Use a calm, naturally occurring opportunity to work toward this goal. Follow any specific steps in the uploaded plan; do not create a difficult situation to practice.`,
      whyItMayHelp: `Supports ${childName}'s plan goal: ${displayGoal}`,
      steps: cleanSteps([`Skill practiced: ${cleanStep}`]),
      estimatedMinutes: 5,
      status: "not_started",
    }];
  });
}

function recentHelpfulPattern(
  selected: ParentBehavior[],
  cards: SupportCard[],
  logs: ParentLogInput[],
  date: string,
): DailyActionDraft | null {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const groups = new Map<string, { text: string; behaviorKey: string | null; customBehavior: string | null; count: number }>();
  for (const log of logs) {
    const timestamp = new Date(log.createdAt).getTime();
    const text = typeof log.whatHelped === "string" ? log.whatHelped.trim() : "";
    if (!text || text.length > 180 || timestamp < cutoff) continue;
    if (/\b(restraint|hold them down|hit|punish|medicat|dose|ignore (?:all|the) safety|force them)\b/i.test(text)) continue;
    const key = text.toLocaleLowerCase().replace(/\s+/g, " ");
    const current = groups.get(key) || {
      text,
      behaviorKey: log.behaviorKey,
      customBehavior: log.customBehavior,
      count: 0,
    };
    current.count += 1;
    groups.set(key, current);
  }
  const match = [...groups.values()].sort((a, b) => b.count - a.count)[0];
  if (!match || match.count < 2) return null;

  const selectedBehavior = selected.find((behavior) =>
    behavior.behaviorKey === match.behaviorKey &&
    (behavior.behaviorKey !== "custom" ||
      parentBehaviorIdentity(behavior) === parentBehaviorIdentity({
        behaviorKey: "custom",
        customBehavior: match.customBehavior,
        behaviorName: match.customBehavior || "",
      })),
  );
  const card = cards.find((candidate) =>
    candidate.behaviorKey === match.behaviorKey &&
    (!match.customBehavior || identityForCard(candidate) === parentBehaviorIdentity({
      behaviorKey: "custom",
      customBehavior: match.customBehavior,
      behaviorName: match.customBehavior,
    })),
  );
  const behaviorName = selectedBehavior?.behaviorName || card?.behaviorName || match.customBehavior || "your child";
  const identity = selectedBehavior
    ? parentBehaviorIdentity(selectedBehavior)
    : card
      ? identityForCard(card)
      : "recent-log-pattern";
  return {
    actionDate: date,
    actionKey: actionKey("task", identity, "repeated-log"),
    kind: "task",
    behaviorKey: match.behaviorKey,
    behaviorName,
    supportCardId: card?.id || null,
    sourceType: "recent_log_pattern",
    sourceDocumentId: null,
    title: "Try what helped before",
    description: match.text,
    whyItMayHelp: "You noted this as helpful more than once. See whether it is useful again today.",
    steps: [match.text],
    estimatedMinutes: 5,
    status: "not_started",
  };
}

export function buildParentDailyActionDrafts(input: {
  date: string;
  childName?: string;
  selectedBehaviors: ParentBehavior[];
  supportCards: SupportCard[];
  planGoals?: ParentPlanGoal[];
  logs: ParentLogInput[];
}): DailyActionDraft[] {
  const activeIdentities = new Set(input.selectedBehaviors.map(parentBehaviorIdentity));
  const recentLogRank = new Map<string, number>();
  const recentLogs = [...input.logs]
    .filter((log) => Date.now() - new Date(log.createdAt).getTime() <= 30 * 24 * 60 * 60 * 1000)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  for (const log of recentLogs) {
    const identity = parentBehaviorIdentity({
      behaviorKey: log.behaviorKey,
      customBehavior: log.customBehavior,
      behaviorName: log.customBehavior || log.behaviorKey || "",
    } as ParentBehavior);
    if (!recentLogRank.has(identity)) recentLogRank.set(identity, recentLogRank.size);
  }
  const cards = input.supportCards
    .filter((card) => activeIdentities.has(identityForCard(card)) || card.source !== "starter")
    .sort((a, b) =>
      SOURCE_PRIORITY[sourceTypeFor(a)] - SOURCE_PRIORITY[sourceTypeFor(b)] ||
      (recentLogRank.get(identityForCard(a)) ?? Number.MAX_SAFE_INTEGER) -
        (recentLogRank.get(identityForCard(b)) ?? Number.MAX_SAFE_INTEGER),
    )
    .filter((card, index, sorted) =>
      sorted.findIndex((candidate) => identityForCard(candidate) === identityForCard(card)) === index,
    );
  const activitiesByCard = cards.map((card, index) => {
    const selectedBehavior = input.selectedBehaviors.find(
      (behavior) => parentBehaviorIdentity(behavior) === identityForCard(card),
    );
    if (card.conflict) {
      if (!selectedBehavior) return [];
      const libraryCard = makeStarterCard(
        selectedBehavior.behaviorKey,
        selectedBehavior.customBehavior,
        selectedBehavior.goal,
      );
      return selectedGoalPracticeDraft(
        selectedBehavior,
        libraryCard,
        input.date,
        input.childName?.trim() || "your child",
      );
    }
    const planActivities = (card.dailyActivities || []).map((activity) =>
      planActivityDraft(card, activity, input.date, input.childName?.trim() || "your child"),
    );
    if (planActivities.length) return planActivities;

    if (card.source !== "starter") {
      const practice = planGuidedPracticeDraft(
        card,
        selectedBehavior,
        input.date,
        input.childName?.trim() || "your child",
      );
      if (practice) return [practice];
    }
    return selectedBehavior
      ? selectedGoalPracticeDraft(
          selectedBehavior,
          card,
          input.date,
          input.childName?.trim() || "your child",
        )
      : [];
  });
  const cardGoalKeys = new Set(cards
    .map((card) => card.planGoal?.trim())
    .filter((goal): goal is string => Boolean(goal))
    .map((goal) => goal.normalize("NFKC").toLowerCase().replace(/\s+/g, " ")));
  const documentGoalGroups = (input.planGoals || [])
    .filter((goal) => !cardGoalKeys.has(goal.title.normalize("NFKC").toLowerCase().replace(/\s+/g, " ")))
    .map((goal) => documentGoalDrafts(goal, input.date, input.childName?.trim() || "your child"))
    .filter((group) => group.length > 0);

  // Round-robin across selected support areas so one child goal cannot crowd out the rest.
  const actions: DailyActionDraft[] = [];
  const seenActionKeys = new Set<string>();
  for (let activityIndex = 0; actions.length < 5; activityIndex += 1) {
    let added = false;
    for (const activities of [...documentGoalGroups, ...activitiesByCard]) {
      const action = activities[activityIndex];
      if (!action || seenActionKeys.has(action.actionKey)) continue;
      seenActionKeys.add(action.actionKey);
      actions.push(action);
      added = true;
      if (actions.length === 5) break;
    }
    if (!added) break;
  }
  return actions;
}

function serializeLog(log: ParentDailyActionLog) {
  return {
    id: log.id,
    actionId: log.actionId,
    taskId: log.taskId ?? null,
    activityId: log.activityId ?? null,
    childId: log.childId,
    eventType: log.eventType,
    rating: log.rating ?? null,
    outcome: log.outcome ?? null,
    note: log.note ?? null,
    createdAt: log.createdAt.toISOString(),
  };
}

function serializeAction(action: ParentDailyAction, logs: ParentDailyActionLog[]) {
  return {
    id: action.id,
    childId: action.childId,
    actionDate: action.actionDate,
    actionKey: action.actionKey,
    kind: action.kind,
    behaviorKey: action.behaviorKey ?? null,
    behaviorName: action.behaviorName,
    supportCardId: action.supportCardId ?? null,
    sourceType: action.sourceType,
    sourceDocumentId: action.sourceDocumentId ?? null,
    title: action.title,
    description: action.description,
    whyItMayHelp: action.whyItMayHelp,
    steps: action.steps || [],
    estimatedMinutes: action.estimatedMinutes,
    status: action.status,
    currentStep: 0,
    bookmarked: action.status === "saved_for_later",
    completedAt: action.completedAt?.toISOString() ?? null,
    loggedAt: action.loggedAt?.toISOString() ?? null,
    createdAt: action.createdAt.toISOString(),
    logs: logs.map(serializeLog),
  };
}

export async function getOrCreateParentDailyActions(input: {
  parentId: string;
  parentUserId: string;
  childId: string;
  childName?: string;
  workspaceId: string;
  date: string;
  selectedBehaviors: ParentBehavior[];
  supportCards: SupportCard[];
  planGoals?: ParentPlanGoal[];
  logs: ParentLogInput[];
}) {
  const drafts = buildParentDailyActionDrafts(input);
  for (const draft of drafts) {
    const now = new Date();
    // Refresh existing same-day activity copy for returning and demo accounts.
    // The update deliberately omits status and timestamps so logs remain intact.
    await db.insert(parentDailyActionsTable).values({
      id: crypto.randomUUID(),
      parentId: input.parentId,
      parentUserId: input.parentUserId,
      childId: input.childId,
      workspaceId: input.workspaceId,
      ...draft,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: [
        parentDailyActionsTable.parentId,
        parentDailyActionsTable.childId,
        parentDailyActionsTable.actionDate,
        parentDailyActionsTable.actionKey,
      ],
      set: {
        parentUserId: input.parentUserId,
        workspaceId: input.workspaceId,
        kind: draft.kind,
        behaviorKey: draft.behaviorKey,
        behaviorName: draft.behaviorName,
        supportCardId: draft.supportCardId,
        sourceType: draft.sourceType,
        sourceDocumentId: draft.sourceDocumentId,
        title: draft.title,
        description: draft.description,
        whyItMayHelp: draft.whyItMayHelp,
        steps: draft.steps,
        estimatedMinutes: draft.estimatedMinutes,
        updatedAt: now,
      },
    });
  }

  const rows = await db
    .select()
    .from(parentDailyActionsTable)
    .where(and(
      eq(parentDailyActionsTable.parentId, input.parentId),
      eq(parentDailyActionsTable.childId, input.childId),
      eq(parentDailyActionsTable.actionDate, input.date),
    ))
    .orderBy(desc(parentDailyActionsTable.createdAt));
  const visibleKeys = new Set(drafts.map((draft) => draft.actionKey));
  const currentRows = rows.filter((row) => visibleKeys.has(row.actionKey));
  const rowsByKey = new Map(currentRows.map((row) => [row.actionKey, row]));
  const orderedRows = drafts.map((draft) => rowsByKey.get(draft.actionKey)).filter((row): row is ParentDailyAction => Boolean(row));
  const ids = orderedRows.map((row) => row.id);
  const logRows = ids.length
    ? await db.select().from(parentDailyActionLogsTable)
        .where(inArray(parentDailyActionLogsTable.actionId, ids))
        .orderBy(desc(parentDailyActionLogsTable.createdAt))
    : [];
  const logsByAction = new Map<string, ParentDailyActionLog[]>();
  for (const log of logRows) {
    const actionLogs = logsByAction.get(log.actionId) || [];
    actionLogs.push(log);
    logsByAction.set(log.actionId, actionLogs);
  }
  return orderedRows.map((row) => serializeAction(row, logsByAction.get(row.id) || []));
}

export { serializeAction as serializeParentDailyAction, serializeLog as serializeParentDailyActionLog };
