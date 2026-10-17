export type StarterTemplate = {
  key: string;
  name: string;
  description: string;
  whatMayBeHappening: string;
  rightNow: string[];
  avoid: string[];
  prevention: string[];
  replacementSkill: string;
  reinforcementIdea: string;
  seekHelp: string;
  track: string[];
  relatedGoals: string[];
};

export type SourceReference = { documentId: string; title: string; excerpt: string | null };
export type ParentPlanActivitySource = "clinician_reviewed" | "clinician_uploaded_plan" | "parent_uploaded_plan";
export type ParentPlanActivity = {
  title: string;
  routineContext: string;
  opportunity: string;
  skill: string;
  reinforcement: string | null;
  sourceDocumentId: string;
  sourceExcerpt: string;
  sourceType: ParentPlanActivitySource;
  contentVersion?: string;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  assignedBy?: string | null;
  assignedAt?: string | null;
};
export type SupportCard = {
  id: string;
  behaviorKey: string;
  behaviorName: string;
  goal: string | null;
  planGoal?: string | null;
  planGoalSourceDocumentIds: string[];
  planGoalSourceReferences: SourceReference[];
  source: "starter" | "parent_document" | "clinician_document" | "clinician_reviewed";
  sourceDocumentIds: string[];
  sourceReferences: SourceReference[];
  conflict: boolean;
  conflictMessage: string | null;
  whatMayBeHappening: string;
  rightNow: string[];
  avoid: string[];
  prevention: string[];
  replacementSkill: string;
  reinforcementIdea: string;
  seekHelp: string;
  track: string[];
  relatedGoals: string[];
  dailyActivities?: ParentPlanActivity[];
  reviewedBy: string | null;
  reviewedAt: string | null;
};

