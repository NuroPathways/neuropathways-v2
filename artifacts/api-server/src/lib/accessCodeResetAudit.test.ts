import assert from "node:assert/strict";
import { test } from "node:test";
import { accessCodeResetAuditTargetId } from "./accessCodeResetAudit";

test("reset-link audit target is stable and does not expose the lookup hash", () => {
  const tokenHash = "a".repeat(64);
  const targetId = accessCodeResetAuditTargetId(tokenHash);

  assert.equal(targetId, accessCodeResetAuditTargetId(tokenHash));
  assert.match(targetId, /^resetlink_[a-f0-9]{24}$/);
  assert.equal(targetId.includes(tokenHash), false);
});
