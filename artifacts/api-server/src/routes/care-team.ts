import { Router, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import {
  db, childrenTable, userProfilesTable, rewardTokensTable, careTeamAssignmentsTable, careTeamVersionsTable,
  careTeamPracticeTable, parentPracticeProgressTable,
} from "@workspace/db";
import {
  CreateCareTeamGoalBody, UpdateCareTeamGoalBody, CreateCareTeamAssignmentBody, UpdateCareTeamAssignmentBody,
  SaveCareTeamPracticeProgressBody, RecordCareTeamPracticeBody, ReviewCareTeamActivityRecommendationBody,
} from "@workspace/api-zod";
import { requireParent, parentActor, ownedParentChild } from "../lib/parentAuth";
import { careTeamActivityLibrary } from "../lib/parentDailyActions";
import { isActivityPublishConfirmationSatisfied } from "../lib/parentActivityLibrary";
import { clinicianCanAccessChild } from "../lib/clinicAuthorization";
import {
  assignmentWire, careGoalWire, careWorkspace, readableGoalTitle, carePracticeHistory, resolveAssignment,
  isCareTeamActivityComplete, isCareTeamRecommendationComplete,
} from "../lib/careTeam";
import type { ActivityRecommendation } from "../lib/activityMatching";

const router = Router();
async function clinicianChild(req: Request, res: Response) {
  if (!req.user?.id) { res.status(401).json({ error: "Clinician sign-in required" }); return null; }
  const [profile] = await db.select().from(userProfilesTable).where(eq(userProfilesTable.id, req.user.id));
  if (profile?.appRole !== "clinician") { res.status(403).json({ error: "Clinician access required" }); return null; }
  const [child] = await db.select().from(childrenTable).where(eq(
    childrenTable.id, String(req.params.childId),
  ));
  if (!child || !(await clinicianCanAccessChild(req.user.id, child.id))) {
    res.status(404).json({ error: "Authorized client not found" }); return null;
  }
  return child;
}
async function parentChild(req: Request, res: Response) {
  const child = await ownedParentChild(parentActor(req).id, String(req.params.childId));
  if (!child) res.status(404).json({ error: "Child not found" });
  return child;
}
class Conflict extends Error {}
const fail = (res: Response, e: unknown) => {
  if (e instanceof Conflict) return res.status(409).json({ error: e.message });
  throw e;
};
const REVIEW_ONLY_ACTIVITY_STATUSES = new Set(["needs_review", "needs_details", "approved", "rejected"]);
const activityReviewFor = (definition: Record<string, unknown>) => {
  const review = definition.activityReview;
  return review && typeof review === "object" ? review as Record<string, unknown> : null;
};
function activityIsComplete(definition: Record<string, unknown>) {
}

router.get("/care-team/activity-library", (req, res) => {
  // General starter content contains no child or account data.
  res.json(careTeamActivityLibrary());
});
router.get("/clinician/children/:childId/goals-activities", async (req, res) => {
  const child = await clinicianChild(req, res);
  if (child) res.json(await careWorkspace(child.id, req.user!.id));
});
router.get("/parent/children/:childId/care-team", requireParent, async (req, res) => {
  const child = await parentChild(req, res);
  if (child) res.json(await careWorkspace(child.id, child.clinicianId, parentActor(req).id));
});

async function saveGoal(req: Request, res: Response, update: boolean) {
  const child = await clinicianChild(req, res);
  if (!child) return;
  const input = (update ? UpdateCareTeamGoalBody : CreateCareTeamGoalBody).safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: "Enter a title, description and valid goal fields." });
  const d = input.data;
  if (!d.title.trim() || !d.description.trim()) return res.status(400).json({ error: "Title and description are required." });
  if (["frequency", "duration", "percentage", "completed_steps"].includes(d.measurement || "") && !(typeof d.target === "number" && d.target > 0)) {
    return res.status(400).json({ error: "This measurement needs a target greater than zero." });
  }
  if (d.measurement === "percentage" && Number(d.target) > 100) return res.status(400).json({ error: "A percentage target cannot exceed 100." });
  try {
    const result = await db.transaction(async tx => {
      const [existing] = update ? await tx.select().from(rewardTokensTable).where(and(
        eq(rewardTokensTable.id, String(req.params.goalId)), eq(rewardTokensTable.childId, child.id),
        eq(rewardTokensTable.clinicianId, req.user!.id), eq(rewardTokensTable.createdByClinician, true),
      )).for("update") : [];
      if (update && !existing) return null;
      if (existing && d.expectedVersion !== existing.goalVersion) throw new Conflict("This goal changed. Reload before editing.");
      const version = (existing?.goalVersion || 0) + 1;
      const status = d.status || "draft";
      const details = {
        ...existing?.goalDetails,
        ...(d.skill !== undefined ? { skill: d.skill } : {}),
        ...(d.measurement !== undefined ? { measurement: d.measurement } : {}),
        ...(d.target !== undefined ? { target: d.target } : {}),
        ...(d.milestones !== undefined ? { milestones: d.milestones } : {}),
        ...(d.notes !== undefined ? { notes: d.notes } : {}),
      };
      const versions = [...(existing?.goalVersions || [])];
      // Preserve the prior legacy publication before editing its record.
      if (existing?.publicationStatus === "published" && !versions.some(v => v.version === existing.goalVersion)) {
        versions.push({ ...careGoalWire(existing), publishedAt: existing.createdDate.toISOString() });
      }
      if (status === "published") versions.push({
        version, title: d.title.trim(), description: d.description.trim(), ...details, publishedAt: new Date().toISOString(),
      });
      const values = {
        goalTitle: d.title.trim(), goalName: d.title.trim(), goalDescription: d.description.trim(),
        publicationStatus: status, goalDetails: details, goalVersion: version, goalVersions: versions,
        ...(typeof d.target === "number" ? { target: Math.ceil(d.target), tokensGoal: Math.ceil(d.target) } : {}),
      };
      const [row] = existing ? await tx.update(rewardTokensTable).set(values).where(eq(rewardTokensTable.id, existing.id)).returning()
        : await tx.insert(rewardTokensTable).values({
          ...values, childId: child.id, clinicianId: req.user!.id, tenantId: child.tenantId || req.user!.id,
          source: "care_team", createdByClinician: true, progress: 0, tokensEarned: 0,
        }).returning();
      return row;
    });
    if (!result) return res.status(404).json({ error: "Authorized clinical goal not found" });
    return res.status(update ? 200 : 201).json(careGoalWire(result));
  } catch (e) { return fail(res, e); }
}
router.post("/clinician/children/:childId/care-goals", (req, res) => saveGoal(req, res, false));
router.patch("/clinician/children/:childId/care-goals/:goalId", (req, res) => saveGoal(req, res, true));

