import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import express from "express";
import http from "node:http";
import { once } from "node:events";
import { after, test } from "node:test";

const databaseUrl = process.env.P0_ACCESS_TEST_DATABASE_URL;
const testRoot = process.env.P0_ACCESS_TEST_ROOT;
const evidenceDir = process.env.P0_ACCESS_EVIDENCE_DIR;
if (!databaseUrl || !testRoot || !evidenceDir) {
  throw new Error("The isolated family-scope test runner did not provide required test paths.");
}
const parsedDatabaseUrl = new URL(databaseUrl);
if (
  !["127.0.0.1", "::1", "[::1]"].includes(parsedDatabaseUrl.hostname) ||
  decodeURIComponent(parsedDatabaseUrl.pathname.slice(1)) !== "np_p0_access_test" ||
  !path.resolve(testRoot).startsWith("/tmp/np-p0-family-scope.")
) {
  throw new Error("Refusing to run outside the isolated loopback database and temporary test root.");
}

process.env.DATABASE_URL = databaseUrl;
process.env.FILE_ENCRYPTION_KEY = "d".repeat(64);
process.env.REPLIT_CONNECTORS_ENABLED = "false";
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
const appRoot = path.join(testRoot, "application");
await fs.mkdir(appRoot, { recursive: true, mode: 0o700 });
process.chdir(appRoot);

const database = await import("@workspace/db");
const {
  auditLogsTable,
  childrenTable,
  clinicMembershipsTable,
  clinicsTable,
  clinicalAssignmentsTable,
  clientProfilesTable,
  clientSessionsTable,
  db,
  documentsTable,
  familiesTable,
  messagesTable,
  mobileTokensTable,
  parentClinicConsentsTable,
  parentDocumentsTable,
  pool,
  rewardTokensTable,
  userProfilesTable,
  usersTable,
} = database;
const { eq } = await import("drizzle-orm");
const { default: entitiesRouter } = await import("./entities");
const { default: clinicManagementRouter } = await import("./clinic-management");
const { default: uploadRouter } = await import("./upload");
const { hashClientAccessCode } = await import("../lib/clientAccessCode");
const { clinicianCanAccessChild } = await import("../lib/clinicAuthorization");

after(async () => pool.end());

type DenialCase = {
  caseId: string;
  status: number;
  unchanged: boolean;
  noMarker: boolean;
  auditCount: number;
  auditActorMatches: boolean;
  auditTargetMatches: boolean;
  auditTenantMatches: boolean;
  auditOutcomeMatches: boolean;
  auditRequestMatches: boolean;
  auditOperationMatches: boolean;
  auditTimestampMatches: boolean;
  noSensitiveAuditMarkers: boolean;
};

