import assert from "node:assert/strict";
import test from "node:test";
import { auditLogsTable } from "@workspace/db";
import { safeAuditMetadata, writeAuditEvent } from "./auditEvents";

test("audit metadata strips nested credentials and document contents but keeps scope and correlation", () => {
  assert.deepEqual(
    safeAuditMetadata({
      child_id: "child-1",
      nested: {
        access_code: "do-not-store",
        document_text: "clinical text",
        result: "allowed",
      },
    }, "request-123"),
    {
      child_id: "child-1",
      nested: { result: "allowed" },
      request_id: "request-123",
    },
  );
});

test("encrypted cleanup paths can exceed the ordinary audit string limit", () => {
  const longEncryptedPath = `NPA1.${"a".repeat(900)}`;
  assert.equal(
    (safeAuditMetadata({ storage_path: longEncryptedPath }) as any).storage_path,
    longEncryptedPath,
  );
});

test("audit writer persists actor, target, outcome and sanitized metadata", async () => {
  let inserted: Record<string, unknown> | undefined;
  const executor = {
    insert(table: unknown) {
      assert.equal(table, auditLogsTable);
      return {
        values(values: Record<string, unknown>) {
          inserted = values;
          return Promise.resolve();
        },
      };
    },
  };

  await writeAuditEvent(executor as any, {
    userId: "actor-1",
    userRole: "clinician",
    tenantId: "clinic-1",
    action: "document_download_denied",
    targetType: "document",
    targetId: "doc-1",
    success: false,
    metadata: { child_id: "child-1", password_hash: "never-persist" },
    requestId: "request-456",
  });

  assert.ok(inserted);
  assert.equal(inserted.userId, "actor-1");
  assert.equal(inserted.tenantId, "clinic-1");
  assert.equal(inserted.action, "document_download_denied");
  assert.equal(inserted.success, false);
  assert.deepEqual(inserted.metadata, { child_id: "child-1", request_id: "request-456" });
});
