import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { test } from "node:test";
import {
  auditLogsTable,
  clientSessionsTable,
  childrenTable,
  clinicMembershipsTable,
  clinicalAssignmentsTable,
  clinicsTable,
  db,
  familiesTable,
  interventionPlansTable,
  behaviorPlansTable,
  documentsTable,
  behaviorLogsTable,
  rewardTokensTable,
  userProfilesTable,
} from "@workspace/db";
import entitiesRouter from "./entities";

test("client-detail rejects a caller-selected child outside the clinician assignment", async (t) => {
  const originalSelect = (db as any).select;
  const originalInsert = (db as any).insert;
  const actorId = "authz-clinician";
  const foreignChild = {
    id: "foreign-client",
    clinicianId: "another-clinician",
    tenantId: "another-tenant",
    parentId: null,
    familyId: null,
    childName: "Synthetic",
    accountType: "individual",
  };

  (db as any).select = () => {
    let table: unknown;
    return {
      from(value: unknown) { table = value; return this; },
      where() {
        if (table === childrenTable) return Promise.resolve([foreignChild]);
        if (table === userProfilesTable) return Promise.resolve([{
          id: actorId, appRole: "clinician", tenantId: "trusted-tenant",
        }]);
        if (table === clinicsTable || table === clinicMembershipsTable ||
            table === clinicalAssignmentsTable || table === behaviorPlansTable ||
            table === documentsTable || table === interventionPlansTable ||
            table === behaviorLogsTable) return Promise.resolve([]);
        return Promise.resolve([]);
      },
    };
  };
  (db as any).insert = (table: unknown) => ({
    values() {
      assert.equal(table, auditLogsTable);
      return Promise.resolve([]);
    },
  });

  const app = express();
  app.use((req: any, _res, next) => {
    req.user = { id: actorId, appRole: "clinician", email: "clinician@example.test" };
    req.isAuthenticated = () => true;
    next();
  });
  app.use(entitiesRouter);
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(
      `http://127.0.0.1:${address.port}/client-detail?child_id=foreign-client`,
    );
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "Access denied" });
  } finally {
    (db as any).select = originalSelect;
    (db as any).insert = originalInsert;
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("client portal cross-family denial writes a security audit event", async (t) => {
  const originalSelect = (db as any).select;
  const originalInsert = (db as any).insert;
  const sessionChild = {
    id: "session-child",
    status: "active",
    familyId: null,
    clinicianId: "clinician-a",
    tenantId: "tenant-a",
  };
  const targetChild = {
    id: "foreign-child",
    status: "active",
    familyId: null,
    clinicianId: "clinician-b",
    tenantId: "tenant-b",
  };
  let childReads = 0;
  const auditRows: Record<string, unknown>[] = [];

  (db as any).select = () => {
    let table: unknown;
    return {
      from(value: unknown) { table = value; return this; },
      where() {
        if (table === clientSessionsTable) {
          return Promise.resolve([{ childId: sessionChild.id, inviteToken: "synthetic-session-token", username: "synthetic" }]);
        }
        if (table === childrenTable) {
          childReads += 1;
          if (childReads === 1 || childReads === 2) return Promise.resolve([sessionChild]);
          return Promise.resolve([targetChild]);
        }
        return Promise.resolve([]);
      },
    };
  };
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
    req.id = "synthetic-request";
    next();
  });
  app.use(entitiesRouter);
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/client-portal-data`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ child_id: targetChild.id, invite_token: "synthetic-session-token" }),
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "Access denied" });
    assert.equal(auditRows.length, 1);
    assert.equal(auditRows[0].action, "cross_tenant_access_attempt");
    assert.equal(auditRows[0].userRole, "client");
    assert.equal(auditRows[0].targetId, targetChild.id);
    assert.equal(auditRows[0].success, false);
    assert.deepEqual(auditRows[0].metadata, {
      session_child_id: sessionChild.id,
      request_id: "synthetic-request",
    });
  } finally {
    (db as any).select = originalSelect;
    (db as any).insert = originalInsert;
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("parent session cannot delete a clinician-created goal", async () => {
  const originalSelect = (db as any).select;
  const originalDelete = (db as any).delete;
  let deleteCalled = false;
  const child = {
    id: "goal-child",
    familyId: null,
    status: "active",
    accountType: "individual",
  };
  const clinicianGoal = {
    id: "clinician-goal",
    childId: child.id,
    parentId: child.id,
    source: "manual",
    createdByClinician: true,
    clinicianId: "clinician-synthetic",
    publicationStatus: "published",
  };

  (db as any).select = () => {
    let table: unknown;
    return {
      from(value: unknown) { table = value; return this; },
      where() {
        if (table === clientSessionsTable) {
          return Promise.resolve([{
            childId: child.id,
            inviteToken: "synthetic-goal-session",
            username: "synthetic-goal-user",
            expiresAt: new Date(Date.now() + 60_000),
          }]);
        }
        if (table === childrenTable) return Promise.resolve([child]);
        if (table === rewardTokensTable) return Promise.resolve([clinicianGoal]);
        return Promise.resolve([]);
      },
    };
  };
  (db as any).delete = () => ({
    where() {
      deleteCalled = true;
      return Promise.resolve([]);
    },
  });

  const app = express();
  app.use(express.json());
  app.use(entitiesRouter);
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/manage-client-goal`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "delete",
        entity_id: clinicianGoal.id,
        invite_token: "synthetic-goal-session",
      }),
    });
    assert.equal(response.status, 403);
    assert.equal(deleteCalled, false);
  } finally {
    (db as any).select = originalSelect;
    (db as any).delete = originalDelete;
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("revoked family session is invalidated before client goal access", async () => {
  const originalSelect = (db as any).select;
  const originalDelete = (db as any).delete;
  const deletedTables: unknown[] = [];
  const familyChild = {
    id: "revoked-family-child",
    familyId: "revoked-family",
    clinicianId: "clinician-synthetic",
    status: "active",
    accountType: "parent_family",
  };
  const revokedFamily = {
    id: "revoked-family",
    clinicianId: "clinician-synthetic",
    accountType: "parent_family",
    inviteStatus: "revoked",
  };

  (db as any).select = () => {
    let table: unknown;
    return {
      from(value: unknown) { table = value; return this; },
      where() {
        if (table === clientSessionsTable) {
          return Promise.resolve([{
            childId: familyChild.id,
            inviteToken: "revoked-session-token",
            username: "synthetic-family-user",
            expiresAt: new Date(Date.now() + 60_000),
          }]);
        }
        if (table === childrenTable) return Promise.resolve([familyChild]);
        if (table === familiesTable) return Promise.resolve([revokedFamily]);
        return Promise.resolve([]);
      },
    };
  };
  (db as any).delete = (table: unknown) => ({
    where() {
      deletedTables.push(table);
      return Promise.resolve([]);
    },
  });

  const app = express();
  app.use(express.json());
  app.use(entitiesRouter);
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/manage-client-goal`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "delete",
        entity_id: "any-goal",
        invite_token: "revoked-session-token",
      }),
    });
    assert.equal(response.status, 401);
    assert.deepEqual(deletedTables, [clientSessionsTable]);
  } finally {
    (db as any).select = originalSelect;
    (db as any).delete = originalDelete;
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("an API query failure does not return its SQL or parameter text", async () => {
  const originalSelect = (db as any).select;
  const internalMessage = 'Failed query: insert into "children" values ($1) -- parameter: Synthetic';
  const loggedErrors: Array<Record<string, unknown>> = [];
  (db as any).select = () => {
    throw Object.assign(new Error(internalMessage), { code: "23505" });
  };

  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.id = "sql-redaction-request";
    req.log = {
      error(context: Record<string, unknown>) {
        loggedErrors.push(context);
      },
    };
    next();
  });
  app.use(entitiesRouter);
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/client-session/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "synthetic-user", access_code: "1234" }),
    });
    const body = await response.text();
    assert.equal(response.status, 500);
    assert.equal(body.includes("Failed query"), false);
    assert.equal(body.includes("Synthetic"), false);
    assert.equal(body.includes("sql-redaction-request"), true);
    assert.equal(loggedErrors.length, 1);
    assert.equal(JSON.stringify(loggedErrors[0]).includes(internalMessage), false);
  } finally {
    (db as any).select = originalSelect;
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