async function saveAssignment(req: Request, res: Response, update: boolean) {
  const child = await clinicianChild(req, res);
  if (!child) return;
  const parsed = (update ? UpdateCareTeamAssignmentBody : CreateCareTeamAssignmentBody).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Check the activity fields and numbered instructions." });
  const input = parsed.data;
  try {
    const result = await db.transaction(async tx => {
      const [old] = update ? await tx.select().from(careTeamAssignmentsTable).where(and(
        eq(careTeamAssignmentsTable.id, String(req.params.assignmentId)), eq(careTeamAssignmentsTable.childId, child.id),
        eq(careTeamAssignmentsTable.clinicianId, req.user!.id),
      )).for("update") : [];
      if (update && !old) return null;
      if (old && input.expectedVersion !== old.version) throw new Conflict("This assignment changed. Reload before editing.");
      const libraryId = input.libraryId !== undefined ? input.libraryId : old?.libraryId || null;
      const goalId = input.goalId !== undefined ? input.goalId : old?.goalId || null;
      const status = input.status || old?.status || "draft";
      const previousReview = old ? activityReviewFor(old.definition) : null;
      const recommendationId = typeof previousReview?.recommendationId === "string" ? previousReview.recommendationId : null;
      if (REVIEW_ONLY_ACTIVITY_STATUSES.has(status) && !recommendationId) {
        throw new Conflict("Review-only statuses are available for a document or library suggestion.");
      }
      const [goal] = goalId ? await tx.select().from(rewardTokensTable).where(and(
        eq(rewardTokensTable.id, goalId), eq(rewardTokensTable.childId, child.id),
        eq(rewardTokensTable.clinicianId, req.user!.id), eq(rewardTokensTable.createdByClinician, true),
      )) : [];
      if (goalId && !goal) throw new Conflict("Choose an authorized care-team goal for this child.");
      if (status === "published" && goal && goal.publicationStatus !== "published") throw new Conflict("Publish the related goal before publishing this assignment.");
      const library = libraryId ? careTeamActivityLibrary().find(a => a.id === libraryId) : null;
      if (libraryId && !library) throw new Conflict("That library activity is unavailable.");
      const planConfirmed = input.planConfirmed ?? old?.definition.planConfirmed === true;
      if (status === "published" && !isActivityPublishConfirmationSatisfied(library, Boolean(planConfirmed))) {
        throw new Conflict("Review the child-specific context and confirm that the current support plan authorizes this activity before publishing.");
      }
      if (recommendationId && status === "approved" && !planConfirmed) {
        throw new Conflict("Confirm the child's current fit, familiarity, and safety before approving this suggestion.");
      }
      if (recommendationId && status === "published") {
        if (!["approved", "published", "paused"].includes(old?.status || "")) {
          throw new Conflict("Approve this reviewed suggestion before publishing it to the family.");
        }
        if (!planConfirmed) {
          throw new Conflict("Review the current activity version and confirm its fit and safety before publishing.");
        }
      }
      if (recommendationId && status === "needs_details" && !String(input.reviewNote || previousReview?.reviewNote || "").trim()) {
        throw new Conflict("Add a short note describing what detail is still needed.");
      }
      const now = new Date();
      const reviewNote = input.reviewNote !== undefined ? input.reviewNote.trim() : String(previousReview?.reviewNote || "");
      const nextReview = previousReview ? {
        ...previousReview,
        reviewNote,
        ...(status === "approved" || status === "published"
          ? { reviewedBy: req.user!.id, reviewedAt: now.toISOString(), fitSafetyConfirmed: Boolean(planConfirmed) }
          : {}),
        ...(status === "needs_details"
          ? { detailsRequestedBy: req.user!.id, detailsRequestedAt: now.toISOString() }
          : {}),
        ...(status === "rejected"
          ? { rejectedBy: req.user!.id, rejectedAt: now.toISOString() }
          : {}),
        ...(["draft", "needs_review", "needs_details", "rejected"].includes(status)
          ? { reviewedBy: null, reviewedAt: null, fitSafetyConfirmed: false }
          : {}),
      } : null;
      let definition: Record<string, unknown> = library ? {
        libraryId, libraryVersion: library.version,
        planConfirmed: Boolean(planConfirmed),
        notes: input.notes ?? old?.definition.notes ?? "", schedule: input.schedule ?? old?.definition.schedule ?? "",
      } : {
        ...(old?.libraryId ? {} : old?.definition || {}),
        ...Object.fromEntries(Object.entries(input).filter(([key]) => !["expectedVersion", "status", "goalId", "libraryId", "planConfirmed", "reviewNote"].includes(key))),
      };
      definition = {
        ...definition,
        planConfirmed: Boolean(planConfirmed),
        ...(nextReview ? { activityReview: nextReview } : {}),
      };
      if (!library && !isCareTeamActivityComplete(definition) && ["approved", "published"].includes(status)) {
        throw new Conflict("Complete the title, description, skill, and parent-facing instructions before approval or publication.");
      }
      if (recommendationId && ["approved", "published"].includes(status) &&
        !isCareTeamRecommendationComplete(definition, activityReviewFor(definition))) {
        throw new Conflict("Complete and verify the missing activity details above before approval or publication.");
      }
      if (recommendationId && ["approved", "published"].includes(status)) {
        const currentReview = activityReviewFor(definition);
        if (currentReview) definition.activityReview = { ...currentReview, missingInformation: [] };
      }
      if (status === "needs_details" && recommendationId) {
        definition.activityReview = { ...nextReview, reviewNote };
      }
      const version = (old?.version || 0) + (status === "published" ? 1 : 0);
      const values = { goalId, libraryId, definition, status, version, updatedAt: now, publishedAt: status === "published" ? now : old?.publishedAt || null };
      const [row] = old ? await tx.update(careTeamAssignmentsTable).set(values).where(eq(careTeamAssignmentsTable.id, old.id)).returning()
        : await tx.insert(careTeamAssignmentsTable).values({ ...values, childId: child.id, clinicianId: req.user!.id, tenantId: child.tenantId || req.user!.id }).returning();
      if (status === "published") await tx.insert(careTeamVersionsTable).values({
        assignmentId: row.id, version, snapshot: { ...definition, libraryId, goalId, goalTitle: goal ? readableGoalTitle(goal) : null },
      });
      return row;
    });
    if (!result) return res.status(404).json({ error: "Assignment not found" });
    return res.status(update ? 200 : 201).json(await assignmentWire(result));
  } catch (e) { return fail(res, e); }
}
router.post("/clinician/children/:childId/assignments", (req, res) => saveAssignment(req, res, false));
router.patch("/clinician/children/:childId/assignments/:assignmentId", (req, res) => saveAssignment(req, res, true));

