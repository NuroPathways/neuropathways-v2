import { and, desc, eq, isNull } from "drizzle-orm";
import {
  db, rewardTokensTable, careTeamAssignmentsTable, careTeamVersionsTable, careTeamPracticeTable,
  parentPracticeProgressTable, parentClinicConsentsTable, parentAccountsTable, parentLogsTable,
  behaviorLogsTable,
} from "@workspace/db";
import { careTeamActivityLibrary } from "./parentDailyActions";
import { familyIdForOwner } from "./familyParentAuth";

export function readableGoalTitle(goal: { goalTitle?: string | null; goalName?: string | null; goalDescription?: string | null }) {
  const technical = /^(?:[A-Z]\d+\s+)?goal\s+\d{1,2}:\d{2}(?::\d{2})?$|^(?:goal|token)[_-][a-f0-9-]{8,}$/i;
  for (const raw of [goal.goalTitle, goal.goalName]) {
    const title = raw?.replace(/^(?:plan|document|clinical|parent|goal)[_:]+/i, "").replace(/_/g, " ").trim();
    if (title && !technical.test(title)) return title;
  }
  const saved = goal.goalDescription?.trim().split(/[\n.!?]/)[0]?.trim();
  return saved ? saved.slice(0, 160) : "Goal — title needs review";
}

export function careGoalWire(g: typeof rewardTokensTable.$inferSelect, linked: string[] = []) {
  const d = g.goalDetails || {};
  const measurement = String(d.measurement || (g.target ? "completed_steps" : "observation"));
  return {
    id: g.id, childId: g.childId!, title: readableGoalTitle(g), description: g.goalDescription || "",
    skill: String(d.skill || ""), measurement,
    target: d.target === null ? null : Number(d.target ?? g.target ?? g.tokensGoal ?? 0),
    milestones: Array.isArray(d.milestones) ? d.milestones.map(String) : g.milestoneNotes ? [g.milestoneNotes] : [],
    notes: String(d.notes || g.notes || ""), status: g.publicationStatus,
    version: g.goalVersion, source: g.source || "manual",
    canEdit: Boolean(g.createdByClinician),
    progress: measurement === "observation" || measurement === "clinician_defined" ? null : g.progress ?? g.tokensEarned ?? 0,
    linkedActivityIds: linked,
  };
}

export function resolveAssignment(snapshot: Record<string, unknown>) {
  const library = snapshot.libraryId ? careTeamActivityLibrary().find(a => a.id === snapshot.libraryId && a.version === (snapshot.libraryVersion || 1)) : null;
  if (snapshot.libraryId && !library) throw new Error("Original library version is unavailable; instructions were not replaced.");
  const d = library || snapshot;
  return {
    title: String(d.title || ""), description: String(d.description || ""), skill: String(d.skill || ""),
    estimatedMinutes: typeof d.estimatedMinutes === "number" ? d.estimatedMinutes : null,
    materials: String(d.materials || ""), steps: Array.isArray(d.steps) ? d.steps.map(String) : [],
    whyItMayHelp: String(d.whyItMayHelp || ""), ifDifficult: String(d.ifDifficult || ""),
    notes: String(snapshot.notes || d.notes || ""), schedule: String(snapshot.schedule || ""),
  };
}

export async function assignmentWire(row: typeof careTeamAssignmentsTable.$inferSelect, parentId?: string) {
  const [version] = row.status === "published" ? await db.select().from(careTeamVersionsTable)
    .where(and(eq(careTeamVersionsTable.assignmentId, row.id), eq(careTeamVersionsTable.version, row.version))) : [];
  const snapshot = version?.snapshot || { ...row.definition, libraryId: row.libraryId, goalId: row.goalId };
  const [goal] = row.goalId ? await db.select().from(rewardTokensTable).where(eq(rewardTokensTable.id, row.goalId)) : [];
  const visibleGoal = goal?.publicationStatus === "published" && goal.clinicianId === row.clinicianId;
  const [progress] = parentId ? await db.select().from(parentPracticeProgressTable).where(and(
    eq(parentPracticeProgressTable.parentId, parentId), eq(parentPracticeProgressTable.childId, row.childId),
    eq(parentPracticeProgressTable.actionKey, `assignment:${row.id}:v${row.version}`),
  )) : [];
  return {
    ...resolveAssignment(snapshot), id: row.id, childId: row.childId, libraryId: row.libraryId,
    goalId: parentId && !visibleGoal ? null : row.goalId,
    goalTitle: parentId && !visibleGoal ? null : String(snapshot.goalTitle || (goal ? readableGoalTitle(goal) : "")) || null,
    status: row.status, version: row.version, source: row.libraryId ? "Care team · NeuroPathways starter library" : "Care team · custom activity",
    currentStep: progress?.currentStep || 0, bookmarked: progress?.bookmarked || false,
  };
}