test("legacy family credentials cannot write across family boundaries", async () => {
  const suffix = crypto.randomUUID();
  const tenantId = `scope-tenant-${suffix}`;
  const clinicianId = `scope-clinician-${suffix}`;
  const familyA = `scope-family-a-${suffix}`;
  const familyB = `scope-family-b-${suffix}`;
  const childA = `scope-child-a-${suffix}`;
  const childB = `scope-child-b-${suffix}`;
  const userName = `scope-${suffix.slice(0, 10)}`;
  const accessCode = `SAFE-${suffix.slice(0, 10)}`;
  const privateMarker = `FOREIGN_PRIVATE_${suffix}`;
  const existingGoalId = `scope-goal-${suffix}`;

  await db.insert(familiesTable).values([
    {
      id: familyA,
      tenantId,
      clinicianId,
      familyName: "Synthetic Family A",
      accountType: "family",
      inviteStatus: "accepted",
    },
    {
      id: familyB,
      tenantId,
      clinicianId,
      familyName: "Synthetic Family B",
      accountType: "family",
      inviteStatus: "accepted",
    },
  ]);
  await db.insert(childrenTable).values([
    {
      id: childA,
      tenantId,
      clinicianId,
      familyId: familyA,
      childName: "Synthetic Child A",
      accountType: "parent_clinician",
      status: "active",
      username: userName,
      accessCode: await hashClientAccessCode(accessCode),
    },
    {
      id: childB,
      tenantId,
      clinicianId,
      familyId: familyB,
      childName: "Synthetic Child B",
      accountType: "parent_clinician",
      status: "active",
      username: `other-${userName}`,
      accessCode: await hashClientAccessCode(`OTHER-${accessCode}`),
    },
  ]);
  await db.insert(rewardTokensTable).values({
    id: existingGoalId,
    childId: childB,
    parentId: childB,
    tenantId,
    clinicianId,
    goalName: privateMarker,
    source: "manual",
    createdByClinician: false,
  });
  const clinicianOnlyDocumentId = `scope-clinician-only-${suffix}`;
  const sharedDocumentId = `scope-shared-document-${suffix}`;
  const legacyDocumentId = `scope-legacy-document-${suffix}`;
  await db.insert(documentsTable).values([
    {
      id: clinicianOnlyDocumentId,
      childId: childA,
      tenantId,
      clinicianId,
      title: "Synthetic clinician-only document",
      fileName: "clinician-only.txt",
      fileUrl: "/uploads/clinician-only.txt",
      uploadedBy: clinicianId,
      accessRoles: "clinician",
      scanStatus: "done",
    },
    {
      id: sharedDocumentId,
      childId: childA,
      tenantId,
      clinicianId,
      title: "Synthetic shared document",
      fileName: "shared.txt",
      fileUrl: "/uploads/shared.txt",
      uploadedBy: clinicianId,
      accessRoles: "parent,client,clinician",
      scanStatus: "done",
    },
    {
      id: legacyDocumentId,
      childId: childA,
      tenantId,
      clinicianId,
      title: "Synthetic legacy document",
      fileName: "legacy.txt",
      fileUrl: "/uploads/legacy.txt",
      uploadedBy: clinicianId,
      accessRoles: null,
      scanStatus: "done",
    },
  ]);
  await db.insert(documentsTable).values({
    childId: childB,
    tenantId,
    clinicianId,
    title: privateMarker,
    fileName: "synthetic-no-content.pdf",
    fileUrl: "/uploads/synthetic-no-content.pdf",
    uploadedBy: clinicianId,
    accessRoles: "parent,client,clinician",
    scanStatus: "done",
  });
  await db.insert(messagesTable).values({
    childId: childB,
    tenantId,
    fromUserId: clinicianId,
    toUserId: childB,
    senderRole: "clinician",
    content: privateMarker,
  });
  await db.insert(clientProfilesTable).values({
    childId: childB,
    tenantId,
    clinicianId,
    notes: privateMarker,
  });

  const app = express();
  app.use(express.json());
  const safeErrors: Record<string, unknown>[] = [];
  app.use((req: any, _res, next) => {
    req.id = req.header("x-test-request-id") || `family-scope-${crypto.randomUUID()}`;
    req.isAuthenticated = () => false;
    req.log = {
      error: (fields: Record<string, unknown>) => safeErrors.push(fields),
      warn: () => undefined,
      info: () => undefined,
    };
    next();
  });
  app.use(entitiesRouter);
  app.use((error: unknown, req: any, res: any, _next: (error?: unknown) => void) => {
    safeErrors.push({
      operation: "isolated_test_express_error_middleware",
      error_name: error instanceof Error ? error.name : "UnknownError",
      error_code: error && typeof error === "object" && "code" in error &&
        typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : undefined,
      stack_frames: error instanceof Error
        ? error.stack?.split("\n").slice(1, 5).map((frame) => frame.replaceAll("/home/runner/workspace", "<workspace>"))
        : undefined,
      request_id: typeof req.id === "string" ? req.id : undefined,
    });
    res.status(500).json({ error: "isolated test server error" });
  });
  const server = app.listen(0, "127.0.0.1");
  const cases: DenialCase[] = [];
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const login = await fetch(`${baseUrl}/client-session/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: userName, access_code: accessCode }),
    });
    const loginContentType = login.headers.get("content-type") ?? "missing";
    const loginText = await login.text();
    let loginBody: Record<string, unknown> | null = null;
    try {
      loginBody = JSON.parse(loginText) as Record<string, unknown>;
    } catch {
      // Record only the response type and sanitized server log fields below.
    }
    const safeLoginErrors = safeErrors.map((entry) => ({
      operation: typeof entry.operation === "string" ? entry.operation : undefined,
      error_name: typeof entry.error_name === "string" ? entry.error_name : undefined,
      error_code: typeof entry.error_code === "string" ? entry.error_code : undefined,
      stack_frames: Array.isArray(entry.stack_frames) ? entry.stack_frames : undefined,
      request_id: typeof entry.request_id === "string" ? entry.request_id : undefined,
    }));
    assert.equal(login.status, 200, [
      "synthetic Family A must be able to sign in",
      `content-type=${loginContentType}`,
      `json-response=${loginBody !== null}`,
      `safe-errors=${JSON.stringify(safeLoginErrors)}`,
    ].join("; "));
    assert.ok(loginBody, "successful login should return JSON");
    const session = loginBody as { invite_token: string };
    assert.ok(session.invite_token);
    const ownPortalResponse = await fetch(`${baseUrl}/client-portal-data`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-request-id": `family-own-portal-${suffix}`,
      },
      body: JSON.stringify({ child_id: childA, invite_token: session.invite_token }),
    });
    const ownPortalBody = await ownPortalResponse.json() as {
      documents?: Array<{ id: string }>;
    };
    const visibleDocumentIds = (ownPortalBody.documents ?? []).map((document) => document.id);
    const clinicianOnlyVisibility = {
      status: ownPortalResponse.status,
      clinicianOnlyHidden: !visibleDocumentIds.includes(clinicianOnlyDocumentId),
      sharedDocumentVisible: visibleDocumentIds.includes(sharedDocumentId),
      legacyDocumentVisible: visibleDocumentIds.includes(legacyDocumentId),
    };
    assert.equal(clinicianOnlyVisibility.status, 200);
    assert.equal(clinicianOnlyVisibility.clinicianOnlyHidden, true);
    assert.equal(clinicianOnlyVisibility.sharedDocumentVisible, true);
    assert.equal(clinicianOnlyVisibility.legacyDocumentVisible, true);
    const requestIds = {
      goalCreate: `family-goal-create-${suffix}`,
      goalUpdate: `family-goal-update-${suffix}`,
      documentUpload: `family-document-upload-${suffix}`,
      messageCreate: `family-message-create-${suffix}`,
      profileBuild: `family-profile-build-${suffix}`,
    };
    const before = {
      goals: await db.select().from(rewardTokensTable).where(eq(rewardTokensTable.id, existingGoalId)),
      documents: await db.select().from(documentsTable).where(eq(documentsTable.childId, childB)),
      messages: await db.select().from(messagesTable).where(eq(messagesTable.childId, childB)),
      profiles: await db.select().from(clientProfilesTable).where(eq(clientProfilesTable.childId, childB)),
    };
    const requests = [
      {
        caseId: "GE-ACC-071:create",
        requestId: requestIds.goalCreate,
        path: "/manage-client-goal",
        body: {
          action: "create",
          child_id: childB,
          invite_token: session.invite_token,
          data: { goal_name: privateMarker },
        },
        count: async () => (await db.select().from(rewardTokensTable).where(eq(rewardTokensTable.childId, childB))).length,
        beforeCount: before.goals.length,
        targetType: "child",
        targetId: childB,
        operation: "manage_client_goal.create",
      },
      {
        caseId: "GE-ACC-071:update",
        requestId: requestIds.goalUpdate,
        path: "/manage-client-goal",
        body: {
          action: "update",
          entity_id: existingGoalId,
          invite_token: session.invite_token,
          data: { goal_name: `MUTATED_${privateMarker}` },
        },
        count: async () => JSON.stringify(await db.select().from(rewardTokensTable).where(eq(rewardTokensTable.id, existingGoalId))),
        beforeCount: JSON.stringify(before.goals),
        targetType: "goal",
        targetId: existingGoalId,
        operation: "manage_client_goal.update",
      },
      {
        caseId: "GE-ACC-072",
        requestId: requestIds.documentUpload,
        path: "/client-upload-document",
        body: {
          child_id: childB,
          invite_token: session.invite_token,
          authorizedUploader: "true",
          title: privateMarker,
          file_url: "/uploads/forged-family-scope-reference",
        },
        count: async () => (await db.select().from(documentsTable).where(eq(documentsTable.childId, childB))).length,
        beforeCount: before.documents.length,
        targetType: "child",
        targetId: childB,
        operation: "client_upload_document",
      },
      {
        caseId: "GE-ACC-073",
        requestId: requestIds.messageCreate,
        path: "/client-send-message",
        body: { child_id: childB, invite_token: session.invite_token, content: privateMarker },
        count: async () => (await db.select().from(messagesTable).where(eq(messagesTable.childId, childB))).length,
        beforeCount: before.messages.length,
        targetType: "child",
        targetId: childB,
        operation: "client_send_message",
      },
      {
        caseId: "GE-ACC-074",
        requestId: requestIds.profileBuild,
        path: "/build-client-profile",
        body: { child_id: childB, invite_token: session.invite_token },
        count: async () => JSON.stringify(await db.select().from(clientProfilesTable).where(eq(clientProfilesTable.childId, childB))),
        beforeCount: JSON.stringify(before.profiles),
        targetType: "child",
        targetId: childB,
        operation: "build_client_profile",
      },
    ];

    const auditWindowStart = new Date(Date.now() - 5000);
    const genuineAudits: Array<Record<string, unknown>> = [];
    for (const scenario of requests) {
      const response = await fetch(`${baseUrl}${scenario.path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-request-id": scenario.requestId,
        },
        body: JSON.stringify(scenario.body),
      });
      const responseText = await response.text();
      const afterCount = await scenario.count();
      const rows = await db.select().from(auditLogsTable);
      const matching = rows.filter((row) =>
        (row.metadata as Record<string, unknown> | null)?.request_id === scenario.requestId
      );
      const auditPayload = JSON.stringify(matching);
      genuineAudits.push(...matching.map((row) => ({
        id: row.id,
        createdAt: row.createdDate instanceof Date
          ? row.createdDate.toISOString()
          : new Date(row.createdDate ?? 0).toISOString(),
        actorId: row.userId,
        actorRole: row.userRole,
        tenantId: row.tenantId,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        success: row.success,
        reason: row.reason,
        metadata: row.metadata,
      })));
      const createdDate = matching[0]?.createdDate instanceof Date
        ? matching[0].createdDate
        : new Date(matching[0]?.createdDate ?? 0);
      const matchingMetadata = matching[0]?.metadata as Record<string, unknown> | null;
      cases.push({
        caseId: scenario.caseId,
        status: response.status,
        unchanged: afterCount === scenario.beforeCount,
        noMarker: !responseText.includes(privateMarker),
        auditCount: matching.length,
        auditActorMatches: matching.every((row) => row.userId === childA && row.userRole === "client"),
        auditTargetMatches: matching.every((row) => row.targetId === scenario.targetId && row.targetType === scenario.targetType),
        auditTenantMatches: matching.every((row) => row.tenantId === tenantId),
        auditOutcomeMatches: matching.every((row) => row.success === false && row.action === "cross_tenant_access_attempt"),
        auditRequestMatches: matching.every((row) => (row.metadata as Record<string, unknown> | null)?.request_id === scenario.requestId),
        auditOperationMatches: matching.every((row) => matchingMetadata?.operation === scenario.operation),
        auditTimestampMatches: matching.length === 1 && createdDate >= auditWindowStart && createdDate <= new Date(Date.now() + 5000),
        noSensitiveAuditMarkers: !auditPayload.includes(privateMarker) &&
          !auditPayload.includes(session.invite_token) &&
          !auditPayload.includes(accessCode),
      });
    }

    const evidence = {
      testRun: "isolated fictional family cross-family write checks",
      commit: process.env.NP_APP_COMMIT,
      database: "np_p0_access_test",
      databaseHost: parsedDatabaseUrl.hostname,
      crossFamilyProfileProvider: "not called; request was denied before AI",
      clinicianOnlyDocumentVisibility: clinicianOnlyVisibility,
      cases,
      noCredentialValuesRecorded: true,
    };
    await fs.mkdir(evidenceDir, { recursive: true, mode: 0o700 });
    await fs.writeFile(path.join(evidenceDir, "family-cross-family-write-results.json"), `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
    await fs.writeFile(
      path.join(evidenceDir, "family-cross-family-genuine-audit-events.json"),
      `${JSON.stringify(genuineAudits, null, 2)}\n`,
      { mode: 0o600 },
    );
    const failures = cases.filter((entry) =>
      entry.status !== 403 ||
      !entry.unchanged ||
      !entry.noMarker ||
      entry.auditCount !== 1 ||
      !entry.auditActorMatches ||
      !entry.auditTargetMatches ||
      !entry.auditTenantMatches ||
      !entry.auditOutcomeMatches ||
      !entry.auditRequestMatches ||
      !entry.auditOperationMatches ||
      !entry.auditTimestampMatches ||
      !entry.noSensitiveAuditMarkers
    );
    assert.deepEqual(failures, [], "family cross-scope writes must be denied, unchanged, and audited");
  } finally {
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("legacy client session cannot download a clinician-only document by direct URL", async () => {
  const [child] = await db.select().from(childrenTable)
    .where(eq(childrenTable.childName, "Synthetic Child A"));
  assert.ok(child, "The family-scope fixture child must exist.");
  const [document] = await db.select().from(documentsTable)
    .where(eq(documentsTable.fileName, "clinician-only.txt"));
  assert.ok(document, "The family-scope fixture document must exist.");
  const [sharedDocument] = await db.select().from(documentsTable)
    .where(eq(documentsTable.fileName, "shared.txt"));
  assert.ok(sharedDocument, "The shared-document fixture must exist.");
  const [legacyDocument] = await db.select().from(documentsTable)
    .where(eq(documentsTable.fileName, "legacy.txt"));
  assert.ok(legacyDocument, "The legacy-visible document fixture must exist.");
  const [session] = await db.select().from(clientSessionsTable)
    .where(eq(clientSessionsTable.childId, child.id));
  assert.ok(session?.inviteToken, "The synthetic family session must exist.");
  const mobileToken = `synthetic-mobile-${crypto.randomUUID()}`;
  await db.insert(mobileTokensTable).values({
    token: mobileToken,
    childId: child.id,
    expiresAt: new Date(Date.now() + 60_000),
  });

  const marker = "CLINICIAN_ONLY_PRIVATE_TEST_CONTENT";
  const sharedMarker = "AUTHORIZED_SHARED_DOCUMENT_CONTENT";
  const legacyMarker = "AUTHORIZED_LEGACY_VISIBLE_DOCUMENT_CONTENT";
  const uploadDir = path.join(process.cwd(), "uploads");
  const filePath = path.join(uploadDir, "clinician-only.txt");
  const sharedFilePath = path.join(uploadDir, "shared.txt");
  const legacyFilePath = path.join(uploadDir, "legacy.txt");
  await fs.mkdir(uploadDir, { recursive: true, mode: 0o700 });
  await fs.writeFile(filePath, marker, { mode: 0o600 });
  await fs.writeFile(sharedFilePath, sharedMarker, { mode: 0o600 });
  await fs.writeFile(legacyFilePath, legacyMarker, { mode: 0o600 });

  const app = express();
  app.use((req: any, _res, next) => {
    req.id = req.header("x-mobile-token")
      ? req.path.includes("shared.txt")
        ? "mobile-shared-document-direct-download-regression"
        : "mobile-clinician-only-direct-download-regression"
      : req.path.includes("shared.txt")
        ? "shared-document-direct-download-regression"
        : "clinician-only-direct-download-regression";
    req.isAuthenticated = () => false;
    next();
  });
  app.use(uploadRouter);
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(
      `http://127.0.0.1:${address.port}/uploads/clinician-only.txt?invite_token=${encodeURIComponent(session.inviteToken)}`,
    );
    const responseBody = await response.text();
    const sharedResponse = await fetch(
      `http://127.0.0.1:${address.port}/uploads/shared.txt?invite_token=${encodeURIComponent(session.inviteToken)}`,
    );
    const sharedResponseBody = await sharedResponse.text();
    const mobilePrivateResponse = await fetch(
      `http://127.0.0.1:${address.port}/uploads/clinician-only.txt`,
      { headers: { "x-mobile-token": mobileToken } },
    );
    const mobilePrivateBody = await mobilePrivateResponse.text();
    const mobileSharedResponse = await fetch(
      `http://127.0.0.1:${address.port}/uploads/shared.txt`,
      { headers: { "x-mobile-token": mobileToken } },
    );
    const mobileSharedBody = await mobileSharedResponse.text();
    const capturedAiRequests: Array<Record<string, unknown>> = [];
    const fakeAi = http.createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      request.on("end", () => {
        try {
          capturedAiRequests.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch {
          capturedAiRequests.push({ invalidJson: true });
        }
        response.writeHead(400, { "content-type": "application/json" });
        response.end(JSON.stringify({
          type: "error",
          error: { type: "invalid_request_error", message: "Synthetic fake-provider stop for authorization test." },
        }));
      });
    });
    await new Promise<void>((resolve) => fakeAi.listen(0, "127.0.0.1", resolve));
    const fakeAddress = fakeAi.address();
    assert.ok(fakeAddress && typeof fakeAddress !== "string");
    const priorAiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
    const priorAiBaseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
    process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY = "isolated-fake-provider-key";
    process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL = `http://127.0.0.1:${fakeAddress.port}`;
    const scanApp = express();
    scanApp.use(express.json());
    scanApp.use((req: any, _res, next) => {
      req.id = "clinician-only-document-ai-context-regression";
      req.isAuthenticated = () => false;
      req.log = { info() {}, warn() {}, error() {} };
      next();
    });
    scanApp.use(entitiesRouter);
    const scanServer = scanApp.listen(0, "127.0.0.1");
    let scanStatus = 0;
    try {
      await once(scanServer, "listening");
      const scanAddress = scanServer.address();
      assert.ok(scanAddress && typeof scanAddress !== "string");
      const scanResponse = await fetch(`http://127.0.0.1:${scanAddress.port}/build-client-profile`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          child_id: child.id,
          invite_token: session.inviteToken,
          force_rebuild: true,
        }),
      });
      scanStatus = scanResponse.status;
      await scanResponse.text();
    } finally {
      if (scanServer.listening) await new Promise<void>((resolve) => scanServer.close(() => resolve()));
      if (fakeAi.listening) await new Promise<void>((resolve) => fakeAi.close(() => resolve()));
      if (priorAiKey === undefined) delete process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
      else process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY = priorAiKey;
      if (priorAiBaseUrl === undefined) delete process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
      else process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL = priorAiBaseUrl;
    }
    const auditRows = await db.select().from(auditLogsTable);
    const denialAudits = auditRows.filter((row) =>
      row.action === "document_download_denied" && row.targetId === document.id &&
      (row.metadata as Record<string, unknown> | null)?.child_id === child.id &&
      (row.metadata as Record<string, unknown> | null)?.request_id === "clinician-only-direct-download-regression"
    );
    const allowedAudits = auditRows.filter((row) =>
      row.action === "document_download_authorized" && row.targetId === sharedDocument.id &&
      (row.metadata as Record<string, unknown> | null)?.child_id === child.id &&
      (row.metadata as Record<string, unknown> | null)?.request_id === "shared-document-direct-download-regression"
    );
    const mobileDenialAudits = auditRows.filter((row) =>
      row.action === "document_download_denied" && row.targetId === document.id &&
      row.userRole === "client" &&
      (row.metadata as Record<string, unknown> | null)?.child_id === child.id &&
      (row.metadata as Record<string, unknown> | null)?.request_id === "mobile-clinician-only-direct-download-regression"
    );
    const mobileAllowedAudits = auditRows.filter((row) =>
      row.action === "document_download_authorized" && row.targetId === sharedDocument.id &&
      (row.metadata as Record<string, unknown> | null)?.child_id === child.id &&
      (row.metadata as Record<string, unknown> | null)?.request_id === "mobile-shared-document-direct-download-regression"
    );
    const profileScanAudit = auditRows.find((row) =>
      row.action === "document_scan_requested" &&
      (row.metadata as Record<string, unknown> | null)?.request_id === "clinician-only-document-ai-context-regression"
    );
    const providerCallAudits = auditRows.filter((row) =>
      row.action === "ai_document_provider_call" &&
      (row.metadata as Record<string, unknown> | null)?.request_id === "clinician-only-document-ai-context-regression"
    );
    const serializedAiRequests = JSON.stringify(capturedAiRequests);
    const providerSourceIds = providerCallAudits.flatMap((row) =>
      Array.isArray((row.metadata as Record<string, unknown> | null)?.source_document_ids)
        ? (row.metadata as Record<string, unknown>).source_document_ids as string[]
        : []
    );
    const result = {
      scenarioId: "GE-ACC-097:direct-download",
      status: response.status,
      privateMarkerReturned: responseBody.includes(marker),
      denialAuditCount: denialAudits.length,
      auditActorMatches: denialAudits.some((row) => row.userId === child.id && row.userRole === "client"),
      auditOutcomeDenied: denialAudits.some((row) => row.success === false),
      authorizedSharedDownloadStatus: sharedResponse.status,
      authorizedSharedContentReturned: sharedResponseBody.includes(sharedMarker),
      authorizedAuditCount: allowedAudits.length,
      authorizedAuditActorMatches: allowedAudits.some((row) => row.userId === child.id && row.userRole === "client"),
      authorizedAuditOutcomeMatches: allowedAudits.some((row) => row.success === true),
      mobilePrivateDownloadStatus: mobilePrivateResponse.status,
      mobilePrivateMarkerReturned: mobilePrivateBody.includes(marker),
      mobileDenialAuditCount: mobileDenialAudits.length,
      mobileSharedDownloadStatus: mobileSharedResponse.status,
      mobileSharedContentReturned: mobileSharedBody.includes(sharedMarker),
      mobileAuthorizedAuditCount: mobileAllowedAudits.length,
      fakeProviderRequests: capturedAiRequests.length,
      fakeProviderErrorStatus: scanStatus,
      aiContextExcludesClinicianOnlyMarker: !serializedAiRequests.includes(marker),
      aiContextIncludesSharedVisibleMarker: serializedAiRequests.includes(sharedMarker),
      aiContextIncludesLegacyVisibleMarker: serializedAiRequests.includes(legacyMarker),
      scanAuditVisibleDocumentCount: (profileScanAudit?.metadata as Record<string, unknown> | null)?.visible_document_count,
      providerAuditCount: providerCallAudits.length,
      providerAuditSourceIdsExcludeClinicianOnly: !providerSourceIds.includes(document.id),
      providerAuditSourceIdsIncludeSharedAndLegacy: providerSourceIds.includes(sharedDocument.id) &&
        providerSourceIds.includes(legacyDocument.id),
      fakeProviderFailureHandled: scanStatus >= 400 && scanStatus < 600,
    };
    await fs.writeFile(path.join(evidenceDir, "clinician-only-direct-download-results.json"), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
    await fs.writeFile(path.join(evidenceDir, "clinician-only-direct-download-genuine-audit-events.json"), `${JSON.stringify(
      [...denialAudits, ...allowedAudits, ...mobileDenialAudits, ...mobileAllowedAudits].map((row) => ({
        id: row.id,
        createdAt: row.createdDate instanceof Date ? row.createdDate.toISOString() : row.createdDate,
        actorId: row.userId,
        actorRole: row.userRole,
        tenantId: row.tenantId,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        success: row.success,
        reason: row.reason,
        metadata: row.metadata,
      })),
      null,
      2,
    )}\n`, { mode: 0o600 });
    await fs.writeFile(path.join(evidenceDir, "clinician-only-ai-genuine-audit-events.json"), `${JSON.stringify(
      [profileScanAudit, ...providerCallAudits].filter(Boolean).map((row: any) => ({
        id: row.id,
        createdAt: row.createdDate instanceof Date ? row.createdDate.toISOString() : row.createdDate,
        actorId: row.userId,
        actorRole: row.userRole,
        tenantId: row.tenantId,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        success: row.success,
        reason: row.reason,
        metadata: row.metadata,
      })),
      null,
      2,
    )}\n`, { mode: 0o600 });
    assert.equal(result.status, 403);
    assert.equal(result.privateMarkerReturned, false);
    assert.equal(result.denialAuditCount, 1);
    assert.equal(result.auditActorMatches, true);
    assert.equal(result.auditOutcomeDenied, true);
    assert.equal(result.authorizedSharedDownloadStatus, 200);
    assert.equal(result.authorizedSharedContentReturned, true);
    assert.equal(result.authorizedAuditCount, 1);
    assert.equal(result.authorizedAuditActorMatches, true);
    assert.equal(result.authorizedAuditOutcomeMatches, true);
    assert.equal(result.mobilePrivateDownloadStatus, 403);
    assert.equal(result.mobilePrivateMarkerReturned, false);
    assert.equal(result.mobileDenialAuditCount, 1);
    assert.equal(result.mobileSharedDownloadStatus, 200);
    assert.equal(result.mobileSharedContentReturned, true);
    assert.equal(result.mobileAuthorizedAuditCount, 1);
    assert.ok(result.fakeProviderRequests > 0);
    assert.equal(result.aiContextExcludesClinicianOnlyMarker, true);
    assert.equal(result.aiContextIncludesSharedVisibleMarker, true);
    assert.equal(result.aiContextIncludesLegacyVisibleMarker, true);
    assert.equal(result.scanAuditVisibleDocumentCount, 2);
    assert.ok(result.providerAuditCount > 0);
    assert.equal(result.providerAuditSourceIdsExcludeClinicianOnly, true);
    assert.equal(result.providerAuditSourceIdsIncludeSharedAndLegacy, true);
    assert.equal(result.fakeProviderFailureHandled, true);
  } finally {
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    await fs.rm(filePath, { force: true });
    await fs.rm(sharedFilePath, { force: true });
    await fs.rm(legacyFilePath, { force: true });
  }
});

