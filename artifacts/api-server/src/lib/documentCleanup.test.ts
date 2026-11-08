import assert from "node:assert/strict";
import test from "node:test";
import {
  decryptCleanupPath,
  documentCleanupSpecs,
  encryptCleanupPath,
} from "./documentCleanup";

test("cleanup paths are encrypted at rest and reject tampering", () => {
  const previous = process.env.FILE_ENCRYPTION_KEY;
  process.env.FILE_ENCRYPTION_KEY = "0123456789abcdef".repeat(4);
  try {
    const encrypted = encryptCleanupPath("private-bucket/path/document.enc");
    assert.notEqual(encrypted, "private-bucket/path/document.enc");
    assert.equal(decryptCleanupPath(encrypted), "private-bucket/path/document.enc");
    assert.throws(() => decryptCleanupPath(`${encrypted.slice(0, -1)}x`));
  } finally {
    if (previous === undefined) delete process.env.FILE_ENCRYPTION_KEY;
    else process.env.FILE_ENCRYPTION_KEY = previous;
  }
});

test("document cleanup captures the source and extracted scan outputs without clinical text", () => {
  const tasks = documentCleanupSpecs({
    documentId: "doc-1",
    childId: "child-1",
    tenantId: "clinic-1",
    actorId: "clinician-1",
    actorRole: "clinician",
    requestId: "request-1",
    parentStoragePath: "private-bucket/parent-documents/doc-1.enc",
    scanOutputPaths: ["private-bucket/document-scan-outputs/hash.enc"],
  });

  assert.deepEqual(tasks.map(({ kind, storagePath }) => ({ kind, storagePath })), [
    { kind: "parent_encrypted", storagePath: "private-bucket/parent-documents/doc-1.enc" },
    { kind: "scan_output", storagePath: "private-bucket/document-scan-outputs/hash.enc" },
  ]);
  assert.ok(tasks.every((task) => !("documentText" in task)));
});
