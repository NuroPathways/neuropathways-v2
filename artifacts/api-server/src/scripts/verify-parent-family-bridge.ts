/**
 * Development-only integration regression. Creates isolated synthetic fixtures;
 * credentials are written only to a mode-0600 /tmp file for the browser tester.
 * No existing account, clinical record, schema, or production data is changed.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { and, count, desc, eq, gt } from "drizzle-orm";
import {
  db, usersTable, userProfilesTable, clinicianCredentialsTable, familiesTable, childrenTable,
  parentAccountsTable, parentChildSettingsTable, parentClinicInvitesTable,
  behaviorPlansTable, behaviorLogsTable, rewardTokensTable, documentsTable,
  clientSessionsTable, mobileTokensTable,
} from "@workspace/db";
import { hashParentPassword, createParentSession } from "../lib/parentAuth";
import { makeStarterCard } from "../lib/parentStarterLibrary";

if (process.env.REPLIT_DEPLOYMENT) throw new Error("This verification must never run in production");
const base = "http://localhost:80/api";
const fixturePath = "/tmp/np-parent-unification-fixtures.json";
const id = () => crypto.randomUUID();
const password = `Synthetic-${crypto.randomBytes(16).toString("hex")}`;
const code = crypto.randomBytes(8).toString("hex").toUpperCase();
async function saltedHash(value: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = await new Promise<Buffer>((resolve, reject) => crypto.scrypt(value, salt, 64, (e, k) => e ? reject(e) : resolve(k)));
  return `${salt}:${key.toString("hex")}`;
}
async function seed() {
  const run = id();
  const clinicianA = id(), clinicianB = id(), familyA = id(), familyOther = id(), individualFamily = id(), unknownFamily = id(), independentFamily = id();
  const a = id(), b = id(), cross = id(), other = id(), individual = id(), individualSibling = id(), unknown = id(), oldIndependent = id();
  const direct = id(), workspace = id(), directChild = id(), directSibling = id();
  const linking = id(), linkingWorkspace = id(), linkingChild = id(), inviteFamily = id(), clinicDuplicate = id(), invite = crypto.randomBytes(32).toString("base64url");
  const clinicalGoal = id(), mergeGoal = id();
  const clinicianEmail = `np-check-clinician-${run}@example.test`;
  const directEmail = `np-check-parent-${run}@example.test`;
  const linkingEmail = `np-check-link-${run}@example.test`;
  const username = `np-check-${run.slice(0, 12)}`;
  const accessCodeHash = await saltedHash(code);
  const parentHash = await hashParentPassword(password);
  const clinicianHash = await saltedHash(password);
  await db.transaction(async tx => {
    await tx.insert(usersTable).values([
      { id: clinicianA, email: clinicianEmail, firstName: "Verification Clinician" },
      { id: clinicianB, email: `np-check-other-clinician-${run}@example.test`, firstName: "Other Clinician" },
      { id: direct, email: directEmail, firstName: "Verification Parent" },
      { id: linking, email: linkingEmail, firstName: "Linking Parent" },
    ]);
    await tx.insert(userProfilesTable).values([
      { id: clinicianA, tenantId: clinicianA, appRole: "clinician", accountType: "clinician", firstName: "Verification Clinician" },
      { id: clinicianB, tenantId: clinicianB, appRole: "clinician", accountType: "clinician", firstName: "Other Clinician" },
      { id: direct, tenantId: workspace, appRole: "parent", accountType: "parent_free", linkedFamilyId: workspace },
      { id: linking, tenantId: linkingWorkspace, appRole: "parent", accountType: "parent_free", linkedFamilyId: linkingWorkspace },
    ]);
    await tx.insert(clinicianCredentialsTable).values({ userId: clinicianA, email: clinicianEmail, passwordHash: clinicianHash });
    await tx.insert(parentAccountsTable).values([
      { id: direct, email: directEmail, firstName: "Verification Parent", workspaceId: workspace, passwordHash: parentHash },
      { id: linking, email: linkingEmail, firstName: "Linking Parent", workspaceId: linkingWorkspace, passwordHash: parentHash },
    ]);
    await tx.insert(familiesTable).values([
      { id: familyA, tenantId: clinicianA, clinicianId: clinicianA, accountType: "parent", familyName: "Verification Family", email: `np-check-family-${run}@example.test` },
      { id: familyOther, tenantId: clinicianA, clinicianId: clinicianA, accountType: "parent", familyName: "Other Family" },
      { id: individualFamily, tenantId: clinicianA, clinicianId: clinicianA, accountType: "individual", familyName: "Individual" },
      { id: unknownFamily, tenantId: clinicianA, clinicianId: clinicianA, accountType: "unrecognized", familyName: "Unknown" },
      { id: independentFamily, tenantId: independentFamily, accountType: "independent", familyName: "Legacy Independent" },
      { id: workspace, tenantId: workspace, accountType: "parent_free", createdBy: direct, email: directEmail },
      { id: linkingWorkspace, tenantId: linkingWorkspace, accountType: "parent_free", createdBy: linking, email: linkingEmail },
      { id: inviteFamily, tenantId: clinicianA, clinicianId: clinicianA, accountType: "parent", familyName: "Invitation Family", email: linkingEmail },
    ]);
    await tx.insert(childrenTable).values([
      { id: a, familyId: familyA, tenantId: clinicianA, clinicianId: clinicianA, accountType: "parent", childName: "River", username, accessCode: accessCodeHash },
      { id: b, familyId: familyA, tenantId: clinicianA, clinicianId: clinicianA, accountType: "parent", childName: "Sky", username: `${username}-sibling`, accessCode: accessCodeHash },
      { id: cross, familyId: familyA, tenantId: clinicianB, clinicianId: clinicianB, accountType: "parent", childName: "Cross-clinician fixture" },
      { id: other, familyId: familyOther, tenantId: clinicianA, clinicianId: clinicianA, accountType: "parent", childName: "Other-family fixture" },
      { id: individual, familyId: individualFamily, tenantId: clinicianA, clinicianId: clinicianA, accountType: "individual", childName: "Individual fixture", username: `${username}-individual`, accessCode: accessCodeHash },
      { id: individualSibling, familyId: individualFamily, tenantId: clinicianA, clinicianId: clinicianA, accountType: "individual", childName: "Other individual fixture" },
      { id: unknown, familyId: unknownFamily, tenantId: clinicianA, clinicianId: clinicianA, accountType: "unrecognized", childName: "Unknown fixture", username: `${username}-unknown`, accessCode: accessCodeHash },
      { id: oldIndependent, familyId: independentFamily, tenantId: independentFamily, accountType: "independent", childName: "Legacy independent fixture", username: `${username}-old`, accessCode: accessCodeHash },
      { id: directChild, familyId: workspace, tenantId: workspace, parentId: direct, accountType: "parent_free", childName: "Alex" },
      { id: directSibling, familyId: workspace, tenantId: workspace, parentId: direct, accountType: "parent_free", childName: "Sam" },
      { id: linkingChild, familyId: linkingWorkspace, tenantId: linkingWorkspace, parentId: linking, accountType: "parent_free", childName: "Casey" },
      { id: clinicDuplicate, familyId: inviteFamily, tenantId: clinicianA, clinicianId: clinicianA, accountType: "parent", childName: "Casey" },
    ]);
    const behaviors = [{ behaviorKey: "elopement", behaviorName: "Elopement / Running Away", customBehavior: null, goal: "Ask for a break" }];
    await tx.insert(parentChildSettingsTable).values([
      { parentId: direct, childId: directChild, workspaceId: workspace, behaviors, supportCards: [makeStarterCard("elopement", null, "Ask for a break")] },
      { parentId: direct, childId: directSibling, workspaceId: workspace, behaviors, supportCards: [makeStarterCard("elopement", null, "Ask for a break")] },
      { parentId: linking, childId: linkingChild, workspaceId: linkingWorkspace, behaviors, supportCards: [makeStarterCard("elopement", null, "Ask for a break")] },
    ]);
    await tx.insert(behaviorPlansTable).values({
      childId: a, clinicianId: clinicianA, tenantId: clinicianA, behaviorName: "Elopement / Running Away",
      behaviorDescription: "Leaving a safe area can have many causes. Prioritize safety and familiar communication.",
      strategySteps: "During a calm supervised activity, offer a familiar way to ask for a break.\nAccept the request and pause.",
      deescalationSteps: "Reduce talking and focus on safety.\nContact emergency services if there is immediate danger.",
      avoidActions: "Do not create an unsafe situation to practice.",
    });
    await tx.insert(rewardTokensTable).values([
      { id: clinicalGoal, childId: a, clinicianId: clinicianA, tenantId: clinicianA, goalTitle: "Ask for a break", goalDescription: "Use a familiar break signal during calm practice", source: "document", createdByClinician: true, progress: 2, target: 10 },
      { id: mergeGoal, childId: clinicDuplicate, clinicianId: clinicianA, tenantId: clinicianA, goalTitle: "Ask for help", source: "document", createdByClinician: true, progress: 1, target: 5 },
    ]);
    await tx.insert(behaviorLogsTable).values({ childId: a, clinicianId: clinicianA, tenantId: clinicianA, behaviorType: "elopement", intensity: "low", notes: "Synthetic pre-existing observation" });
    await tx.insert(parentClinicInvitesTable).values({ familyId: inviteFamily, clinicianId: clinicianA, invitedEmail: linkingEmail, tokenHash: crypto.createHash("sha256").update(invite).digest("hex"), expiresAt: new Date(Date.now() + 86400000) });
  });
  const directToken = (await createParentSession(direct)).token;
  const linkingToken = (await createParentSession(linking)).token;
  const fixture = { run, clinician: { id: clinicianA, email: clinicianEmail, password }, direct: { id: direct, email: directEmail, password, token: directToken, childId: directChild, siblingId: directSibling },
    linking: { id: linking, email: linkingEmail, password, token: linkingToken, childId: linkingChild, duplicateId: clinicDuplicate, invite, goalId: mergeGoal },
    legacy: { username, accessCode: code, childId: a, siblingId: b, crossId: cross, otherId: other, clinicalGoal },
    individual: { username: `${username}-individual`, accessCode: code, childId: individual, siblingId: individualSibling },
    unknown: { username: `${username}-unknown`, accessCode: code }, oldIndependent: { username: `${username}-old`, accessCode: code, childId: oldIndependent } };
  await fs.writeFile(fixturePath, JSON.stringify(fixture), { mode: 0o600 });
  return fixture;
}
const f = process.argv.includes("--verify") ? JSON.parse(await fs.readFile(fixturePath, "utf8")) : await seed();
const results: Array<{ name: string; status: string }> = [];
const selectedCases = process.argv.find(v => v.startsWith("--only="))?.slice("--only=".length);
async function call(path: string, method = "GET", body?: any, headers: Record<string, string> = {}) {
  const res = await fetch(`${base}${path}`, { method, headers: { ...headers, ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}) }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}
async function check(name: string, fn: () => Promise<void>) {
  if (selectedCases && !new RegExp(selectedCases, "i").test(name)) return;
  try { await fn(); results.push({ name, status: "PASS" }); console.info(`PASS ${name}`); }
  catch (e) { results.push({ name, status: `FAIL: ${e instanceof Error ? e.message : String(e)}` }); console.error(`FAIL ${name}: ${e instanceof Error ? e.message : String(e)}`); }
}
const directHeaders = { "X-Parent-Token": f.direct.token }, linkHeaders = { "X-Parent-Token": f.linking.token };
const webLogin = async (v: any) => {
  // Follow-up checks reuse a legitimately issued fixture session, just as a
  // browser reload does. Login itself is tested by the initial full run.
  if (process.argv.includes("--verify")) {
    const [active] = await db.select().from(clientSessionsTable).where(and(
      eq(clientSessionsTable.username, v.username), gt(clientSessionsTable.expiresAt, new Date()),
    )).orderBy(desc(clientSessionsTable.expiresAt)).limit(1);
    if (active) {
      const restored = await call("/parent/session", "GET", undefined, { "X-Family-Token": active.inviteToken! });
      return { id: active.childId, invite_token: active.inviteToken, children: restored.status === 200 ? restored.data.children : [] };
    }
  }
  const r = await call("/verify-client-credentials", "POST", { username: v.username, access_code: v.accessCode });
  assert.equal(r.status, 200, "Legacy credential login");
  return r.data.session;
};
const mobileLogin = async (v: any) => {
  if (process.argv.includes("--verify")) {
    const [child] = await db.select().from(childrenTable).where(eq(childrenTable.username, v.username));
    const [active] = child ? await db.select().from(mobileTokensTable).where(and(
      eq(mobileTokensTable.childId, child.id), gt(mobileTokensTable.expiresAt, new Date()),
    )).orderBy(desc(mobileTokensTable.expiresAt)).limit(1) : [];
    if (active) {
      const restored = await call("/mobile/session", "GET", undefined, { "X-Mobile-Token": active.token });
      if (restored.status === 200) return { ...restored.data, token: active.token };
    }
  }
  const r = await call("/mobile/auth/login", "POST", { username: v.username, access_code: v.accessCode });
  assert.equal(r.status, 200, "Mobile credential login");
  return r.data;
};
const legacy = await webLogin(f.legacy);
const familyHeaders = { "X-Family-Token": legacy.invite_token };
const mobile = await mobileLogin(f.legacy);
const mobileHeaders = { "X-Mobile-Token": mobile.token };
const childPath = `/parent/children/${f.legacy.childId}`;
await check("Independent parent session retains both original children", async () => {
  const r = await call("/parent/session", "GET", undefined, directHeaders);
  assert.equal(r.status, 200); assert.equal(r.data.parent.accountType, "parent_free"); assert.equal(r.data.children.length, 2);
});
await check("Legacy family and native mobile use the same normalized two-child parent session", async () => {
  assert.equal(mobile.experience, "parent");
  assert.equal(legacy.children.length, 2);
  for (const headers of [familyHeaders, mobileHeaders]) {
    const r = await call("/parent/session", "GET", undefined, headers);
    assert.equal(r.status, 200); assert.equal(r.data.parent.accountType, "legacy_family");
    assert.deepEqual(r.data.children.map((c: any) => c.id).sort(), [f.legacy.childId, f.legacy.siblingId].sort());
  }
});
await check("Cross-family and cross-clinician reads and writes are denied", async () => {
  for (const target of [f.legacy.crossId, f.legacy.otherId, f.direct.childId]) {
    for (const headers of [familyHeaders, mobileHeaders]) {
      assert.equal((await call(`/parent/children/${target}/dashboard`, "GET", undefined, headers)).status, 404);
      assert.equal((await call(`/parent/children/${target}/goals`, "POST", { title: "Unauthorized" }, headers)).status, 404);
      assert.equal((await call(`/parent/children/${target}/family-tools`, "PUT", { routines: [], routineRuns: [], preferences: {}, reminders: [] }, headers)).status, 404);
    }
  }
});
await check("Existing plans/goals/logs are reused; a goal alone does not become a practice activity", async () => {
  const before = await db.select({ n: count() }).from(behaviorLogsTable).where(eq(behaviorLogsTable.childId, f.legacy.childId));
  const r = await call(`${childPath}/dashboard`, "GET", undefined, familyHeaders);
  assert.equal(r.status, 200);
  assert.ok(r.data.supportCards.length); assert.ok(r.data.logs.some((l: any) => l.notes === "Synthetic pre-existing observation"));
  const [goal] = await db.select().from(rewardTokensTable).where(eq(rewardTokensTable.id, f.legacy.clinicalGoal));
  assert.ok(goal, "The existing clinical goal remains intact");
  assert.equal(goal.progress, 2, "Opening parent support does not change clinical progress");
  assert.equal(r.data.dailyActions.some((a: any) => a.goalId === f.legacy.clinicalGoal), false,
    "A clinical goal without concrete activity instructions must not become a fake practice activity");
  const after = await db.select({ n: count() }).from(behaviorLogsTable).where(eq(behaviorLogsTable.childId, f.legacy.childId));
  assert.equal(before[0].n, after[0].n);
});
await check("A goal-only record cannot be opened or tracked as a fake activity", async () => {
  const fakeActivityPath = `${childPath}/daily-actions/${f.legacy.clinicalGoal}`;
  assert.equal((await call(`${fakeActivityPath}/practice-progress`, "PATCH", { currentStep: 1, bookmarked: true }, familyHeaders)).status, 404);
  assert.equal((await call(`${fakeActivityPath}/logs`, "POST", {
    eventType: "completion", rating: "helped", note: "Synthetic attempt against a goal-only record",
  }, familyHeaders)).status, 404);
});
await check("Routines and preferences persist without replacing family support settings", async () => {
  const state = { routines: [{ id: id(), name: "Morning routine", steps: [{ id: id(), text: "Choose a familiar item" }, { id: id(), text: "Ask for help" }], updatedAt: new Date().toISOString() }], routineRuns: [], preferences: { favoriteActivities: ["building blocks"], communicationMethods: ["picture card"] }, reminders: [] };
  assert.equal((await call(`${childPath}/family-tools`, "PUT", state, familyHeaders)).status, 200);
  const r = await call(`${childPath}/family-tools`, "GET", undefined, mobileHeaders);
  assert.equal(r.data.routines[0].name, "Morning routine");
  const dash = await call(`${childPath}/dashboard`, "GET", undefined, familyHeaders);
  assert.ok(dash.data.dailyActions.some((a: any) => a.description.includes("building blocks")));
  assert.ok(dash.data.child.behaviors.some((b: any) => b.behaviorKey === "elopement"));
});
await check("Clinical goal edits denied; parent goal create/edit/delete works", async () => {
  const clinical = `${childPath}/goals/${f.legacy.clinicalGoal}`;
  assert.equal((await call(clinical, "PATCH", { progress: 3 }, familyHeaders)).status, 403);
  assert.equal((await call(clinical, "DELETE", undefined, familyHeaders)).status, 403);
  const created = await call(`${childPath}/goals`, "POST", { title: "Ask for a turn", target: 5 }, familyHeaders);
  assert.equal(created.status, 201); assert.equal(created.data.canEdit, true);
  const r = await call(`${childPath}/goals/${created.data.id}`, "PATCH", { progress: 1 }, mobileHeaders);
  assert.equal(r.status, 200); assert.equal(r.data.progress, 1);
  assert.equal((await call(`${childPath}/goals/${created.data.id}`, "DELETE", undefined, familyHeaders)).status, 204);
});
await check("Manual observation appears exactly once in unified history", async () => {
  const r = await call(`${childPath}/logs`, "POST", { happened: true, intensity: "low", duration: 1, behaviorKey: "elopement", notes: "Synthetic manual observation" }, familyHeaders);
  assert.equal(r.status, 201);
  const dash = await call(`${childPath}/dashboard`, "GET", undefined, mobileHeaders);
  assert.equal(dash.data.logs.filter((l: any) => l.id === r.data.id).length, 1);
});
await check("Family personal notes persist without changing clinician-owned demographics or guidance", async () => {
  const [before] = await db.select().from(childrenTable).where(eq(childrenTable.id, f.legacy.childId));
  const updated = await call(childPath, "PATCH", { notes: "Synthetic personal family note" }, familyHeaders);
  assert.equal(updated.status, 200); assert.equal(updated.data.notes, "Synthetic personal family note");
  const [after] = await db.select().from(childrenTable).where(eq(childrenTable.id, f.legacy.childId));
  assert.equal(after.notes, before.notes);
  const dash = await call(`${childPath}/dashboard`, "GET", undefined, mobileHeaders);
  assert.ok(dash.data.supportCards.some((c: any) => c.source === "clinician_document"));
});
await check("Individual clients remain client-only and cannot select a sibling", async () => {
  const session = await webLogin(f.individual), native = await mobileLogin(f.individual);
  assert.equal(native.experience, "client");
  const r = await call("/parent/session", "GET", undefined, { "X-Family-Token": session.invite_token });
  assert.equal(r.status, 409); assert.equal(r.data.code, "individual_client");
  const h = { "X-Mobile-Token": native.token };
  assert.equal((await call("/mobile/children", "GET", undefined, h)).data.length, 1);
  assert.equal((await call("/mobile/behavior-plans", "GET", undefined, { ...h, "X-Mobile-Child-Id": f.individual.siblingId })).status, 403);
  assert.equal((await call("/client-portal-data", "POST", { child_id: f.individual.siblingId, invite_token: session.invite_token })).status, 403);
});
await check("Legacy independent families get parent support without a new account", async () => {
  const s = await webLogin(f.oldIndependent);
  const h = { "X-Family-Token": s.invite_token };
  assert.equal((await call("/parent/session", "GET", undefined, h)).data.parent.accountType, "legacy_family");
  assert.ok((await call(`/parent/children/${f.oldIndependent.childId}/dashboard`, "GET", undefined, h)).data.supportCards.length);
});
await check("Unknown family types fail safely rather than becoming parents", async () => {
  const s = await webLogin(f.unknown);
  assert.equal((await call("/parent/session", "GET", undefined, { "X-Family-Token": s.invite_token })).status, 409);
});
await check("Independent parent clinic connection preserves IDs and private documents", async () => {
  if (f.privateDocumentId) {
    // The invitation is single-use. A follow-up verification checks the state
    // created by the initial run instead of consuming it a second time.
    const session = await call("/parent/session", "GET", undefined, linkHeaders);
    assert.equal(session.status, 200);
    assert.ok(session.data.children.some((child: any) => child.id === f.linking.childId));
    const [goal] = await db.select().from(rewardTokensTable).where(eq(rewardTokensTable.id, f.linking.goalId));
    assert.equal(goal.childId, f.linking.childId);
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, f.privateDocumentId));
    assert.equal(doc.childId, f.linking.childId);
    const docs = await call(`/parent/children/${f.linking.childId}/documents`, "GET", undefined, linkHeaders);
    assert.equal(docs.status, 200); assert.equal(docs.data.find((d: any) => d.id === f.privateDocumentId).shared, false);
    assert.equal((await call(`/parent/documents/${f.privateDocumentId}/content`, "GET", undefined, familyHeaders)).status, 403);
    return;
  }
  const form = new FormData(); form.set("authorizedUploader", "true"); form.set("title", "Private verification plan");
  form.set("file", new Blob(["A synthetic private plan. Offer familiar communication and calm supervised practice."], { type: "text/plain" }), "verification-plan.txt");
  const uploaded = await call(`/parent/children/${f.linking.childId}/documents`, "POST", form, linkHeaders);
  assert.ok([200, 201].includes(uploaded.status), `Upload HTTP ${uploaded.status}`);
  f.privateDocumentId = uploaded.data.id;
  const linked = await call(`/parent/children/${f.linking.childId}/connect`, "POST", {
    inviteToken: f.linking.invite, sharing: "none", shareObservations: false, mergeChildId: f.linking.duplicateId, confirmMerge: true,
  }, linkHeaders);
  assert.equal(linked.status, 200, `Connect HTTP ${linked.status}: ${linked.data.error || ""}`);
  const [goal] = await db.select().from(rewardTokensTable).where(eq(rewardTokensTable.id, f.linking.goalId));
  assert.equal(goal.childId, f.linking.childId);
  const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, uploaded.data.id));
  assert.equal(doc.childId, f.linking.childId);
  const docs = await call(`/parent/children/${f.linking.childId}/documents`, "GET", undefined, linkHeaders);
  assert.equal(docs.status, 200); assert.equal(docs.data.find((d: any) => d.id === uploaded.data.id).shared, false);
  assert.equal((await call(`/parent/documents/${uploaded.data.id}/content`, "GET", undefined, familyHeaders)).status, 403);
});
await check("Care-team messages use the real shared thread", async () => {
  const sent = await call(`${childPath}/messages`, "POST", { content: "Synthetic parent-care-team message" }, familyHeaders);
  assert.equal(sent.status, 201); assert.equal(sent.data.senderRole, "parent");
  const read = await call(`${childPath}/messages`, "GET", undefined, mobileHeaders);
  assert.ok(read.data.some((m: any) => m.id === sent.data.id));
});
await check("Clinician session remains clinician-scoped", async () => {
  const login = await call("/mobile/clinician/login", "POST", { email: f.clinician.email, password: f.clinician.password });
  assert.equal(login.status, 200);
  const r = await call("/clinician-data", "GET", undefined, { Authorization: `Bearer ${login.data.token}` });
  assert.equal(r.status, 200);
  assert.equal((await call("/clinician-data", "GET", undefined, familyHeaders)).status, 401);
});
await check("Linked-family document privacy, explicit sharing and revocation use protected bytes", async () => {
  const linkedUsername = `${f.legacy.username}-linked`;
  await db.update(childrenTable).set({ username: linkedUsername, accessCode: await saltedHash(f.legacy.accessCode) }).where(eq(childrenTable.id, f.linking.childId));
  const session = await webLogin({ username: linkedUsername, accessCode: f.legacy.accessCode });
  const h = { "X-Family-Token": session.invite_token };
  await call(`/parent/children/${f.linking.childId}/documents/${f.privateDocumentId}/sharing`, "PATCH", { shared: false }, linkHeaders);
  const sessionResult = await call("/parent/session", "GET", undefined, h);
  assert.equal(sessionResult.status, 200);
  assert.equal(sessionResult.data.children[0].id, f.linking.childId);
  const route = `/parent/documents/${f.privateDocumentId}/content`;
  assert.equal((await call(route, "GET", undefined, h)).status, 403);
  assert.equal((await call(`/parent/children/${f.linking.childId}/documents`, "GET", undefined, h)).data.some((d: any) => d.id === f.privateDocumentId), false);
  const share = `/parent/children/${f.linking.childId}/documents/${f.privateDocumentId}/sharing`;
  assert.equal((await call(share, "PATCH", { shared: true }, linkHeaders)).status, 200);
  const opened = await call(route, "GET", undefined, h);
  assert.equal(opened.status, 200); assert.match(opened.data, /synthetic private plan/);
  assert.equal((await call(share, "PATCH", { shared: false }, linkHeaders)).status, 200);
  assert.equal((await call(route, "GET", undefined, h)).status, 403);
});
await check("Legacy-parent upload remains private until explicit clinician sharing", async () => {
  const form = new FormData(); form.set("authorizedUploader", "true");
  form.set("file", new Blob(["Synthetic family-owned guidance. Offer a familiar way to ask for a break."], { type: "text/plain" }), "family-plan.txt");
  const created = await call(`${childPath}/documents`, "POST", form, familyHeaders);
  assert.ok([200, 201].includes(created.status), `Family upload HTTP ${created.status}`);
  const documentId = created.data.id;
  const route = `/parent/documents/${documentId}/content`;
  assert.equal((await call(route, "GET", undefined, mobileHeaders)).status, 200);
  const clinician = await call("/mobile/clinician/login", "POST", { email: f.clinician.email, password: f.clinician.password });
  const h = { Authorization: `Bearer ${clinician.data.token}` };
  assert.equal((await call(route, "GET", undefined, h)).status, 403);
  const share = `${childPath}/documents/${documentId}/sharing`;
  assert.equal((await call(share, "PATCH", { shared: true }, familyHeaders)).status, 200);
  assert.equal((await call(route, "GET", undefined, h)).status, 200);
  assert.equal((await call(share, "PATCH", { shared: false }, familyHeaders)).status, 200);
  assert.equal((await call(route, "GET", undefined, h)).status, 403);
});
await check("Legacy-parent document reading completes against the real scanner", async () => {
  const [document] = await db.select().from(documentsTable).where(and(
    eq(documentsTable.childId, f.legacy.childId), eq(documentsTable.fileName, "family-plan.txt"),
  ));
  assert.ok(document, "Synthetic uploaded family document exists");
  const read = await call(`${childPath}/documents/${document.id}/scan`, "POST", {}, familyHeaders);
  assert.equal(read.status, 200, `Document scan HTTP ${read.status}: ${read.data.error || ""}`);
  const listed = await call(`${childPath}/documents`, "GET", undefined, familyHeaders);
  assert.equal(listed.status, 200);
  assert.equal(listed.data.find((d: any) => d.id === document.id)?.scanStatus, "done");
});
await check("Expired web/native credentials cannot fall back to another valid parent token", async () => {
  const expiredWeb = crypto.randomBytes(32).toString("base64url"), expiredMobile = crypto.randomBytes(32).toString("hex");
  await db.insert(clientSessionsTable).values({ inviteToken: expiredWeb, childId: f.legacy.childId, username: f.legacy.username, expiresAt: new Date(Date.now() - 1000) });
  await db.insert(mobileTokensTable).values({ token: expiredMobile, childId: f.legacy.childId, expiresAt: new Date(Date.now() - 1000) });
  assert.equal((await call("/parent/session", "GET", undefined, { ...directHeaders, "X-Family-Token": expiredWeb })).status, 401);
  assert.equal((await call("/parent/session", "GET", undefined, { ...directHeaders, "X-Mobile-Token": expiredMobile })).status, 401);
});
await fs.writeFile(fixturePath, JSON.stringify(f), { mode: 0o600 });
const prior = selectedCases ? JSON.parse(await fs.readFile("/tmp/np-parent-unification-api-results.json", "utf8").catch(() => '{"results":[]}')).results : [];
const merged = [...new Map([...prior, ...results].map((r: any) => [r.name, r])).values()] as typeof results;
await fs.writeFile("/tmp/np-parent-unification-api-results.json", JSON.stringify({ verifiedAt: new Date().toISOString(), results: merged }, null, 2));
console.info(`Integration checks: ${merged.filter(r => r.status === "PASS").length}/${merged.length} passed. Synthetic browser fixtures are in ${fixturePath}; no credentials printed.`);
process.exit(results.every(r => r.status === "PASS") ? 0 : 1);
