import crypto from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  parentDailyActionLogsTable,
  parentDailyActionsTable,
  type ParentDailyAction,
  type ParentDailyActionKind,
  type ParentDailyActionLog,
  type ParentDailyActionSource,
} from "@workspace/db";
import { parentBehaviorIdentity, type ParentBehavior } from "./parentAuth";
import type { SupportCard } from "./parentStarterLibrary";
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

const SOURCE_PRIORITY: Record<ParentDailyActionSource, number> = {
  clinician_reviewed: 0,
  clinician_uploaded_plan: 1,
  parent_uploaded_plan: 2,
  starter_template: 3,
  recent_log_pattern: 4,
  selected_behavior: 5,
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

function cardTask(card: SupportCard, date: string, slot: string, step?: string): DailyActionDraft {
  if (card.conflict) {
    return cardDraft(
      card,
      date,
      "task",
      slot,
      "Check these plan steps with your clinician",
      card.conflictMessage || "The uploaded guidance needs review before you use plan-specific steps.",
      [],
      2,
      "needs_review",
    );
  }

  const chosen = step || cleanSteps([...card.prevention, card.replacementSkill], 1)[0];
  const detail = chosen || `Open the saved support steps for ${card.behaviorName} and choose one that fits today.`;
  return cardDraft(
    card,
    date,
    "task",
    slot,
    shortTitle(detail, `One small step for ${card.behaviorName}`),
    `Try this saved support for ${card.behaviorName} only when it fits today's situation.`,
    cleanSteps([detail, card.reinforcementIdea]),
    5,
  );
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
    `Notice this skill: ${activity.skill}`,
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
    description: `Try this only in the routine described and when it fits ${card.behaviorName}'s written support plan. Do not create a difficult situation to practice it.`,
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

function selectedBehaviorDraft(
  behavior: ParentBehavior,
  date: string,
  kind: ParentDailyActionKind,
  slot: string,
  title: string,
  detail: string,
): DailyActionDraft {
  const identity = parentBehaviorIdentity(behavior);
  return {
    actionDate: date,
    actionKey: actionKey(kind, identity, slot),
    kind,
    behaviorKey: behavior.behaviorKey,
    behaviorName: behavior.behaviorName,
    supportCardId: null,
    sourceType: "selected_behavior",
    sourceDocumentId: null,
    title,
    description: behavior.goal
      ? `Based on your family-selected goal for ${behavior.behaviorName}.`
      : `No support card is saved for ${behavior.behaviorName}; use this as a simple observation or review of familiar support.`,
    whyItMayHelp: `This is tied to your selected focus, ${behavior.behaviorName}. Use it to notice what fits your family, not as a measure of clinical progress.`,
    steps: [detail],
    estimatedMinutes: kind === "practice" ? 3 : 5,
    status: "not_started",
  };
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
  logs: ParentLogInput[];
}): DailyActionDraft[] {
  const activeIdentities = new Set(input.selectedBehaviors.map(parentBehaviorIdentity));
  const cards = input.supportCards
    .filter((card) => activeIdentities.has(identityForCard(card)))
    .sort((a, b) => SOURCE_PRIORITY[sourceTypeFor(a)] - SOURCE_PRIORITY[sourceTypeFor(b)])
    .filter((card, index, sorted) =>
      sorted.findIndex((candidate) => identityForCard(candidate) === identityForCard(card)) === index,
    );
  const activitiesByCard = cards.map((card, index) => {
    if (card.conflict) {
      return [cardTask(card, input.date, `plan-review-${index}`)];
    }
    return (card.dailyActivities || []).map((activity) =>
      planActivityDraft(card, activity, input.date, input.childName?.trim() || "your child"),
    );
  });

  // Round-robin across selected support areas so one child goal cannot crowd out the rest.
  const actions: DailyActionDraft[] = [];
  for (let activityIndex = 0; actions.length < 4; activityIndex += 1) {
    let added = false;
    for (const activities of activitiesByCard) {
      const action = activities[activityIndex];
      if (!action) continue;
      actions.push(action);
      added = true;
      if (actions.length === 4) break;
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
  logs: ParentLogInput[];
}) {
  const drafts = buildParentDailyActionDrafts(input);
  for (const draft of drafts) {
    const now = new Date();
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
      setWhere: eq(parentDailyActionsTable.status, "not_started"),
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
