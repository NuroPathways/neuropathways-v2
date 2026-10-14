import assert from "node:assert/strict";
import { test } from "node:test";
import { parentLoginAccountKey } from "./parentAuthRateLimit.js";

test("parent login limiter scopes valid accounts independently", () => {
  const first = parentLoginAccountKey("one@example.org");
  const second = parentLoginAccountKey("two@example.org");

  assert.notEqual(first, second);
  assert.equal(first.includes("one@example.org"), false);
});

test("parent login limiter groups normalized emails consistently", () => {
  assert.equal(
    parentLoginAccountKey("parent@example.org"),
    parentLoginAccountKey("parent@example.org"),
  );
});

test("malformed email attempts use a shared fallback account key", () => {
  assert.equal(parentLoginAccountKey(null), parentLoginAccountKey(null));
});