function recommendationReviewDefinition(
  recommendation: ActivityRecommendation,
  clinicianId: string,
  action: string,
  reviewNote: string,
) {
  const libraryId = recommendation.id.startsWith("library:")
    ? recommendation.id.slice("library:".length)
    : null;
  const library = libraryId ? careTeamActivityLibrary().find((item) => item.id === libraryId) : null;
  if (libraryId && !library) throw new Conflict("The suggested library activity is no longer available.");
  const planConfirmed = action === "approve";
  const definition: Record<string, unknown> = library
    ? {
        libraryId,
        libraryVersion: library.version,
        planConfirmed,
        notes: "",
        schedule: "",
      }
    : {
        title: recommendation.title,
        description: [
          recommendation.description,
          recommendation.routineContext && !recommendation.description.includes(recommendation.routineContext)
            ? `Appropriate context: ${recommendation.routineContext}`
            : "",
        ].filter(Boolean).join("\n\n"),
        skill: recommendation.skill,
        estimatedMinutes: recommendation.estimatedMinutes,
        materials: recommendation.materials.join(", "),
        steps: [
          ...(recommendation.startAction ? [`Start: ${recommendation.startAction}`] : []),
          ...recommendation.steps,
          ...(recommendation.ending ? [`Finish: ${recommendation.ending}`] : []),
        ],
        whyItMayHelp: "",
        ifDifficult: recommendation.pauseConditions.join(" "),
        notes: "",
        schedule: "",
        planConfirmed,
      };
  const now = new Date().toISOString();
  return {
    libraryId,
    goalId: null,
    definition: {
      ...definition,
      activityReview: {
        recommendationId: recommendation.id,
        sourceClassification: recommendation.sourceClassification,
        evidence: recommendation.evidence,
        matchReasons: recommendation.matchReasons,
        missingInformation: recommendation.missingInformation,
        relatedGoal: recommendation.relatedGoal,
        riskClassification: recommendation.riskClassification,
        reviewContext: recommendation.routineContext || "",
        reviewStartAction: recommendation.startAction || "",
        reviewEnding: recommendation.ending || "",
        reviewPauseConditions: recommendation.pauseConditions,
        reviewNote,
        reviewedBy: action === "approve" ? clinicianId : null,
        reviewedAt: action === "approve" ? now : null,
        fitSafetyConfirmed: planConfirmed,
        sourceDocumentIds: [...new Set(recommendation.evidence.map((source) => source.documentId))],
      },
    },
  };
}

