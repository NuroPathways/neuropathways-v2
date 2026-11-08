import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canSetSelfServiceAccountType,
  canSetSelfServiceRole,
  hashLoginIdentifier,
  isPendingClinicianRequestAllowed,
  matchesBlockedIdentifier,
  PENDING_CLINICIAN_ROLE,
} from "./securityPolicies";

test("blocked login identifiers are normalized before matching", () => {
  const hashes = [hashLoginIdentifier("Example.User@Example.org")];

  assert.equal(matchesBlockedIdentifier("  example.user@example.org  ", hashes), true);
  assert.equal(matchesBlockedIdentifier("another.user@example.org", hashes), false);
  assert.equal(matchesBlockedIdentifier("", hashes), false);
});

test("self-service role changes cannot create or promote a clinician account", () => {
  assert.equal(canSetSelfServiceRole(null, "parent"), true);
  assert.equal(canSetSelfServiceRole("parent", "parent"), true);
  assert.equal(canSetSelfServiceRole(null, "clinician"), false);
  assert.equal(canSetSelfServiceRole("parent", "clinician"), false);
  assert.equal(canSetSelfServiceRole("clinician", "parent"), false);
  assert.equal(canSetSelfServiceRole(null, "platform_admin"), false);
  assert.equal(canSetSelfServiceRole(null, PENDING_CLINICIAN_ROLE), true);
  assert.equal(canSetSelfServiceRole(PENDING_CLINICIAN_ROLE, "clinician"), false);
  assert.equal(canSetSelfServiceRole("parent", PENDING_CLINICIAN_ROLE), false);
  assert.equal(canSetSelfServiceRole("clinician", "platform_admin"), false);
});

test("self-service account types remain within the parent's permitted types", () => {
  assert.equal(canSetSelfServiceAccountType(null, null, "parent", "parent_family"), true);
  assert.equal(canSetSelfServiceAccountType("parent", "parent_family", "parent", "individual"), true);
  assert.equal(canSetSelfServiceAccountType("parent", "parent_family", "parent", "clinician"), false);
  assert.equal(canSetSelfServiceAccountType(null, null, "clinician", "clinician"), false);
  assert.equal(canSetSelfServiceAccountType("clinician", "clinician", "clinician", "clinician"), true);
  assert.equal(canSetSelfServiceAccountType(null, null, PENDING_CLINICIAN_ROLE, "clinician"), true);
  assert.equal(canSetSelfServiceAccountType("parent", "parent_family", PENDING_CLINICIAN_ROLE, "clinician"), false);
});

test("pending clinicians can read their own status and sign out, but not call app APIs", () => {
  assert.equal(isPendingClinicianRequestAllowed("GET", "/api/users/me"), true);
  assert.equal(isPendingClinicianRequestAllowed("PATCH", "/api/users/me"), true);
  assert.equal(isPendingClinicianRequestAllowed("POST", "/api/logout"), true);
  assert.equal(isPendingClinicianRequestAllowed("GET", "/api/children"), false);
  assert.equal(isPendingClinicianRequestAllowed("GET", "/api/documents"), false);
  assert.equal(isPendingClinicianRequestAllowed("POST", "/api/clinician/approve"), false);
});
