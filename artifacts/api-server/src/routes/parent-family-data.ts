import { Router, type Request, type Response } from "express";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db, rewardTokensTable, messagesTable } from "@workspace/db";
import { CreateParentGoalBody, UpdateParentGoalBody, SendParentMessageBody } from "@workspace/api-zod";
import { ownedParentChild, parentActor, requireParent } from "../lib/parentAuth";
import { parentGoalOwnerIds } from "../lib/familyParentAuth";

const router = Router();
async function childScope(req: Request, res: Response) {
  const id = String(req.params.childId || "");
  const actor = parentActor(req);
  const child = await ownedParentChild(actor.id, id);
  if (!child) res.status(404).json({ error: "Child not found" });
  return child;
}
function editable(goal: typeof rewardTokensTable.$inferSelect, owners: string[]) {
  return !goal.createdByClinician && goal.source === "manual" && Boolean(goal.parentId && owners.includes(goal.parentId));
}
function goalWire(goal: typeof rewardTokensTable.$inferSelect, owners: string[]) {
  const title = (goal.goalTitle || goal.goalName || "Practice goal")
    .replace(/^(?:plan|document|clinical|parent|goal)[_:]+/i, "")
    .replace(/_/g, " ").trim();
  return {
    id: goal.id, childId: goal.childId!, title: title || "Practice goal",
    description: goal.goalDescription || goal.notes || "", progress: goal.progress ?? goal.tokensEarned ?? 0,
    target: goal.target || goal.tokensGoal || 10, source: goal.source || "manual",
    createdByClinician: Boolean(goal.createdByClinician || goal.source === "document"),
    canEdit: editable(goal, owners), canDelete: editable(goal, owners),
  };
}
router.get("/parent/children/:childId/goals", requireParent, async (req, res) => {
  const child = await childScope(req, res);
  if (!child) return;
  const owner = parentActor(req).id;
  const owners = await parentGoalOwnerIds(owner);
  const rows = await db.select().from(rewardTokensTable).where(eq(rewardTokensTable.childId, child.id)).orderBy(desc(rewardTokensTable.createdDate));
  // Parent-document findings from another account are not made public simply
  // because legacy credentials can access the clinical child.
  res.json(rows.filter(g => !g.source?.includes("parent_document") || g.parentId === owner)
    .filter(g => !g.createdByClinician || g.clinicianId === child.clinicianId)
    .map(g => goalWire(g, owners)));
});
router.post("/parent/children/:childId/goals", requireParent, async (req, res) => {
  const child = await childScope(req, res);
  if (!child) return;
  const checked = CreateParentGoalBody.safeParse(req.body);
  if (!checked.success || !checked.data.title.trim()) return res.status(400).json({ error: "A goal title and a valid target are required" });
  const owner = parentActor(req).id;
  const [row] = await db.insert(rewardTokensTable).values({
    childId: child.id, parentId: owner, clinicianId: child.clinicianId, tenantId: child.tenantId,
    goalTitle: checked.data.title.trim(), goalName: checked.data.title.trim(),
    goalDescription: checked.data.description || "", target: checked.data.target || 10,
    tokensGoal: checked.data.target || 10, progress: 0, tokensEarned: 0, source: "manual", createdByClinician: false,
  }).returning();
  return res.status(201).json(goalWire(row, [owner]));
});
router.patch("/parent/children/:childId/goals/:goalId", requireParent, async (req, res) => {
  const child = await childScope(req, res);
  if (!child) return;
  const owner = parentActor(req).id;
  const owners = await parentGoalOwnerIds(owner);
  const checked = UpdateParentGoalBody.safeParse(req.body);
  if (!checked.success || (checked.data.title !== undefined && !checked.data.title.trim())) return res.status(400).json({ error: "Invalid goal changes" });
  const condition = and(eq(rewardTokensTable.id, String(req.params.goalId)), eq(rewardTokensTable.childId, child.id));
  const [row] = await db.select().from(rewardTokensTable).where(condition);
  if (!row) return res.status(404).json({ error: "Goal not found" });
  if (!editable(row, owners)) return res.status(403).json({ error: "Clinical goals are read-only here. Record a parent observation instead." });
  const input = checked.data;
  if ((input.progress ?? row.progress ?? 0) > (input.target ?? row.target ?? 10)) return res.status(400).json({ error: "Progress cannot exceed the target" });
  const [updated] = await db.update(rewardTokensTable).set({
    ...(input.title !== undefined ? { goalTitle: input.title.trim(), goalName: input.title.trim() } : {}),
    ...(input.description !== undefined ? { goalDescription: input.description } : {}),
    ...(input.target !== undefined ? { target: input.target, tokensGoal: input.target } : {}),
    ...(input.progress !== undefined ? { progress: input.progress, tokensEarned: input.progress } : {}),
  }).where(and(condition, inArray(rewardTokensTable.parentId, owners), eq(rewardTokensTable.createdByClinician, false), eq(rewardTokensTable.source, "manual"))).returning();
  if (!updated) return res.status(409).json({ error: "Goal permissions changed. Reload before editing." });
  return res.json(goalWire(updated, owners));
});
router.delete("/parent/children/:childId/goals/:goalId", requireParent, async (req, res) => {
  const child = await childScope(req, res);
  if (!child) return;
  const owner = parentActor(req).id;
  const owners = await parentGoalOwnerIds(owner);
  const condition = and(eq(rewardTokensTable.id, String(req.params.goalId)), eq(rewardTokensTable.childId, child.id));
  const [row] = await db.select().from(rewardTokensTable).where(condition);
  if (!row) return res.status(404).json({ error: "Goal not found" });
  if (!editable(row, owners)) return res.status(403).json({ error: "Only your own manually created goals can be deleted" });
  const deleted = await db.delete(rewardTokensTable).where(and(condition, inArray(rewardTokensTable.parentId, owners), eq(rewardTokensTable.createdByClinician, false), eq(rewardTokensTable.source, "manual"))).returning({ id: rewardTokensTable.id });
  if (!deleted.length) return res.status(409).json({ error: "Goal permissions changed" });
  return res.status(204).end();
});
const messageWire = (m: typeof messagesTable.$inferSelect) => ({
  id: m.id, childId: m.childId!, content: m.content || "", senderRole: m.senderRole || "clinician", createdAt: m.createdDate!.toISOString(),
});
router.get("/parent/children/:childId/messages", requireParent, async (req, res) => {
  const child = await childScope(req, res);
  if (!child) return;
  if (!child.clinicianId) return res.json([]);
  const rows = await db.select().from(messagesTable).where(and(
    eq(messagesTable.childId, child.id),
    or(eq(messagesTable.tenantId, child.clinicianId), eq(messagesTable.tenantId, child.tenantId || child.clinicianId)),
  )).orderBy(desc(messagesTable.createdDate)).limit(200);
  return res.json(rows.map(messageWire));
});
router.post("/parent/children/:childId/messages", requireParent, async (req, res) => {
  const child = await childScope(req, res);
  if (!child) return;
  if (!child.clinicianId) return res.status(409).json({ error: "Connect to a clinic before sending care-team messages" });
  const checked = SendParentMessageBody.safeParse(req.body);
  if (!checked.success || !checked.data.content.trim()) return res.status(400).json({ error: "Enter a message of up to 5000 characters" });
  const [message] = await db.insert(messagesTable).values({
    childId: child.id, tenantId: child.clinicianId, fromUserId: parentActor(req).id,
    toUserId: child.clinicianId, senderRole: "parent", content: checked.data.content.trim(), isRead: false,
  }).returning();
  return res.status(201).json(messageWire(message));
});
export default router;
