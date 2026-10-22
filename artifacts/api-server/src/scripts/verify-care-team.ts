/** Real-HTTP development regression using the isolated fixtures created by
 * verify-parent-family-bridge.ts. Never touches existing customer records. */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { and, eq, gt, desc } from "drizzle-orm";
import {
  db, pool, childrenTable, clientSessionsTable, mobileTokensTable, rewardTokensTable,
  careTeamVersionsTable, careTeamPracticeTable, parentClinicConsentsTable, parentLogsTable,
  documentsTable, clientProfilesTable,
} from "@workspace/db";
import { createSession } from "../lib/auth";
if (process.env.REPLIT_DEPLOYMENT) throw new Error("Development verification only");
const f = JSON.parse(await fs.readFile("/tmp/np-parent-unification-fixtures.json", "utf8"));
const cases: { name: string; status: string }[] = [];
const call = async (path: string, method = "GET", data?: unknown, headers: Record<string, string> = {}) => {
  const r = await fetch(`http://localhost:80/api${path}`, {
    method, headers: { ...headers, ...(data ? { "Content-Type": "application/json" } : {}) },
    body: data ? JSON.stringify(data) : undefined,
  });
  const text = await r.text();
  let body: any;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: r.status, data: body };
};
const test = async (name: string, fn: () => Promise<void>) => {
  try { await fn(); cases.push({ name, status: "PASS" }); }
  catch (e) { cases.push({ name, status: `FAIL: ${e instanceof Error ? e.message : String(e)}` }); }
};
const login = await call("/mobile/clinician/login", "POST", { email: f.clinician.email, password: f.clinician.password });
assert.equal(login.status, 200);
const ch = { Authorization: `Bearer ${login.data.token}` };
const [familySession] = await db.select().from(clientSessionsTable).where(and(
  eq(clientSessionsTable.childId, f.legacy.childId), gt(clientSessionsTable.expiresAt, new Date()),
)).orderBy(desc(clientSessionsTable.expiresAt)).limit(1);
const [nativeSession] = await db.select().from(mobileTokensTable).where(and(
  eq(mobileTokensTable.childId, f.legacy.childId), gt(mobileTokensTable.expiresAt, new Date()),
)).orderBy(desc(mobileTokensTable.expiresAt)).limit(1);
assert.ok(familySession?.inviteToken); assert.ok(nativeSession?.token);
const ph = { "X-Family-Token": familySession.inviteToken! };
const nh = { "X-Mobile-Token": nativeSession.token };
const dh = { "X-Parent-Token": f.direct.token };
const lh = { "X-Parent-Token": f.linking.token };
const c = `/clinician/children/${f.legacy.childId}`;
const p = `/parent/children/${f.legacy.childId}`;
const goalBody = { title: "Ask for a Break", description: "Use the existing break signal during a familiar calm activity.", skill: "Communication", measurement: "observation", milestones: ["Use the existing break signal"], status: "draft" };
let goal: any, assignment: any, custom: any, library: any;
await test("Existing activity library has original steps and stable version references", async () => {
  const r = await call("/care-team/activity-library");
  assert.equal(r.status, 200); assert.ok(r.data.length > 5);
  library = r.data.find((a: any) => a.id === "break-request");
  assert.ok(library.steps.length); assert.equal(library.version, 1);
});
await test("Clinician creates a draft in existing reward_tokens; drafts hidden on every parent/client read", async () => {
  const r = await call(`${c}/care-goals`, "POST", goalBody, ch);
  assert.equal(r.status, 201); goal = r.data; assert.equal(goal.status, "draft");
  const [stored] = await db.select().from(rewardTokensTable).where(eq(rewardTokensTable.id, goal.id));
  assert.equal(stored.source, "care_team"); assert.equal(stored.progress, 0);
  for (const headers of [ph, nh]) {
    assert.equal((await call(`${p}/care-team`, "GET", undefined, headers)).data.goals.some((g: any) => g.id === goal.id), false);
    assert.equal((await call(`${p}/goals`, "GET", undefined, headers)).data.some((g: any) => g.id === goal.id), false);
  }
  const portal = await call("/client-portal-data", "POST", { child_id: f.legacy.childId, invite_token: familySession.inviteToken });
  assert.equal(portal.data.goals.some((g: any) => g.id === goal.id), false);
  assert.equal((await call("/mobile/reward-tokens", "GET", undefined, nh)).data.some((g: any) => g.id === goal.id), false);
});
await test("Publishing/editing keeps the original goal ID and version history without changing clinical progress", async () => {
  const pub = await call(`${c}/care-goals/${goal.id}`, "PATCH", { ...goalBody, status: "published", expectedVersion: goal.version }, ch);
  assert.equal(pub.status, 200); goal = pub.data;
  const edit = await call(`${c}/care-goals/${goal.id}`, "PATCH", { ...goalBody, title: "Ask for a Familiar Break", status: "published", expectedVersion: goal.version }, ch);
  assert.equal(edit.status, 200); assert.equal(edit.data.id, goal.id); goal = edit.data;
  const [stored] = await db.select().from(rewardTokensTable).where(eq(rewardTokensTable.id, goal.id));
  assert.equal(stored.goalVersions.length, 2); assert.equal(stored.progress, 0);
  assert.ok((await call(`${p}/care-team`, "GET", undefined, ph)).data.goals.some((g: any) => g.id === goal.id));
});
await test("Assign library activity by reference as Draft, then publish to the correct child", async () => {
  const r = await call(`${c}/assignments`, "POST", { libraryId: library.id, goalId: goal.id }, ch);
  assert.equal(r.status, 201); assignment = r.data; assert.equal(assignment.status, "draft");
  assert.equal((await call(`${p}/care-team`, "GET", undefined, ph)).data.assignments.some((a: any) => a.id === assignment.id), false);
  const pub = await call(`${c}/assignments/${assignment.id}`, "PATCH", { status: "published", expectedVersion: assignment.version }, ch);
  assert.equal(pub.status, 200); assignment = pub.data;
  assert.deepEqual(assignment.steps, library.steps);
  const parent = (await call(`${p}/care-team`, "GET", undefined, ph)).data;
  assert.ok(parent.assignments.some((a: any) => a.id === assignment.id));
  assert.ok(parent.goals.find((g: any) => g.id === goal.id).linkedActivityIds.includes(assignment.id));
  const [v] = await db.select().from(careTeamVersionsTable).where(eq(careTeamVersionsTable.assignmentId, assignment.id));
  assert.equal(v.snapshot.libraryId, library.id); assert.equal(v.snapshot.steps, undefined);
});
await test("Custom activity publishes original clinician instructions without generated replacements", async () => {
  const r = await call(`${c}/assignments`, "POST", {
    title: "Familiar Communication Practice", description: "Practice during an easy familiar activity.",
    skill: "Communication", steps: ["Make the familiar communication tool available.", "Model the existing request once.", "Honor the request according to the established plan."],
    materials: "Existing communication tool", goalId: goal.id, estimatedMinutes: 5, status: "published",
  }, ch);
  assert.equal(r.status, 201); custom = r.data;
  assert.equal(custom.steps[0], "Make the familiar communication tool available.");
});
await test("Cross-clinician, cross-child and cross-family mutations/reads are denied server-side", async () => {
  const [otherChild] = await db.select().from(childrenTable).where(eq(childrenTable.id, f.legacy.crossId));
  const otherSid = await createSession({ user: { id: otherChild.clinicianId! }, access_token: "synthetic" } as any);
  const other = { Authorization: `Bearer ${otherSid}` };
  assert.equal((await call(`${c}/goals-activities`, "GET", undefined, other)).status, 404);
  assert.equal((await call(`${c}/assignments/${custom.id}`, "PATCH", { status: "archived", expectedVersion: custom.version }, other)).status, 404);
  assert.equal((await call(`/parent/children/${f.legacy.otherId}/assignments/${custom.id}/feedback`, "POST", { version: 1, outcome: "tried", requestId: crypto.randomUUID() }, ph)).status, 404);
  assert.equal((await call(`${p}/care-team`, "GET", undefined, dh)).status, 404);
  assert.equal((await call(`${c}/assignments`, "POST", {
    title: custom.title,
    description: custom.description,
    skill: custom.skill,
    steps: custom.steps,
    materials: custom.materials,
    estimatedMinutes: custom.estimatedMinutes,
    goalId: f.linking.goalId,
    status: "published",
  }, ch)).status, 409);
});
await test("Legacy web and native sessions receive identical assignments, sibling has none; independent parent retains empty care-team support", async () => {
  assert.deepEqual((await call(`${p}/care-team`, "GET", undefined, ph)).data.assignments.map((a: any) => a.id),
    (await call(`${p}/care-team`, "GET", undefined, nh)).data.assignments.map((a: any) => a.id));
  assert.equal((await call(`/parent/children/${f.legacy.siblingId}/care-team`, "GET", undefined, ph)).data.assignments.length, 0);
  const independent = await call(`/parent/children/${f.direct.childId}/care-team`, "GET", undefined, dh);
  assert.equal(independent.status, 200); assert.equal(independent.data.goals.length, 0); assert.equal(independent.data.assignments.length, 0);
});
await test("Individual self-managed client credentials cannot gain caregiver assignment access", async () => {
  const [session] = await db.select().from(clientSessionsTable).where(eq(clientSessionsTable.childId, f.individual.childId)).orderBy(desc(clientSessionsTable.expiresAt)).limit(1);
  assert.ok(session);
  assert.equal((await call(`/parent/children/${f.individual.childId}/care-team`, "GET", undefined, { "X-Family-Token": session.inviteToken! })).status, 409);
});
await test("Saved step and bookmark persist on the same assignment/version across web and native requests", async () => {
  const r = await call(`${p}/assignments/${custom.id}/progress`, "POST", { version: custom.version, currentStep: 1, bookmarked: true }, ph);
  assert.equal(r.status, 200); assert.equal(r.data.currentStep, 1);
  const a = (await call(`${p}/care-team`, "GET", undefined, nh)).data.assignments.find((a: any) => a.id === custom.id);
  assert.equal(a.bookmarked, true); assert.equal(a.currentStep, 1);
});
let firstFeedback: any;
await test("Optional feedback is idempotent, in parent and clinician History, and never changes clinical mastery", async () => {
  const request = { version: custom.version, outcome: "tried", note: "Used the familiar request once during calm practice.", requestId: crypto.randomUUID() };
  const r = await call(`${p}/assignments/${custom.id}/feedback`, "POST", request, ph);
  assert.equal(r.status, 201); firstFeedback = r.data;
  const retry = await call(`${p}/assignments/${custom.id}/feedback`, "POST", request, ph);
  assert.equal(retry.data.id, firstFeedback.id);
  assert.ok((await call(`${p}/care-team`, "GET", undefined, ph)).data.recentPractice.some((p: any) => p.id === firstFeedback.id));
  assert.ok((await call(`${c}/goals-activities`, "GET", undefined, ch)).data.recentPractice.some((p: any) => p.id === firstFeedback.id));
  const [g] = await db.select().from(rewardTokensTable).where(eq(rewardTokensTable.id, goal.id));
  assert.equal(g.progress, 0); assert.equal(g.tokensEarned, 0);
});
await test("Published instruction edits preserve original feedback/version; stale progress returns 409", async () => {
  const oldSteps = [...custom.steps];
  const r = await call(`${c}/assignments/${custom.id}`, "PATCH", { title: "Updated Familiar Practice", steps: ["Follow the newly confirmed communication plan."], status: "published", expectedVersion: custom.version }, ch);
  assert.equal(r.status, 200); const oldVersion = custom.version; custom = r.data;
  assert.equal(custom.version, oldVersion + 1);
  assert.equal((await call(`${p}/assignments/${custom.id}/progress`, "POST", { version: oldVersion, currentStep: 0, bookmarked: true }, ph)).status, 409);
  const prior = (await call(`${c}/goals-activities`, "GET", undefined, ch)).data.recentPractice.find((p: any) => p.id === firstFeedback.id);
  assert.equal(prior.version, oldVersion); assert.deepEqual(prior.steps, oldSteps); assert.equal(prior.title, "Familiar Communication Practice");
});
await test("Pausing and archiving hide current assignments but preserve historical feedback", async () => {
  const r = await call(`${c}/assignments/${custom.id}`, "PATCH", { status: "paused", expectedVersion: custom.version }, ch);
  assert.equal(r.status, 200);
  assert.equal((await call(`${p}/care-team`, "GET", undefined, ph)).data.assignments.some((a: any) => a.id === custom.id), false);
  assert.equal((await call(`${p}/assignments/${custom.id}/feedback`, "POST", { version: custom.version, outcome: "tried", requestId: crypto.randomUUID() }, ph)).status, 409);
  assert.equal((await call(`${c}/assignments/${custom.id}`, "PATCH", { status: "archived", expectedVersion: custom.version }, ch)).status, 200);
  assert.ok((await call(`${p}/care-team`, "GET", undefined, ph)).data.recentPractice.some((p: any) => p.id === firstFeedback.id));
});
await test("Parents cannot edit clinician goals; legacy CRUD cannot bypass clinical publication/history", async () => {
  assert.equal((await call(`${p}/goals/${goal.id}`, "PATCH", { title: "Unauthorized" }, ph)).status, 403);
  assert.equal((await call("/manage-client-goal", "POST", { action: "update", entity_id: goal.id, invite_token: familySession.inviteToken, data: { goal_title: "Unauthorized" } })).status, 403);
  assert.equal((await call(`/reward-tokens/${goal.id}`, "DELETE", undefined, ch)).status, 409);
  assert.equal((await call(`/reward-tokens/${goal.id}`, "PATCH", { publication_status: "draft" }, ch)).status, 409);
});
await test("Direct linked parent practice and observations are consent-filtered immediately on grant/revocation", async () => {
  const lc = `/clinician/children/${f.linking.childId}`, lp = `/parent/children/${f.linking.childId}`;
  const cg = await call(`${lc}/care-goals`, "POST", { ...goalBody, status: "published" }, ch);
  assert.equal(cg.status, 201);
  const a = await call(`${lc}/assignments`, "POST", { libraryId: library.id, goalId: cg.data.id, status: "published" }, ch);
  assert.equal(a.status, 201);
  const feedback = await call(`${lp}/assignments/${a.data.id}/feedback`, "POST", { version: a.data.version, outcome: "needed_support", note: "Synthetic consent-protected feedback", requestId: crypto.randomUUID() }, lh);
  assert.equal(feedback.status, 201);
  const observationId = crypto.randomUUID();
  const [linkedChild] = await db.select().from(childrenTable).where(eq(childrenTable.id, f.linking.childId));
  const privateGoalIds = [crypto.randomUUID(), crypto.randomUUID()];
  await db.insert(rewardTokensTable).values(privateGoalIds.map((id, index) => ({
    id, childId: linkedChild.id, parentId: f.linking.id, clinicianId: f.clinician.id, tenantId: linkedChild.tenantId,
    goalTitle: "Synthetic private family goal", goalDescription: "Not shared by linking or observations permission",
    createdByClinician: false, source: index ? "parent_document" : "manual",
  })));
  await db.insert(parentLogsTable).values({ id: observationId, parentId: f.linking.id, childId: f.linking.childId, workspaceId: linkedChild.tenantId!, happened: true, intensity: "low", duration: 0, notes: "Synthetic private observation" });
  const where = and(eq(parentClinicConsentsTable.parentId, f.linking.id), eq(parentClinicConsentsTable.childId, f.linking.childId));
  await db.update(parentClinicConsentsTable).set({ scopes: ["support"], revokedAt: null }).where(where);
  let workspace = (await call(`${lc}/goals-activities`, "GET", undefined, ch)).data;
  assert.equal(workspace.goals.some((g: any) => privateGoalIds.includes(g.id)), false);
  assert.equal(workspace.recentPractice.some((p: any) => p.id === feedback.data.id), false);
  assert.equal(workspace.observations.some((p: any) => p.id === observationId), false);
  await db.update(parentClinicConsentsTable).set({ scopes: ["support", "observations"] }).where(where);
  workspace = (await call(`${lc}/goals-activities`, "GET", undefined, ch)).data;
  assert.equal(workspace.recentPractice.some((p: any) => p.id === feedback.data.id), true);
  assert.equal(workspace.observations.some((p: any) => p.id === observationId), true);
  assert.equal(workspace.goals.some((g: any) => privateGoalIds.includes(g.id)), false);
  await db.update(parentClinicConsentsTable).set({ scopes: ["support"] }).where(where);
  assert.equal((await call(`${lc}/goals-activities`, "GET", undefined, ch)).data.recentPractice.some((p: any) => p.id === feedback.data.id), false);
});
await test("Missing targets, wrong-child goals, unpublished linked goals and version conflicts are rejected", async () => {
  assert.equal((await call(`${c}/care-goals`, "POST", { ...goalBody, measurement: "percentage", target: 101 }, ch)).status, 400);
  assert.equal((await call(`${c}/care-goals`, "POST", { ...goalBody, measurement: "frequency" }, ch)).status, 400);
  assert.equal((await call(`${c}/care-goals/${goal.id}`, "PATCH", { ...goalBody, expectedVersion: 0 }, ch)).status, 409);
  const draft = await call(`${c}/care-goals`, "POST", goalBody, ch);
  assert.equal((await call(`${c}/assignments`, "POST", { libraryId: library.id, goalId: draft.data.id, status: "published" }, ch)).status, 409);
});
await test("Archived goals disappear without deletion; original rows and all publication history remain", async () => {
  const r = await call(`${c}/care-goals/${goal.id}`, "PATCH", { ...goalBody, status: "archived", expectedVersion: goal.version }, ch);
  assert.equal(r.status, 200);
  assert.equal((await call(`${p}/care-team`, "GET", undefined, ph)).data.goals.some((g: any) => g.id === goal.id), false);
  assert.equal((await call(`${p}/goals`, "GET", undefined, ph)).data.some((g: any) => g.id === goal.id), false);
  const [stored] = await db.select().from(rewardTokensTable).where(eq(rewardTokensTable.id, goal.id));
  assert.equal(stored.publicationStatus, "archived"); assert.equal(stored.goalVersions.length, 2);
  const repub = await call(`${c}/care-goals/${goal.id}`, "PATCH", { ...goalBody, status: "published", expectedVersion: r.data.version }, ch);
  assert.equal(repub.status, 200); goal = repub.data;
});
await test("Failed document re-read preserves prior profile, clinical goals, and specific persisted error", async () => {
  const [original] = await db.select().from(clientProfilesTable).where(eq(clientProfilesTable.childId, f.legacy.childId));
  const before = await db.select().from(rewardTokensTable).where(eq(rewardTokensTable.childId, f.legacy.childId));
  if (!original) await db.insert(clientProfilesTable).values({
    childId: f.legacy.childId, clinicianId: f.clinician.id, tenantId: f.clinician.id,
    behaviors: [{ name: "Preserved synthetic support" }], goals: [{ title: "Preserved saved goal" }],
  });
  const [profile] = await db.select().from(clientProfilesTable).where(eq(clientProfilesTable.childId, f.legacy.childId));
  const docId = crypto.randomUUID();
  await db.insert(documentsTable).values({
    id: docId, childId: f.legacy.childId, clinicianId: f.clinician.id, tenantId: f.clinician.id,
    title: "Synthetic unreadable retry document", fileName: "missing.pdf", fileUrl: "/api/uploads/synthetic-not-present.pdf",
  });
  const scan = await call("/build-client-profile", "POST", { child_id: f.legacy.childId, force_rebuild: true }, ch);
  assert.equal(scan.status, 422);
  const [after] = await db.select().from(clientProfilesTable).where(eq(clientProfilesTable.id, profile.id));
  assert.deepEqual(after.behaviors, profile.behaviors); assert.deepEqual(after.goals, profile.goals);
  const goalsAfter = await db.select().from(rewardTokensTable).where(eq(rewardTokensTable.childId, f.legacy.childId));
  assert.deepEqual(goalsAfter.map(g => g.id).sort(), before.map(g => g.id).sort());
  const [bad] = await db.select().from(documentsTable).where(eq(documentsTable.id, docId));
  assert.equal(bad.scanStatus, "error"); assert.match(bad.scanError!, /could not be found/);
});
await fs.writeFile("/tmp/np-care-team-results.json", JSON.stringify(cases, null, 2));
await fs.writeFile("/tmp/np-care-team-browser.json", JSON.stringify({ fixtureFile: "/tmp/np-parent-unification-fixtures.json", clinicianToken: login.data.token, familyToken: familySession.inviteToken, assignmentId: assignment.id, goalId: goal.id }), { mode: 0o600 });
process.stdout.write(cases.map(c => `${c.status}: ${c.name}`).join("\n") + "\n");
process.exitCode = cases.some(c => c.status !== "PASS") ? 1 : 0;
await pool.end();
