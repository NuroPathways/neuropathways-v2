import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  db, childrenTable, documentsTable, documentExtractionRunsTable, parentDocumentsTable,
  rewardTokensTable, careTeamAssignmentsTable, careTeamVersionsTable, careTeamPracticeTable,
  parentPracticeProgressTable, parentClinicConsentsTable, parentAccountsTable, parentLogsTable,
  behaviorLogsTable,
} from "@workspace/db";
import { careTeamActivityLibrary } from "./parentDailyActions";
import { familyIdForOwner } from "./familyParentAuth";
import { legacyVisibleDocuments } from "./documentVisibility";
import { getParentSharedSupport } from "./parentDocuments";
import { buildChildActivityRecommendations, canExposeActivityRecommendations } from "./activityMatching";

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
    ...(library ? {
      skillDomain: library.skillDomain,
      appropriateContexts: library.appropriateContexts,
      requiredInformation: library.requiredInformation,
      caregiverPhrases: library.caregiverPhrases,
      stopConditions: library.stopConditions,
      riskTier: library.riskTier,
      evidenceReferences: library.evidenceReferences,
      exclusionCriteria: library.exclusionCriteria,
      sourceClassification: library.sourceClassification,
      personalizationFields: library.personalizationFields,
      requiresClinicianConfirmation: library.requiresClinicianConfirmation,
    } : {}),
    title: String(d.title || ""), description: String(d.description || ""), skill: String(d.skill || ""),
    estimatedMinutes: typeof d.estimatedMinutes === "number" ? d.estimatedMinutes : null,
    materials: String(d.materials || ""), steps: Array.isArray(d.steps) ? d.steps.map(String) : [],
    whyItMayHelp: String(d.whyItMayHelp || ""), ifDifficult: String(d.ifDifficult || ""),
    notes: String(snapshot.notes || d.notes || ""), schedule: String(snapshot.schedule || ""),
  };
}

export function isCareTeamActivityComplete(definition: Record<string, unknown>) {
  const resolved = resolveAssignment(definition);
  return Boolean(
    resolved.title.trim() &&
    resolved.description.trim() &&
    resolved.skill.trim() &&
    resolved.steps.length > 0 &&
    resolved.steps.every((step) => step.trim()),
  );
}

