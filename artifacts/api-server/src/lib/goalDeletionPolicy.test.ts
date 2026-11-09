import assert from "node:assert/strict";
import { test } from "node:test";
import { clientMayDeleteGoal } from "./goalDeletionPolicy";

test("parents may delete only their own parent-managed goals", () => {
  assert.equal(clientMayDeleteGoal({
    parentId: "child-a",
    source: "manual",
    createdByClinician: false,
  }, "child-a"), true);
  assert.equal(clientMayDeleteGoal({
    parentId: "child-a",
    source: "manual",
    createdByClinician: true,
  }, "child-a"), false);
  assert.equal(clientMayDeleteGoal({
    parentId: "child-a",
    source: "document",
    createdByClinician: false,
  }, "child-a"), false);
  assert.equal(clientMayDeleteGoal({
    parentId: "child-b",
    source: "manual",
    createdByClinician: false,
  }, "child-a"), false);
});
