import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import express from "express";
import { once } from "node:events";
import { test } from "node:test";

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
  clientProfilesTable,
  clientSessionsTable,
  db,
  documentsTable,
  familiesTable,
  messagesTable,
  pool,
  rewardTokensTable,
} = database;
const { eq } = await import("drizzle-orm");
const { default: entitiesRouter } = await import("./entities");
const { hashClientAccessCode } = await import("../lib/clientAccessCode");

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
};

test("legacy family credentials cannot write across family boundaries", async (t) => {
  t.after(async () => pool.end());
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
    req.ip = "127.0.0.1";
    req.isAuthenticated = () => false;
    req.log = {
      error: (fields: Record<string, unknown>) => safeErrors.push(fields),
      warn: () => undefined,
      info: () => undefined,
    };
    next();
  });
  app.use(entitiesRouter);
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
    assert.equal(
      login.status,
      200,
      `synthetic Family A must be able to sign in; generic response=${(await login.clone().json()).error}; safe logs=${JSON.stringify(safeErrors)}`,
    );
    const session = await login.json() as { invite_token: string };
    assert.ok(session.invite_token);
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
        targetType: "goal",
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
        targetType: "document",
      },
      {
        caseId: "GE-ACC-073",
        requestId: requestIds.messageCreate,
        path: "/client-send-message",
        body: { child_id: childB, invite_token: session.invite_token, content: privateMarker },
        count: async () => (await db.select().from(messagesTable).where(eq(messagesTable.childId, childB))).length,
        beforeCount: before.messages.length,
        targetType: "message",
      },
      {
        caseId: "GE-ACC-074",
        requestId: requestIds.profileBuild,
        path: "/build-client-profile",
        body: { child_id: childB, invite_token: session.invite_token },
        count: async () => JSON.stringify(await db.select().from(clientProfilesTable).where(eq(clientProfilesTable.childId, childB))),
        beforeCount: JSON.stringify(before.profiles),
        targetType: "client_profile",
      },
    ];

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
      cases.push({
        caseId: scenario.caseId,
        status: response.status,
        unchanged: afterCount === scenario.beforeCount,
        noMarker: !responseText.includes(privateMarker),
        auditCount: matching.length,
        auditActorMatches: matching.every((row) => row.userId === childA && row.userRole === "client"),
        auditTargetMatches: matching.every((row) => row.targetId === childB && row.targetType === scenario.targetType),
        auditTenantMatches: matching.every((row) => row.tenantId === tenantId),
        auditOutcomeMatches: matching.every((row) => row.success === false && row.action === "cross_tenant_access_attempt"),
      });
    }

    const evidence = {
      testRun: "isolated fictional family cross-family write checks",
      commit: process.env.NP_APP_COMMIT,
      database: "np_p0_access_test",
      databaseHost: parsedDatabaseUrl.hostname,
      provider: "none; profile-denial request must stop before AI",
      cases,
      noCredentialValuesRecorded: true,
    };
    await fs.mkdir(evidenceDir, { recursive: true, mode: 0o700 });
    await fs.writeFile(path.join(evidenceDir, "family-cross-family-write-results.json"), `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
    const failures = cases.filter((entry) =>
      entry.status !== 403 ||
      !entry.unchanged ||
      !entry.noMarker ||
      entry.auditCount !== 1 ||
      !entry.auditActorMatches ||
      !entry.auditTargetMatches ||
      !entry.auditTenantMatches ||
      !entry.auditOutcomeMatches
    );
    assert.deepEqual(failures, [], "family cross-scope writes must be denied, unchanged, and audited");
  } finally {
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
