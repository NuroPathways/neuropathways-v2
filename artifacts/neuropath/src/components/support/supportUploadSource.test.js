import { describe, expect, it } from "vitest";
import {
  supportSourceDocumentIds,
  supportUploadIsFamilyOwned,
  supportUploadSourceLabel,
  supportUploadsAreFamilyOwned,
} from "./supportUploadSource";

describe("support upload source labels", () => {
  const documents = [
    { id: "client-doc", uploadedBy: "client:child-1" },
    { id: "parent-doc", uploaded_by: "parent" },
    { id: "clinician-doc", uploadedBy: "clinician-1" },
  ];

  it("labels client and family uploads as self-uploaded documents", () => {
    expect(supportUploadSourceLabel(documents, ["client-doc"], "clinician-1")).toBe("Self-uploaded document");
    expect(supportUploadSourceLabel(documents, ["parent-doc"], "clinician-1")).toBe("Self-uploaded document");
  });

  it("labels documents uploaded by the child's clinician as clinician-uploaded", () => {
    expect(supportUploadSourceLabel(documents, ["clinician-doc"], "clinician-1")).toBe("Clinician-uploaded");
  });

  it("identifies mixed-source cards without attributing them to one uploader", () => {
    expect(supportUploadSourceLabel(documents, ["client-doc", "clinician-doc"], "clinician-1"))
      .toBe("Self- and clinician-uploaded");
  });

  it("uses an explicit fallback when uploader provenance is unavailable", () => {
    expect(supportUploadSourceLabel([], ["missing-doc"], "clinician-1", "Clinician-uploaded"))
      .toBe("Clinician-uploaded");
  });

  it("recognizes parent and client uploads without treating clinician uploads as family-owned", () => {
    expect(supportUploadIsFamilyOwned({ uploadedBy: "parent" })).toBe(true);
    expect(supportUploadIsFamilyOwned({ uploadedBy: "client:child-1" })).toBe(true);
    expect(supportUploadIsFamilyOwned({ uploadedBy: "clinician-1" })).toBe(false);
    expect(supportUploadsAreFamilyOwned(documents, ["parent-doc", "client-doc"])).toBe(true);
    expect(supportUploadsAreFamilyOwned(documents, ["parent-doc", "clinician-doc"])).toBe(false);
  });

  it("prefers behavior-level source document IDs over profile-level IDs", () => {
    expect(supportSourceDocumentIds({ source_doc_ids: ["behavior-doc"] }, ["profile-doc"]))
      .toEqual(["behavior-doc"]);
    expect(supportSourceDocumentIds({}, ["profile-doc"])).toEqual(["profile-doc"]);
  });
});
