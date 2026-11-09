import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clientAccessCodeResetsTable,
  clientSessionsTable,
  familiesTable,
  mobileTokensTable,
  auditLogsTable,
} from "@workspace/db";
import { revokeFamilyAccess } from "./familyAccessRevocation";

function mockTransaction() {
  const deletedTables: unknown[] = [];
  const updates: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const inserts: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const tx = {
    delete(table: unknown) {
      return {
        where() {
          deletedTables.push(table);
          return Promise.resolve([]);
        },
      };
    },
    update(table: unknown) {
      return {
        set(values: Record<string, unknown>) {
          return {
            where() {
              updates.push({ table, values });
              return Promise.resolve([]);
            },
          };
        },
      };
    },
    insert(table: unknown) {
      return {
        values(values: Record<string, unknown>) {
          inserts.push({ table, values });
          return Promise.resolve([]);
        },
      };
    },
  };
  return { tx, deletedTables, updates, inserts };
}

test("family access revocation removes credentials, preserves clinical records, and audits atomically", async () => {
  const { tx, deletedTables, updates, inserts } = mockTransaction();
  await revokeFamilyAccess(tx, {
    familyId: "family-synthetic",
    childIds: ["child-a", "child-b"],
    actorId: "clinician-synthetic",
    tenantId: "clinic-synthetic",
    requestId: "request-synthetic",
  });

  assert.deepEqual(deletedTables, [
    clientSessionsTable,
    mobileTokensTable,
    clientAccessCodeResetsTable,
  ]);
  assert.deepEqual(updates, [{
    table: familiesTable,
    values: { inviteToken: null, inviteStatus: "revoked" },
  }]);
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].table, auditLogsTable);
  assert.equal(inserts[0].values.action, "family_access_revoked");
  assert.deepEqual(inserts[0].values.metadata, {
    child_count: 2,
    active_sessions_revoked: true,
    clinical_history_retained: true,
    request_id: "request-synthetic",
  });
});
