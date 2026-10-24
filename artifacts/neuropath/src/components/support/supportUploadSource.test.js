import { describe, expect, it } from "vitest";
import { supportSourceDocumentIds, supportUploadSourceLabel } from "./supportUploadSource";

describe("support upload source labels", () => {
  const documents = [
    { id: "client-doc", uploadedBy: "client:child-1" },
    { id: "parent-doc", uploaded_by: "parent" },
    { id: "clinician-doc", uploadedBy: "clinician-1" },
  ];

  it("labels client and family uploads as client-uploaded", () => {
    expect(supportUploadSourceLabel(documents, ["client-doc"], "clinician-1")).toBe("Client-uploaded");
    expect(supportUploadSourceLabel(documents, ["parent-doc"], "clinician-1")).toBe("Client-uploaded");
  });

  it("labels documents uploaded by the child's clinician as clinician-uploaded", () => {
    expect(supportUploadSourceLabel(documents, ["clinician-doc"], "clinician-1")).toBe("Clinician-uploaded");
  });

  it("identifies mixed-source cards without attributing them to one uploader", () => {
    expect(supportUploadSourceLabel(documents, ["client-doc", "clinician-doc"], "clinician-1"))
      .toBe("Client- and clinician-uploaded");
  });

  it("uses an explicit fallback when uploader provenance is unavailable", () => {
    expect(supportUploadSourceLabel([], ["missing-doc"], "clinician-1", "Clinician-uploaded"))
      .toBe("Clinician-uploaded");
  });

  it("prefers behavior-level source document IDs over profile-level IDs", () => {
    expect(supportSourceDocumentIds({ source_doc_ids: ["behavior-doc"] }, ["profile-doc"]))
      .toEqual(["behavior-doc"]);
    expect(supportSourceDocumentIds({}, ["profile-doc"])).toEqual(["profile-doc"]);
  });
});
