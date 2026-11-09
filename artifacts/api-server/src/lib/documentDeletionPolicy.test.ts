import assert from "node:assert/strict";
import { test } from "node:test";
import { clinicianMayDeleteUploadedDocument } from "./documentDeletionPolicy";

test("a clinician may delete only their own uploaded document", () => {
  assert.equal(
    clinicianMayDeleteUploadedDocument({ uploadedBy: "clinician-a" }, "clinician-a"),
    true,
  );
  assert.equal(
    clinicianMayDeleteUploadedDocument({ uploadedBy: "clinician-b" }, "clinician-a"),
    false,
  );
  assert.equal(
    clinicianMayDeleteUploadedDocument({ uploadedBy: "client:child-a" }, "clinician-a"),
    false,
  );
  assert.equal(
    clinicianMayDeleteUploadedDocument(
      { uploadedBy: "clinician-a" },
      "clinician-a",
      { sharedClinicianId: "clinician-a" },
    ),
    false,
  );
});
