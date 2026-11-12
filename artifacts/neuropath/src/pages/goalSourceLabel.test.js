import { describe, expect, it } from "vitest";
import { goalSourceLabel } from "./goalSourceLabel";

describe("goalSourceLabel", () => {
  it("labels an available self-uploaded document", () => {
    expect(goalSourceLabel({ source: "parent_document", sourceStatus: "available" }))
      .toBe("Self-uploaded document");
  });

  it("labels deleted or inaccessible sources without exposing their IDs", () => {
    expect(goalSourceLabel({
      source: "parent_document",
      sourceStatus: "unavailable",
      sourceDocumentId: null,
    })).toBe("Self-uploaded document · source unavailable");
  });

  it("keeps legacy unlinked document goals distinct from unavailable sources", () => {
    expect(goalSourceLabel({ source: "document", source_status: "unknown" }))
      .toBe("Clinician-uploaded document · source not linked");
  });

  it("does not label manual goals as document-derived", () => {
    expect(goalSourceLabel({ source: "manual" })).toBeNull();
  });
});
