import { Router, type Request, type Response } from "express";
import { and, eq, isNull } from "drizzle-orm";
import {
  db, childrenTable, userProfilesTable, rewardTokensTable, careTeamAssignmentsTable, careTeamVersionsTable,
  careTeamPracticeTable, parentPracticeProgressTable,
  parentAccountsTable, parentClinicConsentsTable,
} from "@workspace/db";
import {
  CreateCareTeamGoalBody, UpdateCareTeamGoalBody, CreateCareTeamAssignmentBody, UpdateCareTeamAssignmentBody,
  SaveCareTeamPracticeProgressBody, RecordCareTeamPracticeBody,
} from "@workspace/api-zod";
import { requireParent, parentActor, ownedParentChild } from "../lib/parentAuth";
import { careTeamActivityLibrary } from "../lib/parentDailyActions";
import { assignmentWire, careGoalWire, careWorkspace, readableGoalTitle, carePracticeHistory, resolveAssignment } from "../lib/careTeam";

const router = Router();
async function clinicianChild(req: Request, res: Response) {
  if (!req.user?.id) { res.status(401).json({ error: "Clinician sign-in required" }); return null; }
  const [profile] = await db.select().from(userProfilesTable).where(eq(userProfilesTable.id, req.user.id));
  if (profile?.appRole !== "clinician") { res.status(403).json({ error: "Clinician access required" }); return null; }
  const [child] = await db.select().from(childrenTable).where(and(
    eq(childrenTable.id, String(req.params.childId)), eq(childrenTable.clinicianId, req.user.id),
  ));
  let linkedWorkspace = false;
  if (child?.parentId && child.tenantId && ![req.user.id, profile.tenantId].includes(child.tenantId)) {
    const [parent] = await db.select().from(parentAccountsTable).where(eq(parentAccountsTable.id, child.parentId));
    const [grant] = await db.select().from(parentClinicConsentsTable).where(and(
      eq(parentClinicConsentsTable.parentId, child.parentId), eq(parentClinicConsentsTable.childId, child.id),
      eq(parentClinicConsentsTable.clinicianId, req.user.id), isNull(parentClinicConsentsTable.revokedAt),
    ));
    // Linking retains the original parent's workspace; it never migrates or
    // copies the child to a clinician tenant. Require the actual live link.
    linkedWorkspace = Boolean(parent && parent.workspaceId === child.tenantId && grant);
  }
  if (!child || (child.tenantId && ![req.user.id, profile.tenantId].includes(child.tenantId) && !linkedWorkspace)) {
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
      const [goal] = goalId ? await tx.select().from(rewardTokensTable).where(and(
        eq(rewardTokensTable.id, goalId), eq(rewardTokensTable.childId, child.id),
        eq(rewardTokensTable.clinicianId, req.user!.id), eq(rewardTokensTable.createdByClinician, true),
      )) : [];
      if (goalId && !goal) throw new Conflict("Choose an authorized care-team goal for this child.");
      if (status === "published" && goal && goal.publicationStatus !== "published") throw new Conflict("Publish the related goal before publishing this assignment.");
      const library = libraryId ? careTeamActivityLibrary().find(a => a.id === libraryId) : null;
      if (libraryId && !library) throw new Conflict("That library activity is unavailable.");
      const definition: Record<string, unknown> = library ? {
        libraryId, libraryVersion: library.version,
        notes: input.notes ?? old?.definition.notes ?? "", schedule: input.schedule ?? old?.definition.schedule ?? "",
      } : {
        ...(old?.libraryId ? {} : old?.definition || {}),
        ...Object.fromEntries(Object.entries(input).filter(([key]) => !["expectedVersion", "status", "goalId", "libraryId"].includes(key))),
      };
      const resolved = resolveAssignment(definition);
      if (!library && (!resolved.title.trim() || !resolved.description.trim() || !resolved.skill.trim() ||
        !resolved.steps.length || resolved.steps.some(s => !s.trim()))) throw new Conflict("Custom activities need a title, skill, description and at least one original instruction.");
      const version = (old?.version || 0) + (status === "published" ? 1 : 0);
      const now = new Date();
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
