import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { test } from "node:test";
import {
  auditLogsTable,
  childrenTable,
  db,
  parentAccountsTable,
  parentChildSettingsTable,
  parentSessionsTable,
  rewardTokensTable,
} from "@workspace/db";
import parentFamilyDataRouter from "./parent-family-data";

test("parent goal create and delete audit success, and clinical-goal deletion audit denial", async () => {
  const originalSelect = (db as any).select;
  const originalTransaction = (db as any).transaction;
  const originalInsert = (db as any).insert;
  const ownerId = "parent-audit";
  const childId = "parent-audit-child";
  const token = "parent-audit-session";
  const child = {
    id: childId,
    parentId: ownerId,
    tenantId: "parent-audit-workspace",
    clinicianId: "clinical-team-audit",
    familyId: null,
    childName: "Synthetic child",
    status: "active",
  };
  const goalState: {
    created: Record<string, any> | null;
    selected: Record<string, any> | null;
    deleteCalls: number;
  } = { created: null, selected: null, deleteCalls: 0 };
  const auditRows: Record<string, unknown>[] = [];

  (db as any).select = () => {
    let table: unknown;
    const query: any = {
      from(value: unknown) { table = value; return query; },
      innerJoin() { return query; },
      where() {
        if (table === parentSessionsTable) {
          return Promise.resolve([{
            parentId: ownerId,
            expiresAt: new Date(Date.now() + 60_000),
          }]);
        }
        if (table === parentAccountsTable) {
          return Promise.resolve([{
            id: ownerId,
            firstName: "Synthetic",
            email: "parent@example.test",
            workspaceId: child.tenantId,
          }]);
        }
        if (table === childrenTable) {
          return Promise.resolve([{ child, settings: { parentId: ownerId, workspaceId: child.tenantId } }]);
        }
        if (table === rewardTokensTable) {
          return Promise.resolve(goalState.selected ? [goalState.selected] : []);
        }
        return Promise.resolve([]);
      },
    };
    return query;
  };
  (db as any).transaction = async (callback: (tx: any) => Promise<unknown>) => callback({
    insert(table: unknown) {
      return {
        values(values: Record<string, any>) {
          if (table === rewardTokensTable) {
            goalState.created = {
              id: "parent-created-goal",
              ...values,
              createdDate: new Date(),
            };
            return { returning: async () => [goalState.created] };
          }
          assert.equal(table, auditLogsTable);
          auditRows.push(values);
          return Promise.resolve([]);
        },
      };
    },
    delete(table: unknown) {
      assert.equal(table, rewardTokensTable);
      return {
        where() {
          goalState.deleteCalls += 1;
          return { returning: async () => goalState.selected ? [{ id: goalState.selected.id }] : [] };
        },
      };
    },
  });
  (db as any).insert = (table: unknown) => ({
    values(values: Record<string, unknown>) {
      assert.equal(table, auditLogsTable);
      auditRows.push(values);
      return Promise.resolve([]);
    },
  });

  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.id = "parent-goal-audit-request";
    next();
  });
  app.use(parentFamilyDataRouter);
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}/parent/children/${childId}/goals`;
    const authHeaders = { "content-type": "application/json", "x-parent-token": token };

    const create = await fetch(url, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ title: "Practice a short break", description: "A parent-created goal", target: 4 }),
    });
    assert.equal(create.status, 201);
    assert.equal(auditRows.length, 1);
    assert.equal(auditRows[0].action, "goal_created");
    assert.equal(auditRows[0].userId, ownerId);
    assert.equal(auditRows[0].userRole, "parent");
    assert.equal(auditRows[0].tenantId, child.tenantId);
    assert.equal(auditRows[0].targetType, "goal");
    assert.equal(auditRows[0].targetId, goalState.created?.id);
    assert.equal(auditRows[0].success, true);

    goalState.selected = {
      id: "clinician-authored-goal",
      childId,
      parentId: null,
      tenantId: child.tenantId,
      clinicianId: child.clinicianId,
      source: "document",
      createdByClinician: true,
    };
    const deniedDelete = await fetch(`${url}/${goalState.selected.id}`, {
      method: "DELETE",
      headers: { "x-parent-token": token },
    });
    assert.equal(deniedDelete.status, 403);
    assert.equal(goalState.deleteCalls, 0);
    assert.equal(auditRows.length, 2);
    assert.equal(auditRows[1].action, "goal_delete_denied");
    assert.equal(auditRows[1].userId, ownerId);
    assert.equal(auditRows[1].userRole, "parent");
    assert.equal(auditRows[1].tenantId, child.tenantId);
    assert.equal(auditRows[1].targetId, "clinician-authored-goal");
    assert.equal(auditRows[1].success, false);

    goalState.selected = goalState.created;
    const deleteOwned = await fetch(`${url}/${goalState.created?.id}`, {
      method: "DELETE",
      headers: { "x-parent-token": token },
    });
    assert.equal(deleteOwned.status, 204);
    assert.equal(goalState.deleteCalls, 1);
    assert.equal(auditRows.length, 3);
    assert.equal(auditRows[2].action, "goal_deleted");
    assert.equal(auditRows[2].userId, ownerId);
    assert.equal(auditRows[2].tenantId, child.tenantId);
    assert.equal(auditRows[2].targetId, goalState.created?.id);
    assert.equal(auditRows[2].success, true);
  } finally {
    (db as any).select = originalSelect;
    (db as any).transaction = originalTransaction;
    (db as any).insert = originalInsert;
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
