import { test } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/parent-auth-tests";
const { classifyFamilyAccount, familyIdForOwner, familyOwnerId, hasFamilyCredential } = await import("./familyParentAuth.js");
test("only explicit legacy parent-family types receive family classification", () => {
  for (const type of ["parent", "parent_family", "family", "caregiver", "independent"]) assert.equal(classifyFamilyAccount(type), "family");
  assert.equal(classifyFamilyAccount("individual"), "individual");
  for (const type of [null, undefined, "", "admin", "clinician", "parent_free", "unknown"]) assert.equal(classifyFamilyAccount(type), "unknown");
});
test("family auxiliary ownership is explicitly namespaced, not an existing parent ID", () => {
  assert.equal(familyOwnerId("family-a"), "legacy-family:family-a");
  assert.equal(familyIdForOwner("legacy-family:family-a"), "family-a");
  assert.equal(familyIdForOwner("real-parent-id"), null);
});
test("even empty or invalid explicit family headers prevent parent-cookie fallback", () => {
  for (const headers of [{ "x-family-token": "" }, { "x-family-token": "invalid" }, { "x-mobile-token": "" }]) {
    assert.equal(hasFamilyCredential({ headers } as any), true);
  }
  assert.equal(hasFamilyCredential({ headers: {} } as any), false);
});
