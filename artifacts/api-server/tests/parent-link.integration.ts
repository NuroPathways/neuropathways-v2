import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  auditLogsTable,
  behaviorLogsTable,
  behaviorPlansTable,
  childrenTable,
  clientAccessCodeResetsTable,
  clientProfilesTable,
  clientSessionsTable,
  clinicianCredentialsTable,
  consentEventsTable,
  dailyCheckInsTable,
  db,
  documentsTable,
  engagementEventsTable,
  familiesTable,
  invitationsTable,
  interventionPlansTable,
  messagesTable,
  mobileTokensTable,
  parentAccountsTable,
  parentChildSettingsTable,
  parentClinicInvitesTable,
  parentDocumentsTable,
  parentFamilyToolsTable,
  parentLogsTable,
  parentSessionsTable,
  pool,
  rewardTokensTable,
  sessionsTable,
  userProfilesTable,
  usersTable,
  aiConversationsTable,
  winLogsTable,
} from "@workspace/db";
import { and, eq, inArray, or } from "drizzle-orm";
import { makeStarterCard } from "../src/lib/parentStarterLibrary";

type Auth =
  | { kind: "clinician"; token: string }
  | { kind: "parent"; token: string };

type ApiResult = {
  status: number;
  body: any;
};

const developmentBase = process.env.REPLIT_DEV_DOMAIN
  ? `https://${process.env.REPLIT_DEV_DOMAIN}/api`
  : "http://localhost:80/api";
const suppliedBase = process.env.API_BASE_URL ?? developmentBase;
const baseUrl = new URL(suppliedBase);
const permittedHosts = new Set(["localhost", "127.0.0.1", "::1"]);
if (
  !permittedHosts.has(baseUrl.hostname) &&
  !baseUrl.hostname.endsWith(".replit.dev")
) {
  throw new Error(
    "Refusing to run parent-link integration tests outside a local or Replit development host. Production hosts are not allowed.",
  );
}
if (baseUrl.hostname.endsWith(".replit.app")) {
  throw new Error("Refusing to run parent-link integration tests against a production Replit host.");
}
const pathPrefix = baseUrl.pathname.replace(/\/+$/, "");
const apiPrefix = pathPrefix.endsWith("/api") ? pathPrefix : `${pathPrefix}/api`;
const apiOrigin = baseUrl.origin;

const runKey = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const testIpSuffix = crypto.randomInt(1, 255);
const emailPrefix = `parent-link-${runKey}`;
const fixture = {
  userIds: [] as string[],
  clinicianTokens: [] as string[],
  parentTokens: [] as string[],
  familyIds: [] as string[],
  childIds: [] as string[],
  documentIds: [] as string[],
  inviteTokens: [] as string[],
  inviteHashes: [] as string[],
};

let checks = 0;
const failures: string[] = [];

function check(name: string, condition: unknown, details = ""): void {
  checks += 1;
  if (condition) {
    console.log(`PASS ${name}`);
  } else {
    const failure = details ? `${name}: ${details}` : name;
    failures.push(failure);
    console.error(`FAIL ${failure}`);
  }
}

function expectStatus(result: ApiResult, expected: number, name: string): void {
  check(
    name,
    result.status === expected,
    `expected HTTP ${expected}, got ${result.status}: ${JSON.stringify(result.body)}`,
  );
}

function required<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined || value === "") {
    throw new Error(`Could not create fixture: ${label}`);
  }
  return value;
}

async function requestWithHeaders(
  path: string,
  method: "GET" | "POST" | "PATCH",
  headers: Record<string, string> = {},
  body?: unknown,
): Promise<ApiResult> {
  const requestHeaders = { ...headers };
  // Keep loopback fixtures separate from the real preview user's auth budget.
  if (permittedHosts.has(baseUrl.hostname)) requestHeaders["X-Forwarded-For"] = `198.18.254.${testIpSuffix}`;
  if (body !== undefined) requestHeaders["Content-Type"] ??= "application/json";
  const response = await fetch(`${apiOrigin}${apiPrefix}${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: any = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // Keep the response text in assertion output for unexpected non-JSON pages.
  }
  return { status: response.status, body: parsed };
}

async function api(path: string, auth?: Auth, body?: unknown): Promise<ApiResult> {
  const headers: Record<string, string> = {};
  if (auth?.kind === "clinician") headers.Authorization = `Bearer ${auth.token}`;
  if (auth?.kind === "parent") headers["X-Parent-Token"] = auth.token;
  return requestWithHeaders(path, body === undefined ? "GET" : "POST", headers, body);
}

async function post(path: string, auth: Auth | undefined, body: unknown): Promise<ApiResult> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth?.kind === "clinician") headers.Authorization = `Bearer ${auth.token}`;
  if (auth?.kind === "parent") headers["X-Parent-Token"] = auth.token;
  return requestWithHeaders(path, "POST", headers, body);
}

async function patch(path: string, auth: Auth, body: unknown): Promise<ApiResult> {
  const headers: Record<string, string> = {};
  if (auth.kind === "clinician") headers.Authorization = `Bearer ${auth.token}`;
  if (auth.kind === "parent") headers["X-Parent-Token"] = auth.token;
  return requestWithHeaders(path, "PATCH", headers, body);
}

async function registerClinician(label: string): Promise<{ id: string; auth: Auth }> {
  const email = `${emailPrefix}-${label}@example.test`;
  const response = await post("/mobile/clinician/register", undefined, {
    email,
    password: "Fixture-Clinician-Password-44!",
    firstName: `Fixture ${label}`,
    lastName: "Clinician",
    accountHolderType: "clinician",
    accountHolderAgeGroup: "18_plus",
    adultOrGuardianConfirmed: true,
  });
  assert.equal(response.status, 201, `Clinician fixture registration failed: ${JSON.stringify(response.body)}`);
  const id = required(response.body?.clinician?.id, `clinician ${label} id`);
  const token = required(response.body?.token, `clinician ${label} session token`);
  fixture.userIds.push(id);
  fixture.clinicianTokens.push(token);
  return { id, auth: { kind: "clinician", token } };
}

async function createFamily(auth: Auth, name: string, email: string): Promise<string> {
  const response = await post("/families", auth, {
    familyName: name,
    email,
    firstName: name,
    primaryContact: name,
    accountType: "parent_family",
  });
  assert.equal(response.status, 201, `Family fixture creation failed: ${JSON.stringify(response.body)}`);
  const familyId = required(response.body?.id ?? response.body?.family_id, "family id");
  fixture.familyIds.push(familyId);
  return familyId;
}

async function createClinicChild(
  auth: Auth,
  familyId: string,
  name: string,
  parentId?: string,
): Promise<any> {
  const response = await post("/children", auth, {
    familyId,
    childName: name,
    firstName: name,
    ...(parentId ? { parentId } : {}),
    status: "active",
  });
  assert.equal(response.status, 201, `Clinic-child fixture creation failed: ${JSON.stringify(response.body)}`);
  const child = response.body;
  fixture.childIds.push(required(child?.id, `clinic child ${name} id`));
  return child;
}

async function registerParent(label: string, firstName: string): Promise<{
  id: string;
  email: string;
  workspaceId: string;
  auth: Auth;
}> {
  const email = `${emailPrefix}-${label}@example.test`;
  const response = await post("/parent/auth/register", undefined, {
    firstName,
    email,
    password: "Fixture-Parent-Password-44!",
    confirmPassword: "Fixture-Parent-Password-44!",
    accountHolderType: "parent_guardian",
    accountHolderAgeGroup: "18_plus",
    adultOrGuardianConfirmed: true,
    parentGuardianAuthorityConfirmed: true,
    privacyConsent: true,
    healthConsent: true,
  });
  assert.equal(response.status, 201, `Parent fixture registration failed: ${JSON.stringify(response.body)}`);
  const id = required(response.body?.parent?.id, `parent ${label} id`);
  const workspaceId = required(response.body?.parent?.workspaceId, `parent ${label} workspace`);
  const token = required(response.body?.token, `parent ${label} session token`);
  fixture.userIds.push(id);
  fixture.parentTokens.push(token);
  fixture.familyIds.push(workspaceId);
  return { id, email, workspaceId, auth: { kind: "parent", token } };
}

async function createParentChild(auth: Auth, name: string): Promise<any> {
  const response = await post("/parent/children", auth, { name });
  assert.equal(response.status, 201, `Parent-child fixture creation failed: ${JSON.stringify(response.body)}`);
  const child = response.body;
  fixture.childIds.push(required(child?.id, `parent child ${name} id`));
  return child;
}

async function createInvite(auth: Auth, familyId: string, email: string): Promise<any> {
  const response = await post("/parent/clinic-invites", auth, { familyId, email });
  assert.equal(response.status, 201, `Invite fixture creation failed: ${JSON.stringify(response.body)}`);
  const inviteToken = required(response.body?.inviteToken, "invite token");
  fixture.inviteTokens.push(inviteToken);
  fixture.inviteHashes.push(crypto.createHash("sha256").update(inviteToken).digest("hex"));
  return response.body;
}

async function attachParentDocument(
  ownerId: string,
  workspaceId: string,
  childId: string,
  label: string,
): Promise<string> {
  const documentId = crypto.randomUUID();
  const digest = crypto.createHash("sha256").update(`${runKey}:${label}`).digest("hex");
  await db.transaction(async (tx) => {
    await tx.insert(documentsTable).values({
      id: documentId,
      tenantId: workspaceId,
      childId,
      parentId: ownerId,
      title: `${label} fixture`,
      category: "support_plan",
      fileName: `${label}.txt`,
      fileUrl: `fixture-only://${documentId}`,
      scanStatus: "pending",
      uploadedBy: "parent",
    });
    await tx.insert(parentDocumentsTable).values({
      documentId,
      parentId: ownerId,
      childId,
      workspaceId,
      storagePath: `test-fixtures/${runKey}/${documentId}`,
      mimeType: "text/plain",
      sha256: digest,
    });
  });
  fixture.documentIds.push(documentId);
  return documentId;
}

