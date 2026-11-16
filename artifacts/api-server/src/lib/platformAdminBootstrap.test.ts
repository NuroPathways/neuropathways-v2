import assert from "node:assert/strict";
import test from "node:test";
import {
  parsePlatformAdminBootstrapInput,
  PLATFORM_ADMIN_BOOTSTRAP_CONFIRMATION,
} from "./platformAdminBootstrap.js";

const acceptedArgs = [
  "--user-id=existing-verified-clinician",
  "--approval-reference=SEC-123",
  `--confirm=${PLATFORM_ADMIN_BOOTSTRAP_CONFIRMATION}`,
];

test("platform admin bootstrap requires an explicit operator approval guard", () => {
  assert.throws(() => parsePlatformAdminBootstrapInput(acceptedArgs, {}), /Bootstrap refused/);
  assert.throws(() => parsePlatformAdminBootstrapInput(
    acceptedArgs.filter((arg) => !arg.startsWith("--confirm=")),
    { NP_ALLOW_PLATFORM_ADMIN_BOOTSTRAP: "approved" },
  ), /Bootstrap refused/);
});

test("platform admin bootstrap rejects inferred, malformed, or empty identities", () => {
  assert.throws(() => parsePlatformAdminBootstrapInput(
    ["--approval-reference=SEC-123", `--confirm=${PLATFORM_ADMIN_BOOTSTRAP_CONFIRMATION}`],
    { NP_ALLOW_PLATFORM_ADMIN_BOOTSTRAP: "approved" },
  ), /Bootstrap refused/);
  assert.throws(() => parsePlatformAdminBootstrapInput(
    ["--user-id=me", "--approval-reference=x", `--confirm=${PLATFORM_ADMIN_BOOTSTRAP_CONFIRMATION}`],
    { NP_ALLOW_PLATFORM_ADMIN_BOOTSTRAP: "approved" },
  ), /Bootstrap refused/);
});

test("valid bootstrap input returns only explicit operator-supplied account and approval references", () => {
  assert.deepEqual(
    parsePlatformAdminBootstrapInput(acceptedArgs, { NP_ALLOW_PLATFORM_ADMIN_BOOTSTRAP: "approved" }),
    { userId: "existing-verified-clinician", approvalReference: "SEC-123" },
  );
});
