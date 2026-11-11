import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import express from "express";
import { once } from "node:events";
import { after, test } from "node:test";

const databaseUrl = process.env.P0_ACCESS_TEST_DATABASE_URL;
const testRoot = process.env.P0_ACCESS_TEST_ROOT;
const evidenceDir = process.env.P0_ACCESS_EVIDENCE_DIR;
if (!databaseUrl || !testRoot || !evidenceDir) {
  throw new Error("The isolated document-integrity runner did not provide its required test paths.");
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
delete process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
delete process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
delete process.env.ANTHROPIC_API_KEY;
const appRoot = path.join(testRoot, "document-integrity");
await fs.mkdir(path.join(appRoot, "uploads"), { recursive: true, mode: 0o700 });
process.chdir(appRoot);

const {
  auditLogsTable,
  childrenTable,
  clientSessionsTable,
  db,
  documentsTable,
  pool,
} = await import("@workspace/db");
const { eq } = await import("drizzle-orm");
const { default: entitiesRouter } = await import("./entities");
const { default: uploadRouter } = await import("./upload");

after(async () => pool.end());

function encryptForTest(plain: Buffer): Buffer {
  const key = Buffer.from("d".repeat(64), "hex");
  const iv = Buffer.alloc(12, 19);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = Buffer.from(cipher.getAuthTag());
  tag[0] ^= 0xff;
  return Buffer.concat([iv, tag, ciphertext]);
}

test("tampered encrypted upload is rejected by download and scan and emits sanitized integrity audits", async () => {
  const clinicianId = crypto.randomUUID();
  const childId = crypto.randomUUID();
  const documentId = crypto.randomUUID();
  const inviteToken = crypto.randomBytes(32).toString("hex");
  const requestIds = {
    download: `tamper-download-${crypto.randomUUID()}`,
    scan: `tamper-scan-${crypto.randomUUID()}`,
  };
  const privateMarker = `TAMPERED_PRIVATE_CONTENT_${crypto.randomUUID()}`;
  const filename = `${documentId}.txt`;
  const filePath = path.join(appRoot, "uploads", filename);

  await db.insert(childrenTable).values({
    id: childId,
    tenantId: clinicianId,
    clinicianId,
    childName: "Synthetic Integrity Test Child",
    accountType: "individual",
    status: "active",
    username: `integrity-${documentId.slice(0, 8)}`,
  });
  await db.insert(clientSessionsTable).values({
    childId,
    inviteToken,
    username: `integrity-${documentId.slice(0, 8)}`,
    expiresAt: new Date(Date.now() + 60_000),
  });
  await db.insert(documentsTable).values({
    id: documentId,
    childId,
    tenantId: clinicianId,
    clinicianId,
    title: "Synthetic encrypted integrity fixture",
    fileName: filename,
    fileUrl: `/api/uploads/${filename}`,
    uploadedBy: clinicianId,
    accessRoles: "client,clinician",
    scanStatus: "done",
  });
  await fs.writeFile(filePath, encryptForTest(Buffer.from(privateMarker)), { mode: 0o600 });

  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.id = req.path.includes("/uploads/")
      ? requestIds.download
      : requestIds.scan;
    req.isAuthenticated = () => false;
    req.log = { info() {}, warn() {}, error() {} };
    next();
  });
  app.use(entitiesRouter);
  app.use(uploadRouter);
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}`;

    const download = await fetch(
      `${origin}/uploads/${filename}?invite_token=${encodeURIComponent(inviteToken)}`,
    );
    const downloadBody = await download.text();
    const scan = await fetch(`${origin}/build-client-profile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ child_id: childId, invite_token: inviteToken, force_rebuild: true }),
    });
    const scanBody = await scan.json() as {
      error?: { code?: string; message?: string };
      failed?: Array<{ id: string; reason: string }>;
    };

    const auditRows = await db.select().from(auditLogsTable)
      .where(eq(auditLogsTable.targetId, documentId));
    const integrityAudits = auditRows.filter((row) => row.action === "document_integrity_failure");
    const result = {
      recordedAt: new Date().toISOString(),
      documentId,
      downloadStatus: download.status,
      downloadBodyContainsPrivateContent: downloadBody.includes(privateMarker),
      scanStatus: scan.status,
      scanErrorCode: scanBody.error?.code ?? null,
      scanFailureMatchesDocument: scanBody.failed?.some((row) =>
        row.id === documentId && row.reason.includes("integrity check"),
      ) ?? false,
      integrityAuditCount: integrityAudits.length,
      integrityAuditDetails: integrityAudits.map((row) => ({
        actorId: row.userId,
        actorRole: row.userRole,
        tenantId: row.tenantId,
        action: row.action,
        targetId: row.targetId,
        success: row.success,
        requestId: row.metadata && typeof row.metadata === "object"
          ? (row.metadata as Record<string, unknown>).request_id ?? null
          : null,
        operation: row.metadata && typeof row.metadata === "object"
          ? (row.metadata as Record<string, unknown>).operation ?? null
          : null,
        childId: row.metadata && typeof row.metadata === "object"
          ? (row.metadata as Record<string, unknown>).child_id ?? null
          : null,
        createdAt: row.createdDate instanceof Date ? row.createdDate.toISOString() : row.createdDate,
        metadataContainsPrivateContent: JSON.stringify(row.metadata).includes(privateMarker),
      })),
    };
    await fs.writeFile(
      path.join(evidenceDir, "document-integrity-results.json"),
      `${JSON.stringify(result, null, 2)}\n`,
      { mode: 0o600 },
    );
    await fs.writeFile(
      path.join(evidenceDir, "document-integrity-genuine-audit-events.json"),
      `${JSON.stringify(result.integrityAuditDetails, null, 2)}\n`,
      { mode: 0o600 },
    );

    assert.equal(download.status, 404);
    assert.equal(downloadBody.includes(privateMarker), false);
    assert.equal(scan.status, 422);
    assert.equal(scanBody.error?.code, "no_readable_content");
    assert.equal(result.scanFailureMatchesDocument, true);
    assert.equal(integrityAudits.length, 2);
    assert.deepEqual(new Set(integrityAudits.map((row) => row.userId)), new Set([childId]));
    assert.deepEqual(new Set(integrityAudits.map((row) => row.userRole)), new Set(["client"]));
    assert.deepEqual(new Set(integrityAudits.map((row) => row.tenantId)), new Set([clinicianId]));
    assert.deepEqual(new Set(integrityAudits.map((row) => row.success)), new Set([false]));
    assert.deepEqual(new Set(result.integrityAuditDetails.map((row) => row.operation)), new Set(["download", "scan"]));
    assert.deepEqual(new Set(result.integrityAuditDetails.map((row) => row.requestId)), new Set(Object.values(requestIds)));
    assert.equal(result.integrityAuditDetails.every((row) => row.metadataContainsPrivateContent === false), true);
    assert.ok(integrityAudits.every((row) => row.createdDate instanceof Date && Math.abs(Date.now() - row.createdDate.getTime()) < 60_000));
  } finally {
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    await fs.rm(filePath, { force: true });
  }
});