export function isCareTeamRecommendationComplete(
  definition: Record<string, unknown>,
  review: Record<string, unknown> | null,
) {
  if (!isCareTeamActivityComplete(definition)) return false;
  const resolved = resolveAssignment(definition);
  const missing = Array.isArray(review?.missingInformation) ? review.missingInformation.map(String) : [];
  if (missing.length || review?.sourceClassification === "document_candidate") {
    if (resolved.steps.filter((step) => step.trim()).length < 2) return false;
    if (missing.some((item) => /pause|stop|safety/i.test(item)) && !resolved.ifDifficult.trim()) return false;
  }
  return true;
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
  const review = snapshot.activityReview && typeof snapshot.activityReview === "object"
    ? snapshot.activityReview as Record<string, unknown>
    : null;
  return {
    ...resolveAssignment(snapshot), id: row.id, childId: row.childId, libraryId: row.libraryId,
    goalId: parentId && !visibleGoal ? null : row.goalId,
    goalTitle: parentId && !visibleGoal ? null : String(snapshot.goalTitle || (goal ? readableGoalTitle(goal) : "")) || null,
    status: row.status, version: row.version, source: row.libraryId ? "Care team · NeuroPathways starter library" : "Care team · custom activity",
    currentStep: progress?.currentStep || 0, bookmarked: progress?.bookmarked || false,
    ...(parentId ? {} : {
      planConfirmed: snapshot.planConfirmed === true,
      recommendationId: typeof review?.recommendationId === "string" ? review.recommendationId : null,
      sourceClassification: typeof review?.sourceClassification === "string" ? review.sourceClassification : undefined,
      sourceEvidence: Array.isArray(review?.evidence) ? review.evidence : undefined,
      matchReasons: Array.isArray(review?.matchReasons) ? review.matchReasons : undefined,
      reviewNote: typeof review?.reviewNote === "string" ? review.reviewNote : null,
      reviewedBy: typeof review?.reviewedBy === "string" ? review.reviewedBy : null,
      reviewedAt: typeof review?.reviewedAt === "string" ? review.reviewedAt : null,
      riskClassification: typeof review?.riskClassification === "string" ? review.riskClassification : undefined,
      missingInformation: Array.isArray(review?.missingInformation) ? review.missingInformation.map(String) : [],
      relatedGoal: typeof review?.relatedGoal === "string" ? review.relatedGoal : null,
      reviewContext: typeof review?.reviewContext === "string" ? review.reviewContext : "",
      reviewStartAction: typeof review?.reviewStartAction === "string" ? review.reviewStartAction : "",
      reviewEnding: typeof review?.reviewEnding === "string" ? review.reviewEnding : "",
      reviewPauseConditions: Array.isArray(review?.reviewPauseConditions) ? review.reviewPauseConditions.map(String) : [],
    }),
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
    if (!assignment || assignment.childId !== childId) continue;
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
  const legacy = await db.select().from(behaviorLogsTable)
    .where(eq(behaviorLogsTable.childId, childId))
    .orderBy(desc(behaviorLogsTable.createdDate)).limit(100);
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
    eq(rewardTokensTable.childId, childId),
    parentId ? and(eq(rewardTokensTable.createdByClinician, true), eq(rewardTokensTable.publicationStatus, "published")) : undefined,
  )).orderBy(desc(rewardTokensTable.createdDate)) : [];
  const assignments = clinicianId ? await db.select().from(careTeamAssignmentsTable).where(and(
    eq(careTeamAssignmentsTable.childId, childId),
    parentId ? eq(careTeamAssignmentsTable.status, "published") : undefined,
  )).orderBy(desc(careTeamAssignmentsTable.updatedAt)) : [];
  const assignmentWires = await Promise.all(assignments.map(a => assignmentWire(a, parentId)));
  const workspace = {
    // Existing document/manual clinical goals still use their original IDs. The
    // unified Goals UI uses this section for clinician-managed care_team goals.
    // Never expose private parent-document goals or a family's private goal
    // collection merely because a clinician was linked to the child.
    goals: goals.filter(g => g.createdByClinician && g.source !== "parent_document" && (!parentId || g.source === "care_team"))
      .map(g => careGoalWire(g, assignments.filter(a => a.goalId === g.id).map(a => a.id))),
    assignments: assignmentWires,
    recentPractice: await carePracticeHistory(childId, clinicianId, parentId),
    observations: parentId || !clinicianId ? [] : await careObservations(childId, clinicianId),
  };
  if (!clinicianId || !canExposeActivityRecommendations(clinicianId, parentId)) return workspace;

  const [child] = await db.select().from(childrenTable).where(and(
    eq(childrenTable.id, childId),
  ));
  if (!child) {
    return {
      ...workspace,
      activityRecommendations: [],
      activityRecommendationStatus: "no_documents" as const,
      activityRecommendationMessage: "No authorized child records were available for activity matching.",
      activitySafetyEvidence: [],
    };
  }

  const allDocuments = await db.select().from(documentsTable).where(eq(documentsTable.childId, childId));
  const permissionVisible = await legacyVisibleDocuments(allDocuments, clinicianId);
  const parentMetadata = permissionVisible.length
    ? await db.select().from(parentDocumentsTable)
      .where(inArray(parentDocumentsTable.documentId, permissionVisible.map((document) => document.id)))
    : [];
  const metadataById = new Map(parentMetadata.map((metadata) => [metadata.documentId, metadata]));
  const visibleDocuments = permissionVisible.filter((document) => {
    const metadata = metadataById.get(document.id);
    return !metadata || (
      metadata.childId === childId &&
      metadata.parentId === child.parentId &&
      metadata.sharedClinicianId === clinicianId
    );
  });
  const visibleDocumentIds = visibleDocuments.map((document) => document.id);
  const runs = visibleDocumentIds.length
    ? await db.select().from(documentExtractionRunsTable)
      .where(and(
        inArray(documentExtractionRunsTable.documentId, visibleDocumentIds),
        eq(documentExtractionRunsTable.childId, childId),
      ))
      .orderBy(desc(documentExtractionRunsTable.updatedAt))
    : [];
  const documentById = new Map(visibleDocuments.map((document) => [document.id, document]));
  const latestRunByDocument = new Map<string, typeof runs[number]>();
  for (const run of runs) {
    if (!latestRunByDocument.has(run.documentId)) {
      latestRunByDocument.set(run.documentId, run);
    }
  }
  const usableDocuments = visibleDocuments.filter((document) => {
    if (document.scanStatus !== "done") return false;
    const run = latestRunByDocument.get(document.id);
    if (!run || !["completed", "partial", "no_relevant_content"].includes(run.scanStatus)) return false;
    const metadata = metadataById.get(document.id);
    return !metadata || run.documentVersion === metadata.sha256;
  });
  const incompleteScans = visibleDocuments.filter((document) => {
    if (document.scanStatus !== "done") return true;
    const run = latestRunByDocument.get(document.id);
    if (!run) return true;
    const metadata = metadataById.get(document.id);
    if (metadata && run.documentVersion !== metadata.sha256) return true;
    return run.scanStatus === "partial" || run.scanStatus === "failed" || run.scanStatus === "processing";
  });
  const usableDocumentIds = new Set(usableDocuments.map((document) => document.id));
  const records = runs
    .filter((run) => usableDocumentIds.has(run.documentId) && latestRunByDocument.get(run.documentId)?.id === run.id)
    .flatMap((run) => {
      const document = documentById.get(run.documentId);
      const saved = Array.isArray(run.records) ? run.records : [];
      return document ? saved.map((record) => ({
        ...record,
        documentTitle: document.title || document.fileName || "Support document",
      })) : [];
    });

  let approvedDocumentActivities: Array<{
    title: string;
    routineContext?: string;
    opportunity?: string;
    skill?: string;
    relatedGoal?: string | null;
    estimatedMinutes?: number | null;
    materials?: string[];
    startAction?: string;
    steps?: string[];
    ending?: string;
    pauseConditions?: string[];
    sourceDocumentId: string;
    sourceDocumentTitle: string;
    sourceExcerpt: string;
    sourcePage?: number | null;
    reviewedBy: string;
    reviewedAt: string;
    assignedAt?: string | null;
    readiness: string;
    sourceExcerptVerified: boolean;
  }> = [];
  if (child.parentId || child.familyId) {
    const sharedSupport = await getParentSharedSupport(clinicianId, childId);
    const sharedTitles = new Map(sharedSupport.documents.map((document) => [document.id, document.title]));
    approvedDocumentActivities = sharedSupport.supportCards.flatMap((card) =>
      (card.dailyActivities || []).flatMap((activity) => {
        if (
          activity.sourceType !== "clinician_reviewed" ||
          activity.reviewedBy !== clinicianId ||
          !activity.reviewedAt ||
          !activity.sourceDocumentId ||
          !activity.sourceExcerpt ||
          !sharedTitles.has(activity.sourceDocumentId)
        ) return [];
        return [{
          title: activity.title,
          routineContext: activity.routineContext,
          opportunity: activity.opportunity,
          skill: activity.skill,
          relatedGoal: activity.relatedGoal,
          estimatedMinutes: activity.estimatedMinutes,
          materials: activity.materials,
          startAction: activity.startAction,
          steps: activity.steps,
          ending: activity.ending,
          pauseConditions: activity.pauseConditions,
          sourceDocumentId: activity.sourceDocumentId,
          sourceDocumentTitle: sharedTitles.get(activity.sourceDocumentId) || "Shared support document",
          sourceExcerpt: activity.sourceExcerpt,
          reviewedBy: clinicianId,
          reviewedAt: String(activity.reviewedAt),
          assignedAt: activity.assignedAt,
          readiness: activity.readiness || "needs_details",
          sourceExcerptVerified: activity.sourceExcerptVerified === true,
        }];
      }),
    );
  }

  const matching = buildChildActivityRecommendations({
    childId,
    clinicianId,
    records,
    library: careTeamActivityLibrary(),
    existingAssignments: assignmentWires,
    approvedDocumentActivities,
  });
  const hasDocuments = visibleDocuments.length > 0;
  const incomplete = incompleteScans.length > 0;
  const status = !hasDocuments
    ? "no_documents" as const
    : incomplete
      ? "scan_incomplete" as const
      : matching.recommendations.length
        ? "ready" as const
        : "no_verified_matches" as const;
  const message = !hasDocuments
    ? "No source documents are available in this clinician workspace. No individualized activity suggestions were generated."
    : incomplete
      ? "Some available documents are not fully scanned. Suggestions use only current, source-verified information; missing scan content was not guessed."
      : matching.recommendations.length
        ? "These are reviewable suggestions, not assignments. Published assignments remain the first priority; confirm current fit and safety before considering a suggestion. Goals alone do not create activities."
        : "No child-specific activity suggestion matched the current source-verified records. Goals alone do not create activities.";

  return {
    ...workspace,
    activityRecommendations: matching.recommendations,
    activityReviews: assignmentWires.filter((assignment) =>
      Boolean(assignment.recommendationId) &&
      ["draft", "needs_review", "needs_details", "approved", "rejected"].includes(assignment.status),
    ),
    activityRecommendationStatus: status,
    activityRecommendationMessage: message,
    activitySafetyEvidence: matching.safetyEvidence,
  };
}
