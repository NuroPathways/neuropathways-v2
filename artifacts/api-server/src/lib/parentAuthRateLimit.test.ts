import assert from "node:assert/strict";
import { test } from "node:test";
import { parentLoginLimitKey } from "./parentAuthRateLimit.js";

test("parent login limiter scopes valid accounts independently within the same IP", () => {
  const first = parentLoginLimitKey("203.0.113.10", "one@example.org");
  const second = parentLoginLimitKey("203.0.113.10", "two@example.org");

  assert.notEqual(first, second);
  assert.equal(first.includes("one@example.org"), false);
});

test("parent login limiter groups normalized email and IP consistently", () => {
  assert.equal(
    parentLoginLimitKey("203.0.113.10", "parent@example.org"),
    parentLoginLimitKey("203.0.113.10", "parent@example.org"),
  );
  assert.notEqual(
    parentLoginLimitKey("203.0.113.10", "parent@example.org"),
    parentLoginLimitKey("203.0.113.11", "parent@example.org"),
  );
});

test("malformed email attempts remain bounded by their IP", () => {
  assert.equal(
    parentLoginLimitKey("203.0.113.10", null),
    parentLoginLimitKey("203.0.113.10", null),
  );
  assert.notEqual(
    parentLoginLimitKey("203.0.113.10", null),
    parentLoginLimitKey("203.0.113.11", null),
  );
});
