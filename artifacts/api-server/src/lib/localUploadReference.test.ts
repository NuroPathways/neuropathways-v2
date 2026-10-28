import assert from "node:assert/strict";
import test from "node:test";
import { resolveLocalUploadReference } from "./localUploadReference";

test("resolves current and legacy local upload routes without query strings", () => {
  assert.deepEqual(
    resolveLocalUploadReference("https://example.test/api/uploads/report%20one.pdf?download=1", "report.pdf"),
    { filename: "report one.pdf", extension: ".pdf" },
  );
  assert.deepEqual(
    resolveLocalUploadReference("/uploads/legacy-file", "plan.docx"),
    { filename: "legacy-file", extension: ".docx" },
  );
});

test("rejects non-upload routes and traversal filenames", () => {
  assert.equal(resolveLocalUploadReference("https://example.test/private/report.pdf"), null);
  assert.equal(resolveLocalUploadReference("/api/uploads/%2e%2e%2fsecret.pdf"), null);
  assert.equal(resolveLocalUploadReference("/api/uploads/report.pdf/extra"), null);
});

test("uses the stored supported extension before a conflicting display name", () => {
  assert.deepEqual(
    resolveLocalUploadReference("/api/uploads/uuid.pdf", "report.docx"),
    { filename: "uuid.pdf", extension: ".pdf" },
  );
});
