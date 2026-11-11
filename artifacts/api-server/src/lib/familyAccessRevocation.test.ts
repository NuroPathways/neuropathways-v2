import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clientAccessCodeResetsTable,
  clientSessionsTable,
  childrenTable,
  familiesTable,
  mobileTokensTable,
  auditLogsTable,
} from "@workspace/db";
import { revokeFamilyAccess } from "./familyAccessRevocation";
import { accessCodeResetAuditTargetId } from "./accessCodeResetAudit";

function mockTransaction(pendingResetLinks: Array<{ childId: string; tokenHash: string }> = []) {
  const deletedTables: unknown[] = [];
  const updates: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const inserts: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const tx = {
    select() {
      let table: unknown;
      return {
        from(value: unknown) { table = value; return this; },
        where() {
          return Promise.resolve(table === clientAccessCodeResetsTable ? pendingResetLinks : []);
        },
      };
    },
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
    table: childrenTable,
    values: { username: null, accessCode: null },
  }, {
    table: familiesTable,
    values: { inviteToken: null, inviteStatus: "revoked" },
  }]);
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].table, auditLogsTable);
  assert.equal(inserts[0].values.action, "family_access_revoked");
  assert.deepEqual(inserts[0].values.metadata, {
    child_count: 2,
    active_sessions_revoked: true,
    legacy_login_fields_cleared: true,
    invalidated_reset_link_count: 0,
    clinical_history_retained: true,
    request_id: "request-synthetic",
  });
});

test("family revocation audits each pending reset link without storing its token hash", async () => {
  const pending = [
    { childId: "child-a", tokenHash: "a".repeat(64) },
    { childId: "child-b", tokenHash: "b".repeat(64) },
  ];
  const { tx, inserts } = mockTransaction(pending);
  await revokeFamilyAccess(tx, {
    familyId: "family-synthetic",
    childIds: ["child-a", "child-b"],
    actorId: "clinician-synthetic",
    tenantId: "clinic-synthetic",
    requestId: "request-synthetic",
  });

  const invalidationEvents = inserts.filter(({ values }) =>
    values.action === "access_code_reset_invalidated",
  );
  assert.equal(invalidationEvents.length, 2);
  assert.deepEqual(invalidationEvents.map(({ values }) => ({
    userId: values.userId,
    userRole: values.userRole,
    tenantId: values.tenantId,
    targetType: values.targetType,
    targetId: values.targetId,
    success: values.success,
    metadata: values.metadata,
  })), pending.map((reset) => ({
    userId: "clinician-synthetic",
    userRole: "clinician",
    tenantId: "clinic-synthetic",
    targetType: "access_code_reset",
    targetId: accessCodeResetAuditTargetId(reset.tokenHash),
    success: true,
    metadata: {
      family_id: "family-synthetic",
      child_id: reset.childId,
      reason: "family_access_revoked",
      request_id: "request-synthetic",
    },
  })));
  assert.equal(JSON.stringify(invalidationEvents.map(({ values }) => values)).includes("a".repeat(64)), false);
});
