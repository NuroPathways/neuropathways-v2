import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import express from "express";
import { Storage } from "@google-cloud/storage";
import { test } from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { and, eq, inArray } from "drizzle-orm";

const testDatabaseUrl = process.env.PARENT_DOCUMENT_DELETE_TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error("PARENT_DOCUMENT_DELETE_TEST_DATABASE_URL must point to the isolated loopback test database");
}

const parsedTestDatabaseUrl = new URL(testDatabaseUrl);
const testDatabaseName = decodeURIComponent(parsedTestDatabaseUrl.pathname.slice(1));
if (
  !["127.0.0.1", "::1", "[::1]"].includes(parsedTestDatabaseUrl.hostname) ||
  testDatabaseName !== "np_parent_document_delete_test"
) {
  throw new Error("Refusing to run document-delete integration test outside np_parent_document_delete_test on loopback");
}

process.env.DATABASE_URL = testDatabaseUrl;
process.env.FILE_ENCRYPTION_KEY = "a".repeat(64);
process.env.PRIVATE_OBJECT_DIR = "np-parent-doc-delete-test/regression";
process.env.REPLIT_CONNECTORS_ENABLED = "false";

const storedObjects = new Map<string, Buffer>();
const storagePrototype = Storage.prototype as unknown as {
  bucket: (bucketName: string) => unknown;
};
const originalBucket = storagePrototype.bucket;

storagePrototype.bucket = function fakeBucket(bucketName: string) {
  return {
    file(objectName: string) {
      const key = `${bucketName}/${objectName}`;
      return {
        async save(bytes: Buffer | Uint8Array) {
          storedObjects.set(key, Buffer.from(bytes));
        },
        async download() {
          const bytes = storedObjects.get(key);
          if (!bytes) throw new Error("Synthetic object not found");
          return [Buffer.from(bytes)];
        },
        async delete() {
          storedObjects.delete(key);
          return [{}];
        },
        async exists() {
          return [storedObjects.has(key)];
        },
      };
    },
  };
} as typeof storagePrototype.bucket;

const database = await import("@workspace/db");
const {
  auditLogsTable,
  childrenTable,
  db,
  documentsTable,
  documentExtractionRunsTable,
  parentAccountsTable,
  parentChildSettingsTable,
  parentDocumentsTable,
  parentSessionsTable,
  pool,
} = database;
const { hashParentSessionToken } = await import("../lib/parentAuth");

const routeOverride = process.env.PARENT_DOCUMENTS_ROUTE_MODULE;
const candidateRouteUrl = routeOverride
  ? routeOverride.startsWith("file:")
    ? routeOverride
    : pathToFileURL(routeOverride).href
  : new URL("./parent-documents.ts", import.meta.url).href;
const { default: currentParentDocumentsRouter } = await import(new URL("./parent-documents.ts", import.meta.url).href);
const { default: candidateParentDocumentsRouter } = routeOverride
  ? await import(candidateRouteUrl)
  : { default: currentParentDocumentsRouter };

