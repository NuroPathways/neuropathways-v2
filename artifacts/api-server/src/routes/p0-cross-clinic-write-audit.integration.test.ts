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
  childrenTable,
  clinicMembershipsTable,
  clinicsTable,
  clinicalAssignmentsTable,
  db,
  documentsTable,
  familiesTable,
  interventionPlansTable,
  pool,
  userProfilesTable,
  usersTable,
} = database;
const { eq } = await import("drizzle-orm");
const { default: entitiesRouter } = await import("./entities");
const { getClinicianAccessibleChildren } = await import("../lib/clinicAuthorization");

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
    { id: familyA, tenantId: tenantA, clinicianId: clinicianA, familyName: "Synthetic Family A", accountType: "clinic_family" },
    { id: familyB, tenantId: tenantB, clinicianId: clinicianB, familyName: "Synthetic Family B", accountType: "clinic_family" },
  ]);
  await db.insert(childrenTable).values([
    {
      id: childA, tenantId: tenantA, clinicianId: clinicianA, familyId: familyA,
      childName: "Synthetic Child A", accountType: "parent_clinician", status: "active",
    },
    {
      id: childB, tenantId: tenantB, clinicianId: clinicianB, familyId: familyB,
      childName: "Synthetic Child B", accountType: "parent_clinician", status: "active",
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
    fileName, fileUrl: `/uploads/${fileName}`, uploadedBy: clinicianA, accessRoles: "clinician",
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
    req.user = { id: clinicianB, email: `${clinicianB}@example.test`, appRole: "clinician", tenantId: tenantB };
    req.id = req.header("x-test-request-id") || `p0-request-${crypto.randomUUID()}`;
    req.ip = "127.0.0.1";
    req.log = { error: (fields: Record<string, unknown>) => safeApplicationErrors.push(fields) };
    next();
  });
  app.use(entitiesRouter);
  app.use((error: any, _req: any, res: any, _next: any) => {
    safeApplicationErrors.push({
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorCode: typeof error?.code === "string" ? error.code : null,
      safeMessage: error instanceof Error ? error.message.slice(0, 200) : null,
    });
    res.status(500).json({ error: "Internal error in isolated test router" });
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const observed: Array<Record<string, unknown>> = [];
  try {
    for (const fixture of fixtures) {
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
          auditDenied: matchingAudits.every((row) => row.success === false),
          requestId,
        });
      }
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  const allAuditRows = await db.select().from(auditLogsTable).where(eq(auditLogsTable.userId, clinicianB));
  const emittedAuditRows = allAuditRows.filter((row) =>
    observed.some((entry) =>
      (row.metadata as Record<string, unknown> | null)?.request_id === entry.requestId
    )
  ).map((row) => ({
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
      database: "np_p0_access_test",
      host: parsedDatabaseUrl.hostname,
      actor: "fictional Clinic B clinician",
      expected: "all requests return 403, disclose no marker, leave records/files unchanged, and create one denial audit row",
      cases: observed,
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
    entry.auditDenied !== true
  );
  assert.deepEqual(failures, [], "Cross-clinic request failures are recorded in the evidence JSON.");
});