async function addParentLog(auth: Auth, childId: string): Promise<string> {
  const response = await post(`/parent/children/${childId}/logs`, auth, {
    happened: true,
    intensity: "low",
    duration: 3,
    trigger: "integration fixture",
    whatHelped: "integration fixture",
    notes: `fixture ${runKey}`,
  });
  assert.equal(response.status, 201, `Parent-log fixture creation failed: ${JSON.stringify(response.body)}`);
  return required(response.body?.id, "parent log id");
}

async function linkPreview(auth: Auth, childId: string, inviteToken: string): Promise<ApiResult> {
  return post(`/parent/children/${childId}/link-preview`, auth, { inviteToken });
}

async function connect(
  auth: Auth,
  childId: string,
  inviteToken: string,
  sharing: "all" | "selected" | "none",
  options: Record<string, unknown> = {},
): Promise<ApiResult> {
  return post(`/parent/children/${childId}/connect`, auth, {
    inviteToken,
    sharing,
    ...options,
  });
}

async function cleanup(): Promise<void> {
  const childIds = [...new Set(fixture.childIds)];
  const documentIds = [...new Set(fixture.documentIds)];
  const userIds = [...new Set(fixture.userIds)];
  const inviteHashes = [...new Set(fixture.inviteHashes)];
  const sessionIds = [...new Set(fixture.clinicianTokens)];
  try {
    await db.transaction(async (tx) => {
      if (childIds.length) {
        await tx.delete(parentLogsTable).where(inArray(parentLogsTable.childId, childIds));
        await tx.delete(behaviorLogsTable).where(inArray(behaviorLogsTable.childId, childIds));
        await tx.delete(behaviorPlansTable).where(inArray(behaviorPlansTable.childId, childIds));
        await tx.delete(interventionPlansTable).where(inArray(interventionPlansTable.childId, childIds));
        await tx.delete(rewardTokensTable).where(inArray(rewardTokensTable.childId, childIds));
        await tx.delete(messagesTable).where(inArray(messagesTable.childId, childIds));
        await tx.delete(aiConversationsTable).where(inArray(aiConversationsTable.childId, childIds));
        await tx.delete(dailyCheckInsTable).where(inArray(dailyCheckInsTable.childId, childIds));
        await tx.delete(winLogsTable).where(inArray(winLogsTable.childId, childIds));
        await tx.delete(engagementEventsTable).where(inArray(engagementEventsTable.childId, childIds));
        await tx.delete(clientProfilesTable).where(inArray(clientProfilesTable.childId, childIds));
        await tx.delete(clientSessionsTable).where(inArray(clientSessionsTable.childId, childIds));
        await tx.delete(mobileTokensTable).where(inArray(mobileTokensTable.childId, childIds));
        await tx.delete(clientAccessCodeResetsTable).where(inArray(clientAccessCodeResetsTable.childId, childIds));
        await tx.delete(invitationsTable).where(inArray(invitationsTable.clientId, childIds));
        await tx.delete(parentChildSettingsTable).where(inArray(parentChildSettingsTable.childId, childIds));
        await tx.delete(parentFamilyToolsTable).where(inArray(parentFamilyToolsTable.childId, childIds));
        await tx.delete(parentDocumentsTable).where(inArray(parentDocumentsTable.childId, childIds));
        await tx.delete(documentsTable).where(inArray(documentsTable.childId, childIds));
        await tx.delete(childrenTable).where(inArray(childrenTable.id, childIds));
      }
      if (documentIds.length) {
        await tx.delete(parentDocumentsTable).where(inArray(parentDocumentsTable.documentId, documentIds));
        await tx.delete(documentsTable).where(inArray(documentsTable.id, documentIds));
      }
      if (userIds.length) {
        await tx.delete(auditLogsTable).where(or(
          inArray(auditLogsTable.userId, userIds),
          childIds.length ? inArray(auditLogsTable.targetId, childIds) : undefined,
        ));
        await tx.delete(consentEventsTable).where(inArray(consentEventsTable.subjectId, userIds));
        await tx.delete(parentSessionsTable).where(inArray(parentSessionsTable.parentId, userIds));
        await tx.delete(parentAccountsTable).where(inArray(parentAccountsTable.id, userIds));
        await tx.delete(clinicianCredentialsTable).where(inArray(clinicianCredentialsTable.userId, userIds));
        await tx.delete(userProfilesTable).where(inArray(userProfilesTable.id, userIds));
        await tx.delete(usersTable).where(inArray(usersTable.id, userIds));
      }
      if (fixture.familyIds.length) {
        await tx.delete(familiesTable).where(inArray(familiesTable.id, [...new Set(fixture.familyIds)]));
      }
      if (sessionIds.length) {
        await tx.delete(sessionsTable).where(inArray(sessionsTable.sid, sessionIds));
      }
      if (inviteHashes.length) {
        await tx.delete(parentClinicInvitesTable).where(inArray(parentClinicInvitesTable.tokenHash, inviteHashes));
      }
    });
  } catch (error) {
    console.error("Fixture-only cleanup encountered an error:", error);
  }
}

