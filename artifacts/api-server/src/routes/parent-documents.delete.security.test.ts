import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import express from "express";
import { Storage } from "@google-cloud/storage";
import { test } from "node:test";
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
  const tokenA = `fictional-parent-a-${suffix}`;
  const tokenB = `fictional-parent-b-${suffix}`;
  const requestPrefix = `delete-regression-${suffix}`;
  const fixtureParentIds = [familyAId, familyBId];
  const fixtureChildIds = [childAId, childBId];
  let documentId: string | undefined;
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

    const [initialMetadata] = await db.select().from(parentDocumentsTable)
      .where(eq(parentDocumentsTable.documentId, documentId));
    assert.ok(initialMetadata);
    storagePath = initialMetadata.storagePath;
    assert.ok(storedObjects.has(storagePath!), "The explicitly labeled fake storage must contain the uploaded object");

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
      headers: { "x-parent-token": tokenA, "x-test-request-id": `${requestPrefix}-view` },
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
  } finally {
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error) => error ? reject(error) : resolve());
      });
    }
    if (documentId) {
      await db.delete(auditLogsTable).where(and(
        eq(auditLogsTable.targetId, documentId),
        inArray(auditLogsTable.userId, fixtureParentIds),
      ));
      await db.delete(parentDocumentsTable).where(eq(parentDocumentsTable.documentId, documentId));
      await db.delete(documentsTable).where(eq(documentsTable.id, documentId));
    }
    await db.delete(parentSessionsTable).where(inArray(parentSessionsTable.parentId, fixtureParentIds));
    await db.delete(parentChildSettingsTable).where(inArray(parentChildSettingsTable.childId, fixtureChildIds));
    await db.delete(childrenTable).where(inArray(childrenTable.id, fixtureChildIds));
    await db.delete(parentAccountsTable).where(inArray(parentAccountsTable.id, fixtureParentIds));
    storedObjects.clear();
    storagePrototype.bucket = originalBucket;
    await pool.end();
  }
});