test("parent document DELETE denies cross-family access without disclosure and preserves owner access", async () => {
  const suffix = randomUUID();
  const familyAId = `delete-test-family-a-${suffix}`;
  const familyBId = `delete-test-family-b-${suffix}`;
  const familyAWorkspace = `delete-test-workspace-a-${suffix}`;
  const familyBWorkspace = `delete-test-workspace-b-${suffix}`;
  const childAId = randomUUID();
  const childBId = randomUUID();
  const syntheticClinicianId = `delete-test-clinician-${suffix}`;
  const tokenA = `fictional-parent-a-${suffix}`;
  const tokenB = `fictional-parent-b-${suffix}`;
  const requestPrefix = `delete-regression-${suffix}`;
  const fixtureParentIds = [familyAId, familyBId];
  const fixtureChildIds = [childAId, childBId];
  let documentId: string | undefined;
  let hiddenDocumentId: string | undefined;
  let storagePath: string | undefined;
  let server: ReturnType<express.Application["listen"]> | undefined;

  try {
    const identityResult = await pool.query(
      "select current_database() as database_name, host(inet_server_addr()) as server_address",
    );
    assert.equal(identityResult.rows[0]?.database_name, "np_parent_document_delete_test");
    assert.ok(
      ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(identityResult.rows[0]?.server_address),
      "Database server address must resolve to loopback",
    );

    await db.insert(parentAccountsTable).values([
      {
        id: familyAId,
        email: `${suffix}.family-a@example.test`,
        firstName: "Fictional Family A",
        workspaceId: familyAWorkspace,
        passwordHash: "test-only-unused-password-hash",
      },
      {
        id: familyBId,
        email: `${suffix}.family-b@example.test`,
        firstName: "Fictional Family B",
        workspaceId: familyBWorkspace,
        passwordHash: "test-only-unused-password-hash",
      },
    ]);
    await db.insert(childrenTable).values([
      {
        id: childAId,
        tenantId: familyAWorkspace,
        clinicianId: syntheticClinicianId,
        parentId: familyAId,
        childName: "Fictional child A",
        accountType: "parent_free",
        status: "active",
      },
      {
        id: childBId,
        tenantId: familyBWorkspace,
        parentId: familyBId,
        childName: "Fictional child B",
        accountType: "parent_free",
        status: "active",
      },
    ]);
    await db.insert(parentChildSettingsTable).values([
      { childId: childAId, parentId: familyAId, workspaceId: familyAWorkspace },
      { childId: childBId, parentId: familyBId, workspaceId: familyBWorkspace },
    ]);
    await db.insert(parentSessionsTable).values([
      {
        tokenHash: hashParentSessionToken(tokenA),
        parentId: familyAId,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
      {
        tokenHash: hashParentSessionToken(tokenB),
        parentId: familyBId,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    ]);

    const app = express();
    app.use((req: any, _res, next) => {
      req.id = req.header("x-test-request-id") || `${requestPrefix}-unlabeled`;
      req.log = { error() {} };
      next();
    });
    app.use(express.json());
    app.use("/current", currentParentDocumentsRouter);
    app.use("/candidate", candidateParentDocumentsRouter);
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const sourceBytes = Buffer.from(`Fictional document fixture ${suffix}\n`, "utf8");
    const uploadForm = new FormData();
    uploadForm.set("authorizedUploader", "true");
    uploadForm.set("title", "Fictional family document");
    uploadForm.set("file", new Blob([sourceBytes], { type: "text/plain" }), "fictional-support.txt");
    const uploadResponse = await fetch(`${baseUrl}/current/parent/children/${childAId}/documents`, {
      method: "POST",
      headers: { "x-parent-token": tokenA, "x-test-request-id": `${requestPrefix}-upload` },
      body: uploadForm,
    });
    assert.equal(uploadResponse.status, 201, "Family A must be able to upload its own test document");
    const uploadedDocument = await uploadResponse.json() as { id?: string };
    assert.ok(uploadedDocument.id);
    documentId = uploadedDocument.id!;
    hiddenDocumentId = randomUUID();
    await db.insert(documentsTable).values({
      id: hiddenDocumentId,
      childId: childAId,
      tenantId: familyAWorkspace,
      clinicianId: syntheticClinicianId,
      title: "Synthetic clinician-only record",
      fileName: "clinician-only-test.txt",
      fileUrl: `/api/uploads/${randomUUID()}.txt`,
      uploadedBy: syntheticClinicianId,
      accessRoles: "clinician",
      scanStatus: "done",
    });

    const [initialMetadata] = await db.select().from(parentDocumentsTable)
      .where(eq(parentDocumentsTable.documentId, documentId));
    assert.ok(initialMetadata);
    storagePath = initialMetadata.storagePath;
    assert.ok(storedObjects.has(storagePath!), "The explicitly labeled fake storage must contain the uploaded object");

    const accessRequestIds = {
      signedOutRead: `${requestPrefix}-signed-out-read`,
      familyBRead: `${requestPrefix}-family-b-read`,
      familyBDownload: `${requestPrefix}-family-b-download`,
      familyBScan: `${requestPrefix}-family-b-scan`,
      parentClinicianOnlyRead: `${requestPrefix}-parent-clinician-only-read`,
      parentClinicianOnlyScan: `${requestPrefix}-parent-clinician-only-scan`,
      ownerRead: `${requestPrefix}-owner-read`,
    };
    const documentsBeforeAccess = await db.select().from(documentsTable)
      .where(inArray(documentsTable.id, [documentId, hiddenDocumentId!]));
    const extractionBeforeAccess = await db.select().from(documentExtractionRunsTable)
      .where(inArray(documentExtractionRunsTable.documentId, [documentId, hiddenDocumentId!]));

    const signedOutReadResponse = await fetch(
      `${baseUrl}/current/parent/documents/${documentId}/content`,
      { headers: { "x-test-request-id": accessRequestIds.signedOutRead } },
    );
    const signedOutReadBody = await signedOutReadResponse.text();

    const foreignReadResponse = await fetch(
      `${baseUrl}/current/parent/documents/${documentId}/content`,
      { headers: { "x-parent-token": tokenB, "x-test-request-id": accessRequestIds.familyBRead } },
    );
    const foreignReadBody = await foreignReadResponse.text();
    const foreignDownloadResponse = await fetch(
      `${baseUrl}/current/parent/documents/${documentId}/content`,
      { headers: { "x-parent-token": tokenB, "x-test-request-id": accessRequestIds.familyBDownload } },
    );
    const foreignDownloadBody = await foreignDownloadResponse.text();
    const foreignScanResponse = await fetch(
      `${baseUrl}/current/parent/children/${childAId}/documents/${documentId}/scan`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-parent-token": tokenB,
          "x-test-request-id": accessRequestIds.familyBScan,
        },
        body: JSON.stringify({ async_scan: true }),
      },
    );
    const foreignScanBody = await foreignScanResponse.text();

    const clinicianOnlyReadResponse = await fetch(
      `${baseUrl}/current/parent/documents/${hiddenDocumentId}/content`,
      { headers: { "x-parent-token": tokenA, "x-test-request-id": accessRequestIds.parentClinicianOnlyRead } },
    );
    const clinicianOnlyReadBody = await clinicianOnlyReadResponse.text();
    const clinicianOnlyScanResponse = await fetch(
      `${baseUrl}/current/parent/children/${childAId}/documents/${hiddenDocumentId}/scan`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-parent-token": tokenA,
          "x-test-request-id": accessRequestIds.parentClinicianOnlyScan,
        },
        body: JSON.stringify({ async_scan: true }),
      },
    );
    const clinicianOnlyScanBody = await clinicianOnlyScanResponse.text();
    const documentsAfterDeniedAccess = await db.select().from(documentsTable)
      .where(inArray(documentsTable.id, [documentId, hiddenDocumentId!]));
    const extractionAfterDeniedAccess = await db.select().from(documentExtractionRunsTable)
      .where(inArray(documentExtractionRunsTable.documentId, [documentId, hiddenDocumentId!]));

    const foreignRequestId = `${requestPrefix}-family-b-delete`;
    const foreignResponse = await fetch(
      `${baseUrl}/candidate/parent/children/${childAId}/documents/${documentId}`,
      {
        method: "DELETE",
        headers: { "x-parent-token": tokenB, "x-test-request-id": foreignRequestId },
      },
    );
    const foreignBody = await foreignResponse.json().catch(() => null);

    const docsAfterDenial = await db.select().from(documentsTable)
      .where(eq(documentsTable.id, documentId));
    const metadataAfterDenial = await db.select().from(parentDocumentsTable)
      .where(eq(parentDocumentsTable.documentId, documentId));
    const storedObjectRemainsAfterDenial = storedObjects.has(storagePath!);
    const auditResult = await pool.query(
      `select id, created_date, user_id, user_role, tenant_id, action, target_type,
              target_id, success, reason, metadata
         from audit_logs
        where action = $1 and target_id = $2 and metadata->>'request_id' = $3`,
      ["document_delete_denied", documentId, foreignRequestId],
    );
    const denialAudit = auditResult.rows[0];
    const auditEvidence = denialAudit ? {
      id: denialAudit.id,
      createdAt: denialAudit.created_date instanceof Date
        ? denialAudit.created_date.toISOString()
        : String(denialAudit.created_date),
      actorId: denialAudit.user_id,
      actorRole: denialAudit.user_role,
      tenantId: denialAudit.tenant_id,
      action: denialAudit.action,
      targetType: denialAudit.target_type,
      targetId: denialAudit.target_id,
      success: denialAudit.success,
      reason: denialAudit.reason,
      metadata: {
        child_id: denialAudit.metadata?.child_id,
        request_id: denialAudit.metadata?.request_id,
      },
    } : null;
    console.log(`Genuine isolated PostgreSQL denial audit row: ${JSON.stringify(auditEvidence)}`);

    const missingResponse = await fetch(
      `${baseUrl}/current/parent/children/${childAId}/documents/${randomUUID()}`,
      {
        method: "DELETE",
        headers: { "x-parent-token": tokenA, "x-test-request-id": `${requestPrefix}-missing` },
      },
    );
    const missingBody = await missingResponse.json().catch(() => null);

    const listResponse = await fetch(`${baseUrl}/current/parent/children/${childAId}/documents`, {
      headers: { "x-parent-token": tokenA, "x-test-request-id": `${requestPrefix}-list` },
    });
    const listedDocuments = await listResponse.json() as Array<Record<string, unknown>>;

    const viewResponse = await fetch(`${baseUrl}/current/parent/documents/${documentId}/content`, {
      headers: { "x-parent-token": tokenA, "x-test-request-id": accessRequestIds.ownerRead },
    });
    const viewedBytes = Buffer.from(await viewResponse.arrayBuffer());

    const ownerDeleteResponse = await fetch(
      `${baseUrl}/current/parent/children/${childAId}/documents/${documentId}`,
      {
        method: "DELETE",
        headers: { "x-parent-token": tokenA, "x-test-request-id": `${requestPrefix}-owner-delete` },
      },
    );
    const ownerDeleteBody = await ownerDeleteResponse.json().catch(() => null);
    const docsAfterOwnerDelete = await db.select().from(documentsTable)
      .where(eq(documentsTable.id, documentId));
    const metadataAfterOwnerDelete = await db.select().from(parentDocumentsTable)
      .where(eq(parentDocumentsTable.documentId, documentId));
    const allAuditRows = await db.select().from(auditLogsTable);
    const requestIds = new Set([
      ...Object.values(accessRequestIds),
      foreignRequestId,
    ]);
    const relevantAuditRows = allAuditRows.filter((row) =>
      requestIds.has(String((row.metadata as Record<string, unknown> | null)?.request_id ?? "")),
    );
    const auditEvents = relevantAuditRows.map((row) => ({
      id: row.id,
      occurredAt: row.createdDate instanceof Date ? row.createdDate.toISOString() : String(row.createdDate),
      actorId: row.userId,
      actorRole: row.userRole,
      tenantId: row.tenantId,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      success: row.success,
      reason: row.reason,
      requestId: (row.metadata as Record<string, unknown> | null)?.request_id,
      childId: (row.metadata as Record<string, unknown> | null)?.child_id,
      metadataKeys: Object.keys((row.metadata as Record<string, unknown> | null) ?? {}).sort(),
    }));
    const fullAuditRows = JSON.stringify(relevantAuditRows);
    const auditExportContainsSensitiveValues = fullAuditRows.includes(sourceBytes.toString("utf8")) ||
      JSON.stringify(auditEvents).includes(tokenA) ||
      JSON.stringify(auditEvents).includes(tokenB) ||
      fullAuditRows.includes(tokenA) ||
      fullAuditRows.includes(tokenB) ||
      fullAuditRows.includes("fictional-support.txt") ||
      fullAuditRows.includes("clinician-only-test.txt") ||
      relevantAuditRows.some((row) =>
        Object.keys((row.metadata as Record<string, unknown> | null) ?? {}).some((key) =>
          /password|access.?code|secret|credential|authorization|cookie|document.?text|excerpt|prompt|response|file.?contents|clinical.?content|^body$|^notes?$/i.test(key),
        ),
      );
    const auditCountFor = (requestId: string, action: string) =>
      auditEvents.filter((event) => event.requestId === requestId && event.action === action).length;
    const auditAttributionMatches = (
      requestId: string,
      action: string,
      actorId: string,
      tenantId: string,
      targetId: string,
      success: boolean,
    ) => {
      const matches = relevantAuditRows.filter((row) =>
        (row.metadata as Record<string, unknown> | null)?.request_id === requestId && row.action === action,
      );
      return matches.length === 1 &&
        matches[0].userId === actorId &&
        matches[0].userRole === "parent" &&
        matches[0].tenantId === tenantId &&
        matches[0].targetId === targetId &&
        matches[0].targetType === "document" &&
        matches[0].success === success &&
        matches[0].createdDate instanceof Date &&
        Number.isFinite(matches[0].createdDate.getTime());
    };
    const accessAuditResults = {
      signedOut: {
        status: signedOutReadResponse.status,
        body: signedOutReadBody,
        privateContentDisclosed: signedOutReadBody.includes(sourceBytes.toString("utf8")) ||
          signedOutReadBody.includes("fictional-support.txt"),
        auditEventCount: auditEvents.filter((event) => event.requestId === accessRequestIds.signedOutRead).length,
      },
      foreignFamilyRead: {
        status: foreignReadResponse.status,
        privateContentDisclosed: foreignReadBody.includes(sourceBytes.toString("utf8")) ||
          foreignReadBody.includes("fictional-support.txt"),
        denialAuditCount: auditCountFor(accessRequestIds.familyBRead, "document_download_denied"),
        auditAttributionMatches: auditAttributionMatches(
          accessRequestIds.familyBRead, "document_download_denied", familyBId, familyBWorkspace, documentId, false,
        ),
      },
      foreignFamilyDownload: {
        status: foreignDownloadResponse.status,
        privateContentDisclosed: foreignDownloadBody.includes(sourceBytes.toString("utf8")) ||
          foreignDownloadBody.includes("fictional-support.txt"),
        denialAuditCount: auditCountFor(accessRequestIds.familyBDownload, "document_download_denied"),
        auditAttributionMatches: auditAttributionMatches(
          accessRequestIds.familyBDownload, "document_download_denied", familyBId, familyBWorkspace, documentId, false,
        ),
      },
      foreignFamilyScan: {
        status: foreignScanResponse.status,
        privateContentDisclosed: foreignScanBody.includes(sourceBytes.toString("utf8")) ||
          foreignScanBody.includes("fictional-support.txt"),
        denialAuditCount: auditCountFor(accessRequestIds.familyBScan, "document_scan_requested"),
        auditAttributionMatches: auditAttributionMatches(
          accessRequestIds.familyBScan, "document_scan_requested", familyBId, familyBWorkspace, documentId, false,
        ),
      },
      parentClinicianOnlyRead: {
        status: clinicianOnlyReadResponse.status,
        privateContentDisclosed: clinicianOnlyReadBody.includes("clinician-only-test.txt"),
        denialAuditCount: auditCountFor(accessRequestIds.parentClinicianOnlyRead, "document_download_denied"),
        auditAttributionMatches: auditAttributionMatches(
          accessRequestIds.parentClinicianOnlyRead, "document_download_denied", familyAId, familyAWorkspace, hiddenDocumentId!, false,
        ),
      },
      parentClinicianOnlyScan: {
        status: clinicianOnlyScanResponse.status,
        privateContentDisclosed: clinicianOnlyScanBody.includes("clinician-only-test.txt"),
        denialAuditCount: auditCountFor(accessRequestIds.parentClinicianOnlyScan, "document_scan_requested"),
        auditAttributionMatches: auditAttributionMatches(
          accessRequestIds.parentClinicianOnlyScan, "document_scan_requested", familyAId, familyAWorkspace, hiddenDocumentId!, false,
        ),
      },
      deniedDelete: {
        status: foreignResponse.status,
        denialAuditCount: auditCountFor(foreignRequestId, "document_delete_denied"),
        auditAttributionMatches: auditAttributionMatches(
          foreignRequestId, "document_delete_denied", familyBId, familyBWorkspace, documentId, false,
        ),
      },
      authorizedOwnerRead: {
        status: viewResponse.status,
        contentMatches: viewedBytes.equals(sourceBytes),
        successAuditCount: auditCountFor(accessRequestIds.ownerRead, "document_downloaded"),
        auditAttributionMatches: auditAttributionMatches(
          accessRequestIds.ownerRead, "document_downloaded", familyAId, familyAWorkspace, documentId, true,
        ),
      },
      noUnauthorizedMutation: {
        documentRowsUnchanged: JSON.stringify(documentsBeforeAccess) === JSON.stringify(documentsAfterDeniedAccess),
        extractionRowsUnchanged: JSON.stringify(extractionBeforeAccess) === JSON.stringify(extractionAfterDeniedAccess),
        storedSourceRemains: storedObjectRemainsAfterDenial,
      },
      auditExportContainsSensitiveValues,
      auditEvents,
    };
    const evidenceDirectory = process.env.PARENT_DOCUMENT_DELETE_EVIDENCE_DIR;
    if (evidenceDirectory) {
      await fs.mkdir(evidenceDirectory, { recursive: true, mode: 0o700 });
      await fs.writeFile(path.join(evidenceDirectory, "document-access-audit-results.json"),
        `${JSON.stringify(accessAuditResults, null, 2)}\n`, { mode: 0o600 });
      await fs.writeFile(path.join(evidenceDirectory, "document-access-genuine-audit-events.json"),
        `${JSON.stringify(auditEvents, null, 2)}\n`, { mode: 0o600 });
    }
    console.log(`Document access audit evidence: ${JSON.stringify({
      ...accessAuditResults,
      auditEvents: auditEvents.map(({ id, occurredAt, actorId, actorRole, tenantId, action, targetType, targetId, success, requestId, childId }) =>
        ({ id, occurredAt, actorId, actorRole, tenantId, action, targetType, targetId, success, requestId, childId })),
    })}`);

    const actual = {
      foreignDelete: {
        status: foreignResponse.status,
        body: foreignBody,
        leaksDocumentId: JSON.stringify(foreignBody).includes(documentId),
        leaksFilename: JSON.stringify(foreignBody).includes("fictional-support.txt"),
        rowAndMetadataRemain: docsAfterDenial.length === 1 && metadataAfterDenial.length === 1,
        storedObjectRemains: storedObjectRemainsAfterDenial,
      },
      denialAudit: denialAudit ? {
        idIsUuid: /^[0-9a-f-]{36}$/i.test(denialAudit.id),
        createdAtIsDate: denialAudit.created_date instanceof Date,
        actorId: denialAudit.user_id,
        actorRole: denialAudit.user_role,
        tenantId: denialAudit.tenant_id,
        action: denialAudit.action,
        targetType: denialAudit.target_type,
        targetId: denialAudit.target_id,
        success: denialAudit.success,
        reason: denialAudit.reason,
        childId: denialAudit.metadata?.child_id,
        requestId: denialAudit.metadata?.request_id,
      } : null,
      missingDocument: {
        status: missingResponse.status,
        body: missingBody,
        samePublicResponseAsForeign: missingResponse.status === foreignResponse.status &&
          JSON.stringify(missingBody) === JSON.stringify(foreignBody),
      },
      ownerAccess: {
        listStatus: listResponse.status,
        listedDocument: listedDocuments.some((item) => item.id === documentId),
        viewStatus: viewResponse.status,
        viewBytesMatch: viewedBytes.equals(sourceBytes),
        deleteStatus: ownerDeleteResponse.status,
        deleteBody: ownerDeleteBody,
        rowsRemoved: docsAfterOwnerDelete.length === 0 && metadataAfterOwnerDelete.length === 0,
        storedObjectRemoved: !storedObjects.has(storagePath!),
      },
    };

    assert.deepEqual(actual, {
      foreignDelete: {
        status: 404,
        body: { error: "Parent-uploaded document not found" },
        leaksDocumentId: false,
        leaksFilename: false,
        rowAndMetadataRemain: true,
        storedObjectRemains: true,
      },
      denialAudit: {
        idIsUuid: true,
        createdAtIsDate: true,
        actorId: familyBId,
        actorRole: "parent",
        tenantId: familyBWorkspace,
        action: "document_delete_denied",
        targetType: "document",
        targetId: documentId,
        success: false,
        reason: "child_outside_parent_scope",
        childId: childAId,
        requestId: foreignRequestId,
      },
      missingDocument: {
        status: 404,
        body: { error: "Parent-uploaded document not found" },
        samePublicResponseAsForeign: true,
      },
      ownerAccess: {
        listStatus: 200,
        listedDocument: true,
        viewStatus: 200,
        viewBytesMatch: true,
        deleteStatus: 200,
        deleteBody: { ok: true, cleanupStatus: "complete" },
        rowsRemoved: true,
        storedObjectRemoved: true,
      },
    });
    assert.equal(accessAuditResults.signedOut.status, 401, "Signed-out reads must remain denied");
    assert.equal(accessAuditResults.signedOut.privateContentDisclosed, false);
    assert.equal(accessAuditResults.foreignFamilyRead.status, 403);
    assert.equal(accessAuditResults.foreignFamilyRead.privateContentDisclosed, false);
    assert.equal(accessAuditResults.foreignFamilyRead.denialAuditCount, 1);
    assert.equal(accessAuditResults.foreignFamilyRead.auditAttributionMatches, true);
    assert.equal(accessAuditResults.foreignFamilyDownload.status, 403);
    assert.equal(accessAuditResults.foreignFamilyDownload.privateContentDisclosed, false);
    assert.equal(accessAuditResults.foreignFamilyDownload.denialAuditCount, 1);
    assert.equal(accessAuditResults.foreignFamilyDownload.auditAttributionMatches, true);
    assert.equal(accessAuditResults.foreignFamilyScan.status, 404);
    assert.equal(accessAuditResults.foreignFamilyScan.privateContentDisclosed, false);
    assert.equal(accessAuditResults.foreignFamilyScan.denialAuditCount, 1);
    assert.equal(accessAuditResults.foreignFamilyScan.auditAttributionMatches, true);
    assert.equal(accessAuditResults.parentClinicianOnlyRead.status, 403);
    assert.equal(accessAuditResults.parentClinicianOnlyRead.privateContentDisclosed, false);
    assert.equal(accessAuditResults.parentClinicianOnlyRead.denialAuditCount, 1);
    assert.equal(accessAuditResults.parentClinicianOnlyRead.auditAttributionMatches, true);
    assert.equal(accessAuditResults.parentClinicianOnlyScan.status, 404);
    assert.equal(accessAuditResults.parentClinicianOnlyScan.privateContentDisclosed, false);
    assert.equal(accessAuditResults.parentClinicianOnlyScan.denialAuditCount, 1);
    assert.equal(accessAuditResults.parentClinicianOnlyScan.auditAttributionMatches, true);
    assert.equal(accessAuditResults.deniedDelete.status, 404);
    assert.equal(accessAuditResults.deniedDelete.denialAuditCount, 1);
    assert.equal(accessAuditResults.deniedDelete.auditAttributionMatches, true);
    assert.equal(accessAuditResults.authorizedOwnerRead.status, 200);
    assert.equal(accessAuditResults.authorizedOwnerRead.contentMatches, true);
    assert.equal(accessAuditResults.authorizedOwnerRead.successAuditCount, 1);
    assert.equal(accessAuditResults.authorizedOwnerRead.auditAttributionMatches, true);
    assert.deepEqual(accessAuditResults.noUnauthorizedMutation, {
      documentRowsUnchanged: true,
      extractionRowsUnchanged: true,
      storedSourceRemains: true,
    });
    assert.equal(accessAuditResults.auditExportContainsSensitiveValues, false);
  } finally {
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error) => error ? reject(error) : resolve());
      });
    }
    if (documentId) {
      await db.delete(auditLogsTable).where(and(
        inArray(auditLogsTable.targetId, [documentId, ...(hiddenDocumentId ? [hiddenDocumentId] : [])]),
        inArray(auditLogsTable.userId, fixtureParentIds),
      ));
      await db.delete(parentDocumentsTable).where(eq(parentDocumentsTable.documentId, documentId));
      await db.delete(documentsTable).where(eq(documentsTable.id, documentId));
    }
    if (hiddenDocumentId) await db.delete(documentsTable).where(eq(documentsTable.id, hiddenDocumentId));
    await db.delete(parentSessionsTable).where(inArray(parentSessionsTable.parentId, fixtureParentIds));
    await db.delete(parentChildSettingsTable).where(inArray(parentChildSettingsTable.childId, fixtureChildIds));
    await db.delete(childrenTable).where(inArray(childrenTable.id, fixtureChildIds));
    await db.delete(parentAccountsTable).where(inArray(parentAccountsTable.id, fixtureParentIds));
    storedObjects.clear();
    storagePrototype.bucket = originalBucket;
    await pool.end();
  }
});
