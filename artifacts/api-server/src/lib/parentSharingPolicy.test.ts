import assert from "node:assert/strict";
import { test } from "node:test";
import { nextParentClinicConsentScopes } from "./parentSharingPolicy";

test("sharing a document adds document consent without removing other scopes", () => {
  assert.deepEqual(
    nextParentClinicConsentScopes(["observations"], true, true),
    { scopes: ["observations", "documents"], revoked: false },
  );
});

test("a fresh share after revocation does not silently restore old consent scopes", () => {
  assert.deepEqual(
    nextParentClinicConsentScopes([], true, true),
    { scopes: ["documents"], revoked: false },
  );
});

test("unsharing one document keeps document consent while another remains shared", () => {
  assert.deepEqual(
    nextParentClinicConsentScopes(["documents", "observations"], false, true),
    { scopes: ["documents", "observations"], revoked: false },
  );
});

test("unsharing the final document removes only document consent", () => {
  assert.deepEqual(
    nextParentClinicConsentScopes(["documents", "observations"], false, false),
    { scopes: ["observations"], revoked: false },
  );
});

test("unsharing the final document revokes an otherwise empty consent grant", () => {
  assert.deepEqual(
    nextParentClinicConsentScopes(["documents"], false, false),
    { scopes: [], revoked: true },
  );
});
