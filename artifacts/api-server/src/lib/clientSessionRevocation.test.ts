import assert from "node:assert/strict";
import { test } from "node:test";
import { clientSessionsTable, mobileTokensTable } from "@workspace/db";
import { revokeClientSessionsForChildren } from "./clientSessionRevocation";

function mockTransaction() {
  const deletes: Array<{ table: unknown; condition: unknown }> = [];
  return {
    deletes,
    delete(table: unknown) {
      return {
        where(condition: unknown) {
          deletes.push({ table, condition });
          return Promise.resolve([]);
        },
      };
    },
  };
}

test("credential rotation revokes web and mobile sessions across the affected children", async () => {
  const tx = mockTransaction();
  await revokeClientSessionsForChildren(tx, ["child-a", "child-b"]);
  assert.equal(tx.deletes.length, 2);
  assert.deepEqual(tx.deletes.map(({ table }) => table), [clientSessionsTable, mobileTokensTable]);
});

test("an authenticated mobile credential rotation preserves only its current token", async () => {
  const tx = mockTransaction();
  await revokeClientSessionsForChildren(tx, ["child-a"], "current-mobile-token");
  assert.equal(tx.deletes.length, 2);
  assert.equal(tx.deletes[0].table, clientSessionsTable);
  assert.equal(tx.deletes[1].table, mobileTokensTable);
  assert.ok(tx.deletes[1].condition);
});

test("an empty child scope issues no revocation queries", async () => {
  const tx = mockTransaction();
  await revokeClientSessionsForChildren(tx, []);
  assert.equal(tx.deletes.length, 0);
});
