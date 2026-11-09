import { describe, expect, it } from "vitest";
import { canClinicianDeleteDocument } from "./documentOwnership";

describe("clinician document deletion ownership", () => {
  it("does not grant deletion rights just because a document is attached to an assigned client", () => {
    expect(canClinicianDeleteDocument({
      uploaded_by: "client:child-1",
      clinician_id: "clinician-1",
    }, "clinician-1")).toBe(false);
  });

  it("allows a clinician to delete their own upload", () => {
    expect(canClinicianDeleteDocument({
      uploadedBy: "clinician-1",
      clinicianId: "clinician-1",
    }, "clinician-1")).toBe(true);
  });

  it("does not allow a clinician to delete an unrelated family upload", () => {
    expect(canClinicianDeleteDocument({
      uploaded_by: "parent",
      clinician_id: "clinician-2",
    }, "clinician-1")).toBe(false);
  });

  it("does not allow deletion of a shared parent upload by its assigned clinician", () => {
    expect(canClinicianDeleteDocument({
      uploaded_by: "client:child-1",
      clinician_id: "clinician-1",
      shared_with_clinician: true,
    }, "clinician-1")).toBe(false);
  });

  it("does not allow deletion without an authenticated clinician identity", () => {
    expect(canClinicianDeleteDocument({ uploaded_by: "clinician-1" }, "")).toBe(false);
  });
});