// Direct-parent observations stay private unless the current clinic consent
// includes observations. Verified legacy-family records use that family's scope.
export async function mayReadParentPractice(parentId: string, childId: string, clinicianId: string) {
  if (familyIdForOwner(parentId)) return true;
  const [grant] = await db.select().from(parentClinicConsentsTable).where(and(
    eq(parentClinicConsentsTable.parentId, parentId), eq(parentClinicConsentsTable.childId, childId),
    eq(parentClinicConsentsTable.clinicianId, clinicianId), isNull(parentClinicConsentsTable.revokedAt),
  ));
  return grant?.scopes.includes("observations") || false;
}

export async function carePracticeHistory(childId: string, clinicianId: string | null, parentId?: string) {
  const rows = await db.select().from(careTeamPracticeTable).where(and(
    eq(careTeamPracticeTable.childId, childId), parentId ? eq(careTeamPracticeTable.parentId, parentId) : undefined,
  )).orderBy(desc(careTeamPracticeTable.createdAt)).limit(200);
  const output = [];
  for (const row of rows) {
    if (!parentId && (!clinicianId || !(await mayReadParentPractice(row.parentId, childId, clinicianId)))) continue;
    const [assignment] = await db.select().from(careTeamAssignmentsTable).where(eq(careTeamAssignmentsTable.id, row.assignmentId));
    if (!assignment || assignment.childId !== childId || (!parentId && assignment.clinicianId !== clinicianId)) continue;
    const [v] = await db.select().from(careTeamVersionsTable).where(and(
      eq(careTeamVersionsTable.assignmentId, row.assignmentId), eq(careTeamVersionsTable.version, row.version),
    ));
    if (!v) continue;
    const definition = resolveAssignment(v.snapshot);
    output.push({
      id: row.id, assignmentId: row.assignmentId, childId, version: row.version,
      outcome: row.outcome, note: row.note, createdAt: row.createdAt.toISOString(),
      title: definition.title, steps: definition.steps,
      goalId: v.snapshot.goalId as string | null || null, goalTitle: v.snapshot.goalTitle as string | null || null,
    });
  }
  return output;
}

export async function careObservations(childId: string, clinicianId: string) {
  const own = await db.select().from(parentLogsTable).where(eq(parentLogsTable.childId, childId)).orderBy(desc(parentLogsTable.createdAt)).limit(100);
  const visible = [];
  for (const row of own) {
    if (await mayReadParentPractice(row.parentId, childId, clinicianId)) visible.push({
      id: row.id, createdAt: row.createdAt.toISOString(), behavior: row.customBehavior || row.behaviorKey,
      notes: row.notes, intensity: row.intensity,
    });
  }
  const seen = new Set(own.map(l => l.id));
  const legacy = await db.select().from(behaviorLogsTable).where(and(
    eq(behaviorLogsTable.childId, childId), eq(behaviorLogsTable.clinicianId, clinicianId),
  )).orderBy(desc(behaviorLogsTable.createdDate)).limit(100);
  for (const row of legacy) {
    if (seen.has(row.id) || (row.eventCategory && row.eventCategory !== "behavior")) continue;
    if (row.parentId) {
      const [direct] = await db.select().from(parentAccountsTable).where(eq(parentAccountsTable.id, row.parentId));
      if (direct && !(await mayReadParentPractice(row.parentId, childId, clinicianId))) continue;
    }
    visible.push({ id: row.id, createdAt: row.createdDate.toISOString(), behavior: row.behaviorType, notes: row.notes, intensity: row.intensity });
  }
  return visible.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100);
}

export async function careWorkspace(childId: string, clinicianId: string | null, parentId?: string) {
  const goals = clinicianId ? await db.select().from(rewardTokensTable).where(and(
    eq(rewardTokensTable.childId, childId), eq(rewardTokensTable.clinicianId, clinicianId),
    parentId ? and(eq(rewardTokensTable.createdByClinician, true), eq(rewardTokensTable.publicationStatus, "published")) : undefined,
  )).orderBy(desc(rewardTokensTable.createdDate)) : [];
  const assignments = clinicianId ? await db.select().from(careTeamAssignmentsTable).where(and(
    eq(careTeamAssignmentsTable.childId, childId), eq(careTeamAssignmentsTable.clinicianId, clinicianId),
    parentId ? eq(careTeamAssignmentsTable.status, "published") : undefined,
  )).orderBy(desc(careTeamAssignmentsTable.updatedAt)) : [];
  return {
    // Existing document/manual clinical goals still use their original IDs. The
    // unified Goals UI uses this section for clinician-managed care_team goals.
    // Never expose private parent-document goals or a family's private goal
    // collection merely because a clinician was linked to the child.
    goals: goals.filter(g => g.createdByClinician && g.source !== "parent_document" && (!parentId || g.source === "care_team"))
      .map(g => careGoalWire(g, assignments.filter(a => a.goalId === g.id).map(a => a.id))),
    assignments: await Promise.all(assignments.map(a => assignmentWire(a, parentId))),
    recentPractice: await carePracticeHistory(childId, clinicianId, parentId),
    observations: parentId || !clinicianId ? [] : await careObservations(childId, clinicianId),
  };
}
