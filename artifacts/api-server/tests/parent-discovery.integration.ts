import assert from "node:assert/strict";
import crypto from "node:crypto";
import { inArray } from "drizzle-orm";
import {
  db,
  usersTable,
  userProfilesTable,
  familiesTable,
  childrenTable,
  parentAccountsTable,
  parentSessionsTable,
  parentChildSettingsTable,
  parentDocumentsTable,
  documentsTable,
  consentEventsTable,
  auditLogsTable,
} from "@workspace/db";

// Development-only synthetic fixture. Never print credentials, tokens, or source text.
const base = process.env.API_BASE_URL || `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
const hostname = new URL(base).hostname;
assert(hostname.endsWith(".replit.dev") || ["localhost", "127.0.0.1"].includes(hostname), "Refusing to test a published app");
const fixtureIp = `198.18.252.${crypto.randomInt(1, 255)}`;
const accounts: any[] = [];
const childIds: string[] = [];
let checks = 0;

function check(value: unknown, description: string, failureOnlyDiagnostic?: string) {
  assert(value, failureOnlyDiagnostic ? `${description}: ${failureOnlyDiagnostic}` : description);
  checks++;
  console.log(`PASS ${description}`);
}

function syntheticCandidateDiagnostic(candidates: any[]): string {
  const bounded = (value: unknown, max: number) =>
    typeof value === "string"
      ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").slice(0, max)
      : "<missing>";
  const summaries = candidates.slice(0, 20).map((candidate) =>
    `key=${bounded(candidate?.behaviorKey, 80)} name=${bounded(candidate?.behaviorName, 120)} goal=${bounded(candidate?.goal, 500)}`,
  );
  return `synthetic returned candidates: ${(summaries.length ? summaries.join(" | ") : "<none>").slice(0, 2000)}`;
}

async function request(path: string, method = "GET", body?: unknown, token?: string) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(hostname.endsWith(".replit.dev") || ["localhost", "127.0.0.1"].includes(hostname)
        ? { "X-Forwarded-For": fixtureIp }
        : {}),
      ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...(token ? { "X-Parent-Token": token } : {}),
    },
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(150_000),
  });
  const data = response.headers.get("content-type")?.includes("application/json")
    ? await response.json()
    : await response.text();
  return { response, data: data as any };
}

async function upload(childId: string, token: string, text: string) {
  const form = new FormData();
  form.append("file", new Blob([text], { type: "text/plain" }), "focused-discovery-plan.txt");
  form.append("title", "Synthetic focused discovery plan");
  form.append("documentType", "behavior_plan");
  form.append("authorizedUploader", "true");
  return request(`/parent/children/${childId}/documents`, "POST", form, token);
}

function checkScan(result: { response: Response; data: any }, description: string) {
  const error = !result.response.ok && typeof result.data?.error === "string"
    ? `: ${result.data.error.slice(0, 500)}`
    : "";
  check(result.response.ok && result.data?.ok === true, `${description}${error}`);
}

try {
  const credentials = {
    firstName: "Synthetic Discovery",
    email: `parent-discovery-${crypto.randomUUID()}@example.test`,
    password: "Test-Parent-123!",
    confirmPassword: "Test-Parent-123!",
    privacyConsent: true,
    healthConsent: true,
  };
  const registration = await request("/parent/auth/register", "POST", credentials);
  if (registration.data?.parent?.id) accounts.push(registration.data);
  check(registration.response.status === 201, "focused discovery parent account created");
  const parent = registration.data;

  const behaviors = [
    { behaviorKey: "task_refusal", goal: "Begin one task step" },
    { behaviorKey: "custom", customBehavior: "Morning clothing discomfort", goal: "Choose one comfortable item" },
  ];
  const created = await request("/parent/children", "POST", {
    name: "Synthetic Discovery Child",
    behaviors,
  }, parent.token);
  if (created.data?.id) childIds.push(created.data.id);
  check(created.response.status === 201 && created.data.behaviors.length === 2,
    "focused discovery child has two selected behaviors");
  check(created.data.behaviors[0].goal === behaviors[0].goal &&
    created.data.behaviors[1].goal === behaviors[1].goal,
  "both selected goals are independently initialized");

  const planText = [
    "Target behavior: Task Refusal (avoiding homework tasks).",
    "Explicit goal for Task Refusal: Start the worksheet within two minutes after one reminder.",
    "Support: Break the worksheet into a short first step and recognize getting started.",
    "Target behavior: Repetitive questioning (repeating the same question without distress).",
    "Explicit goal for repetitive questioning: Ask a question once, then use the written answer card.",
    "Support: Offer the written answer card after a single question and point to a short checklist.",
    "Avoid arguing or physical restraint.",
  ].join(" ");
  const uploaded = await upload(created.data.id, parent.token, planText);
  check(uploaded.response.ok && uploaded.data.id && uploaded.data.shared === false && uploaded.data.reviewed === false,
    "focused discovery source is a private, unreviewed parent upload");

  const scan = await request(`/parent/children/${created.data.id}/documents/${uploaded.data.id}/scan`, "POST", {}, parent.token);
  checkScan(scan, "focused discovery scan succeeds");
  const candidate = scan.data.supportCards.find((card: any) =>
    card.behaviorKey === "custom" && /repetitive questioning/i.test(card.behaviorName),
  );
  check(candidate?.goal === "Ask a question once, then use the written answer card.",
    "explicitly discovered target retains the exact source goal",
    syntheticCandidateDiagnostic(candidate
      ? [candidate]
      : scan.data.supportCards.filter((card: any) => card.sourceDocumentIds?.includes(uploaded.data.id))));
  const taskRefusalCard = scan.data.supportCards.find((card: any) => card.behaviorKey === "task_refusal");
  check(taskRefusalCard?.goal === behaviors[0].goal &&
    taskRefusalCard?.planGoal === "Start the worksheet within two minutes after one reminder." &&
    taskRefusalCard.planGoalSourceDocumentIds.length === 1 &&
    taskRefusalCard.planGoalSourceDocumentIds[0] === uploaded.data.id &&
    taskRefusalCard.planGoalSourceReferences.length === 1 &&
    taskRefusalCard.planGoalSourceReferences[0].documentId === uploaded.data.id,
  "explicit plan goal displays alongside the unchanged manual goal with independent source references");
  check(Boolean(candidate && candidate.source === "parent_document" &&
    candidate.sourceDocumentIds.length === 1 && candidate.sourceDocumentIds[0] === uploaded.data.id &&
    candidate.sourceReferences.length === 1 && candidate.sourceReferences[0].documentId === uploaded.data.id &&
    !candidate.reviewedBy && !candidate.reviewedAt),
  "candidate provenance points only to its private parent source and has no fabricated review");

  const firstDashboard = await request(`/parent/children/${created.data.id}/dashboard`, "GET", undefined, parent.token);
  const firstReloadedCandidate = firstDashboard.data.supportCards.find((card: any) => card.id === candidate.id);
  check(firstReloadedCandidate?.goal === candidate.goal &&
    firstReloadedCandidate.sourceDocumentIds[0] === uploaded.data.id &&
    firstDashboard.data.child.behaviors.length === 2 &&
    firstDashboard.data.child.behaviors[0].goal === behaviors[0].goal &&
    firstDashboard.data.child.behaviors[1].goal === behaviors[1].goal &&
    !firstDashboard.data.child.behaviors.some((behavior: any) => /repetitive questioning/i.test(behavior.behaviorName || "")),
  "reload retains the unselected candidate while selected goals remain unchanged");
  const reloadedTaskRefusal = firstDashboard.data.supportCards.find((card: any) => card.behaviorKey === "task_refusal");
  check(reloadedTaskRefusal?.goal === behaviors[0].goal &&
    reloadedTaskRefusal?.planGoal === taskRefusalCard.planGoal &&
    reloadedTaskRefusal.planGoalSourceReferences[0]?.documentId === uploaded.data.id,
  "dashboard reload retains both distinct goals and plan-goal provenance");

  const rescan = await request(`/parent/children/${created.data.id}/documents/${uploaded.data.id}/scan`, "POST", {}, parent.token);
  checkScan(rescan, "focused discovery rescan succeeds");
  const rescannedCandidates = rescan.data.supportCards.filter((card: any) =>
    card.behaviorKey === "custom" && /repetitive questioning/i.test(card.behaviorName),
  );
  const rescannedCandidate = rescannedCandidates[0];
  check(rescannedCandidates.length === 1 && rescannedCandidate?.id === candidate.id &&
    rescannedCandidate.goal === candidate.goal &&
    rescannedCandidate.sourceDocumentIds.length === 1 &&
    rescannedCandidate.sourceDocumentIds[0] === uploaded.data.id &&
    rescannedCandidate.sourceReferences.length === 1 &&
    rescannedCandidate.sourceReferences[0].documentId === uploaded.data.id &&
    !rescannedCandidate.reviewedBy && !rescannedCandidate.reviewedAt,
  "rescan retains one stable candidate identity with authentic private provenance");
  const rescannedTaskRefusal = rescan.data.supportCards.find((card: any) => card.behaviorKey === "task_refusal");
  check(rescannedTaskRefusal?.goal === behaviors[0].goal &&
    rescannedTaskRefusal?.planGoal === taskRefusalCard.planGoal &&
    rescannedTaskRefusal.planGoalSourceDocumentIds[0] === uploaded.data.id &&
    rescannedTaskRefusal.planGoalSourceReferences[0]?.documentId === uploaded.data.id,
  "rescan updates the separate explicit plan goal without changing the saved manual goal");

  const finalDashboard = await request(`/parent/children/${created.data.id}/dashboard`, "GET", undefined, parent.token);
  const finalTaskRefusal = finalDashboard.data.supportCards.find((card: any) => card.behaviorKey === "task_refusal");
  check(finalDashboard.data.child.behaviors.length === 2 &&
    finalDashboard.data.child.behaviors[0].goal === behaviors[0].goal &&
    finalDashboard.data.child.behaviors[1].goal === behaviors[1].goal &&
    !finalDashboard.data.child.behaviors.some((behavior: any) => /repetitive questioning/i.test(behavior.behaviorName || "")),
  "rescan reload keeps the candidate out of selected setup behaviors and preserves both goals");
  check(finalTaskRefusal?.goal === behaviors[0].goal &&
    finalTaskRefusal?.planGoal === taskRefusalCard.planGoal &&
    finalTaskRefusal.planGoalSourceReferences[0]?.documentId === uploaded.data.id,
  "rescan reload preserves the saved and scanned goals independently");
  console.log(`Parent discovery integration: ${checks} checks passed.`);
} finally {
  const parentIds = accounts.map((account) => account.parent.id);
  const workspaceIds = accounts.map((account) => account.parent.workspaceId);
  if (childIds.length) {
    const metadata = await db.select().from(parentDocumentsTable).where(inArray(parentDocumentsTable.childId, childIds));
    if (metadata.length) {
      const storage = await import("../src/lib/parentFileStorage");
      for (const row of metadata) await storage.deleteEncryptedParentFile(row.storagePath);
    }
    await db.delete(parentDocumentsTable).where(inArray(parentDocumentsTable.childId, childIds));
    await db.delete(documentsTable).where(inArray(documentsTable.childId, childIds));
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