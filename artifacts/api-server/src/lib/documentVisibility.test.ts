import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allSourceDocumentsVisible,
  documentAccessRolesPermit,
  filterDocumentsForViewerRole,
  parentVisibleScanDocumentIds,
} from "./documentVisibility";

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

test("explicit clinician-only document access is not exposed to parent or client portals", () => {
  assert.equal(documentAccessRolesPermit("clinician", "clinician"), true);
  assert.equal(documentAccessRolesPermit("clinician", "parent"), false);
  assert.equal(documentAccessRolesPermit("clinician", "client"), false);
});

test("document access roles support shared audiences and default legacy visibility", () => {
  assert.equal(documentAccessRolesPermit("parent, clinician", "parent"), true);
  assert.equal(documentAccessRolesPermit("parent, clinician", "client"), true);
  assert.equal(documentAccessRolesPermit("parent, clinician", "clinician"), true);
  assert.equal(documentAccessRolesPermit("all", "client"), true);
  assert.equal(documentAccessRolesPermit(null, "parent"), true);
  assert.equal(documentAccessRolesPermit("unknown", "client"), false);
});

test("legacy family document lists omit clinician-only records without hiding shared records", () => {
  const records = [
    { id: "private", accessRoles: "clinician" },
    { id: "shared", accessRoles: "parent, clinician" },
    { id: "legacy", accessRoles: null },
  ];
  assert.deepEqual(
    filterDocumentsForViewerRole(records, "client").map(({ id }) => id),
    ["shared", "legacy"],
  );
  assert.deepEqual(
    filterDocumentsForViewerRole(records, "clinician").map(({ id }) => id),
    ["private", "shared", "legacy"],
  );
});
