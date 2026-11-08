import assert from "node:assert/strict";
import { test } from "node:test";
import { allSourceDocumentsVisible, parentVisibleScanDocumentIds } from "./documentVisibility";

test("derived profile remains visible only when every source remains visible", () => {
  assert.equal(allSourceDocumentsVisible(["doc-a", "doc-b"], ["doc-a", "doc-b", "doc-c"]), true);
  assert.equal(allSourceDocumentsVisible(["doc-a", "doc-b"], ["doc-a"]), false);
  assert.equal(allSourceDocumentsVisible(["doc-a"], []), false);
});

test("source-less legacy profiles stay eligible and malformed provenance fails closed", () => {
  assert.equal(allSourceDocumentsVisible([], []), true);
  assert.equal(allSourceDocumentsVisible(undefined, []), true);
  assert.equal(allSourceDocumentsVisible(["doc-a", null], ["doc-a"]), false);
});

test("parent AI context includes only scan-enabled clinician documents visible for that child", () => {
  const visible = parentVisibleScanDocumentIds([
    { id: "shared", childId: "child-a", uploadedBy: "clinician", canScan: true },
    { id: "private", childId: "child-a", uploadedBy: "clinician", canScan: false },
    { id: "other-child", childId: "child-b", uploadedBy: "clinician", canScan: true },
    { id: "parent-upload", childId: "child-a", uploadedBy: "parent", canScan: true },
  ], "child-a");
  assert.deepEqual([...visible], ["shared"]);
});