router.post("/clinician/children/:childId/activity-recommendations/:recommendationId/review", async (req, res) => {
  const child = await clinicianChild(req, res);
  if (!child) return;
  const parsed = ReviewCareTeamActivityRecommendationBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Choose a review action and provide any requested detail." });
  const { action, fitSafetyConfirmed, reviewNote: rawReviewNote } = parsed.data;
  const reviewNote = String(rawReviewNote || "").trim();
  if (action === "request_details" && reviewNote.length < 3) {
    return res.status(400).json({ error: "Describe the missing detail so your team knows what to follow up on." });
  }
  const recommendationId = String(req.params.recommendationId);
  try {
    const current = await careWorkspace(child.id, req.user!.id);
    const recommendations = "activityRecommendations" in current ? current.activityRecommendations || [] : [];
    const recommendation = recommendations.find((item) => item.id === recommendationId);
    if (!recommendation) return res.status(404).json({ error: "This suggestion is no longer available. Reload the workspace." });
    if (action === "approve" && (recommendation.status === "needs_details" || recommendation.missingInformation.length > 0)) {
      return res.status(409).json({ error: "Complete the missing activity details before approving this suggestion." });
    }
    if (action === "approve" && !fitSafetyConfirmed) {
      return res.status(409).json({ error: "Confirm the child's current fit, familiarity, and safety before approval." });
    }
    const nextStatus = action === "start_review" ? "needs_review"
      : action === "approve" ? "approved"
        : action === "reject" ? "rejected"
          : "needs_details";
    const prepared = recommendationReviewDefinition(recommendation, req.user!.id, action, reviewNote);
    if (action === "approve" && !isCareTeamRecommendationComplete(
      prepared.definition,
      activityReviewFor(prepared.definition),
    )) {
      return res.status(409).json({ error: "Complete and verify the missing activity details before approval." });
    }
    const result = await db.transaction(async (tx) => {
      await tx.select({ id: childrenTable.id }).from(childrenTable)
        .where(eq(childrenTable.id, child.id)).for("update");
      const existing = await tx.select().from(careTeamAssignmentsTable).where(and(
        eq(careTeamAssignmentsTable.childId, child.id),
        eq(careTeamAssignmentsTable.clinicianId, req.user!.id),
      )).for("update");
      const matching = existing.find((row) => activityReviewFor(row.definition)?.recommendationId === recommendationId);
      if (matching) return { row: matching, created: false };
      const [row] = await tx.insert(careTeamAssignmentsTable).values({
        childId: child.id,
        clinicianId: req.user!.id,
        tenantId: child.tenantId || req.user!.id,
        goalId: prepared.goalId,
        libraryId: prepared.libraryId,
        definition: prepared.definition,
        status: nextStatus,
        version: 0,
        publishedAt: null,
        updatedAt: new Date(),
      }).returning();
      return { row, created: true };
    });
    return res.status(result.created ? 201 : 200).json(await assignmentWire(result.row));
  } catch (e) {
    return fail(res, e);
  }
});