export const starterLibrary: StarterTemplate[] = [
  {
    key: "elopement",
    name: "Elopement / Running Away",
    description: "Leaving the area, bolting, or moving toward unsafe places.",
    whatMayBeHappening: "Your child may be trying to get away from a demand, reach something they want, avoid overwhelm, or respond to sensory overload. These are possibilities, not a conclusion about why it is happening.",
    rightNow: [
      "Move yourself and other people toward a safer place and call emergency services if there is immediate danger.",
      "Use a calm, short safety phrase such as “Stop” or “Come back.”",
      "Reduce talking and demands while you focus on safety.",
      "When your child is safe, offer one simple choice or a familiar calming option.",
    ],
    avoid: [
      "Do not yell long explanations from far away.",
      "Avoid turning a chase into a game when it is safe to use another approach.",
      "Do not add new demands while your child is still in an unsafe place.",
      "Do not use physical restraint; use your child’s written safety plan and emergency support when needed.",
    ],
    prevention: [
      "Use a short transition warning or visual cue before leaving.",
      "Plan ahead for exits, parking lots, water, and other high-risk places.",
      "Practice a simple stop or help signal during calm moments.",
      "Notice and praise staying close or returning safely.",
    ],
    replacementSkill: "Practice asking for a break or help, using a familiar safety signal, or stopping at a clearly marked boundary.",
    reinforcementIdea: "Notice and praise staying near a caregiver, stopping when called, or returning to a safe place.",
    seekHelp: "If your child moves toward traffic, water, an exit, or another immediate danger, contact emergency services. Ask your child’s clinician to help make an individualized safety plan.",
    track: ["Where it happened", "What happened right before", "Where your child was trying to go", "What helped everyone get to safety", "Any immediate safety concern"],
    relatedGoals: ["Stay near caregiver", "Stop when called", "Use a safety cue", "Ask for a break before leaving"],
  },
  {
    key: "self_injury",
    name: "Self-Injury",
    description: "Head hitting, biting, scratching, or other unsafe self-directed behavior.",
    whatMayBeHappening: "Your child may be overwhelmed, frustrated, unable to communicate, in pain, or reacting to a demand or sensory experience. A health professional can help check for pain or other medical causes.",
    rightNow: [
      "Move nearby dangerous objects away and make space for your child.",
      "Use a calm, low voice and fewer words.",
      "Offer a familiar safe alternative or communication support if one is already part of the plan.",
      "If there is serious injury or immediate danger, contact emergency services or urgent medical help.",
      "Follow the child’s written safety plan; do not attempt a hold, restraint, or physical block unless specifically trained and authorized in that plan.",
    ],
    avoid: [
      "Do not yell, punish, or ask many questions during an intense moment.",
      "Do not ignore a serious injury risk.",
      "Do not introduce a new physical safety technique or restraint.",
    ],
    prevention: [
      "Notice early signs of stress and offer a break or help before things intensify.",
      "Use communication supports and familiar routines.",
      "Consider whether tiredness, hunger, pain, or sensory overload may be involved.",
      "Ask the clinician or health professional about repeated or changing self-injury.",
    ],
    replacementSkill: "When calm, practice a safe way to ask for help or a break, or use a communication card already approved for your child.",
    reinforcementIdea: "Recognize safe communication and use of a familiar replacement skill.",
    seekHelp: "Get urgent medical help for a serious injury, possible head injury, difficulty breathing, or immediate danger. Contact the child’s clinician about repeated or escalating self-injury.",
    track: ["What the behavior looked like", "Intensity and duration", "What happened right before", "Any injury or health concern", "What helped your child feel safer"],
    relatedGoals: ["Use a safe replacement behavior", "Ask for help", "Use a familiar calming strategy", "Move to a safer space"],
  },
  {
    key: "aggression",
    name: "Aggression",
    description: "Hitting, kicking, biting, throwing, or other unsafe physical behavior.",
    whatMayBeHappening: "Your child may be overwhelmed, frustrated, unable to communicate a need, or struggling with a situation. This does not identify the cause; patterns and health concerns should be discussed with the child’s clinician.",
    rightNow: [
      "Create space and move other people and unsafe objects away when you can do so safely.",
      "Use a calm, brief phrase and reduce extra demands.",
      "Offer one familiar option such as help, space, or a break.",
      "If someone is in immediate danger, move to safety and call emergency services.",
    ],
    avoid: [
      "Do not argue, lecture, threaten, crowd, or raise your voice.",
      "Avoid repeating the same demand rapidly.",
      "Do not use physical restraint or an unfamiliar safety technique.",
    ],
    prevention: [
      "Notice situations that often happen before unsafe behavior.",
      "Use clear choices and prepare for changes or denied access.",
      "Practice asking for help, space, or a break when everyone is calm.",
      "Reinforce safe communication early.",
    ],
    replacementSkill: "Practice asking for help, space, or a break using words, gestures, or a familiar communication tool.",
    reinforcementIdea: "Notice safe hands, asking for help, or moving away to get space.",
    seekHelp: "If someone is injured or cannot be kept safe, get emergency support. Ask the child’s clinician for an individualized plan if this is severe or recurring.",
    track: ["Who was nearby", "What happened right before", "What your child may have needed", "How long it lasted", "What helped people get safe"],
    relatedGoals: ["Use words or gestures instead of hitting", "Ask for space", "Use familiar calm-down steps", "Keep hands safe"],
  },
  {
    key: "meltdowns",
    name: "Meltdowns",
    description: "Crying, screaming, shutting down, dropping to the floor, or becoming overwhelmed.",
    whatMayBeHappening: "Your child may be overloaded, anxious, tired, frustrated, or unable to process more demands right now. The reason may not be clear in the moment.",
    rightNow: [
      "Use fewer words and a calm voice.",
      "Lower noise or light if that is comfortable and possible.",
      "Give space while keeping the area safe.",
      "Offer one familiar calming option, then allow time.",
      "Wait until your child is calmer before discussing what happened.",
    ],
    avoid: [
      "Do not ask many questions or demand eye contact.",
      "Avoid forcing conversation or threatening consequences during escalation.",
      "Do not try to teach a lesson in the middle of the moment.",
    ],
    prevention: [
      "Watch for early signs that your child is becoming overwhelmed.",
      "Keep routines predictable and prepare for changes.",
      "Offer breaks and reduce sensory demands when possible.",
      "Use a familiar visual schedule or transition warning.",
    ],
    replacementSkill: "When calm, practice asking for a break or help, using a familiar calming tool, or communicating a feeling.",
    reinforcementIdea: "Recognize using a calming tool, communicating a need, or recovering safely.",
    seekHelp: "Contact the child’s clinician if meltdowns regularly involve unsafe behavior, self-injury, or interfere with daily life. Seek emergency support for immediate danger.",
    track: ["What happened before", "Early signs", "How long it lasted", "What calming options were offered", "How recovery went"],
    relatedGoals: ["Use a calming strategy", "Move to a calm space", "Recover safely", "Communicate feelings"],
  },
  {
    key: "task_refusal",
    name: "Task Refusal",
    description: "Refusing, avoiding, or becoming upset about homework, chores, hygiene, or other tasks.",
    whatMayBeHappening: "The task may feel too hard, too long, unclear, boring, or overwhelming. It may help to understand what makes starting difficult before changing expectations.",
    rightNow: [
      "Pause and calmly make the next step smaller and clear.",
      "Offer two reasonable choices about how to begin.",
      "Use a simple first-then statement if that is familiar.",
      "Recognize an attempt or a request for help.",
      "Offer a brief break when appropriate, then revisit the small step.",
    ],
    avoid: [
      "Do not repeat the demand over and over or turn it into an argument.",
      "Avoid adding extra tasks while your child is stuck.",
      "Do not remove all preferred activities as a sudden consequence.",
    ],
    prevention: [
      "Make the first step clear and manageable.",
      "Use a visual checklist or timer if your child finds it helpful.",
      "Offer choices and start with an easier step.",
      "Notice effort early rather than waiting for the whole task to be finished.",
    ],
    replacementSkill: "Practice asking for help or a break, choosing the first step, or telling you what feels difficult.",
    reinforcementIdea: "Praise getting started, trying one small part, or asking for help appropriately.",
    seekHelp: "Talk with the child’s clinician if refusal is intense, unsafe, or repeatedly prevents important daily activities.",
    track: ["Task and time of day", "What the first step was", "How long getting started took", "What support was tried", "Whether your child returned to the task"],
    relatedGoals: ["Complete one small step", "Ask for a break appropriately", "Use a first-then routine", "Return to a task after support"],
  },
  {
    key: "transition_difficulty",
    name: "Transition Difficulty",
    description: "Struggling to stop one activity and move to the next.",
    whatMayBeHappening: "Your child may need more predictability, processing time, support ending a preferred activity, or help understanding what comes next.",
    rightNow: [
      "Use a calm, short reminder of what is ending and what comes next.",
      "Offer extra processing time and one small choice.",
      "Use a familiar timer, visual cue, or first-then phrase if helpful.",
      "Recognize any safe movement toward the next activity.",
    ],
    avoid: [
      "Avoid sudden changes when a warning is possible.",
      "Do not grab items away without preparation unless needed to prevent immediate harm.",
      "Avoid long explanations or arguing during escalation.",
      "Do not change instructions repeatedly.",
    ],
    prevention: [
      "Use a visual schedule or countdown that your child understands.",
      "Practice transitions during calm moments.",
      "Keep transition routines consistent and clear.",
      "Offer a familiar transition object if it helps your child.",
    ],
    replacementSkill: "Practice using a transition cue, asking for one more minute, or choosing the first step in the next activity.",
    reinforcementIdea: "Notice moving safely to the next activity or using a transition tool.",
    seekHelp: "Ask the child’s clinician for an individualized transition plan if transitions regularly become unsafe or prevent daily routines.",
    track: ["Activity that ended", "Next activity", "Warning or cue used", "How your child responded", "How long it took and what helped"],
    relatedGoals: ["Follow a transition warning", "Move to the next activity", "Use a timer or visual support", "Make transitions safer and calmer"],
  },
];

