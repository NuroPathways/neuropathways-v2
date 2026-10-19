import assert from "node:assert/strict";
import { test } from "node:test";
import { createClinicianPasswordHash, verifyClinicianPassword } from "./clinicianPassword.js";

test("clinician password reset hashes remain compatible with email/password login", async () => {
  const password = "correct horse battery staple";
  const encoded = await createClinicianPasswordHash(password);

  assert.match(encoded, /^[a-f0-9]{32}:[a-f0-9]{128}$/);
  assert.equal(await verifyClinicianPassword(password, encoded), true);
  assert.equal(await verifyClinicianPassword("different password", encoded), false);
  assert.equal(await verifyClinicianPassword(password, "malformed"), false);
});
