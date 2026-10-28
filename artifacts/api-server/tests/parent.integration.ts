import assert from "node:assert/strict";
import crypto from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import {
  db, usersTable, userProfilesTable, familiesTable, childrenTable,
  parentAccountsTable, parentSessionsTable, parentChildSettingsTable, parentLogsTable,
  parentDocumentsTable, documentsTable, documentExtractionRunsTable, behaviorLogsTable, consentEventsTable, auditLogsTable,
} from "@workspace/db";
import { normalizeDocumentExtractions, persistDocumentExtractionBatch } from "../src/lib/documentExtractions";

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
function checkScan(
  result: { response: Response; data: any },
  description: string,
  additionalCheck: (data: any) => boolean = () => true,
) {
  const error = !result.response.ok && typeof result.data?.error === "string"
    ? `: ${result.data.error.slice(0, 500)}`
    : "";
  check(result.response.ok && result.data?.ok === true && additionalCheck(result.data), `${description}${error}`);
}
async function request(path: string, method = "GET", body?: unknown, token?: string) {
  const response = await fetch(`${base}${path}`, {
    method, headers: {
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
    ? await response.json() : await response.text();
  return { response, data: data as any };
}
async function upload(
  childId: string,
  token: string,
  text: string,
  name = "synthetic-support-plan.txt",
  documentType = "behavior_plan",
) {
  const form = new FormData();
  form.append("file", new Blob([text], { type: "text/plain" }), name);
  form.append("title", "Synthetic parent plan");
  form.append("documentType", documentType);
  form.append("authorizedUploader", "true");
  return request(`/parent/children/${childId}/documents`, "POST", form, token);
}

async function verifySafetyPlanProjection(
  childId: string,
  parentId: string,
  parentToken: string,
  otherParentToken: string,
) {
  const safetyText = "If Sam moves toward the driveway, call the listed caregiver and follow the family plan.";
  const safetyUpload = await upload(
    childId,
    parentToken,
    safetyText,
    "synthetic-safety-plan.txt",
    "safety_crisis_plan",
  );
  check(safetyUpload.response.status === 201, "parent can upload a child-scoped safety plan");
  const documentId = safetyUpload.data.id;
  try {
    const [metadata] = await db.select().from(parentDocumentsTable)
      .where(eq(parentDocumentsTable.documentId, documentId));
    assert(metadata?.sha256, "uploaded safety source has a current content version");
    const source = {
      childId,
      documentId,
      documentVersion: metadata.sha256,
      documentType: "text/plain",
      searchableText: safetyText,
    };
    const normalized = normalizeDocumentExtractions([{
      category: "safety_instruction",
      source_document_id: source.documentId,
      source_section: "Family safety plan",
      source_page: 1,
      source_excerpt: safetyText,
      ambiguous: false,
      ambiguity_reason: "",
      interpretation: { applies_to: "Leaving the home", instruction: safetyText },
    }], [source]);
    await persistDocumentExtractionBatch({
      sources: [source],
      normalized,
      scannedBy: parentId,
    });
    await db.update(documentsTable).set({ scanStatus: "done" })
      .where(eq(documentsTable.id, documentId));

    const dashboard = await request(`/parent/children/${childId}/dashboard`, "GET", undefined, parentToken);
    const projectedInstruction = dashboard.data.safetyPlan?.instructions?.find(
      (instruction: any) => instruction.documentId === documentId,
    );
    check(
      dashboard.response.ok &&
        dashboard.data.safetyPlan?.childId === childId &&
        projectedInstruction?.sourceExcerpt === safetyText &&
        projectedInstruction?.uploadedBy === "parent" &&
        projectedInstruction?.sourceExcerptVerified === true &&
        projectedInstruction?.clinicianApproved === false,
      "dashboard delivers exact current safety source text with parent-uploaded, unapproved provenance",
    );
    const unauthorized = await request(`/parent/children/${childId}/dashboard`, "GET", undefined, otherParentToken);
    check(
      [403, 404].includes(unauthorized.response.status) &&
        !Object.hasOwn(unauthorized.data, "safetyPlan"),
      "another parent cannot retrieve the child's safety plan",
    );
  } finally {
    const [metadata] = await db.select().from(parentDocumentsTable)
      .where(eq(parentDocumentsTable.documentId, documentId));
    if (metadata?.storagePath) {
      const storage = await import("../src/lib/parentFileStorage");
      await storage.deleteEncryptedParentFile(metadata.storagePath);
    }
    await db.delete(documentExtractionRunsTable).where(eq(documentExtractionRunsTable.documentId, documentId));
    await db.delete(parentDocumentsTable).where(eq(parentDocumentsTable.documentId, documentId));
    await db.delete(documentsTable).where(eq(documentsTable.id, documentId));
  }
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
    accountHolderType: "parent_guardian", accountHolderAgeGroup: "18_plus",
    adultOrGuardianConfirmed: true, parentGuardianAuthorityConfirmed: true,
  });
  check(noConsent.response.status === 400, "signup requires privacy and health consent");
  for (const label of ["one", "two"]) {
    const credentials = {
      firstName: `Synthetic ${label}`, email: `np-parent-${label}-${crypto.randomUUID()}@example.test`,
      password: "Test-Parent-123!", confirmPassword: "Test-Parent-123!",
      privacyConsent: true, healthConsent: true,
      accountHolderType: "parent_guardian", accountHolderAgeGroup: "18_plus",
      adultOrGuardianConfirmed: true, parentGuardianAuthorityConfirmed: true,
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
  const initialBehaviors = [
    { behaviorKey: task.key, goal: "Start one small step" },
    { behaviorKey: "custom", customBehavior: "Morning clothing discomfort", goal: "Choose one comfortable item" },
  ];
  const setupMultiChild = await request("/parent/children", "POST", {
    name: "Synthetic Multi Setup",
    behaviors: initialBehaviors,
  }, one.token);
  check(setupMultiChild.response.status === 201 && setupMultiChild.data.behaviors.length === 2,
    "initial setup accepts multiple behaviors and independent goals");
  childIds.push(setupMultiChild.data.id);
  check(setupMultiChild.data.behaviorKey === task.key && setupMultiChild.data.goal === "Start one small step" &&
    setupMultiChild.data.behaviors[1].customBehavior === "Morning clothing discomfort",
  "initial multi-behavior setup retains primary scalar projection and custom label");
  const setupMultiDashboard = await request(`/parent/children/${setupMultiChild.data.id}/dashboard`, "GET", undefined, one.token);
  check(setupMultiDashboard.response.ok && setupMultiDashboard.data.supportCards.some((card: any) => card.behaviorKey === task.key) &&
    setupMultiDashboard.data.supportCards.some((card: any) => card.behaviorKey === "custom" && card.goal === "Choose one comfortable item"),
  "initial setup creates a starter support card per selected behavior");
  const partial = await request("/parent/session", "GET", undefined, one.token);
  check(partial.data.children.some((value: any) => value.id === child.id && !value.behaviorKey && !value.goal) &&
    partial.data.children.some((value: any) => value.id === setupMultiChild.data.id && value.behaviors.length === 2),
  "parent session resumes both incomplete and multi-behavior setup");
  const chosenBehavior = await request(`/parent/children/${child.id}`, "PATCH", { behaviorKey: task.key }, one.token);
  check(chosenBehavior.response.ok && chosenBehavior.data.behaviorKey === task.key, "behavior selection persists independently");
  const chosenGoal = await request(`/parent/children/${child.id}`, "PATCH", { goal: task.relatedGoals[0] }, one.token);
  check(chosenGoal.response.ok && chosenGoal.data.goal === task.relatedGoals[0], "starter goal persists");
  const dashboard = await request(`/parent/children/${child.id}/dashboard`, "GET", undefined, one.token);
  check(dashboard.response.ok && dashboard.data.supportCards[0]?.source === "starter" && dashboard.data.supportCards[0]?.rightNow.length, "immediate starter card works without upload or AI");
  check(
    dashboard.data.safetyPlan?.childId === child.id &&
      dashboard.data.safetyPlan.hasSafetyPlan === false &&
      Array.isArray(dashboard.data.safetyPlan.documents) &&
      Array.isArray(dashboard.data.safetyPlan.instructions),
    "dashboard returns an explicit child-scoped empty safety-plan state",
  );
  check(dashboard.data.documents.length === 0 && dashboard.data.child.goal, "dashboard has current focus and no required document");
  const unauthorized = await request(`/parent/children/${child.id}/dashboard`, "GET", undefined, two.token);
  check([403, 404].includes(unauthorized.response.status), "another parent cannot change child URL to read a profile");
  check(!Object.hasOwn(unauthorized.data, "safetyPlan"), "another parent never receives safety-plan content");
  await verifySafetyPlanProjection(child.id, one.parent.id, one.token, two.token);
  if (process.env.PARENT_SAFETY_PLAN_ONLY === "true") {
    console.log(`Parent safety integration: ${checks} checks passed.`);
  } else {
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
  checkScan(scan, "real uploaded text plan scans successfully");
  check(scan.data.supportCards.some((card: any) => card.source === "parent_document" && card.sourceDocumentIds.includes(documentId) && card.sourceReferences.length), "support upgrades with document sources and no false clinician approval");
  const second = await upload(child.id, one.token, `${text}\nAdditional parent observation: first-then helps after school.`, "second-synthetic-plan.txt");
  check(second.response.ok, "parent can upload a second plan after onboarding");
  const scanSecond = await request(`/parent/children/${child.id}/documents/${second.data.id}/scan`, "POST", {}, one.token);
  checkScan(scanSecond, "second plan scans successfully");
  const matched = scanSecond.data.supportCards.filter((card: any) => card.source !== "starter" && card.behaviorKey === task.key);
  check(matched.length === 1, "matching uploaded behavior information merges instead of creating duplicate cards");
  const chat = await request(`/parent/children/${child.id}/chat`, "POST", { message: "What does my uploaded plan say I can offer when homework feels hard?" }, one.token);
  check(chat.response.ok && chat.data.answer && /not.*reviewed/i.test(chat.data.disclaimer),
    `document-grounded parent chat discloses no clinician review (disclaimer: ${String(chat.data?.disclaimer || "missing").slice(0, 180)}; source count: ${chat.data?.sourceReferences?.length ?? 0})`);
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
  const behaviorSelections = [
    { behaviorKey: task.key, goal: "Finish one small step" },
    { behaviorKey: "custom", customBehavior, goal: "Choose one comfortable item" },
  ];
  const multiBehavior = await request(`/parent/children/${child.id}`, "PATCH", { behaviors: behaviorSelections }, one.token);
  if (!multiBehavior.response.ok) {
    console.error("Multi-behavior edit failed:", multiBehavior.response.status, multiBehavior.data?.error);
  }
  check(multiBehavior.response.ok && multiBehavior.data.behaviors.length === 2, "parent can select multiple behaviors with independent goals");
  check(multiBehavior.data.behaviorKey === task.key && multiBehavior.data.goal === "Finish one small step", "legacy scalar fields project the first selected behavior");
  const duplicateBehaviors = await request(`/parent/children/${child.id}`, "PATCH", {
    behaviors: [
      { behaviorKey: "custom", customBehavior: "Morning clothing discomfort" },
      { behaviorKey: "custom", customBehavior: " MORNING   CLOTHING DISCOMFORT " },
    ],
  }, one.token);
  check(duplicateBehaviors.response.status === 400, "normalized duplicate custom selections are rejected");
  const overLimitBehaviors = await request(`/parent/children/${child.id}`, "PATCH", {
    behaviors: Array.from({ length: 21 }, (_, index) => ({ behaviorKey: task.key, goal: `Goal ${index}` })),
  }, one.token);
  check(overLimitBehaviors.response.status === 400, "behavior selection limit is enforced");
  const scalarGoalEdit = await request(`/parent/children/${child.id}`, "PATCH", { goal: "Do the first step" }, one.token);
  check(scalarGoalEdit.response.ok && scalarGoalEdit.data.behaviors.length === 2 &&
    scalarGoalEdit.data.behaviors[0].goal === "Do the first step" &&
    scalarGoalEdit.data.behaviors[1].goal === "Choose one comfortable item",
  "legacy scalar goal edits update only the primary behavior");
  const multiScanUpload = await upload(child.id, one.token, `${text}\nMorning routine support: choose one comfortable clothing item.`, "multi-behavior-plan.txt");
  const multiScan = await request(`/parent/children/${child.id}/documents/${multiScanUpload.data.id}/scan`, "POST", {}, one.token);
  checkScan(multiScan, "one document scan generates guidance for every selected behavior", (data) =>
    data.supportCards.some((card: any) => card.behaviorKey === task.key) &&
    data.supportCards.some((card: any) => card.behaviorKey === "custom" && card.behaviorName === customBehavior));
  const selectedBehaviorCards = multiScan.data.supportCards.filter((card: any) =>
    behaviorSelections.some((selection) =>
      selection.behaviorKey === card.behaviorKey &&
      (selection.behaviorKey !== "custom" || card.behaviorName === customBehavior),
    ),
  );
  check(selectedBehaviorCards.length >= 2, "multi-behavior scan response preserves both selected guidance cards");
  check(selectedBehaviorCards.filter((card: any) => card.source !== "starter").length === 2 &&
    selectedBehaviorCards.filter((card: any) => card.source !== "starter").every((card: any) =>
      card.sourceDocumentIds.includes(multiScanUpload.data.id) &&
      card.sourceReferences.some((reference: any) => reference.documentId === multiScanUpload.data.id),
    ),
  "multi-behavior scan preserves document provenance for each generated card");
  const discoveredPlanText = [
    "Additional target behavior: Repetitive questioning (repeating the same question without distress).",
    "Explicit goal for repetitive questioning: Ask a question once, then use the written answer card.",
    "Support: Show the familiar written answer card and praise using it.",
    "Avoid arguing or physical restraint.",
  ].join(" ");
  const discoveredUpload = await upload(child.id, one.token, discoveredPlanText, "additional-explicit-target.txt");
  check(discoveredUpload.response.ok, "parent can upload a plan naming an additional unselected target and explicit goal");
  const discoveredScan = await request(`/parent/children/${child.id}/documents/${discoveredUpload.data.id}/scan`, "POST", {}, one.token);
  checkScan(discoveredScan, "plan scan discovers additional explicit target");
  const discoveredCard = discoveredScan.data.supportCards.find((card: any) =>
    card.behaviorKey === "custom" && /repetitive questioning/i.test(card.behaviorName),
  );
  check(discoveredCard && discoveredCard.goal === "Ask a question once, then use the written answer card." &&
    discoveredCard.source === "parent_document" && discoveredCard.sourceDocumentIds.includes(discoveredUpload.data.id) &&
    discoveredCard.sourceReferences.some((reference: any) => reference.documentId === discoveredUpload.data.id) &&
    !discoveredCard.reviewedBy && !discoveredCard.reviewedAt,
  "discovered unselected target persists with its explicit goal and authentic parent-plan provenance only");
  const discoveredReload = await request(`/parent/children/${child.id}/dashboard`, "GET", undefined, one.token);
  const reloadedCandidate = discoveredReload.data.supportCards.find((card: any) =>
    card.behaviorKey === "custom" && /repetitive questioning/i.test(card.behaviorName),
  );
  check(reloadedCandidate?.goal === discoveredCard.goal &&
    reloadedCandidate.sourceDocumentIds.includes(discoveredUpload.data.id),
  "discovered candidate and goal survive dashboard reload");
  const rescannedCandidate = await request(`/parent/children/${child.id}/documents/${discoveredUpload.data.id}/scan`, "POST", {}, one.token);
  checkScan(rescannedCandidate, "discovered target rescan succeeds");
  const rescannedCard = rescannedCandidate.data.supportCards.find((card: any) =>
    card.behaviorKey === "custom" && /repetitive questioning/i.test(card.behaviorName),
  );
  check(rescannedCard?.goal === discoveredCard.goal &&
    rescannedCard.sourceDocumentIds.includes(discoveredUpload.data.id) &&
    rescannedCard.sourceReferences.some((reference: any) => reference.documentId === discoveredUpload.data.id) &&
    !rescannedCard.reviewedBy && !rescannedCard.reviewedAt,
  "rescan deduplicates discovered candidate without fabricated clinician review");
  const afterDiscovery = await request(`/parent/children/${child.id}/dashboard`, "GET", undefined, one.token);
  check(afterDiscovery.data.child.behaviors.length === 2 &&
    afterDiscovery.data.child.behaviors[0].goal === "Finish one small step" &&
    afterDiscovery.data.child.behaviors[1].goal === "Choose one comfortable item" &&
    !afterDiscovery.data.child.behaviors.some((behavior: any) => /repetitive questioning/i.test(behavior.behaviorName || "")),
  "discovery and rescan leave manually selected goals unchanged");
  const removedBehavior = await request(`/parent/children/${child.id}`, "PATCH", {
    behaviors: [{ behaviorKey: "custom", customBehavior, goal: "Choose one comfortable item" }],
  }, one.token);
  check(removedBehavior.response.ok && removedBehavior.data.behaviors.length === 1 &&
    removedBehavior.data.behaviorKey === "custom" && removedBehavior.data.goal === "Choose one comfortable item",
  "removing a selected behavior projects the next selection without clearing its goal");
  const preservedDashboard = await request(`/parent/children/${child.id}/dashboard`, "GET", undefined, one.token);
  check(preservedDashboard.data.child.behaviors.length === 1 && preservedDashboard.data.child.behaviors[0].behaviorKey === "custom" &&
    preservedDashboard.data.supportCards[0].behaviorKey === "custom" && preservedDashboard.data.documents.length === 4 &&
    preservedDashboard.data.supportCards.some((card: any) => card.source === "parent_document"),
    "behavior edits preserve source-backed cards and all uploaded documents");
  const customLog = await request(`/parent/children/${child.id}/logs`, "POST", {
    happened: false, intensity: "low", duration: 0, behaviorKey: "custom", customBehavior, goal: "Choose one comfortable item",
  }, one.token);
  check(customLog.response.ok && customLog.data.behaviorKey === "custom" &&
    customLog.data.customBehavior === customBehavior && customLog.data.goal === "Choose one comfortable item",
  "parent logs persist the selected custom behavior label and its goal");
  const [storedCustomLog] = await db.select().from(parentLogsTable).where(inArray(parentLogsTable.id, [customLog.data.id]));
  check(storedCustomLog?.behaviorKey === "custom" && storedCustomLog.customBehavior === customBehavior &&
    storedCustomLog.goal === "Choose one comfortable item",
  "custom behavior log metadata persists in the database");
  const badChat = await request(`/parent/children/${child.id}/chat`, "POST", { message: "Read this child plan" }, two.token);
  check([403, 404].includes(badChat.response.status), "chat cannot retrieve another parent's knowledge base");
  console.log(`Parent integration: ${checks} checks passed.`);
  }
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
    await db.delete(documentExtractionRunsTable).where(inArray(documentExtractionRunsTable.childId, childIds));
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