async function run(): Promise<void> {
  const unauthenticatedInvite = await post("/parent/clinic-invites", undefined, {
    familyId: crypto.randomUUID(),
    email: `${emailPrefix}-unauth@example.test`,
  });
  expectStatus(unauthenticatedInvite, 401, "Invite issuance rejects unauthenticated callers");
  const unauthenticatedAi = await post("/ai/invoke-llm", undefined, {
    prompt: "test",
    file_urls: ["/api/uploads/private-document.pdf"],
  });
  expectStatus(unauthenticatedAi, 401, "AI invocation rejects unauthenticated callers before handling file references");

  const clinicianA = await registerClinician("clinic-a");
  const clinicianB = await registerClinician("clinic-b");
  const parentA = await registerParent("parent-a", `Parent A ${runKey}`);
  const parentB = await registerParent("parent-b", `Parent B ${runKey}`);
  const unapprovedAiFile = await post("/ai/invoke-llm", parentA.auth, {
    prompt: "test",
    file_urls: ["/api/uploads/private-document.pdf"],
  });
  expectStatus(unapprovedAiFile, 410, "The retired generic AI endpoint refuses browser-supplied file references");
  const independentChild = await createParentChild(parentA.auth, `Independent ${runKey}`);
  const forgedAiDocumentScope = await post("/ai/chat", parentA.auth, {
    childId: independentChild.id,
    message: "Summarize the authorized plan.",
    sourceDocumentIds: [crypto.randomUUID()],
  });
  expectStatus(forgedAiDocumentScope, 400, "Scoped AI chat rejects browser-supplied document IDs");
  const parentOwnedGoalId = crypto.randomUUID();
  await db.insert(rewardTokensTable).values({
    id: parentOwnedGoalId,
    childId: independentChild.id,
    parentId: parentA.id,
    tenantId: parentA.workspaceId,
    clinicianId: null,
    goalName: "Parent-owned goal",
  });
  const clinicianCannotEditNullOwnerGoal = await post("/manage-client-goal", clinicianA.auth, {
    action: "update",
    goal_id: parentOwnedGoalId,
    data: { goal_name: "Attempted change" },
  });
  expectStatus(clinicianCannotEditNullOwnerGoal, 403, "Clinicians cannot access goals whose clinician owner is null");

  const familyA = await createFamily(clinicianA.auth, `Fixture Family A ${runKey}`, parentA.email);
  const familyB = await createFamily(clinicianB.auth, `Fixture Family B ${runKey}`, parentB.email);
  const clinicBChild = await createClinicChild(clinicianB.auth, familyB, `Clinic B child ${runKey}`);
  const crossClinicAiScan = await post("/build-client-profile", clinicianA.auth, {
    child_id: clinicBChild.id,
    force_rebuild: true,
  });
  expectStatus(crossClinicAiScan, 403, "Cross-clinic AI scan is denied before document reading or model invocation");
  const crossClinicianGoalCreate = await post("/manage-client-goal", clinicianA.auth, {
    action: "create",
    child_id: clinicBChild.id,
    data: { goal_name: "Unauthorized goal" },
  });
  expectStatus(crossClinicianGoalCreate, 403, "Clinicians cannot create goals for another clinician's child");

  const crossFamilyInvite = await post("/parent/clinic-invites", clinicianB.auth, {
    familyId: familyA,
    email: parentB.email,
  });
  expectStatus(crossFamilyInvite, 404, "Clinician cannot issue an invite for another clinician's family");
  const crossFamilyRead = await api(`/families/${familyB}`, clinicianA.auth);
  expectStatus(crossFamilyRead, 403, "Clinician cannot read another clinician's family");

  const noneChild = await createParentChild(parentA.auth, `None Child ${runKey}`);
  const wrongEmailChild = await createParentChild(parentB.auth, `Wrong Email ${runKey}`);
  const inviteForA = await createInvite(clinicianA.auth, familyA, parentA.email);
  const inviteExpiryMs = Date.parse(inviteForA.expiresAt);
  check(
    "Issued invite expires after approximately seven days",
    Number.isFinite(inviteExpiryMs) &&
      inviteExpiryMs >= Date.now() + 6 * 24 * 60 * 60 * 1000 &&
      inviteExpiryMs <= Date.now() + 7 * 24 * 60 * 60 * 1000 + 10_000,
  );
  const wrongEmailPreview = await linkPreview(parentB.auth, wrongEmailChild.id, inviteForA.inviteToken);
  expectStatus(wrongEmailPreview, 403, "Preview rejects a parent account with the wrong invite email");
  const wrongEmailConnect = await connect(parentB.auth, wrongEmailChild.id, inviteForA.inviteToken, "none");
  expectStatus(wrongEmailConnect, 403, "Connect rejects a parent account with the wrong invite email");

  const protectedChild = await createParentChild(parentB.auth, `Protected Target ${runKey}`);
  const inviteForB = await createInvite(clinicianA.auth, familyA, parentB.email);
  const protectedChildConnect = await connect(parentB.auth, protectedChild.id, inviteForB.inviteToken, "none");
  expectStatus(protectedChildConnect, 200, "Correctly email-bound parent can connect their own child");
  const protectedParentLogId = await addParentLog(parentB.auth, protectedChild.id);
  const protectedPlanId = crypto.randomUUID();
  const protectedClinicalLogId = crypto.randomUUID();
  await db.insert(behaviorPlansTable).values({
    id: protectedPlanId,
    tenantId: clinicianA.id,
    clinicianId: clinicianA.id,
    parentId: parentB.id,
    childId: protectedChild.id,
    behaviorName: `Protected plan ${runKey}`,
  });
  await db.insert(behaviorLogsTable).values({
    id: protectedClinicalLogId,
    tenantId: clinicianA.id,
    clinicianId: clinicianA.id,
    parentId: parentB.id,
    childId: protectedChild.id,
    eventCategory: "behavior",
    behaviorType: "fixture",
    notes: `owned by ${parentB.id}`,
  });
  const reassignClinicianAttempt = await patch(`/behavior-plans/${protectedPlanId}`, clinicianA.auth, {
    clinician_id: clinicianB.id,
  });
  expectStatus(reassignClinicianAttempt, 403, "Generic updates cannot reassign a record to another clinician");
  const reassignChildAttempt = await patch(`/behavior-plans/${protectedPlanId}`, clinicianA.auth, {
    child_id: crypto.randomUUID(),
  });
  expectStatus(reassignChildAttempt, 403, "Generic updates cannot move a record to another child");
  const [protectedPlanAfterMutationAttempts] = await db
    .select()
    .from(behaviorPlansTable)
    .where(eq(behaviorPlansTable.id, protectedPlanId));
  check(
    "Rejected generic ownership changes leave the record owner and child unchanged",
    protectedPlanAfterMutationAttempts?.clinicianId === clinicianA.id &&
      protectedPlanAfterMutationAttempts?.childId === protectedChild.id,
  );

  const noneDoc = await attachParentDocument(parentA.id, parentA.workspaceId, noneChild.id, "none-share");
  const noneLogId = await addParentLog(parentA.auth, noneChild.id);
  const noneResult = await connect(parentA.auth, noneChild.id, inviteForA.inviteToken, "none");
  expectStatus(noneResult, 200, "Connect supports an explicit no-sharing consent");
  check("No-share connection retains the original child ID", noneResult.body?.child?.id === noneChild.id);
  check("No-share connection retains the parent workspace", noneResult.body?.child?.workspaceId === parentA.workspaceId);
  check("No-share connection retains the parent owner ID", noneResult.body?.child?.parentId === parentA.id);

  const allChild = await createParentChild(parentA.auth, `All Child ${runKey}`);
  const allDocs = [
    await attachParentDocument(parentA.id, parentA.workspaceId, allChild.id, "all-share-one"),
    await attachParentDocument(parentA.id, parentA.workspaceId, allChild.id, "all-share-two"),
  ];
  const allLogId = await addParentLog(parentA.auth, allChild.id);
  const inviteForAll = await createInvite(clinicianA.auth, familyA, parentA.email);
  const allResult = await connect(parentA.auth, allChild.id, inviteForAll.inviteToken, "all");
  expectStatus(allResult, 200, "Connect supports sharing all parent documents");

  const selectedChild = await createParentChild(parentA.auth, `Selected Child ${runKey}`);
  const selectedDocs = [
    await attachParentDocument(parentA.id, parentA.workspaceId, selectedChild.id, "selected-share-one"),
    await attachParentDocument(parentA.id, parentA.workspaceId, selectedChild.id, "selected-share-private"),
  ];
  const selectedLogId = await addParentLog(parentA.auth, selectedChild.id);
  const inviteForSelected = await createInvite(clinicianA.auth, familyA, parentA.email);
  const invalidSelected = await connect(
    parentA.auth,
    selectedChild.id,
    inviteForSelected.inviteToken,
    "selected",
    { documentIds: [crypto.randomUUID()] },
  );
  expectStatus(invalidSelected, 403, "Selected consent rejects documents outside the parent child");
  const selectedResult = await connect(
    parentA.auth,
    selectedChild.id,
    inviteForSelected.inviteToken,
    "selected",
    { documentIds: [selectedDocs[0]] },
  );
  expectStatus(selectedResult, 200, "Connect supports sharing a parent-selected document set");
  const sharedReviewCard = {
    ...makeStarterCard("task_refusal", null, "Complete one small step"),
    id: "fixture-shared-review-card",
    source: "parent_document" as const,
    sourceDocumentIds: [selectedDocs[0]],
    sourceReferences: [{ documentId: selectedDocs[0], title: "Selected shared source", excerpt: null }],
    rightNow: ["Offer one calm, clear choice."],
  };
  const legacyFamilyChild = await createClinicChild(clinicianA.auth, familyA, `Family-only child ${runKey}`);
  const legacyFamilyOwnerId = `legacy-family:${familyA}`;
  const legacyFamilyDocumentId = crypto.randomUUID();
  const legacyFamilyCard = {
    ...sharedReviewCard,
    id: "fixture-legacy-family-support-card",
    sourceDocumentIds: [legacyFamilyDocumentId],
    sourceReferences: [{ documentId: legacyFamilyDocumentId, title: "Family-shared source", excerpt: null }],
  };
  await db.insert(documentsTable).values({
    id: legacyFamilyDocumentId,
    tenantId: clinicianA.id,
    childId: legacyFamilyChild.id,
    parentId: legacyFamilyOwnerId,
    title: "Family-shared source fixture",
    category: "support_plan",
    fileName: "family-shared-source.txt",
    fileUrl: `fixture-only://${legacyFamilyDocumentId}`,
    scanStatus: "done",
    uploadedBy: "parent",
  });
  await db.insert(parentDocumentsTable).values({
    documentId: legacyFamilyDocumentId,
    parentId: legacyFamilyOwnerId,
    childId: legacyFamilyChild.id,
    workspaceId: clinicianA.id,
    storagePath: `fixture-only/${legacyFamilyDocumentId}`,
    mimeType: "text/plain",
    sha256: crypto.createHash("sha256").update(`${runKey}:legacy-family-document`).digest("hex"),
    sharedClinicianId: clinicianA.id,
  });
  await db.insert(parentFamilyToolsTable).values({
    parentId: legacyFamilyOwnerId,
    childId: legacyFamilyChild.id,
    state: { legacyParentSettings: { supportCards: [legacyFamilyCard] } },
  });
  const legacyFamilyProjection = await api(
    `/parent/children/${legacyFamilyChild.id}/shared-support`,
    clinicianA.auth,
  );
  expectStatus(legacyFamilyProjection, 200, "Clinician preview supports a verified family-scoped child without a direct parent account");
  check(
    "Family-scoped preview exposes only explicitly shared family documents",
    legacyFamilyProjection.body?.accountLink === "family" &&
      legacyFamilyProjection.body?.supportCards?.some((card: any) => card.id === legacyFamilyCard.id) &&
      legacyFamilyProjection.body?.documents?.some((document: any) => document.id === legacyFamilyDocumentId),
    JSON.stringify(legacyFamilyProjection.body),
  );
  const otherClinicianFamilyProjection = await api(
    `/parent/children/${legacyFamilyChild.id}/shared-support`,
    clinicianB.auth,
  );
  expectStatus(otherClinicianFamilyProjection, 403, "Family-scoped support remains inaccessible to another clinician");
  const reviewedLegacyFamily = await post(
    `/parent/children/${legacyFamilyChild.id}/support-review`,
    clinicianA.auth,
    { approved: true },
  );
  expectStatus(reviewedLegacyFamily, 200, "Clinician review writes back to family-scoped support settings");
  check(
    "Family-scoped review is retained in the legacy family tools record",
    reviewedLegacyFamily.body?.supportCards?.some((card: any) =>
      card.id === legacyFamilyCard.id && card.source === "clinician_reviewed",
    ),
  );
  const unlinkedClinicChildResult = await post("/children", clinicianA.auth, {
    childName: `No family link child ${runKey}`,
    firstName: `No family link child ${runKey}`,
    accountType: "individual",
    status: "active",
  });
  expectStatus(unlinkedClinicChildResult, 201, "Create a clinician-owned client with no parent or family account");
  const unlinkedClinicChild = unlinkedClinicChildResult.body;
  fixture.childIds.push(required(unlinkedClinicChild?.id, "unlinked clinician child id"));
  const unlinkedSupport = await api(
    `/parent/children/${unlinkedClinicChild.id}/shared-support`,
    clinicianA.auth,
  );
  expectStatus(unlinkedSupport, 200, "Optional shared-support review does not fail for clients without a parent/family account");
  check(
    "Unlinked client receives an explicit empty shared-support state",
    unlinkedSupport.body?.accountLink === "none" &&
      unlinkedSupport.body?.supportCards?.length === 0 &&
      unlinkedSupport.body?.documents?.length === 0,
  );
  const privateReviewCard = {
    ...sharedReviewCard,
    id: "fixture-private-review-card",
    sourceDocumentIds: [selectedDocs[1]],
    sourceReferences: [{ documentId: selectedDocs[1], title: "PRIVATE_GUIDANCE_SENTINEL source", excerpt: null }],
    whatMayBeHappening: "PRIVATE_GUIDANCE_SENTINEL private guidance must never reach the clinician projection.",
  };
  const clinicianSourceDocumentId = crypto.randomUUID();
  await db.insert(documentsTable).values({
    id: clinicianSourceDocumentId,
    tenantId: clinicianA.id,
    clinicianId: clinicianA.id,
    childId: selectedChild.id,
    title: "Clinician-owned shared source fixture",
    category: "support_plan",
    fileName: "clinician-source-fixture.txt",
    fileUrl: `fixture-only://${clinicianSourceDocumentId}`,
    scanStatus: "done",
    uploadedBy: clinicianA.id,
  });
  fixture.documentIds.push(clinicianSourceDocumentId);
  const mixedSourceCard = {
    ...sharedReviewCard,
    id: "fixture-mixed-private-clinician-review-card",
    source: "clinician_document" as const,
    sourceDocumentIds: [selectedDocs[0], selectedDocs[1], clinicianSourceDocumentId],
    sourceReferences: [
      { documentId: selectedDocs[0], title: "Selected shared source", excerpt: null },
      { documentId: selectedDocs[1], title: "MIXED_PRIVATE_SENTINEL parent source", excerpt: null },
      { documentId: clinicianSourceDocumentId, title: "Clinician-owned source", excerpt: null },
    ],
  };
  await db.update(parentChildSettingsTable).set({
    supportCards: [sharedReviewCard, privateReviewCard, mixedSourceCard],
  }).where(eq(parentChildSettingsTable.childId, selectedChild.id));
  const sharedSupportProjection = await api(
    `/parent/children/${selectedChild.id}/shared-support`,
    clinicianA.auth,
  );
  expectStatus(sharedSupportProjection, 200, "Clinician support preview returns successfully");
  check(
    "Clinician preview omits private source cards and their references",
    sharedSupportProjection.body?.supportCards?.length === 1 &&
      sharedSupportProjection.body.supportCards[0]?.id === sharedReviewCard.id &&
      !JSON.stringify(sharedSupportProjection.body).includes("PRIVATE_GUIDANCE_SENTINEL") &&
      sharedSupportProjection.body.documents?.length === 1 &&
      sharedSupportProjection.body.documents[0]?.id === selectedDocs[0] &&
      !JSON.stringify(sharedSupportProjection.body).includes(mixedSourceCard.id) &&
      !JSON.stringify(sharedSupportProjection.body).includes("MIXED_PRIVATE_SENTINEL"),
  );
  const reviewedProjection = await post(
    `/parent/children/${selectedChild.id}/support-review`,
    clinicianA.auth,
    { approved: true },
  );
  expectStatus(reviewedProjection, 200, "Clinician can review visible shared support");
  check(
    "Clinician review response never returns private support or its references",
    reviewedProjection.body?.supportCards?.length === 1 &&
      reviewedProjection.body.supportCards[0]?.source === "clinician_reviewed" &&
      reviewedProjection.body.supportCards[0]?.id === sharedReviewCard.id &&
      !JSON.stringify(reviewedProjection.body).includes("PRIVATE_GUIDANCE_SENTINEL"),
  );
  const mixedSourceSharing = await patch(
    `/parent/children/${selectedChild.id}/documents/${selectedDocs[1]}/sharing`,
    parentA.auth,
    { shared: true },
  );
  expectStatus(mixedSourceSharing, 200, "Parent can explicitly share the previously private source");
  const sharedMixedProjection = await api(
    `/parent/children/${selectedChild.id}/shared-support`,
    clinicianA.auth,
  );
  expectStatus(sharedMixedProjection, 200, "Clinician preview succeeds after the second source is shared");
  const sharedMixedCard = sharedMixedProjection.body?.supportCards?.find((card: any) => card.id === mixedSourceCard.id);
  check(
    "Mixed private-parent and clinician-derived card appears only after every parent input is shared",
    sharedMixedCard?.source === "clinician_document" &&
      sharedMixedCard?.sourceDocumentIds?.length === 3 &&
      sharedMixedCard?.sourceReferences?.some((reference: any) => reference.documentId === selectedDocs[1]) &&
      sharedMixedProjection.body.documents?.some((document: any) => document.id === clinicianSourceDocumentId),
  );
  const sharedMixedReview = await post(
    `/parent/children/${selectedChild.id}/support-review`,
    clinicianA.auth,
    { approved: true },
  );
  expectStatus(sharedMixedReview, 200, "Clinician can review the fully shared mixed-source card");
  check(
    "Review response retains all mixed provenance after explicit sharing",
    sharedMixedReview.body?.supportCards?.some((card: any) =>
      card.id === mixedSourceCard.id &&
      card.source === "clinician_reviewed" &&
      card.sourceDocumentIds?.length === 3 &&
      card.sourceReferences?.some((reference: any) => reference.documentId === selectedDocs[1]),
    ),
  );
  const revokedMixedSource = await patch(
    `/parent/children/${selectedChild.id}/documents/${selectedDocs[1]}/sharing`,
    parentA.auth,
    { shared: false },
  );
  expectStatus(revokedMixedSource, 200, "Parent can revoke the mixed card's parent-document source");
  const revokedMixedProjection = await api(
    `/parent/children/${selectedChild.id}/shared-support`,
    clinicianA.auth,
  );
  expectStatus(revokedMixedProjection, 200, "Clinician preview remains available after revocation");
  check(
    "Revocation hides mixed-derived card and its private source reference",
    !JSON.stringify(revokedMixedProjection.body).includes(mixedSourceCard.id) &&
      !JSON.stringify(revokedMixedProjection.body).includes("MIXED_PRIVATE_SENTINEL") &&
      !JSON.stringify(revokedMixedProjection.body).includes(selectedDocs[1]),
  );
  const revokedMixedReview = await post(
    `/parent/children/${selectedChild.id}/support-review`,
    clinicianA.auth,
    { approved: true },
  );
  expectStatus(revokedMixedReview, 200, "Clinician review response remains safe after source revocation");
  check(
    "Review response omits mixed card and revoked source provenance",
    !JSON.stringify(revokedMixedReview.body).includes(mixedSourceCard.id) &&
      !JSON.stringify(revokedMixedReview.body).includes("MIXED_PRIVATE_SENTINEL") &&
      !JSON.stringify(revokedMixedReview.body).includes(selectedDocs[1]),
  );

  const expiredChild = await createParentChild(parentA.auth, `Expired Child ${runKey}`);
  const expiredToken = crypto.randomBytes(32).toString("base64url");
  const expiredHash = crypto.createHash("sha256").update(expiredToken).digest("hex");
  fixture.inviteTokens.push(expiredToken);
  fixture.inviteHashes.push(expiredHash);
  await db.insert(parentClinicInvitesTable).values({
    tokenHash: expiredHash,
    familyId: familyA,
    clinicianId: clinicianA.id,
    invitedEmail: parentA.email,
    expiresAt: new Date(Date.now() - 60_000),
  });
  const expiredPreview = await linkPreview(parentA.auth, expiredChild.id, expiredToken);
  expectStatus(expiredPreview, 410, "Preview rejects expired invites");
  const expiredConnect = await connect(parentA.auth, expiredChild.id, expiredToken, "none");
  expectStatus(expiredConnect, 410, "Connect rejects expired invites");

  const reuseProbe = await createParentChild(parentA.auth, `Reuse Probe ${runKey}`);
  const reusedInvite = await connect(parentA.auth, reuseProbe.id, inviteForA.inviteToken, "none");
  expectStatus(reusedInvite, 410, "A used invite cannot be accepted a second time");

  const mergeName = `Merge Allowed ${runKey}`;
  const mergeClinicChild = await createClinicChild(clinicianA.auth, familyA, mergeName);
  const foreignMergeChild = await createClinicChild(clinicianB.auth, familyB, mergeName);
  const mergePlanId = crypto.randomUUID();
  const mergeForeignPlanId = crypto.randomUUID();
  const mergeClinicalLogId = crypto.randomUUID();
  const mergeLegacyLogId = crypto.randomUUID();
  const mergeForeignOwnerLogId = crypto.randomUUID();
  const mergeDocumentId = crypto.randomUUID();
  const mergeForeignDocumentId = crypto.randomUUID();
  await db.insert(behaviorPlansTable).values({
    id: mergePlanId,
    tenantId: clinicianA.id,
    clinicianId: clinicianA.id,
    childId: mergeClinicChild.id,
    behaviorName: `Merge fixture ${runKey}`,
  });
  await db.insert(behaviorPlansTable).values({
    id: mergeForeignPlanId,
    tenantId: clinicianA.id,
    clinicianId: clinicianA.id,
    parentId: parentB.id,
    childId: mergeClinicChild.id,
    behaviorName: `Other-parent plan fixture ${runKey}`,
  });
  await db.insert(behaviorLogsTable).values({
    id: mergeClinicalLogId,
    tenantId: clinicianA.id,
    clinicianId: clinicianA.id,
    childId: mergeClinicChild.id,
    eventCategory: "behavior",
    behaviorType: "fixture",
    notes: `merge fixture ${runKey}`,
  });
  await db.insert(behaviorLogsTable).values({
    id: mergeLegacyLogId,
    tenantId: clinicianA.id,
    clinicianId: clinicianA.id,
    parentId: mergeClinicChild.id,
    childId: mergeClinicChild.id,
    eventCategory: "behavior",
    behaviorType: "legacy-parent-identity",
    notes: `legacy child identity fixture ${runKey}`,
  });
  await db.insert(behaviorLogsTable).values({
    id: mergeForeignOwnerLogId,
    tenantId: clinicianA.id,
    clinicianId: clinicianA.id,
    parentId: parentB.id,
    childId: mergeClinicChild.id,
    eventCategory: "behavior",
    behaviorType: "other-parent-owned",
    notes: `other-parent-owned fixture ${runKey}`,
  });
  await db.insert(documentsTable).values({
    id: mergeDocumentId,
    tenantId: clinicianA.id,
    clinicianId: clinicianA.id,
    childId: mergeClinicChild.id,
    title: `Merge document ${runKey}`,
    category: "support_plan",
    fileName: "merge-fixture.txt",
    fileUrl: `fixture-only://${mergeDocumentId}`,
    uploadedBy: clinicianA.id,
  });
  await db.insert(documentsTable).values({
    id: mergeForeignDocumentId,
    tenantId: clinicianA.id,
    clinicianId: clinicianA.id,
    parentId: parentB.id,
    childId: mergeClinicChild.id,
    title: `Other-parent document ${runKey}`,
    category: "support_plan",
    fileName: "other-parent-fixture.txt",
    fileUrl: `fixture-only://${mergeForeignDocumentId}`,
    uploadedBy: clinicianA.id,
  });
  fixture.documentIds.push(mergeDocumentId, mergeForeignDocumentId);
  const mergeSessionToken = crypto.randomBytes(32).toString("hex");
  await db.insert(clientSessionsTable).values({
    childId: mergeClinicChild.id,
    inviteToken: mergeSessionToken,
    username: `merge-${runKey}`,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  const mergeMobileToken = crypto.randomBytes(32).toString("hex");
  await db.insert(mobileTokensTable).values({
    token: mergeMobileToken,
    childId: mergeClinicChild.id,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  const mergeParentChild = await createParentChild(parentA.auth, mergeName);
  const mergeSettings = await patch(`/parent/children/${mergeParentChild.id}`, parentA.auth, {
    behaviors: [
      { behaviorKey: "task_refusal", goal: "Start a small step" },
      { behaviorKey: "custom", customBehavior: "Morning clothing discomfort", goal: "Choose comfortable clothing" },
    ],
  });
  expectStatus(mergeSettings, 200, "Multi-behavior settings are saved before clinic merge");
  const mergeParentLogId = await addParentLog(parentA.auth, mergeParentChild.id);
  const inviteForMerge = await createInvite(clinicianA.auth, familyA, parentA.email);
  const mergePreview = await linkPreview(parentA.auth, mergeParentChild.id, inviteForMerge.inviteToken);
  expectStatus(mergePreview, 200, "Duplicate preview succeeds");
  check(
    "Duplicate preview requests merge review",
    mergePreview.body?.requiresMergeReview === true &&
      mergePreview.body?.children?.some((child: any) => child.id === mergeClinicChild.id),
  );
  const unconfirmedMerge = await connect(parentA.auth, mergeParentChild.id, inviteForMerge.inviteToken, "none");
  expectStatus(unconfirmedMerge, 409, "Duplicate merge cannot happen without explicit selection and confirmation");
  const selectedUnconfirmedMerge = await connect(
    parentA.auth,
    mergeParentChild.id,
    inviteForMerge.inviteToken,
    "none",
    { mergeChildId: mergeClinicChild.id, confirmMerge: false },
  );
  expectStatus(selectedUnconfirmedMerge, 409, "Selecting a duplicate without confirming it is rejected");
  const foreignFamilyMerge = await connect(
    parentA.auth,
    mergeParentChild.id,
    inviteForMerge.inviteToken,
    "none",
    { mergeChildId: foreignMergeChild.id, confirmMerge: true },
  );
  expectStatus(foreignFamilyMerge, 403, "Merge selection cannot target a child from another clinic family");
  const merged = await connect(
    parentA.auth,
    mergeParentChild.id,
    inviteForMerge.inviteToken,
    "none",
    { mergeChildId: mergeClinicChild.id, confirmMerge: true },
  );
  expectStatus(merged, 200, "Explicitly selected and confirmed clinic duplicate merges");
  check("Successful merge returns the original parent child ID", merged.body?.child?.id === mergeParentChild.id);
  check("Successful merge retains original parent workspace", merged.body?.child?.workspaceId === parentA.workspaceId);
  check("Successful merge returns every selected behavior and its goal",
    merged.body?.child?.behaviors?.length === 2 &&
      merged.body.child.behaviors[0]?.goal === "Start a small step" &&
      merged.body.child.behaviors[1]?.customBehavior === "Morning clothing discomfort",
  );
  const [retainedMergeSettings] = await db.select().from(parentChildSettingsTable)
    .where(eq(parentChildSettingsTable.childId, mergeParentChild.id));
  check("Clinic merge preserves stored parent behavior settings",
    retainedMergeSettings?.behaviors?.length === 2 &&
      retainedMergeSettings.behaviors[1]?.goal === "Choose comfortable clothing",
  );

  const expiredStatusRows = await db.select().from(parentClinicInvitesTable).where(eq(parentClinicInvitesTable.tokenHash, expiredHash));
  check("Expired invite remains unused after rejected acceptance", expiredStatusRows[0]?.usedAt == null);

  const protectedParentChild = await createParentChild(parentA.auth, `Protected Target ${runKey}`);
  const protectedInviteA = await createInvite(clinicianA.auth, familyA, parentA.email);
  const protectedPreview = await linkPreview(parentA.auth, protectedParentChild.id, protectedInviteA.inviteToken);
  expectStatus(protectedPreview, 200, "Cross-parent duplicate preview is readable for merge review");
  check(
    "Cross-parent duplicate is identified for review",
    protectedPreview.body?.requiresMergeReview === true &&
      protectedPreview.body?.children?.some((child: any) => child.id === protectedChild.id),
  );
  const crossParentMerge = await connect(
    parentA.auth,
    protectedParentChild.id,
    protectedInviteA.inviteToken,
    "none",
    { mergeChildId: protectedChild.id, confirmMerge: true },
  );
  check(
    "Merge refuses a clinic child owned by a different parent",
    crossParentMerge.status === 403 || crossParentMerge.status === 409,
    `expected HTTP 403 or 409, got ${crossParentMerge.status}: ${JSON.stringify(crossParentMerge.body)}`,
  );

  const [noneMetadata] = await db.select().from(parentDocumentsTable).where(eq(parentDocumentsTable.documentId, noneDoc));
  const [noneDocument] = await db.select().from(documentsTable).where(eq(documentsTable.id, noneDoc));
  check("No-sharing preserves document ID, child, workspace, and privacy", noneMetadata?.documentId === noneDoc && noneMetadata?.childId === noneChild.id && noneMetadata?.workspaceId === parentA.workspaceId && noneMetadata?.sharedClinicianId == null);
  check("No-sharing leaves document tenant in parent workspace", noneDocument?.tenantId === parentA.workspaceId);
  const [noneStoredLog] = await db.select().from(parentLogsTable).where(eq(parentLogsTable.id, noneLogId));
  check("Linking preserves parent behavior log ID, child, and workspace", noneStoredLog?.id === noneLogId && noneStoredLog?.childId === noneChild.id && noneStoredLog?.workspaceId === parentA.workspaceId);
  check("No-sharing retains parent child ID and workspace", noneResult.body?.child?.id === noneChild.id && noneResult.body?.child?.workspaceId === parentA.workspaceId);

  const allMetadata = await db.select().from(parentDocumentsTable).where(inArray(parentDocumentsTable.documentId, allDocs));
  const allDocumentRows = await db.select().from(documentsTable).where(inArray(documentsTable.id, allDocs));
  check("Share-all grants explicit metadata consent without rewriting metadata workspace", allMetadata.length === 2 && allMetadata.every((row) => row.sharedClinicianId === clinicianA.id && row.workspaceId === parentA.workspaceId && row.childId === allChild.id));
  check("Share-all updates only the document tenant to the clinic", allDocumentRows.length === 2 && allDocumentRows.every((row) => row.tenantId === clinicianA.id && row.childId === allChild.id));
  check("Share-all retains parent child ID and workspace", allResult.body?.child?.id === allChild.id && allResult.body?.child?.workspaceId === parentA.workspaceId && allResult.body?.child?.parentId === parentA.id);

  const selectedMetadata = await db.select().from(parentDocumentsTable).where(inArray(parentDocumentsTable.documentId, selectedDocs));
  const selectedDocumentRows = await db.select().from(documentsTable).where(inArray(documentsTable.id, selectedDocs));
  const chosenMeta = selectedMetadata.find((row) => row.documentId === selectedDocs[0]);
  const privateMeta = selectedMetadata.find((row) => row.documentId === selectedDocs[1]);
  const chosenDocument = selectedDocumentRows.find((row) => row.id === selectedDocs[0]);
  const privateDocument = selectedDocumentRows.find((row) => row.id === selectedDocs[1]);
  check("Selected consent shares only the chosen document and preserves metadata workspace", chosenMeta?.sharedClinicianId === clinicianA.id && chosenMeta?.workspaceId === parentA.workspaceId && privateMeta?.sharedClinicianId == null && privateMeta?.workspaceId === parentA.workspaceId);
  check("Unselected document tenant remains the parent workspace", chosenDocument?.tenantId === clinicianA.id && privateDocument?.tenantId === parentA.workspaceId);
  check("Selected-sharing connection retains parent child ID and workspace", selectedResult.body?.child?.id === selectedChild.id && selectedResult.body?.child?.workspaceId === parentA.workspaceId && selectedResult.body?.child?.parentId === parentA.id);

  const parentLogs = await db.select().from(parentLogsTable).where(inArray(parentLogsTable.id, [noneLogId, allLogId, selectedLogId, mergeParentLogId, protectedParentLogId]));
  check("Link and merge keep parent log IDs, child IDs, workspaces, and ownership", parentLogs.length === 5 && parentLogs.every((row) =>
    row.parentId === (row.id === protectedParentLogId ? parentB.id : parentA.id) &&
    row.workspaceId === (row.id === protectedParentLogId ? parentB.workspaceId : parentA.workspaceId) &&
    row.childId === (row.id === protectedParentLogId ? protectedChild.id : row.id === mergeParentLogId ? mergeParentChild.id : row.id === noneLogId ? noneChild.id : row.id === allLogId ? allChild.id : selectedChild.id),
  ));
  const [mergedPlan] = await db.select().from(behaviorPlansTable).where(eq(behaviorPlansTable.id, mergePlanId));
  const [unmovedForeignPlan] = await db.select().from(behaviorPlansTable).where(eq(behaviorPlansTable.id, mergeForeignPlanId));
  const [mergedClinicalLog] = await db.select().from(behaviorLogsTable).where(eq(behaviorLogsTable.id, mergeClinicalLogId));
  const [mergedLegacyLog] = await db.select().from(behaviorLogsTable).where(eq(behaviorLogsTable.id, mergeLegacyLogId));
  const [unmovedForeignLog] = await db.select().from(behaviorLogsTable).where(eq(behaviorLogsTable.id, mergeForeignOwnerLogId));
  const [mergedDocument] = await db.select().from(documentsTable).where(eq(documentsTable.id, mergeDocumentId));
  const [unmovedForeignDocument] = await db.select().from(documentsTable).where(eq(documentsTable.id, mergeForeignDocumentId));
  const [movedClientSession] = await db.select().from(clientSessionsTable).where(eq(clientSessionsTable.inviteToken, mergeSessionToken));
  const [movedMobileToken] = await db.select().from(mobileTokensTable).where(eq(mobileTokensTable.token, mergeMobileToken));
  const [mergedClinicChild] = await db.select().from(childrenTable).where(eq(childrenTable.id, mergeClinicChild.id));
  const [foreignChildAfterMerge] = await db.select().from(childrenTable).where(eq(childrenTable.id, foreignMergeChild.id));
  const [retainedMergeChild] = await db.select().from(childrenTable).where(eq(childrenTable.id, mergeParentChild.id));
  check("Confirmed merge preserves clinic-plan record ID and reattaches it", mergedPlan?.childId === mergeParentChild.id && mergedPlan?.id === mergePlanId);
  check("Confirmed merge never transfers another parent's plan", unmovedForeignPlan?.childId === mergeClinicChild.id && unmovedForeignPlan?.parentId === parentB.id);
  check("Confirmed merge preserves clinical-log record ID and reattaches it", mergedClinicalLog?.childId === mergeParentChild.id && mergedClinicalLog?.id === mergeClinicalLogId);
  check("Confirmed merge moves legacy child-identity log and rebinds its owner", mergedLegacyLog?.id === mergeLegacyLogId && mergedLegacyLog?.childId === mergeParentChild.id && mergedLegacyLog?.parentId === parentA.id);
  check("Confirmed merge never transfers another parent's behavior log", unmovedForeignLog?.childId === mergeClinicChild.id && unmovedForeignLog?.parentId === parentB.id);
  check("Confirmed merge preserves document ID and file URL", mergedDocument?.childId === mergeParentChild.id && mergedDocument?.id === mergeDocumentId && mergedDocument?.fileUrl === `fixture-only://${mergeDocumentId}`);
  check("Confirmed merge never transfers another parent's document", unmovedForeignDocument?.childId === mergeClinicChild.id && unmovedForeignDocument?.parentId === parentB.id);
  check("Confirmed merge preserves legacy client-session access", movedClientSession?.childId === mergeParentChild.id);
  check("Confirmed merge preserves mobile-session access", movedMobileToken?.childId === mergeParentChild.id);
  const legacyPortalData = await requestWithHeaders(
    "/client-portal-data",
    "POST",
    {},
    { child_id: mergeParentChild.id, invite_token: mergeSessionToken },
  );
  expectStatus(legacyPortalData, 200, "Retained client-session identity can read merged legacy data");
  check("Legacy client portal can read the moved behavior-log ID", legacyPortalData.body?.behavior_logs?.some((row: any) => row.id === mergeLegacyLogId));
  const mobileBehaviorLogs = await requestWithHeaders(
    "/mobile/behavior-logs",
    "GET",
    { "X-Mobile-Token": mergeMobileToken },
  );
  expectStatus(mobileBehaviorLogs, 200, "Retained mobile identity can read merged legacy data");
  check("Mobile behavior-log API can read the moved behavior-log ID", Array.isArray(mobileBehaviorLogs.body) && mobileBehaviorLogs.body.some((row: any) => row.id === mergeLegacyLogId));
  check("Duplicate clinic child remains as a merged record", mergedClinicChild?.status === "merged");
  check("Cross-family candidate remains untouched", foreignChildAfterMerge?.status === "active" && foreignChildAfterMerge?.clinicianId === clinicianB.id);
  check("Original parent child remains in its workspace and keeps its parent ID", retainedMergeChild?.tenantId === parentA.workspaceId && retainedMergeChild?.parentId === parentA.id);

  const [protectedParentChildAfter] = await db.select().from(childrenTable).where(eq(childrenTable.id, protectedChild.id));
  const [protectedPlanAfter] = await db.select().from(behaviorPlansTable).where(eq(behaviorPlansTable.id, protectedPlanId));
  const [protectedLogAfter] = await db.select().from(behaviorLogsTable).where(eq(behaviorLogsTable.id, protectedClinicalLogId));
  const [protectedParentLogAfter] = await db.select().from(parentLogsTable).where(eq(parentLogsTable.id, protectedParentLogId));
  const [protectedSourceAfter] = await db.select().from(childrenTable).where(eq(childrenTable.id, protectedParentChild.id));
  check("Rejected cross-parent merge does not mark the other parent's child merged", protectedParentChildAfter?.status !== "merged");
  check("Rejected cross-parent merge preserves the other parent's child owner and workspace", protectedParentChildAfter?.parentId === parentB.id && protectedParentChildAfter?.tenantId === parentB.workspaceId);
  check("Rejected cross-parent merge does not move the other parent's clinic plan", protectedPlanAfter?.childId === protectedChild.id && protectedPlanAfter?.parentId === parentB.id);
  check("Rejected cross-parent merge does not move the other parent's clinic log", protectedLogAfter?.childId === protectedChild.id && protectedLogAfter?.parentId === parentB.id);
  check("Rejected cross-parent merge does not move the other parent's log", protectedParentLogAfter?.childId === protectedChild.id && protectedParentLogAfter?.parentId === parentB.id && protectedParentLogAfter?.workspaceId === parentB.workspaceId);
  check("Rejected cross-parent merge leaves the requesting parent's child unlinked", protectedSourceAfter?.clinicianId == null && protectedSourceAfter?.parentId === parentA.id);

  const settingsProtectedName = `Settings Protected ${runKey}`;
  const settingsProtectedTarget = await createClinicChild(clinicianA.auth, familyA, settingsProtectedName);
  await db.insert(parentChildSettingsTable).values({
    childId: settingsProtectedTarget.id,
    parentId: parentB.id,
    workspaceId: parentB.workspaceId,
    supportCards: [],
  });
  const settingsProtectedSource = await createParentChild(parentA.auth, settingsProtectedName);
  const settingsProtectedInvite = await createInvite(clinicianA.auth, familyA, parentA.email);
  const settingsProtectedResult = await connect(
    parentA.auth,
    settingsProtectedSource.id,
    settingsProtectedInvite.inviteToken,
    "none",
    { mergeChildId: settingsProtectedTarget.id, confirmMerge: true },
  );
  check(
    "Merge refuses a target with settings owned by another parent/workspace",
    settingsProtectedResult.status === 403 || settingsProtectedResult.status === 409,
    `expected HTTP 403 or 409, got ${settingsProtectedResult.status}: ${JSON.stringify(settingsProtectedResult.body)}`,
  );
  const [settingsTargetAfter] = await db.select().from(childrenTable).where(eq(childrenTable.id, settingsProtectedTarget.id));
  const [settingsAfter] = await db.select().from(parentChildSettingsTable).where(eq(parentChildSettingsTable.childId, settingsProtectedTarget.id));
  const [settingsSourceAfter] = await db.select().from(childrenTable).where(eq(childrenTable.id, settingsProtectedSource.id));
  check("Settings-owner rejection leaves the target clinic child intact", settingsTargetAfter?.status === "active" && settingsTargetAfter?.parentId == null);
  check("Settings-owner rejection never transfers or rewrites the other parent's settings", settingsAfter?.parentId === parentB.id && settingsAfter?.workspaceId === parentB.workspaceId);
  check("Settings-owner rejection leaves the requesting parent child unlinked", settingsSourceAfter?.clinicianId == null && settingsSourceAfter?.parentId === parentA.id);

  const consentAudits = await db.select().from(auditLogsTable).where(and(
    eq(auditLogsTable.userId, parentA.id),
    eq(auditLogsTable.action, "parent_clinic_document_sharing_consent"),
  ));
  check("Each link choice has an audit record", consentAudits.length >= 4);
  check("Consent audit records include all/selected/none choices", ["all", "selected", "none"].every((mode) =>
    consentAudits.some((row) => (row.metadata as any)?.sharing === mode),
  ));

  const inviteRows = fixture.inviteHashes.length
    ? await db.select().from(parentClinicInvitesTable).where(inArray(parentClinicInvitesTable.tokenHash, fixture.inviteHashes))
    : [];
  check("New invite tokens are stored only as hashes", inviteRows.every((row) =>
    !fixture.inviteTokens.includes(row.tokenHash) && /^[a-f0-9]{64}$/.test(row.tokenHash),
  ));

  assert.equal(failures.length, 0, `${failures.length} parent-link integration regression(s) failed`);
}

try {
  await run();
} catch (error) {
  console.error(error);
  if (!failures.length) failures.push(error instanceof Error ? error.message : String(error));
} finally {
  await cleanup();
  await pool.end();
}

console.log(`Parent-link integration checks: ${checks - failures.length} passed, ${failures.length} failed.`);
if (failures.length) process.exitCode = 1;