test("clinic reassignment revokes former clinician access and inherited parent sharing", async () => {
  const suffix = crypto.randomUUID();
  const clinicId = `transfer-clinic-${suffix}`;
  const tenantId = `transfer-tenant-${suffix}`;
  const adminId = `transfer-admin-${suffix}`;
  const formerClinicianId = `transfer-former-${suffix}`;
  const newClinicianId = `transfer-new-${suffix}`;
  const childId = `transfer-child-${suffix}`;
  const parentId = `transfer-parent-${suffix}`;
  const documentId = `transfer-document-${suffix}`;
  const requestId = `transfer-request-${suffix}`;

  await db.insert(usersTable).values([
    { id: adminId, email: `${suffix}-admin@example.test` },
    { id: formerClinicianId, email: `${suffix}-former@example.test` },
    { id: newClinicianId, email: `${suffix}-new@example.test` },
  ]);
  await db.insert(userProfilesTable).values([
    { id: adminId, appRole: "clinician", tenantId, displayName: "Synthetic Clinic Admin" },
    { id: formerClinicianId, appRole: "clinician", tenantId, displayName: "Synthetic Former Clinician" },
    { id: newClinicianId, appRole: "clinician", tenantId, displayName: "Synthetic New Clinician" },
  ]);
  await db.insert(clinicsTable).values({
    id: clinicId,
    displayName: "Synthetic Transfer Clinic",
    legacyTenantId: tenantId,
    status: "active",
    createdBy: adminId,
  });
  await db.insert(clinicMembershipsTable).values([
    { clinicId, userId: adminId, role: "clinic_admin", status: "active" },
    { clinicId, userId: formerClinicianId, role: "treating_clinician", status: "active" },
    { clinicId, userId: newClinicianId, role: "treating_clinician", status: "active" },
  ]);
  await db.insert(childrenTable).values({
    id: childId,
    tenantId,
    clinicianId: formerClinicianId,
    childName: "Synthetic Transfer Child",
    accountType: "individual",
    status: "active",
  });
  await db.insert(clinicalAssignmentsTable).values({
    clinicId,
    clientId: childId,
    userId: formerClinicianId,
    role: "treating_clinician",
    status: "active",
    assignedBy: adminId,
  });
  await db.insert(documentsTable).values({
    id: documentId,
    tenantId,
    childId,
    clinicianId: formerClinicianId,
    parentId,
    title: "Synthetic shared family document",
    fileName: "synthetic-share.txt",
    fileUrl: "/uploads/synthetic-share.txt",
    uploadedBy: "parent",
    accessRoles: "parent,client,clinician",
  });
  await db.insert(parentDocumentsTable).values({
    documentId,
    parentId,
    childId,
    workspaceId: "synthetic-parent-workspace",
    storagePath: `synthetic/${documentId}`,
    mimeType: "text/plain",
    sha256: crypto.createHash("sha256").update(documentId).digest("hex"),
    sharedClinicianId: formerClinicianId,
    reviewedBy: formerClinicianId,
    reviewedAt: new Date(Date.now() - 60_000),
  });
  await db.insert(parentClinicConsentsTable).values({
    parentId,
    childId,
    clinicianId: formerClinicianId,
    scopes: ["documents", "observations"],
    consentedAt: new Date(Date.now() - 60_000),
  });

  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.id = requestId;
    req.user = { id: adminId, appRole: "clinician", tenantId };
    req.isAuthenticated = () => true;
    next();
  });
  app.use(clinicManagementRouter);
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(
      `http://127.0.0.1:${address.port}/clinic-management/${clinicId}/clients/${childId}/reassign`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clinicianId: newClinicianId }),
      },
    );
    const responseBody = await response.json() as Record<string, unknown>;
    const [childAfter] = await db.select().from(childrenTable).where(eq(childrenTable.id, childId));
    const assignmentsAfter = await db.select().from(clinicalAssignmentsTable)
      .where(eq(clinicalAssignmentsTable.clientId, childId));
    const [documentAfter] = await db.select().from(documentsTable)
      .where(eq(documentsTable.id, documentId));
    const [parentDocumentAfter] = await db.select().from(parentDocumentsTable)
      .where(eq(parentDocumentsTable.documentId, documentId));
    const [consentAfter] = await db.select().from(parentClinicConsentsTable)
      .where(eq(parentClinicConsentsTable.childId, childId));
    const auditRows = await db.select().from(auditLogsTable);
    const transferAudit = auditRows.filter((row) =>
      row.action === "clinical_assignment_reassigned" &&
      row.targetId === childId &&
      (row.metadata as Record<string, unknown> | null)?.correlation_id === requestId
    );
    const result = {
      status: response.status,
      responseSaysSuccess: responseBody.ok === true,
      assignedClinicianIsNew: childAfter?.clinicianId === newClinicianId,
      formerAssignmentRevoked: assignmentsAfter.some((row) =>
        row.userId === formerClinicianId && row.status === "revoked" && row.revokedAt instanceof Date
      ),
      newAssignmentActive: assignmentsAfter.some((row) =>
        row.userId === newClinicianId && row.status === "active"
      ),
      formerClinicianAccessDenied: !(await clinicianCanAccessChild(formerClinicianId, childId)),
      newClinicianAccessAllowed: await clinicianCanAccessChild(newClinicianId, childId),
      parentDocumentSharingRevoked: parentDocumentAfter?.sharedClinicianId === null &&
        parentDocumentAfter?.reviewedBy === null && parentDocumentAfter?.reviewedAt === null,
      documentStorageReferencePreserved: documentAfter?.fileUrl === "/uploads/synthetic-share.txt",
      priorConsentRevoked: consentAfter?.revokedAt instanceof Date && consentAfter.scopes.length === 0,
      transferAuditCount: transferAudit.length,
      auditActorMatches: transferAudit[0]?.userId === adminId && transferAudit[0]?.userRole === "clinic_admin",
      auditClinicMatches: transferAudit[0]?.tenantId === clinicId,
      auditPreviousAndNewClinicianRecorded: (() => {
        const metadata = transferAudit[0]?.metadata as Record<string, unknown> | null;
        return Array.isArray(metadata?.previousClinicianIds) &&
          metadata.previousClinicianIds.includes(formerClinicianId) &&
          metadata.clinicianId === newClinicianId;
      })(),
      auditTimestampValid: transferAudit.length === 1 &&
        transferAudit[0].createdDate instanceof Date &&
        Math.abs(Date.now() - transferAudit[0].createdDate.getTime()) < 10_000,
    };
    await fs.writeFile(path.join(evidenceDir, "clinic-transfer-results.json"), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
    await fs.writeFile(path.join(evidenceDir, "clinic-transfer-genuine-audit-events.json"), `${JSON.stringify(
      transferAudit.map((row) => ({
        id: row.id,
        createdAt: row.createdDate instanceof Date ? row.createdDate.toISOString() : row.createdDate,
        actorId: row.userId,
        actorRole: row.userRole,
        tenantId: row.tenantId,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        success: row.success,
        metadata: row.metadata,
      })),
      null,
      2,
    )}\n`, { mode: 0o600 });
    assert.equal(result.status, 200);
    assert.equal(result.responseSaysSuccess, true);
    assert.equal(result.assignedClinicianIsNew, true);
    assert.equal(result.formerAssignmentRevoked, true);
    assert.equal(result.newAssignmentActive, true);
    assert.equal(result.formerClinicianAccessDenied, true);
    assert.equal(result.newClinicianAccessAllowed, true);
    assert.equal(result.parentDocumentSharingRevoked, true);
    assert.equal(result.documentStorageReferencePreserved, true);
    assert.equal(result.priorConsentRevoked, true);
    assert.equal(result.transferAuditCount, 1);
    assert.equal(result.auditActorMatches, true);
    assert.equal(result.auditClinicMatches, true);
    assert.equal(result.auditPreviousAndNewClinicianRecorded, true);
    assert.equal(result.auditTimestampValid, true);
  } finally {
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("application limits failed client sign-ins and audits rejected credentials without access codes", async () => {
  const suffix = crypto.randomUUID();
  const username = `synthetic-rate-limit-${suffix}`;
  const accessCode = `SYNTHETIC-ACCESS-${suffix}`;
  const requestIp = "198.18.254.44";
  const { default: apiApp } = await import("../app");
  const server = apiApp.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const failedLoginIdsBefore = new Set((await db.select({ id: auditLogsTable.id })
      .from(auditLogsTable)
      .where(eq(auditLogsTable.action, "failed_login"))).map((row) => row.id));
    const statuses: number[] = [];
    for (let index = 0; index < 11; index += 1) {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/client-session/login`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": requestIp,
        },
        body: JSON.stringify({ username, access_code: accessCode }),
      });
      statuses.push(response.status);
      await response.body?.cancel();
    }
    const allAuditRows = await db.select().from(auditLogsTable);
    const failedLoginRows = allAuditRows.filter((row) =>
      row.action === "failed_login" && !failedLoginIdsBefore.has(row.id)
    );
    const rateLimitRows = allAuditRows.filter((row) =>
      row.action === "login_rate_limited" &&
      row.targetType === "auth_route" &&
      row.targetId === "/api/client-session/login"
    );
    const auditPayload = JSON.stringify(failedLoginRows);
    const rateLimitAuditPayload = JSON.stringify(rateLimitRows);
    const result = {
      attempts: statuses.map((status, index) => ({ ordinal: index + 1, status })),
      firstTenRejectedAsInvalid: statuses.slice(0, 10).every((status) => status === 401),
      eleventhAttemptRateLimited: statuses[10] === 429,
      failedCredentialAuditCount: failedLoginRows.length,
      eachRejectedCredentialAttemptAudited: failedLoginRows.length === 10,
      auditEventsExcludeAccessCode: !auditPayload.includes(accessCode),
      auditEventsExcludeUsername: !auditPayload.includes(username) &&
        failedLoginRows.every((row) =>
          !("username" in ((row.metadata as Record<string, unknown> | null) || {}))),
      auditTimestampsValid: failedLoginRows.length === 10 && failedLoginRows.every((row) =>
        row.createdDate instanceof Date && Math.abs(Date.now() - row.createdDate.getTime()) < 10_000
      ),
      rateLimitedAttemptAuditCount: rateLimitRows.length,
      rateLimitedAttemptAuditedWithoutCredentials: rateLimitRows.length === 1 &&
        !rateLimitAuditPayload.includes(accessCode) &&
        !rateLimitAuditPayload.includes(username) &&
        rateLimitRows[0]?.success === false &&
        (rateLimitRows[0]?.metadata as Record<string, unknown> | null)?.request_path === "/api/client-session/login",
      rateLimitAuditTimestampValid: rateLimitRows.length === 1 &&
        rateLimitRows[0].createdDate instanceof Date &&
        Math.abs(Date.now() - rateLimitRows[0].createdDate.getTime()) < 10_000,
    };
    await fs.writeFile(path.join(evidenceDir, "failed-login-limit-results.json"), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
    await fs.writeFile(path.join(evidenceDir, "failed-login-genuine-audit-events.json"), `${JSON.stringify(
      failedLoginRows.map((row) => ({
        id: row.id,
        createdAt: row.createdDate instanceof Date ? row.createdDate.toISOString() : row.createdDate,
        actorId: row.userId,
        actorRole: row.userRole,
        tenantId: row.tenantId,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        success: row.success,
        reason: row.reason,
        metadata: row.metadata,
      })),
      null,
      2,
    )}\n`, { mode: 0o600 });
    await fs.writeFile(path.join(evidenceDir, "login-rate-limit-genuine-audit-events.json"), `${JSON.stringify(
      rateLimitRows.map((row) => ({
        id: row.id,
        createdAt: row.createdDate instanceof Date ? row.createdDate.toISOString() : row.createdDate,
        actorId: row.userId,
        actorRole: row.userRole,
        tenantId: row.tenantId,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        success: row.success,
        reason: row.reason,
        metadata: row.metadata,
      })),
      null,
      2,
    )}\n`, { mode: 0o600 });
    assert.equal(result.firstTenRejectedAsInvalid, true);
    assert.equal(result.eleventhAttemptRateLimited, true);
    assert.equal(result.eachRejectedCredentialAttemptAudited, true);
    assert.equal(result.auditEventsExcludeAccessCode, true);
    assert.equal(result.auditEventsExcludeUsername, true);
    assert.equal(result.auditTimestampsValid, true);
    assert.equal(result.rateLimitedAttemptAuditCount, 1);
    assert.equal(result.rateLimitedAttemptAuditedWithoutCredentials, true);
    assert.equal(result.rateLimitAuditTimestampValid, true);
  } finally {
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
