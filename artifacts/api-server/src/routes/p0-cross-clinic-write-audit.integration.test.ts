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
  throw new Error("The isolated P0 access test runner did not provide required test paths.");
}
const parsedDatabaseUrl = new URL(databaseUrl);
if (
  !["127.0.0.1", "::1", "[::1]"].includes(parsedDatabaseUrl.hostname) ||
  decodeURIComponent(parsedDatabaseUrl.pathname.slice(1)) !== "np_p0_access_test"
) {
  throw new Error("Refusing to run outside loopback database np_p0_access_test.");
}

process.env.DATABASE_URL = databaseUrl;
process.env.FILE_ENCRYPTION_KEY = "c".repeat(64);
process.env.REPLIT_CONNECTORS_ENABLED = "false";
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

await fs.mkdir(testRoot, { recursive: true, mode: 0o700 });
const appRoot = path.join(testRoot, "application");
const uploadRoot = path.join(appRoot, "uploads");
await fs.mkdir(uploadRoot, { recursive: true, mode: 0o700 });
process.chdir(appRoot);
await fs.mkdir(evidenceDir, { recursive: true, mode: 0o700 });

const database = await import("@workspace/db");
const {
  auditLogsTable,
  behaviorLogsTable,
  behaviorPlansTable,
  clientAccessCodeResetsTable,
  clientSessionsTable,
  childrenTable,
  clinicMembershipsTable,
  clinicsTable,
  clinicalAssignmentsTable,
  db,
  documentsTable,
  familiesTable,
  interventionPlansTable,
  mobileTokensTable,
  pool,
  userProfilesTable,
  usersTable,
} = database;
const { eq } = await import("drizzle-orm");
const { default: entitiesRouter } = await import("./entities");
const { default: uploadRouter } = await import("./upload");
const { default: mobileRouter } = await import("./mobile");
const { getClinicianAccessibleChildren } = await import("../lib/clinicAuthorization");
const { hashClientAccessCode } = await import("../lib/clientAccessCode");

type TableFixture = {
  route: string;
  table: any;
  id: string;
  patch: Record<string, string>;
  markerField: string;
  markerValue: string;
};

