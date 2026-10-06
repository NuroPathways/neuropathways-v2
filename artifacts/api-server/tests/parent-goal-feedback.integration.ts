import assert from "node:assert/strict";
import crypto from "node:crypto";
import { inArray } from "drizzle-orm";
import {
  db,
  usersTable,
  userProfilesTable,
  familiesTable,
  childrenTable,
  parentAccountsTable,
  parentSessionsTable,
  parentChildSettingsTable,
  consentEventsTable,
  auditLogsTable,
} from "@workspace/db";

const base = process.env.API_BASE_URL || `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
const hostname = new URL(base).hostname;
assert(
  hostname.endsWith(".replit.dev") || ["localhost", "127.0.0.1"].includes(hostname),
  "Refusing to test a published app",
);
const fixtureIp = `198.18.253.${crypto.randomInt(1, 255)}`;
let parentId = "";
let workspaceId = "";
let childId = "";

async function request(path: string, method = "GET", body?: unknown, token?: string) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(hostname.endsWith(".replit.dev") || ["localhost", "127.0.0.1"].includes(hostname)
        ? { "X-Forwarded-For": fixtureIp }
        : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { "X-Parent-Token": token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const data = response.headers.get("content-type")?.includes("application/json")
    ? await response.json()
    : await response.text();
  return { response, data: data as any };
}

try {
  const registration = await request("/parent/auth/register", "POST", {
    firstName: "Synthetic goal check-in",
    email: `np-goal-checkin-${crypto.randomUUID()}@example.test`,
    password: "Test-Parent-123!",
    confirmPassword: "Test-Parent-123!",
    privacyConsent: true,
    healthConsent: true,
  });
  parentId = registration.data?.parent?.id || "";
  workspaceId = registration.data?.parent?.workspaceId || "";
  assert.equal(registration.response.status, 201, "synthetic parent registration succeeds");
  const token = registration.data.token as string;

  const firstGoal = "Start one small step";
  const secondGoal = "Take a quiet break";
  const created = await request("/parent/children", "POST", {
    name: "Synthetic goal check-in child",
    behaviors: [
      { behaviorKey: "task_refusal", goal: firstGoal },
      { behaviorKey: "custom", customBehavior: "Morning noise overwhelm", goal: secondGoal },
    ],
  }, token);
  childId = created.data?.id || "";
  assert.equal(created.response.status, 201, "synthetic child with two goals is created");

  const firstRating = await request(`/parent/children/${childId}/goal-feedback`, "PATCH", {
    behaviorKey: "task_refusal",
    goal: firstGoal,
    rating: "positive",
  }, token);
  assert.equal(firstRating.response.status, 200, "positive check-in is accepted");
  assert.equal(firstRating.data.goalRating, "positive");
  assert.ok(firstRating.data.goalRatingAt, "check-in timestamp is returned");

  const secondRating = await request(`/parent/children/${childId}/goal-feedback`, "PATCH", {
    behaviorKey: "custom",
    customBehavior: "Morning noise overwhelm",
    goal: secondGoal,
    rating: "needs_support",
  }, token);
  assert.equal(secondRating.response.status, 200, "needs-support check-in is accepted");
  assert.equal(secondRating.data.goalRating, "needs_support");

  const changedFirstGoal = "Ask for a break before stopping";
  const edited = await request(`/parent/children/${childId}`, "PATCH", {
    behaviors: [
      { behaviorKey: "task_refusal", goal: changedFirstGoal },
      { behaviorKey: "custom", customBehavior: "Morning noise overwhelm", goal: secondGoal },
    ],
  }, token);
  assert.equal(edited.response.status, 200, "goal update succeeds");
  assert.equal(edited.data.behaviors[0].goalRating, null, "changed goal clears its old check-in");
  assert.equal(edited.data.behaviors[1].goalRating, "needs_support", "unchanged sibling goal keeps its check-in");

  const staleRating = await request(`/parent/children/${childId}/goal-feedback`, "PATCH", {
    behaviorKey: "task_refusal",
    goal: firstGoal,
    rating: "needs_support",
  }, token);
  assert.equal(staleRating.response.status, 409, "a stale check-in cannot attach to a changed goal");

  const restored = await request(`/parent/children/${childId}/dashboard`, "GET", undefined, token);
  assert.equal(restored.response.status, 200, "updated goal check-ins reload from the dashboard");
  assert.equal(restored.data.child.behaviors[0].goalRating, null);
  assert.equal(restored.data.child.behaviors[1].goalRating, "needs_support");
  console.log("Parent goal feedback integration: 9 checks passed.");
} finally {
  if (childId) {
    await db.delete(parentChildSettingsTable).where(inArray(parentChildSettingsTable.childId, [childId]));
    await db.delete(childrenTable).where(inArray(childrenTable.id, [childId]));
  }
  if (parentId) {
    await db.delete(parentSessionsTable).where(inArray(parentSessionsTable.parentId, [parentId]));
    await db.delete(parentAccountsTable).where(inArray(parentAccountsTable.id, [parentId]));
    await db.delete(userProfilesTable).where(inArray(userProfilesTable.id, [parentId]));
    await db.delete(usersTable).where(inArray(usersTable.id, [parentId]));
    await db.delete(consentEventsTable).where(inArray(consentEventsTable.subjectId, [parentId]));
    await db.delete(auditLogsTable).where(inArray(auditLogsTable.userId, [parentId]));
  }
  if (workspaceId) await db.delete(familiesTable).where(inArray(familiesTable.id, [workspaceId]));
}