function normalizeBehaviorKey(value: string | null | undefined): string {
  const normalized = (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const aliases: Record<string, string> = {
    "elopement_running_away": "elopement",
    "running_away": "elopement",
    "self_injury": "self_injury",
    "self_injurious_behavior": "self_injury",
    "meltdown": "meltdowns",
    "emotional_dysregulation": "meltdowns",
    "task_refusal": "task_refusal",
    "transition": "transition_difficulty",
  };
  return aliases[normalized] ?? normalized;
}

export function getStarterTemplate(behaviorKey: string | null | undefined): StarterTemplate | undefined {
  const key = normalizeBehaviorKey(behaviorKey);
  return starterLibrary.find((template) => template.key === key || normalizeBehaviorKey(template.name) === key);
}

export function makeStarterCard(
  behaviorKey: string | null,
  customBehavior: string | null,
  goal: string | null,
): SupportCard {
  const template = getStarterTemplate(behaviorKey);
  const behaviorName = template?.name || customBehavior?.trim() || "Behavior support";
  const key = template?.key || normalizeBehaviorKey(behaviorKey) || "custom";
  return {
    id: key === "custom"
      ? `starter:custom:${behaviorName.trim().replace(/\s+/g, " ").toLowerCase()}`
      : `starter:${key}`,
    behaviorKey: key,
    behaviorName,
    goal,
    planGoal: null,
    planGoalSourceDocumentIds: [],
    planGoalSourceReferences: [],
    source: "starter",
    sourceDocumentIds: [],
    sourceReferences: [],
    conflict: false,
    conflictMessage: null,
    whatMayBeHappening: template?.whatMayBeHappening || "There may be many reasons this behavior happens. Notice what is going on and ask your child’s clinician for individualized guidance.",
    rightNow: template?.rightNow || ["Use a calm voice, make space, and focus on keeping everyone safe.", "If someone is in immediate danger, contact emergency services."],
    avoid: template?.avoid || ["Avoid punishment, threats, or unfamiliar physical safety techniques."],
    prevention: template?.prevention || ["Notice patterns and prepare one small, predictable support."],
    replacementSkill: template?.replacementSkill || "Practice a safe way to ask for help or a break when calm.",
    reinforcementIdea: template?.reinforcementIdea || "Notice safe communication and small steps toward the goal.",
    seekHelp: template?.seekHelp || "Ask your child’s clinician for individualized support. Contact emergency services for immediate danger.",
    track: template?.track || ["What happened before", "What you noticed", "What helped", "Any safety concern"],
    relatedGoals: template?.relatedGoals || (goal ? [goal] : []),
    reviewedBy: null,
    reviewedAt: null,
  };
}