import assert from "node:assert/strict";
import crypto from "node:crypto";
import { inArray } from "drizzle-orm";
import {
  db, usersTable, userProfilesTable, familiesTable, childrenTable,
  parentAccountsTable, parentSessionsTable, parentChildSettingsTable, parentLogsTable,
  parentDocumentsTable, documentsTable, behaviorLogsTable, consentEventsTable, auditLogsTable,
} from "@workspace/db";

// Development-only, synthetic data. Never print bearer tokens or file contents.
const base = process.env.API_BASE_URL || `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
const hostname = new URL(base).hostname;
assert(hostname.endsWith(".replit.dev") || ["localhost", "127.0.0.1"].includes(hostname), "Refusing to test a published app");
const fixtureIp = `198.18.253.${crypto.randomInt(1, 255)}`;
const accounts: any[] = [];
const childIds: string[] = [];
let checks = 0;
function check(value: unknown, description: string) {
  assert(value, description);
  checks++;
  console.log(`PASS ${description}`);
}
async function request(path: string, method = "GET", body?: unknown, token?: string) {
  const response = await fetch(`${base}${path}`, {
    method, headers: {
      ...(["localhost", "127.0.0.1"].includes(hostname) ? { "X-Forwarded-For": fixtureIp } : {}),
      ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...(token ? { "X-Parent-Token": token } : {}),
    },
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(150_000),
  });
  const data = response.headers.get("content-type")?.includes("application/json")
    ? await response.json() : await response.text();
  return { response, data: data as any };
}
async function upload(childId: string, token: string, text: string, name = "synthetic-support-plan.txt") {
  const form = new FormData();
  form.append("file", new Blob([text], { type: "text/plain" }), name);
  form.append("title", "Synthetic parent plan");
  form.append("documentType", "behavior_plan");
  form.append("authorizedUploader", "true");
  return request(`/parent/children/${childId}/documents`, "POST", form, token);
}

try {
  const { data: library, response: libraryResponse } = await request("/parent/starter-library");
  check(libraryResponse.ok && Array.isArray(library) && library.length === 6, "six complete starter templates available");
  check(library.every((item: any) => item.rightNow.length && item.avoid.length && item.prevention.length && item.relatedGoals.length && item.seekHelp), "starter safety, prevention, tracking, and goals present");
  const task = library.find((item: any) => item.name.includes("Task Refusal"));
  check(task, "task refusal template exists");
  const noConsent = await request("/parent/auth/register", "POST", {
    firstName: "Synthetic", email: `missing-consent-${crypto.randomUUID()}@example.test`,
    password: "Test-Parent-123!", confirmPassword: "Test-Parent-123!",
  });
  check(noConsent.response.status === 400, "signup requires privacy and health consent");
  for (const label of ["one", "two"]) {
    const credentials = {
      firstName: `Synthetic ${label}`, email: `np-parent-${label}-${crypto.randomUUID()}@example.test`,
      password: "Test-Parent-123!", confirmPassword: "Test-Parent-123!",
      privacyConsent: true, healthConsent: true,
    };
    const registration = await request("/parent/auth/register", "POST", credentials);
    check(registration.response.status === 201, `parent ${label} self-signup without a clinic`);
    accounts.push({ ...registration.data, credentials });
    check(registration.data.parent.accountType === "parent_free" && registration.data.parent.workspaceId && !("passwordHash" in registration.data.parent), `parent ${label} has a private workspace and safe response`);
  }
  const [one, two] = accounts;
  const duplicate = await request("/parent/auth/register", "POST", { ...one.credentials, email: one.credentials.email.toUpperCase() });
  check(duplicate.response.status === 409, "case-normalized duplicate email is rejected");
  const created = await request("/parent/children", "POST", { name: "Synthetic Quick Start", notes: "Synthetic setup notes" }, one.token);
  check(created.response.status === 201, "add child with nickname only, no diagnosis or documents");
  const child = created.data;
  childIds.push(child.id);
  check(child.parentId === one.parent.id && child.workspaceId === one.parent.workspaceId && child.familyId && !child.clinicianId, "child ownership and workspace are server-derived");
  const partial = await request("/parent/session", "GET", undefined, one.token);
  check(partial.data.children.some((value: any) => value.id === child.id && !value.behaviorKey && !value.goal), "incomplete setup persists and can resume");
  const chosenBehavior = await request(`/parent/children/${child.id}`, "PATCH", { behaviorKey: task.key }, one.token);
  check(chosenBehavior.response.ok && chosenBehavior.data.behaviorKey === task.key, "behavior selection persists independently");
  const chosenGoal = await request(`/parent/children/${child.id}`, "PATCH", { goal: task.relatedGoals[0] }, one.token);
  check(chosenGoal.response.ok && chosenGoal.data.goal === task.relatedGoals[0], "starter goal persists");
  const dashboard = await request(`/parent/children/${child.id}/dashboard`, "GET", undefined, one.token);
  check(dashboard.response.ok && dashboard.data.supportCards[0]?.source === "starter" && dashboard.data.supportCards[0]?.rightNow.length, "immediate starter card works without upload or AI");
  check(dashboard.data.documents.length === 0 && dashboard.data.child.goal, "dashboard has current focus and no required document");
  const unauthorized = await request(`/parent/children/${child.id}/dashboard`, "GET", undefined, two.token);
  check([403, 404].includes(unauthorized.response.status), "another parent cannot change child URL to read a profile");
  const forgedEdit = await request(`/parent/children/${child.id}`, "PATCH", { name: "Hijacked" }, two.token);
  check([403, 404].includes(forgedEdit.response.status), "another parent cannot edit this child");
  const generic = await request("/children", "GET", undefined, one.token);
  check(generic.response.status === 401, "parent session cannot become a generic clinician identity");
  const log = await request(`/parent/children/${child.id}/logs`, "POST", {
    happened: true, intensity: "medium", duration: 3, trigger: "Homework",
    whatHelped: "Small first step", notes: "Synthetic test log",
  }, one.token);
  check(log.response.status === 201 && log.data.childId === child.id && log.data.goal === task.relatedGoals[0] && log.data.behaviorKey === task.key, "behavior log records current child, behavior, goal, and timestamp");
  const edit = await request(`/parent/children/${child.id}`, "PATCH", { name: "Synthetic Updated", notes: "" }, one.token);
  check(edit.response.ok && edit.data.name === "Synthetic Updated" && edit.data.notes === "", "nickname and optional notes edit without restarting");
  const logout = await request("/parent/auth/logout", "POST", {}, one.token);
  check(logout.response.ok, "parent can sign out");
  const revoked = await request("/parent/session", "GET", undefined, one.token);
  check(revoked.response.status === 401, "signout revokes the server session");
  const login = await request("/parent/auth/login", "POST", { email: one.credentials.email.toUpperCase(), password: one.credentials.password });
  check(login.response.ok && login.data.parent.id === one.parent.id, "email/password login retains account identity");
  one.token = login.data.token;
  const restored = await request(`/parent/children/${child.id}/dashboard`, "GET", undefined, one.token);
  check(restored.data.child.goal === task.relatedGoals[0] && restored.data.logs.some((value: any) => value.id === log.data.id), "returning parent retains child, goal, starter card, and log");

  const text = "Synthetic behavior support plan. Target behavior: Task Refusal. Goal: Complete one small step. Support: break homework into one small step. Offer a blue break card to ask for a short break. Use first-then language. Avoid arguing or physical restraint. Praise the first attempt. Track duration, trigger, and what helped.";
  const uploaded = await upload(child.id, one.token, text);
  check(uploaded.response.ok && uploaded.data.id && uploaded.data.childId === child.id && !uploaded.data.shared && !uploaded.data.reviewed, "optional upload belongs to this child and is private and unreviewed");
  const documentId = uploaded.data.id;
  const deniedDownload = await request(`/parent/documents/${documentId}/content`, "GET", undefined, two.token);
  check([403, 404].includes(deniedDownload.response.status), "another parent cannot download the private plan");
  const content = await request(`/parent/documents/${documentId}/content`, "GET", undefined, one.token);
  check(content.response.ok && content.data === text && content.response.headers.get("cache-control")?.includes("no-store"), "owner download decrypts exact content with no-store headers");
  const noClinicShare = await request(`/parent/children/${child.id}/documents/${documentId}/sharing`, "PATCH", { shared: true }, one.token);
  check([400, 409].includes(noClinicShare.response.status), "a plan cannot be shared with an unlinked clinic");
  const scan = await request(`/parent/children/${child.id}/documents/${documentId}/scan`, "POST", {}, one.token);
  check(scan.response.ok && scan.data.ok, "real uploaded text plan scans successfully");
  check(scan.data.supportCards.some((card: any) => card.source === "parent_document" && card.sourceDocumentIds.includes(documentId) && card.sourceReferences.length), "support upgrades with document sources and no false clinician approval");
  const second = await upload(child.id, one.token, `${text}\nAdditional parent observation: first-then helps after school.`, "second-synthetic-plan.txt");
  check(second.response.ok, "parent can upload a second plan after onboarding");
  const scanSecond = await request(`/parent/children/${child.id}/documents/${second.data.id}/scan`, "POST", {}, one.token);
  check(scanSecond.response.ok, "second plan scans successfully");
  const matched = scanSecond.data.supportCards.filter((card: any) => card.source !== "starter" && card.behaviorKey === task.key);
  check(matched.length === 1, "matching uploaded behavior information merges instead of creating duplicate cards");
  const chat = await request(`/parent/children/${child.id}/chat`, "POST", { message: "What does my uploaded plan say I can offer when homework feels hard?" }, one.token);
  check(chat.response.ok && chat.data.answer && /not.*reviewed/i.test(chat.data.disclaimer), "document-grounded parent chat discloses no clinician review");
  check(chat.data.sourceReferences.some((reference: any) => reference.documentId === documentId || reference.documentId === second.data.id), "chat returns the parent's actual document references");
  const editedGoal = "Ask for a short break before homework";
  const changedGoal = await request(`/parent/children/${child.id}`, "PATCH", { goal: editedGoal }, one.token);
  check(changedGoal.response.ok, "parent can edit a goal after a plan scan");
  const editedDashboard = await request(`/parent/children/${child.id}/dashboard`, "GET", undefined, one.token);
  check(editedDashboard.data.child.goal === editedGoal && editedDashboard.data.supportCards[0].goal === editedGoal, "current support goal does not revert to stale uploaded goal");
  const customBehavior = "Morning clothing discomfort";
  const changedBehavior = await request(`/parent/children/${child.id}`, "PATCH", { behaviorKey: "custom", customBehavior, goal: "Choose one comfortable item" }, one.token);
  check(changedBehavior.response.ok && changedBehavior.data.behaviorName === customBehavior, "predefined behavior can switch to a custom behavior after upload");
  const customDashboard = await request(`/parent/children/${child.id}/dashboard`, "GET", undefined, one.token);
  check(customDashboard.data.supportCards[0].behaviorName === customBehavior && customDashboard.data.supportCards[0].goal === "Choose one comfortable item", "custom support becomes the current focus instead of the old uploaded behavior");
  check(customDashboard.data.documents.length === 2 && customDashboard.data.logs.some((value: any) => value.id === log.data.id), "behavior and goal edits retain uploaded documents and past logs");
  const badChat = await request(`/parent/children/${child.id}/chat`, "POST", { message: "Read this child plan" }, two.token);
  check([403, 404].includes(badChat.response.status), "chat cannot retrieve another parent's knowledge base");
  console.log(`Parent integration: ${checks} checks passed.`);
} finally {
  // All deletes are constrained to IDs created by this invocation.
  const parentIds = accounts.map(account => account.parent.id);
  const workspaceIds = accounts.map(account => account.parent.workspaceId);
  if (childIds.length) {
    const metadata = await db.select().from(parentDocumentsTable).where(inArray(parentDocumentsTable.childId, childIds));
    if (metadata.length) {
      const storage = await import("../src/lib/parentFileStorage");
      for (const row of metadata) await storage.deleteEncryptedParentFile(row.storagePath);
    }
    await db.delete(parentDocumentsTable).where(inArray(parentDocumentsTable.childId, childIds));
    await db.delete(documentsTable).where(inArray(documentsTable.childId, childIds));
    await db.delete(parentLogsTable).where(inArray(parentLogsTable.childId, childIds));
    await db.delete(behaviorLogsTable).where(inArray(behaviorLogsTable.childId, childIds));
    await db.delete(parentChildSettingsTable).where(inArray(parentChildSettingsTable.childId, childIds));
    await db.delete(childrenTable).where(inArray(childrenTable.id, childIds));
  }
  if (parentIds.length) {
    await db.delete(parentSessionsTable).where(inArray(parentSessionsTable.parentId, parentIds));
    await db.delete(parentAccountsTable).where(inArray(parentAccountsTable.id, parentIds));
    await db.delete(userProfilesTable).where(inArray(userProfilesTable.id, parentIds));
    await db.delete(usersTable).where(inArray(usersTable.id, parentIds));
    await db.delete(consentEventsTable).where(inArray(consentEventsTable.subjectId, parentIds));
    await db.delete(auditLogsTable).where(inArray(auditLogsTable.userId, parentIds));
  }
  if (workspaceIds.length) await db.delete(familiesTable).where(inArray(familiesTable.id, workspaceIds));
}
process.exit(0);