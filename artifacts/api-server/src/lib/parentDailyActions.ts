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
    whyItMayHelp: "A brief, predictable step gives you a chance to notice what works without making the whole day feel like a task.",
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

  const chosen = step || cleanSteps([...card.prevention, ...(card.rightNow || []).slice(1), card.replacementSkill], 1)[0];
  const detail = chosen || "Choose one small, safe step that fits your family's routine.";
  return cardDraft(
    card,
    date,
    "task",
    slot,
    shortTitle(detail, `One small step for ${card.behaviorName}`),
    detail,
    [detail],
    5,
  );
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

  const skill = card.replacementSkill?.trim();
  const step = activityText || skill || cleanSteps(card.prevention, 1)[0] || "Practice a familiar way to ask for help or a break.";
  const title = activityText
    ? shortTitle(activityText, `Try a short activity for ${card.behaviorName}`)
    : skill
    ? `Practice: ${shortTitle(skill, card.behaviorName)}`
    : shortTitle(step, `Try a short activity for ${card.behaviorName}`);
  const steps = cleanSteps([
    step,
    "Try this during a calm moment; use communication supports already familiar to your child.",
  ]);
  return cardDraft(
    card,
    date,
    "activity",
    slot,
    title,
    "Keep this brief and low-pressure. Pause if either of you needs a break.",
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
  const skill = card.replacementSkill?.trim() || "Practice asking for help or a break during a calm moment.";
  return cardDraft(
    card,
    date,
    "practice",
    "practice-skill",
    `Practice: ${shortTitle(skill, card.behaviorName)}`,
    "Try this during a calm moment, using communication supports already familiar to your child.",
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
    description: detail,
    whyItMayHelp: "Keep the step small and notice what feels manageable for your family.",
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
  const representedIdentities = new Set(cards.map(identityForCard));
  const selectedWithoutCards = input.selectedBehaviors.filter(
    (behavior) => !representedIdentities.has(parentBehaviorIdentity(behavior)),
  );

  const taskCandidates = cards.map((card, index) => cardTask(card, input.date, `primary-${index}`));
  const tasks = taskCandidates.slice(0, 4);
  const repeatedPattern = recentHelpfulPattern(input.selectedBehaviors, cards, input.logs, input.date);
  if (tasks.length < 4 && repeatedPattern) tasks.push(repeatedPattern);
  for (const [index, behavior] of selectedWithoutCards.entries()) {
    if (tasks.length >= 4) break;
    const detail = behavior.goal
      ? `Choose one small, safe step toward this family-selected goal: ${behavior.goal}`
      : "Choose one small, safe step that fits your family's routine.";
    tasks.push(selectedBehaviorDraft(
      behavior,
      input.date,
      "task",
      `selected-behavior-${index + 1}`,
      "Choose one small step",
      detail,
    ));
  }
  if (tasks.length < 2) {
    const card = cards[0];
    const secondStep = card && !card.conflict
      ? cleanSteps([
          ...card.prevention.slice(1),
          ...card.rightNow.slice(1),
          card.replacementSkill,
        ], 4).find((step) => step.toLocaleLowerCase() !== tasks[0]?.description.toLocaleLowerCase())
      : undefined;
    if (card && secondStep) tasks.push(cardTask(card, input.date, "second", secondStep));
    const fallbackBehavior = input.selectedBehaviors[0];
    while (fallbackBehavior && tasks.length < 2) {
      const slot = `selected-fallback-${tasks.length + 1}`;
      const detail = fallbackBehavior.goal
        ? `Choose one small, safe step toward this family-selected goal: ${fallbackBehavior.goal}`
        : "Choose one small, safe step that fits your family's routine.";
      tasks.push(selectedBehaviorDraft(
        fallbackBehavior,
        input.date,
        "task",
        slot,
        tasks.length === 0 ? "Choose one small step" : "Notice what feels manageable",
        detail,
      ));
    }
  }

  const activityCandidates = cards
    .slice(0, 3)
    .map((card, index) => {
      const activityStep = cleanSteps([
        ...card.prevention.slice(1),
        ...card.rightNow.slice(1),
        ...card.prevention,
      ], 1)[0];
      return cardActivity(card, input.date, `primary-${index}`, activityStep);
    });
  for (const [index, behavior] of selectedWithoutCards.entries()) {
    if (activityCandidates.length >= 3) break;
    activityCandidates.push(selectedBehaviorDraft(
      behavior,
      input.date,
      "activity",
      `selected-behavior-${index + 1}`,
      "Try a short, familiar activity",
      "Practice one familiar way to ask for help or a break during a calm moment.",
    ));
  }
  const fallbackBehavior = input.selectedBehaviors[0];
  if (activityCandidates.length < 2 && cards[0] && !cards[0].conflict) {
    const extra = cleanSteps([
      ...cards[0].prevention.slice(2),
      ...cards[0].rightNow.slice(1),
    ], 6).find((step) => step.toLocaleLowerCase() !== activityCandidates[0]?.steps[0]?.toLocaleLowerCase());
    if (extra) activityCandidates.push(cardActivity(cards[0], input.date, "second", extra));
  }
  while (fallbackBehavior && activityCandidates.length < 2) {
    const detail = "Practice one familiar way to ask for help or a break during a calm moment.";
    activityCandidates.push(selectedBehaviorDraft(
      fallbackBehavior,
      input.date,
      "activity",
      `selected-fallback-${activityCandidates.length + 1}`,
      activityCandidates.length === 0 ? "Practice a helpful phrase" : "Try a short, familiar activity",
      detail,
    ));
  }
  const activities = activityCandidates.slice(0, 3);

  const skillCard = cards.find((card) => !card.conflict);
  const skillAction: DailyActionDraft | null = skillCard
    ? cardPractice(skillCard, input.date)
    : fallbackBehavior
      ? selectedBehaviorDraft(
          fallbackBehavior,
          input.date,
          "practice",
          "selected-behavior",
          "Practice asking for help",
          "Model one familiar way to ask for help, then give your child time to respond.",
        )
      : null;

  return [...tasks, ...activities, ...(skillAction ? [{ ...skillAction, kind: "practice" as const }] : [])];
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