router.post("/parent/children/:childId/assignments/:assignmentId/progress", requireParent, async (req, res) => {
  const child = await parentChild(req, res);
  if (!child) return;
  const input = SaveCareTeamPracticeProgressBody.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: "Invalid activity position" });
  try {
    const row = await db.transaction(async tx => {
      const [a] = await tx.select().from(careTeamAssignmentsTable).where(and(
        eq(careTeamAssignmentsTable.id, String(req.params.assignmentId)), eq(careTeamAssignmentsTable.childId, child.id),
        eq(careTeamAssignmentsTable.clinicianId, child.clinicianId || ""), eq(careTeamAssignmentsTable.status, "published"),
      )).for("update");
      if (!a) return null;
      if (a.version !== input.data.version) throw new Conflict("The care team updated this activity. Reload the current instructions.");
      const [v] = await tx.select().from(careTeamVersionsTable).where(and(eq(careTeamVersionsTable.assignmentId, a.id), eq(careTeamVersionsTable.version, a.version)));
      if (!v || input.data.currentStep > resolveAssignment(v.snapshot).steps.length) throw new Conflict("That instruction is unavailable.");
      await tx.insert(parentPracticeProgressTable).values({
        parentId: parentActor(req).id, childId: child.id, actionKey: `assignment:${a.id}:v${a.version}`,
        currentStep: input.data.currentStep, bookmarked: input.data.bookmarked,
      }).onConflictDoUpdate({
        target: [parentPracticeProgressTable.parentId, parentPracticeProgressTable.childId, parentPracticeProgressTable.actionKey],
        set: { currentStep: input.data.currentStep, bookmarked: input.data.bookmarked, updatedAt: new Date() },
      });
      return a;
    });
    if (!row) return res.status(404).json({ error: "Published activity not found" });
    return res.json(await assignmentWire(row, parentActor(req).id));
  } catch (e) { return fail(res, e); }
});
router.post("/parent/children/:childId/assignments/:assignmentId/feedback", requireParent, async (req, res) => {
  const child = await parentChild(req, res);
  if (!child) return;
  const input = RecordCareTeamPracticeBody.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: "Choose an update and keep notes under 4000 characters." });
  const parentId = parentActor(req).id;
  try {
    const record = await db.transaction(async tx => {
      const [a] = await tx.select().from(careTeamAssignmentsTable).where(and(
        eq(careTeamAssignmentsTable.id, String(req.params.assignmentId)), eq(careTeamAssignmentsTable.childId, child.id),
        eq(careTeamAssignmentsTable.clinicianId, child.clinicianId || ""),
      )).for("update");
      if (!a) return null;
      const [prior] = await tx.select().from(careTeamPracticeTable).where(and(eq(careTeamPracticeTable.parentId, parentId), eq(careTeamPracticeTable.requestId, input.data.requestId)));
      if (prior) {
        if (prior.assignmentId !== a.id || prior.childId !== child.id || prior.version !== input.data.version) throw new Conflict("This update key already belongs to a different activity.");
        return prior;
      }
      // Keep earlier-version feedback tied to the instructions actually seen,
      // even if the clinician has since published a newer version.
      const [version] = await tx.select().from(careTeamVersionsTable).where(and(
        eq(careTeamVersionsTable.assignmentId, a.id), eq(careTeamVersionsTable.version, input.data.version),
      ));
      if (!version) throw new Conflict("This activity version was never published.");
      if (a.status !== "published") throw new Conflict("This assignment is no longer active. Your existing history is preserved.");
      const [saved] = await tx.insert(careTeamPracticeTable).values({
        assignmentId: a.id, childId: child.id, parentId, version: input.data.version, outcome: input.data.outcome,
        note: input.data.note?.trim() || null, requestId: input.data.requestId,
      }).onConflictDoNothing().returning();
      if (saved) return saved;
      const [duplicate] = await tx.select().from(careTeamPracticeTable).where(and(
        eq(careTeamPracticeTable.parentId, parentId), eq(careTeamPracticeTable.requestId, input.data.requestId),
      ));
      if (!duplicate || duplicate.assignmentId !== a.id) throw new Conflict("This update has already been used.");
      return duplicate;
    });
    if (!record) return res.status(404).json({ error: "Published activity not found" });
    const history = await carePracticeHistory(child.id, child.clinicianId, parentId);
    return res.status(201).json(history.find(h => h.id === record.id));
  } catch (e) { return fail(res, e); }
});
export default router;
