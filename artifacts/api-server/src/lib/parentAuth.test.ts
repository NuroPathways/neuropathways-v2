import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/parent-auth-tests";
const {
  hashParentPassword,
  hashParentSessionToken,
  normalizeParentEmail,
  parentBehaviorIdentity,
  parentBehaviorsFromSettings,
  validateParentPassword,
  verifyParentPassword,
} = await import("./parentAuth.js");

test("normalizes and strictly validates parent emails", () => {
  assert.equal(normalizeParentEmail("  Caregiver+Test@Example.org "), "caregiver+test@example.org");
  assert.equal(normalizeParentEmail("missing-at.example.org"), null);
  assert.equal(normalizeParentEmail("name@localhost"), null);
  assert.equal(normalizeParentEmail(`a${"x".repeat(250)}@example.org`), null);
});

test("enforces parent password length limits", () => {
  assert.equal(validateParentPassword("1234567"), false);
  assert.equal(validateParentPassword("12345678"), true);
  assert.equal(validateParentPassword("x".repeat(129)), false);
});

test("scrypt password hashes verify safely without storing the cleartext password", async () => {
  const password = "a long parent password";
  const encoded = await hashParentPassword(password);
  assert.match(encoded, /^scrypt\$16384\$8\$1\$/);
  assert.equal(encoded.includes(password), false);
  assert.equal(await verifyParentPassword(password, encoded), true);
  assert.equal(await verifyParentPassword("a different password", encoded), false);
  assert.equal(await verifyParentPassword(password, "invalid"), false);
});

test("parent session tokens are stored as one-way hashes", () => {
  const token = "random-parent-session-token";
  const hash = hashParentSessionToken(token);
  assert.notEqual(hash, token);
  assert.equal(hashParentSessionToken(token), hash);
  assert.equal(hash.length, 64);
});

test("legacy scalar setup settings serialize as one parent behavior", () => {
  assert.deepEqual(parentBehaviorsFromSettings({
    behaviorKey: "custom",
    customBehavior: "Morning clothing discomfort",
    goal: "Choose one comfortable item",
  }), [{
    behaviorKey: "custom",
    customBehavior: "Morning clothing discomfort",
    behaviorName: "Morning clothing discomfort",
    goal: "Choose one comfortable item",
  }]);
});

test("multi-behavior settings preserve separate goals and custom identities", () => {
  const behaviors = [
    { behaviorKey: "task_refusal", customBehavior: null, behaviorName: "Task Refusal", goal: "Start one step" },
    { behaviorKey: "custom", customBehavior: "Morning clothing discomfort", behaviorName: "Morning clothing discomfort", goal: null },
  ];
  assert.deepEqual(parentBehaviorsFromSettings({ behaviors, behaviorKey: "task_refusal" }), behaviors);
  assert.notEqual(parentBehaviorIdentity(behaviors[0]), parentBehaviorIdentity(behaviors[1]));
  assert.equal(
    parentBehaviorIdentity({ ...behaviors[1], customBehavior: " MORNING   CLOTHING DISCOMFORT " }),
    parentBehaviorIdentity(behaviors[1]),
  );
  assert.equal(
    parentBehaviorIdentity({ ...behaviors[0], behaviorKey: "task_refusal-v2" }),
    "starter:task_refusal-v2",
  );
});