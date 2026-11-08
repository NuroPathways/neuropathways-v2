import assert from "node:assert/strict";
import { test } from "node:test";
import { allSourceDocumentsVisible } from "./documentVisibility";

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