test("cross-clinic entity updates and deletion attempts are denied, unchanged, and audited", async (t) => {
  t.after(async () => pool.end());
  const suffix = crypto.randomUUID();
  const clinicA = `p0-clinic-a-${suffix}`;
  const clinicB = `p0-clinic-b-${suffix}`;
  const tenantA = `p0-tenant-a-${suffix}`;
  const tenantB = `p0-tenant-b-${suffix}`;
  const clinicianA = `p0-clinician-a-${suffix}`;
  const clinicianB = `p0-clinician-b-${suffix}`;
  const familyA = `p0-family-a-${suffix}`;
  const familyB = `p0-family-b-${suffix}`;
  const childA = crypto.randomUUID();
  const childB = crypto.randomUUID();
  const privateMarker = `PRIVATE_FIXTURE_${suffix}`;
  const oldCredential = `SYNTHETIC-${suffix.slice(0, 8)}`;
  const oldCredentialB = `OLD-${suffix.slice(0, 8)}`;
  const newCredentialB = `NEW-${suffix.slice(0, 8)}`;
  const oldUsername = `synthetic-${suffix.slice(0, 8)}`;
  const oldUsernameB = `synthetic-b-${suffix.slice(0, 8)}`;
  const oldInviteToken = `synthetic-invite-${suffix}`;
  const oldMobileToken = `synthetic-mobile-${suffix}`;
  const oldMobileTokenB = `synthetic-mobile-b-${suffix}`;
  const resetTokenHash = `synthetic-reset-hash-${suffix}`;
  const fileName = `${crypto.randomUUID()}.txt`;
  const storedFilePath = path.join(uploadRoot, fileName);
  const storedFileBytes = Buffer.from(`synthetic-file-${suffix}`, "utf8");
  await fs.writeFile(storedFilePath, storedFileBytes, { mode: 0o600 });

  await db.insert(usersTable).values([
    { id: clinicianA, email: `${suffix}.clinician-a@example.test`, firstName: "Synthetic", lastName: "A" },
    { id: clinicianB, email: `${suffix}.clinician-b@example.test`, firstName: "Synthetic", lastName: "B" },
  ]);
  await db.insert(userProfilesTable).values([
    { id: clinicianA, appRole: "clinician", accountType: "clinician", tenantId: tenantA },
    { id: clinicianB, appRole: "clinician", accountType: "clinician", tenantId: tenantB },
  ]);
  await db.insert(clinicsTable).values([
    { id: clinicA, displayName: "Synthetic Clinic A", legacyTenantId: tenantA, status: "active" },
    { id: clinicB, displayName: "Synthetic Clinic B", legacyTenantId: tenantB, status: "active" },
  ]);
  await db.insert(clinicMembershipsTable).values([
    { clinicId: clinicA, userId: clinicianA, role: "treating_clinician", status: "active" },
    { clinicId: clinicB, userId: clinicianB, role: "treating_clinician", status: "active" },
  ]);
  await db.insert(familiesTable).values([
    { id: familyA, tenantId: tenantA, clinicianId: clinicianA, familyName: "Synthetic Family A", accountType: "family", inviteToken: oldInviteToken, inviteStatus: "accepted" },
    { id: familyB, tenantId: tenantB, clinicianId: clinicianB, familyName: "Synthetic Family B", accountType: "family" },
  ]);
  await db.insert(childrenTable).values([
    {
      id: childA, tenantId: tenantA, clinicianId: clinicianA, familyId: familyA,
      childName: "Synthetic Child A", accountType: "parent_clinician", status: "active",
      username: oldUsername, accessCode: await hashClientAccessCode(oldCredential),
    },
    {
      id: childB, tenantId: tenantB, clinicianId: clinicianB, familyId: familyB,
      childName: "Synthetic Child B", accountType: "parent_clinician", status: "active",
      username: oldUsernameB, accessCode: await hashClientAccessCode(oldCredentialB),
    },
  ]);
  await db.insert(clinicalAssignmentsTable).values([
    { clinicId: clinicA, clientId: childA, userId: clinicianA, role: "treating_clinician", status: "active" },
    { clinicId: clinicB, clientId: childB, userId: clinicianB, role: "treating_clinician", status: "active" },
  ]);
  const accessibleChildren = await getClinicianAccessibleChildren(clinicianB);
  assert.deepEqual(accessibleChildren.map((child) => child.id), [childB]);

  const fixtures: TableFixture[] = [
    {
      route: "/children",
      table: childrenTable,
      id: childA,
      patch: { notes: `${privateMarker}_UPDATED` },
      markerField: "notes",
      markerValue: privateMarker,
    },
  ];
  const [familyRow] = await db.insert(familiesTable).values({
    id: `${familyA}-target`, tenantId: tenantA, clinicianId: clinicianA,
    familyName: privateMarker, accountType: "clinic_family",
  }).returning();
  fixtures.push({
    route: "/families",
    table: familiesTable,
    id: familyRow.id,
    patch: { notes: `${privateMarker}_UPDATED` },
    markerField: "familyName",
    markerValue: privateMarker,
  });

  const [behaviorPlan] = await db.insert(behaviorPlansTable).values({
    tenantId: tenantA, childId: childA, clinicianId: clinicianA,
    behaviorName: "Synthetic plan", behaviorDescription: privateMarker, strategyTitle: "One step",
  }).returning();
  fixtures.push({
    route: "/behavior-plans",
    table: behaviorPlansTable,
    id: behaviorPlan.id,
    patch: { strategyTitle: `${privateMarker}_UPDATED` },
    markerField: "behaviorDescription",
    markerValue: privateMarker,
  });

  const [document] = await db.insert(documentsTable).values({
    tenantId: tenantA, childId: childA, clinicianId: clinicianA, title: privateMarker,
    fileName, fileUrl: `/uploads/${fileName}`, uploadedBy: clinicianA, accessRoles: "parent,client,clinician",
  }).returning();
  fixtures.push({
    route: "/documents",
    table: documentsTable,
    id: document.id,
    patch: { title: `${privateMarker}_UPDATED` },
    markerField: "title",
    markerValue: privateMarker,
  });

  const [intervention] = await db.insert(interventionPlansTable).values({
    tenantId: tenantA, childId: childA, clinicianId: clinicianA,
    title: privateMarker, description: privateMarker, immediateSteps: "Synthetic step",
  }).returning();
  fixtures.push({
    route: "/intervention-plans",
    table: interventionPlansTable,
    id: intervention.id,
    patch: { title: `${privateMarker}_UPDATED` },
    markerField: "title",
    markerValue: privateMarker,
  });

  const [behaviorLog] = await db.insert(behaviorLogsTable).values({
    tenantId: tenantA, childId: childA, clinicianId: clinicianA,
    behaviorType: "synthetic", notes: privateMarker,
  }).returning();
  fixtures.push({
    route: "/behavior-logs",
    table: behaviorLogsTable,
    id: behaviorLog.id,
    patch: { notes: `${privateMarker}_UPDATED` },
    markerField: "notes",
    markerValue: privateMarker,
  });

  const app = express();
  app.use(express.json());
  const safeApplicationErrors: Array<Record<string, unknown>> = [];
  app.use((req: any, _res, next) => {
    const requestedActor = req.header("x-synthetic-clinician");
    const isClinicA = requestedActor === clinicianA;
    const hasFamilyCredential = req.header("x-client-token") || req.header("x-mobile-token") ||
      req.query?.invite_token || req.body?.invite_token;
    if (req.header("x-synthetic-anonymous") !== "true" && !hasFamilyCredential) {
      const actorId = isClinicA ? clinicianA : clinicianB;
      req.user = {
        id: actorId,
        email: `${actorId}@example.test`,
        appRole: "clinician",
        tenantId: isClinicA ? tenantA : tenantB,
      };
    }
    req.id = req.header("x-test-request-id") || `p0-request-${crypto.randomUUID()}`;
    req.log = { error: (fields: Record<string, unknown>) => safeApplicationErrors.push(fields) };
    next();
  });
  app.use(entitiesRouter);
  app.use(uploadRouter);
  app.use(mobileRouter);
  app.use((error: any, _req: any, res: any, _next: any) => {
    safeApplicationErrors.push({
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorCode: typeof error?.code === "string" ? error.code : null,
    });
    res.status(500).json({ error: "Internal error in isolated test router" });
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const observed: Array<Record<string, unknown>> = [];
  const readResults: Array<Record<string, unknown>> = [];
  const downloadResults: Array<Record<string, unknown>> = [];
  const selfRoleResults: Array<Record<string, unknown>> = [];
  const familyRevocationResults: Array<Record<string, unknown>> = [];
  const clientPortalResults: Array<Record<string, unknown>> = [];
  const accessCodeRotationResults: Array<Record<string, unknown>> = [];
  try {
    for (const fixture of fixtures) {
      const requestId = `p0-cross-clinic-read-${fixture.route.slice(1)}-${suffix}`;
      const response = await fetch(`${baseUrl}${fixture.route}?id=${encodeURIComponent(fixture.id)}`, {
        headers: { "x-test-request-id": requestId },
      });
      const body = await response.text();
      let parsed: unknown = null;
      try { parsed = JSON.parse(body); } catch { parsed = null; }
      readResults.push({
        route: fixture.route,
        responseStatus: response.status,
        responseContainsPrivateMarker: body.includes(fixture.markerValue),
        responseContainsTargetId: body.includes(fixture.id),
        responseIsEmptyArray: Array.isArray(parsed) && parsed.length === 0,
        requestId,
      });
      for (const operation of ["patch", "delete"] as const) {
        const requestId = `p0-cross-clinic-${operation}-${fixture.route.slice(1)}-${suffix}`;
        const before = (await db.select().from(fixture.table).where(eq(fixture.table.id, fixture.id)))[0];
        const response = await fetch(`${baseUrl}${fixture.route}/${fixture.id}`, {
          method: operation === "patch" ? "PATCH" : "DELETE",
          headers: { "content-type": "application/json", "x-test-request-id": requestId },
          body: operation === "patch" ? JSON.stringify(fixture.patch) : undefined,
        });
        const body = await response.text();
        let safeResponseError: unknown = null;
        try {
          safeResponseError = (JSON.parse(body) as Record<string, unknown>).error ?? null;
        } catch {
          safeResponseError = "non_json_error";
        }
        const after = (await db.select().from(fixture.table).where(eq(fixture.table.id, fixture.id)))[0];
        const auditRows = await db.select().from(auditLogsTable).where(eq(auditLogsTable.targetId, fixture.id));
        const matchingAudits = auditRows.filter((row) =>
          (row.metadata as Record<string, unknown> | null)?.request_id === requestId
        );
        const persistedFileUnchanged = fixture.table !== documentsTable ||
          (await fs.readFile(storedFilePath)).equals(storedFileBytes);
        observed.push({
          route: fixture.route,
          operation,
          responseStatus: response.status,
          safeResponseError,
          responseDisclosedPrivateMarker: body.includes(fixture.markerValue),
          recordUnchanged: JSON.stringify(before) === JSON.stringify(after),
          persistedFileUnchanged,
          auditCount: matchingAudits.length,
          auditActorMatches: matchingAudits.every((row) => row.userId === clinicianB && row.userRole === "clinician"),
          auditTargetMatches: matchingAudits.every((row) => row.targetId === fixture.id),
          auditTenantMatches: matchingAudits.every((row) =>
            row.tenantId === tenantA || row.tenantId === clinicA
          ),
          auditDenied: matchingAudits.every((row) => row.success === false),
          auditTimestampValid: matchingAudits.every((row) =>
            Number.isFinite(Date.parse(row.createdDate.toISOString()))
          ),
          requestId,
        });
      }
    }
    for (const actor of [
      { id: clinicianB, name: "fictional Clinic B clinician", expectedStatus: 403 },
      { id: clinicianA, name: "fictional authorized Clinic A clinician", expectedStatus: 200 },
    ]) {
      const requestId = `p0-cross-clinic-document-download-${actor.id === clinicianA ? "owner" : "unrelated"}-${suffix}`;
      const response = await fetch(`${baseUrl}/uploads/${fileName}`, {
        headers: { "x-synthetic-clinician": actor.id, "x-test-request-id": requestId },
      });
      const body = Buffer.from(await response.arrayBuffer());
      const matchingAudits = (await db.select().from(auditLogsTable).where(eq(auditLogsTable.targetId, document.id)))
        .filter((row) => (row.metadata as Record<string, unknown> | null)?.request_id === requestId);
      const expectedAction = actor.id === clinicianA
        ? "document_download_authorized"
        : "document_download_denied";
      downloadResults.push({
        actor: actor.name,
        responseStatus: response.status,
        fileBytesDisclosed: body.equals(storedFileBytes),
        denialBodyContainsPrivateMarker: actor.expectedStatus === 403 && body.toString("utf8").includes(privateMarker),
        auditCount: matchingAudits.length,
        auditActorMatches: matchingAudits.every((row) => row.userId === actor.id),
        auditActionMatches: matchingAudits.every((row) => row.action === expectedAction),
        auditTargetMatches: matchingAudits.every((row) => row.targetType === "document" && row.targetId === document.id),
        auditTenantMatches: matchingAudits.every((row) => row.tenantId === tenantA),
        auditOutcomeMatches: matchingAudits.every((row) => row.success === (actor.expectedStatus === 200)),
        auditTimestampValid: matchingAudits.every((row) =>
          Number.isFinite(Date.parse(row.createdDate.toISOString()))
        ),
        requestId,
      });
    }
    const anonymousRequestId = `p0-anonymous-document-download-${suffix}`;
    const anonymousResponse = await fetch(`${baseUrl}/uploads/${fileName}`, {
      headers: { "x-synthetic-anonymous": "true", "x-test-request-id": anonymousRequestId },
    });
    const anonymousBody = Buffer.from(await anonymousResponse.arrayBuffer());
    downloadResults.push({
      actor: "anonymous visitor",
      expectedStatus: 401,
      responseStatus: anonymousResponse.status,
      fileBytesDisclosed: anonymousBody.equals(storedFileBytes),
      denialBodyContainsPrivateMarker: anonymousBody.toString("utf8").includes(privateMarker),
      auditCount: 0,
      auditActorMatches: true,
      auditActionMatches: true,
      auditTargetMatches: true,
      auditTenantMatches: true,
      auditOutcomeMatches: true,
      auditTimestampValid: true,
      requestId: anonymousRequestId,
    });
    const orphanFileName = `${crypto.randomUUID()}.txt`;
    const orphanFileBytes = Buffer.from(`synthetic-orphan-file-${suffix}`, "utf8");
    await fs.writeFile(path.join(uploadRoot, orphanFileName), orphanFileBytes, { mode: 0o600 });
    const anonymousOrphanRequestId = `p0-anonymous-orphan-file-${suffix}`;
    const anonymousOrphanResponse = await fetch(`${baseUrl}/uploads/${orphanFileName}`, {
      headers: { "x-synthetic-anonymous": "true", "x-test-request-id": anonymousOrphanRequestId },
    });
    const anonymousOrphanBody = Buffer.from(await anonymousOrphanResponse.arrayBuffer());
    downloadResults.push({
      actor: "anonymous orphan-file visitor",
      expectedStatus: 404,
      responseStatus: anonymousOrphanResponse.status,
      fileBytesDisclosed: anonymousOrphanBody.equals(orphanFileBytes),
      denialBodyContainsPrivateMarker: anonymousOrphanBody.toString("utf8").includes(privateMarker),
      auditCount: 0,
      auditActorMatches: true,
      auditActionMatches: true,
      auditTargetMatches: true,
      auditTenantMatches: true,
      auditOutcomeMatches: true,
      auditTimestampValid: true,
      requestId: anonymousOrphanRequestId,
    });
    const deviceOneLogin = await fetch(`${baseUrl}/client-session/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: oldUsernameB, access_code: oldCredentialB }),
    });
    const deviceOneLoginBody = await deviceOneLogin.json() as Record<string, any>;
    const deviceTwoLogin = await fetch(`${baseUrl}/client-session/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: oldUsernameB, access_code: oldCredentialB }),
    });
    const deviceTwoLoginBody = await deviceTwoLogin.json() as Record<string, any>;
    await db.insert(mobileTokensTable).values({
      token: oldMobileTokenB,
      childId: childB,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const changeCodeRequestId = `p0-access-code-change-${suffix}`;
    const changeCodeResponse = await fetch(`${baseUrl}/client-session/change-access-code`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-request-id": changeCodeRequestId,
      },
      body: JSON.stringify({
        username: oldUsernameB,
        current_access_code: oldCredentialB,
        new_access_code: newCredentialB,
      }),
    });
    const changeCodeBody = await changeCodeResponse.json() as Record<string, any>;
    const deviceOneAfterChange = await fetch(`${baseUrl}/client-portal-data`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ child_id: childB, invite_token: deviceOneLoginBody.invite_token }),
    });
    const deviceTwoAfterChange = await fetch(`${baseUrl}/client-portal-data`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ child_id: childB, invite_token: deviceTwoLoginBody.invite_token }),
    });
    const mobileAfterChange = await fetch(`${baseUrl}/mobile/session`, {
      headers: { "x-mobile-token": oldMobileTokenB },
    });
    const newSessionAfterChange = await fetch(`${baseUrl}/client-portal-data`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ child_id: childB, invite_token: changeCodeBody.session?.invite_token }),
    });
    const oldCredentialAfterChange = await fetch(`${baseUrl}/client-session/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: oldUsernameB, access_code: oldCredentialB }),
    });
    const newCredentialAfterChange = await fetch(`${baseUrl}/client-session/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: oldUsernameB, access_code: newCredentialB }),
    });
    const accessChangeAuditRows = (await db.select().from(auditLogsTable).where(eq(auditLogsTable.targetId, childB)))
      .filter((row) => row.action === "access_code_changed" &&
        (row.metadata as Record<string, unknown> | null)?.request_id === changeCodeRequestId);
    accessCodeRotationResults.push({
      initialWebLoginsSucceeded: deviceOneLogin.status === 200 && deviceTwoLogin.status === 200,
      codeChangeStatus: changeCodeResponse.status,
      deviceOneStatusAfterChange: deviceOneAfterChange.status,
      deviceTwoStatusAfterChange: deviceTwoAfterChange.status,
      mobileSessionStatusAfterChange: mobileAfterChange.status,
      returnedSessionStatus: newSessionAfterChange.status,
      oldCredentialLoginStatus: oldCredentialAfterChange.status,
      newCredentialLoginStatus: newCredentialAfterChange.status,
      auditCount: accessChangeAuditRows.length,
      auditActorMatches: accessChangeAuditRows.every((row) => row.userId === childB && row.userRole === "client"),
      auditTargetMatches: accessChangeAuditRows.every((row) => row.targetType === "child" && row.targetId === childB),
      auditTenantMatches: accessChangeAuditRows.every((row) => row.tenantId === tenantB),
      auditTimestampValid: accessChangeAuditRows.every((row) => Number.isFinite(Date.parse(row.createdDate.toISOString()))),
      auditDoesNotExposeAccessCodes: !JSON.stringify(accessChangeAuditRows).includes(oldCredentialB) &&
        !JSON.stringify(accessChangeAuditRows).includes(newCredentialB),
      requestId: changeCodeRequestId,
    });
    const selfRoleRequestId = `p0-self-role-elevation-${suffix}`;
    const roleBefore = (await db.select().from(userProfilesTable).where(eq(userProfilesTable.id, clinicianB)))[0];
    const selfRoleResponse = await fetch(`${baseUrl}/users/me`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-synthetic-clinician": clinicianB,
        "x-test-request-id": selfRoleRequestId,
      },
      body: JSON.stringify({ app_role: "platform_admin" }),
    });
    const selfRoleBody = await selfRoleResponse.text();
    const roleAfter = (await db.select().from(userProfilesTable).where(eq(userProfilesTable.id, clinicianB)))[0];
    const selfRoleAuditRows = (await db.select().from(auditLogsTable).where(eq(auditLogsTable.targetId, clinicianB)))
      .filter((row) => (row.metadata as Record<string, unknown> | null)?.request_id === selfRoleRequestId);
    selfRoleResults.push({
      responseStatus: selfRoleResponse.status,
      responseDisclosedPrivateMarker: selfRoleBody.includes(privateMarker),
      roleUnchanged: roleBefore.appRole === roleAfter.appRole && roleAfter.appRole === "clinician",
      auditCount: selfRoleAuditRows.length,
      auditActorMatches: selfRoleAuditRows.every((row) => row.userId === clinicianB && row.userRole === "clinician"),
      auditActionMatches: selfRoleAuditRows.every((row) => row.action === "self_role_change_denied"),
      auditTargetMatches: selfRoleAuditRows.every((row) => row.targetType === "user_profile" && row.targetId === clinicianB),
      auditOutcomeMatches: selfRoleAuditRows.every((row) => row.success === false),
      auditTimestampValid: selfRoleAuditRows.every((row) => Number.isFinite(Date.parse(row.createdDate.toISOString()))),
      requestId: selfRoleRequestId,
    });

    const initialWebLoginResponse = await fetch(`${baseUrl}/client-session/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: oldUsername, access_code: oldCredential }),
    });
    const initialWebLoginBody = await initialWebLoginResponse.json() as Record<string, any>;
    const oldWebSession = initialWebLoginBody.invite_token;
    assert.equal(initialWebLoginResponse.status, 200);
    const ownPortalRequestId = `p0-family-own-child-${suffix}`;
    const ownPortalResponse = await fetch(`${baseUrl}/client-portal-data`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-request-id": ownPortalRequestId,
      },
      body: JSON.stringify({ child_id: childA, invite_token: oldWebSession }),
    });
    const ownPortalBody = await ownPortalResponse.json() as Record<string, any>;
    const familyDocumentDownloadRequestId = `p0-family-document-download-${suffix}`;
    const familyDocumentResponse = await fetch(
      `${baseUrl}/uploads/${fileName}?invite_token=${encodeURIComponent(oldWebSession)}`,
      { headers: { "x-test-request-id": familyDocumentDownloadRequestId } },
    );
    const familyDocumentBytes = Buffer.from(await familyDocumentResponse.arrayBuffer());
    const familyDocumentAuditRows = (await db.select().from(auditLogsTable).where(eq(auditLogsTable.targetId, document.id)))
      .filter((row) => (row.metadata as Record<string, unknown> | null)?.request_id === familyDocumentDownloadRequestId);
    downloadResults.push({
      actor: "authorized legacy family account",
      expectedStatus: 200,
      responseStatus: familyDocumentResponse.status,
      fileBytesDisclosed: familyDocumentBytes.equals(storedFileBytes),
      denialBodyContainsPrivateMarker: false,
      auditCount: familyDocumentAuditRows.length,
      auditActorMatches: familyDocumentAuditRows.every((row) => row.userId === childA && row.userRole === "client"),
      auditActionMatches: familyDocumentAuditRows.every((row) => row.action === "document_download_authorized"),
      auditTargetMatches: familyDocumentAuditRows.every((row) => row.targetType === "document" && row.targetId === document.id),
      auditTenantMatches: familyDocumentAuditRows.every((row) => row.tenantId === tenantA),
      auditOutcomeMatches: familyDocumentAuditRows.every((row) => row.success === true),
      auditTimestampValid: familyDocumentAuditRows.every((row) => Number.isFinite(Date.parse(row.createdDate.toISOString()))),
      requestId: familyDocumentDownloadRequestId,
    });
    const crossFamilyRequestId = `p0-family-cross-child-${suffix}`;
    const crossFamilyResponse = await fetch(`${baseUrl}/client-portal-data`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-request-id": crossFamilyRequestId,
      },
      body: JSON.stringify({ child_id: childB, invite_token: oldWebSession }),
    });
    const crossFamilyBody = await crossFamilyResponse.text();
    const crossFamilyAuditRows = (await db.select().from(auditLogsTable).where(eq(auditLogsTable.targetId, childB)))
      .filter((row) => (row.metadata as Record<string, unknown> | null)?.request_id === crossFamilyRequestId);
    clientPortalResults.push({
      ownChildStatus: ownPortalResponse.status,
      ownChildIdentityMatches: ownPortalBody.child?.id === childA,
      ownChildBodyExcludesOtherChild: !JSON.stringify(ownPortalBody).includes("Synthetic Child B"),
      crossFamilyStatus: crossFamilyResponse.status,
      crossFamilyBodyExcludesOtherChild: !crossFamilyBody.includes("Synthetic Child B") && !crossFamilyBody.includes(privateMarker),
      crossFamilyAuditCount: crossFamilyAuditRows.length,
      crossFamilyAuditActorMatches: crossFamilyAuditRows.every((row) => row.userId === childA && row.userRole === "client"),
      crossFamilyAuditTenantMatches: crossFamilyAuditRows.every((row) => row.tenantId === tenantA),
      crossFamilyAuditActionMatches: crossFamilyAuditRows.every((row) => row.action === "cross_tenant_access_attempt"),
      crossFamilyAuditTargetMatches: crossFamilyAuditRows.every((row) => row.targetId === childB && row.targetType === "child"),
      crossFamilyAuditOutcomeMatches: crossFamilyAuditRows.every((row) => row.success === false),
      crossFamilyAuditTimestampValid: crossFamilyAuditRows.every((row) => Number.isFinite(Date.parse(row.createdDate.toISOString()))),
      requestIds: { ownPortalRequestId, crossFamilyRequestId },
    });
    const initialMobileSessionResponse = await fetch(`${baseUrl}/mobile/session`, {
      headers: { "x-mobile-token": oldMobileToken },
    });
    assert.equal(initialMobileSessionResponse.status, 401, "Mobile session should not exist before seeding its token.");
    await db.insert(mobileTokensTable).values({
      token: oldMobileToken,
      childId: childA,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const activeMobileSessionResponse = await fetch(`${baseUrl}/mobile/session`, {
      headers: { "x-mobile-token": oldMobileToken },
    });
    assert.equal(activeMobileSessionResponse.status, 200);

    await db.insert(clientAccessCodeResetsTable).values({
      tenantId: tenantA,
      clinicianId: clinicianA,
      childId: childA,
      familyId: familyA,
      tokenHash: resetTokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      createdBy: clinicianA,
    });
    const revocationRequestId = `p0-family-revocation-${suffix}`;
    const revocationResponse = await fetch(`${baseUrl}/manage-client-record`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-synthetic-clinician": clinicianA,
        "x-test-request-id": revocationRequestId,
      },
      body: JSON.stringify({ action: "deleteFamily", entity_id: familyA }),
    });
    const revocationBody = await revocationResponse.json() as Record<string, any>;
    const oldWebSessionResponse = await fetch(`${baseUrl}/client-portal-data`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ child_id: childA, invite_token: oldWebSession }),
    });
    const oldMobileSessionResponse = await fetch(`${baseUrl}/mobile/session`, {
      headers: { "x-mobile-token": oldMobileToken },
    });
    const postRevokeLoginResponse = await fetch(`${baseUrl}/client-session/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: oldUsername, access_code: oldCredential }),
    });
    const [familyAfterRevocation] = await db.select().from(familiesTable).where(eq(familiesTable.id, familyA));
    const [childAfterRevocation] = await db.select().from(childrenTable).where(eq(childrenTable.id, childA));
    const [retainedDocument] = await db.select().from(documentsTable).where(eq(documentsTable.id, document.id));
    const [retainedBehaviorPlan] = await db.select().from(behaviorPlansTable).where(eq(behaviorPlansTable.id, behaviorPlan.id));
    const resetRowsAfterRevocation = await db.select().from(clientAccessCodeResetsTable)
      .where(eq(clientAccessCodeResetsTable.familyId, familyA));
    const [revocationAudit] = await db.select().from(auditLogsTable).where(eq(auditLogsTable.targetId, familyA));
    const resetInvalidationAudits = await db.select().from(auditLogsTable)
      .where(eq(auditLogsTable.action, "access_code_reset_invalidated"));

    const reissueRequestId = `p0-family-invite-reissue-${suffix}`;
    const reissueResponse = await fetch(`${baseUrl}/manage-client-record`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-synthetic-clinician": clinicianA,
        "x-test-request-id": reissueRequestId,
      },
      body: JSON.stringify({ action: "regenerateFamilyInvite", entity_id: familyA }),
    });
    const [familyAfterReissue] = await db.select().from(familiesTable).where(eq(familiesTable.id, familyA));
    const oldCredentialAfterReissueResponse = await fetch(`${baseUrl}/client-session/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: oldUsername, access_code: oldCredential }),
    });
    const oldWebSessionAfterReissue = await fetch(`${baseUrl}/client-portal-data`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ child_id: childA, invite_token: oldWebSession }),
    });
    const oldMobileSessionAfterReissue = await fetch(`${baseUrl}/mobile/session`, {
      headers: { "x-mobile-token": oldMobileToken },
    });
    const familyAuditRows = await db.select().from(auditLogsTable);
    const revocationAuditEvents = familyAuditRows.filter((row) =>
      (row.metadata as Record<string, unknown> | null)?.request_id === revocationRequestId
    );
    const reissueAuditEvents = familyAuditRows.filter((row) =>
      (row.metadata as Record<string, unknown> | null)?.request_id === reissueRequestId
    );
    familyRevocationResults.push({
      revocationStatus: revocationResponse.status,
      revocationConfirmed: revocationBody.accessRevoked === true,
      recordsPreserved: revocationBody.recordsPreserved === true &&
        Boolean(retainedDocument && retainedBehaviorPlan && childAfterRevocation),
      credentialsCleared: childAfterRevocation.username === null && childAfterRevocation.accessCode === null,
      invitationRevoked: familyAfterRevocation.inviteStatus === "revoked" && familyAfterRevocation.inviteToken === null,
      familySessionsRemoved: await db.select().from(clientSessionsTable).where(eq(clientSessionsTable.childId, childA)).then((rows) =>
        rows.every((row) => row.inviteToken !== oldWebSession)
      ),
      mobileTokenRemoved: !(await db.select().from(mobileTokensTable).where(eq(mobileTokensTable.token, oldMobileToken))).length,
      pendingResetRemoved: resetRowsAfterRevocation.length === 0,
      existingWebSessionStatusAfterRevocation: oldWebSessionResponse.status,
      existingMobileSessionStatusAfterRevocation: oldMobileSessionResponse.status,
      newLoginStatusWhileRevoked: postRevokeLoginResponse.status,
      revocationAuditCount: revocationAuditEvents.filter((row) => row.action === "family_access_revoked").length,
      resetInvalidationAuditCount: resetInvalidationAudits.filter((row) =>
        (row.metadata as Record<string, unknown> | null)?.family_id === familyA
      ).length,
      auditActorMatches: revocationAuditEvents.every((row) => row.userId === clinicianA && row.userRole === "clinician"),
      resetAuditDoesNotExposeHash: !JSON.stringify(resetInvalidationAudits).includes(resetTokenHash),
      reissueStatus: reissueResponse.status,
      inviteTokenRotated: familyAfterReissue.inviteToken !== oldInviteToken,
      invitePending: familyAfterReissue.inviteStatus === "pending",
      oldCredentialStatusAfterReissue: oldCredentialAfterReissueResponse.status,
      oldWebSessionStatusAfterReissue: oldWebSessionAfterReissue.status,
      oldMobileSessionStatusAfterReissue: oldMobileSessionAfterReissue.status,
      reissueAuditCount: reissueAuditEvents.filter((row) => row.action === "family_invitation_reissued").length,
      reissueAuditActorMatches: reissueAuditEvents.every((row) => row.userId === clinicianA && row.userRole === "clinician"),
      allRevocationAndReissueAuditTimestampsValid: [...revocationAuditEvents, ...reissueAuditEvents].every((row) =>
        Number.isFinite(Date.parse(row.createdDate.toISOString()))
      ),
      resetAuditEvents: resetInvalidationAudits.filter((row) =>
        (row.metadata as Record<string, unknown> | null)?.family_id === familyA
      ).map((row) => ({
        createdAt: row.createdDate.toISOString(),
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
      auditEvents: [...revocationAuditEvents, ...reissueAuditEvents].map((row) => ({
        createdAt: row.createdDate.toISOString(),
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
      requestIds: { revocationRequestId, reissueRequestId },
      targetId: familyA,
      resetAuditTargetId: revocationAudit?.id ?? null,
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  const auditRows = await db.select().from(auditLogsTable);
  const auditRequestIds = new Set([
    ...readResults.map((entry) => String(entry.requestId)),
    ...observed.map((entry) => String(entry.requestId)),
    ...downloadResults.map((entry) => String(entry.requestId)),
    ...selfRoleResults.map((entry) => String(entry.requestId)),
    ...accessCodeRotationResults.map((entry) => String(entry.requestId)),
    ...familyRevocationResults.flatMap((entry) => {
      const requestIds = entry.requestIds as Record<string, string>;
      return [requestIds.revocationRequestId, requestIds.reissueRequestId];
    }),
    ...clientPortalResults.flatMap((entry) => {
      const requestIds = entry.requestIds as Record<string, string>;
      return [requestIds.ownPortalRequestId, requestIds.crossFamilyRequestId];
    }),
  ]);
  const emittedAuditRows = [...new Map(auditRows
    .filter((row) => auditRequestIds.has(String((row.metadata as Record<string, unknown> | null)?.request_id)))
    .map((row) => [row.id, row])).values()].map((row) => ({
    id: row.id,
    createdAt: row.createdDate.toISOString(),
    actorId: row.userId,
    actorRole: row.userRole,
    tenantId: row.tenantId,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    success: row.success,
    reason: row.reason,
    metadata: row.metadata,
  }));
  await fs.writeFile(
    path.join(evidenceDir, "cross-clinic-write-results.json"),
    `${JSON.stringify({
      appCommit: process.env.NP_APP_COMMIT,
      appSourceDiffSha256: process.env.NP_APP_SOURCE_DIFF_SHA256,
      testFileSha256: process.env.NP_TEST_FILE_SHA256,
      database: "np_p0_access_test",
      host: parsedDatabaseUrl.hostname,
      actor: "fictional Clinic B clinician",
      expected: "all requests return 403, disclose no marker, leave records/files unchanged, and create one denial audit row",
      cases: observed,
      readCases: readResults,
      documentDownloadCases: downloadResults,
      selfRoleCases: selfRoleResults,
      accessCodeRotationCases: accessCodeRotationResults,
      familyRevocationCases: familyRevocationResults.map(({ auditEvents, resetAuditEvents, ...result }) => ({
        ...result,
        auditEvents,
        resetAuditEvents,
      })),
      caregiverPortalCases: clientPortalResults,
      safeApplicationErrors,
    }, null, 2)}\n`,
    { mode: 0o600 },
  );
  await fs.writeFile(
    path.join(evidenceDir, "cross-clinic-genuine-audit-events.json"),
    `${JSON.stringify(emittedAuditRows, null, 2)}\n`,
    { mode: 0o600 },
  );

  const failures = observed.filter((entry) =>
    entry.responseStatus !== 403 ||
    entry.responseDisclosedPrivateMarker !== false ||
    entry.recordUnchanged !== true ||
    entry.persistedFileUnchanged !== true ||
    entry.auditCount !== 1 ||
    entry.auditActorMatches !== true ||
    entry.auditTargetMatches !== true ||
      entry.auditTenantMatches !== true ||
      entry.auditTimestampValid !== true ||
    entry.auditDenied !== true
  );
  for (const entry of readResults) {
    if (
      entry.responseStatus !== 200 ||
      entry.responseContainsPrivateMarker !== false ||
      entry.responseContainsTargetId !== false ||
      entry.responseIsEmptyArray !== true
    ) {
      failures.push(entry);
    }
  }
  for (const entry of downloadResults) {
    if (entry.actor === "anonymous visitor" || entry.actor === "anonymous orphan-file visitor") {
      if (
        entry.responseStatus !== entry.expectedStatus ||
        entry.fileBytesDisclosed !== false ||
        entry.denialBodyContainsPrivateMarker !== false ||
        entry.auditCount !== 0
      ) {
        failures.push(entry);
      }
      continue;
    }
    const expectedSuccess = entry.expectedStatus === 200 ||
      (entry.expectedStatus === undefined && entry.actor === "fictional authorized Clinic A clinician");
    if (
      entry.responseStatus !== (entry.expectedStatus ?? (entry.actor === "fictional authorized Clinic A clinician" ? 200 : 403)) ||
      entry.fileBytesDisclosed !== expectedSuccess ||
      entry.denialBodyContainsPrivateMarker !== false ||
      entry.auditCount !== 1 ||
      entry.auditActorMatches !== true ||
      entry.auditActionMatches !== true ||
      entry.auditTargetMatches !== true ||
      entry.auditTenantMatches !== true ||
      entry.auditTimestampValid !== true ||
      entry.auditOutcomeMatches !== true
    ) {
      failures.push(entry);
    }
  }
  for (const entry of selfRoleResults) {
    if (
      entry.responseStatus !== 403 ||
      entry.responseDisclosedPrivateMarker !== false ||
      entry.roleUnchanged !== true ||
      entry.auditCount !== 1 ||
      entry.auditActorMatches !== true ||
      entry.auditActionMatches !== true ||
      entry.auditTargetMatches !== true ||
      entry.auditOutcomeMatches !== true ||
      entry.auditTimestampValid !== true
    ) {
      failures.push(entry);
    }
  }
  for (const entry of accessCodeRotationResults) {
    if (
      entry.initialWebLoginsSucceeded !== true ||
      entry.codeChangeStatus !== 200 ||
      entry.deviceOneStatusAfterChange !== 401 ||
      entry.deviceTwoStatusAfterChange !== 401 ||
      entry.mobileSessionStatusAfterChange !== 401 ||
      entry.returnedSessionStatus !== 200 ||
      entry.oldCredentialLoginStatus !== 401 ||
      entry.newCredentialLoginStatus !== 200 ||
      entry.auditCount !== 1 ||
      entry.auditActorMatches !== true ||
      entry.auditTargetMatches !== true ||
      entry.auditTenantMatches !== true ||
      entry.auditTimestampValid !== true ||
      entry.auditDoesNotExposeAccessCodes !== true
    ) {
      failures.push(entry);
    }
  }
  for (const entry of familyRevocationResults) {
    if (
      entry.revocationStatus !== 200 ||
      entry.revocationConfirmed !== true ||
      entry.recordsPreserved !== true ||
      entry.credentialsCleared !== true ||
      entry.invitationRevoked !== true ||
      entry.familySessionsRemoved !== true ||
      entry.mobileTokenRemoved !== true ||
      entry.pendingResetRemoved !== true ||
      entry.existingWebSessionStatusAfterRevocation !== 401 ||
      entry.existingMobileSessionStatusAfterRevocation !== 401 ||
      entry.newLoginStatusWhileRevoked !== 401 ||
      entry.revocationAuditCount !== 1 ||
      entry.resetInvalidationAuditCount !== 1 ||
      entry.auditActorMatches !== true ||
      entry.resetAuditDoesNotExposeHash !== true ||
      entry.reissueStatus !== 200 ||
      entry.inviteTokenRotated !== true ||
      entry.invitePending !== true ||
      entry.oldCredentialStatusAfterReissue !== 401 ||
      entry.oldWebSessionStatusAfterReissue !== 401 ||
      entry.oldMobileSessionStatusAfterReissue !== 401 ||
      entry.reissueAuditCount !== 1 ||
      entry.reissueAuditActorMatches !== true ||
      entry.allRevocationAndReissueAuditTimestampsValid !== true
    ) {
      failures.push(entry);
    }
  }
  for (const entry of clientPortalResults) {
    if (
      entry.ownChildStatus !== 200 ||
      entry.ownChildIdentityMatches !== true ||
      entry.ownChildBodyExcludesOtherChild !== true ||
      entry.crossFamilyStatus !== 403 ||
      entry.crossFamilyBodyExcludesOtherChild !== true ||
      entry.crossFamilyAuditCount !== 1 ||
      entry.crossFamilyAuditActorMatches !== true ||
      entry.crossFamilyAuditTenantMatches !== true ||
      entry.crossFamilyAuditActionMatches !== true ||
      entry.crossFamilyAuditTargetMatches !== true ||
      entry.crossFamilyAuditOutcomeMatches !== true ||
      entry.crossFamilyAuditTimestampValid !== true
    ) {
      failures.push(entry);
    }
  }
  assert.doesNotMatch(JSON.stringify(emittedAuditRows), new RegExp(privateMarker));
  assert.doesNotMatch(JSON.stringify(emittedAuditRows), new RegExp(storedFileBytes.toString("utf8")));
  assert.deepEqual(failures, [], "Cross-clinic request failures are recorded in the evidence JSON.");
});
