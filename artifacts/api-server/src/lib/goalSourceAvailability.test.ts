import test from "node:test";
import assert from "node:assert/strict";
import { goalSourceAvailability } from "./goalSourceAvailability";

test("a document goal exposes its exact source only while that source is visible", () => {
  const visible = new Set(["document-a"]);
  assert.deepEqual(goalSourceAvailability("parent_document", "document-a", visible), {
    sourceStatus: "available",
    sourceDocumentId: "document-a",
  });
  assert.deepEqual(goalSourceAvailability("parent_document", "document-b", visible), {
    sourceStatus: "unavailable",
    sourceDocumentId: null,
  });
});

test("an old document goal without reliable provenance remains unknown", () => {
  assert.deepEqual(goalSourceAvailability("document", null, new Set()), {
    sourceStatus: "unknown",
    sourceDocumentId: null,
  });
});

test("non-document goals do not accept or expose a source document association", () => {
  assert.deepEqual(goalSourceAvailability("manual", "forged-document-id", new Set(["forged-document-id"])), {
    sourceStatus: null,
    sourceDocumentId: null,
  });
});
