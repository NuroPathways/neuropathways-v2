import assert from "node:assert/strict";
import crypto from "node:crypto";
import { once } from "node:events";
import express from "express";
import { test } from "node:test";
import {
  auditLogsTable,
  clientSessionsTable,
  clientAccessCodeResetsTable,
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
  parentChildSettingsTable,
  parentDocumentsTable,
  userProfilesTable,
} from "@workspace/db";
import entitiesRouter from "./entities";
import { accessCodeResetAuditTargetId } from "../lib/accessCodeResetAudit";

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
  const originalInsert = (db as any).insert;
  let deleteCalled = false;
  const auditRows: Record<string, unknown>[] = [];
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
  (db as any).insert = (table: unknown) => ({
    values(values: Record<string, unknown>) {
      assert.equal(table, auditLogsTable);
      auditRows.push(values);
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
    assert.equal(auditRows.length, 1);
    assert.equal(auditRows[0].action, "goal_delete_denied");
    assert.equal(auditRows[0].userId, child.id);
    assert.equal(auditRows[0].userRole, "client");
    assert.equal(auditRows[0].tenantId, clinicianGoal.clinicianId);
    assert.equal(auditRows[0].targetType, "goal");
    assert.equal(auditRows[0].targetId, clinicianGoal.id);
    assert.equal(auditRows[0].success, false);
    assert.equal(auditRows[0].reason, "goal_outside_authorized_scope");
  } finally {
    (db as any).select = originalSelect;
    (db as any).delete = originalDelete;
    (db as any).insert = originalInsert;
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("legacy client goal creation and deletion each produce scoped audit events", async () => {
  const originalSelect = (db as any).select;
  const originalTransaction = (db as any).transaction;
  const child = {
    id: "legacy-goal-child",
    familyId: null,
    clinicianId: "goal-clinician",
    tenantId: "goal-clinic",
    status: "active",
    accountType: "individual",
  };
  const session = {
    childId: child.id,
    inviteToken: "legacy-goal-session",
    username: "synthetic-goal-user",
    expiresAt: new Date(Date.now() + 60_000),
  };
  const auditRows: Record<string, unknown>[] = [];
  const goalState: { current: Record<string, any> | null } = { current: null };
  (db as any).select = () => {
    let table: unknown;
    return {
      from(value: unknown) { table = value; return this; },
      where() {
        if (table === clientSessionsTable) return Promise.resolve([session]);
        if (table === childrenTable) return Promise.resolve([child]);
        if (table === rewardTokensTable) return Promise.resolve(goalState.current ? [goalState.current] : []);
        return Promise.resolve([]);
      },
    };
  };
  (db as any).transaction = async (callback: (tx: any) => Promise<unknown>) => callback({
    insert(table: unknown) {
      return {
        values(values: Record<string, any>) {
          if (table === rewardTokensTable) {
            goalState.current = {
              id: "legacy-parent-goal",
              ...values,
              tenantId: child.tenantId,
            };
            return { returning: async () => [goalState.current] };
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
          return { returning: async () => goalState.current ? [{ id: goalState.current.id }] : [] };
        },
      };
    },
  });

  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.id = "legacy-goal-audit-request";
    next();
  });
  app.use(entitiesRouter);
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const createResponse = await fetch(`http://127.0.0.1:${address.port}/manage-client-goal`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "create",
        child_id: child.id,
        invite_token: session.inviteToken,
        data: { goal_title: "Practice a calm break", tokens_goal: 3 },
      }),
    });
    assert.equal(createResponse.status, 200);
    assert.equal(auditRows.length, 1);
    assert.equal(auditRows[0].action, "goal_created");
    assert.equal(auditRows[0].userId, child.id);
    assert.equal(auditRows[0].userRole, "client");
    assert.equal(auditRows[0].tenantId, child.tenantId);
    assert.equal(auditRows[0].targetId, goalState.current?.id);
    assert.equal(auditRows[0].success, true);

    const deleteResponse = await fetch(`http://127.0.0.1:${address.port}/manage-client-goal`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "delete",
        entity_id: goalState.current?.id,
        invite_token: session.inviteToken,
      }),
    });
    assert.equal(deleteResponse.status, 200);
    assert.equal(auditRows.length, 2);
    assert.equal(auditRows[1].action, "goal_deleted");
    assert.equal(auditRows[1].userId, child.id);
    assert.equal(auditRows[1].userRole, "client");
    assert.equal(auditRows[1].tenantId, child.tenantId);
    assert.equal(auditRows[1].targetId, "legacy-parent-goal");
    assert.equal(auditRows[1].success, true);
  } finally {
    (db as any).select = originalSelect;
    (db as any).transaction = originalTransaction;
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("clinician deletion of a shared parent upload is denied and audited", async () => {
  const originalSelect = (db as any).select;
  const originalInsert = (db as any).insert;
  const actorId = "assigned-clinician";
  const clinicId = "assigned-clinic";
  const child = {
    id: "shared-document-child",
    clinicianId: actorId,
    tenantId: clinicId,
    familyId: "shared-document-family",
    parentId: null,
    status: "active",
  };
  const document = {
    id: "shared-parent-document",
    childId: child.id,
    tenantId: clinicId,
    uploadedBy: "client",
    fileUrl: "local-test-storage://parent-upload",
  };
  const auditRows: Record<string, unknown>[] = [];

  (db as any).select = () => {
    let table: unknown;
    return {
      from(value: unknown) { table = value; return this; },
      where() {
        if (table === childrenTable) return Promise.resolve([child]);
        if (table === userProfilesTable) return Promise.resolve([{
          id: actorId, appRole: "clinician", tenantId: clinicId,
        }]);
        if (table === clinicsTable) return Promise.resolve([{
          id: clinicId, legacyTenantId: clinicId, status: "active",
        }]);
        if (table === clinicMembershipsTable) return Promise.resolve([{
          clinicId, userId: actorId, role: "treating_clinician", status: "active",
        }]);
        if (table === documentsTable) return Promise.resolve([document]);
        if (table === parentDocumentsTable) return Promise.resolve([{
          documentId: document.id,
          childId: child.id,
          sharedClinicianId: actorId,
          storagePath: "private-test-path",
        }]);
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
    req.id = "shared-document-delete-request";
    req.user = { id: actorId, appRole: "clinician", tenantId: clinicId };
    req.isAuthenticated = () => true;
    next();
  });
  app.use(entitiesRouter);
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/manage-client-record`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "deleteDocument", entity_id: document.id }),
    });
    assert.equal(response.status, 403);
    assert.equal(auditRows.length, 1);
    assert.equal(auditRows[0].action, "document_delete_denied");
    assert.equal(auditRows[0].userId, actorId);
    assert.equal(auditRows[0].userRole, "clinician");
    assert.equal(auditRows[0].tenantId, clinicId);
    assert.equal(auditRows[0].targetType, "document");
    assert.equal(auditRows[0].targetId, document.id);
    assert.equal(auditRows[0].success, false);
    assert.equal(auditRows[0].reason, "uploader_ownership_required");
    assert.deepEqual(auditRows[0].metadata, {
      child_id: child.id,
      request_id: "shared-document-delete-request",
    });
  } finally {
    (db as any).select = originalSelect;
    (db as any).insert = originalInsert;
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

test("family invitation reissue is audited for success and unauthorized denial", async () => {
  const originalSelect = (db as any).select;
  const originalInsert = (db as any).insert;
  const originalTransaction = (db as any).transaction;
  const family = {
    id: "family-audit",
    clinicianId: "clinician-audit",
    tenantId: "clinic-audit",
    inviteStatus: "revoked",
    inviteToken: "old-invite-token",
    familyName: "Synthetic family",
  };
  const auditRows: Record<string, unknown>[] = [];
  let updatedFamily = family;
  let actingUser = {
    id: family.clinicianId,
    appRole: "clinician",
    tenantId: family.tenantId,
  };
  (db as any).select = () => {
    let table: unknown;
    return {
      from(value: unknown) { table = value; return this; },
      where() {
        if (table === userProfilesTable) return Promise.resolve([{ id: family.clinicianId, appRole: "clinician", tenantId: family.tenantId }]);
        if (table === familiesTable) return Promise.resolve([family]);
        return Promise.resolve([]);
      },
    };
  };
  (db as any).transaction = async (callback: (tx: any) => Promise<unknown>) => callback({
    update(table: unknown) {
      assert.equal(table, familiesTable);
      return {
        set(values: Record<string, unknown>) {
          return {
            where() {
              return {
                returning: async () => {
                  updatedFamily = { ...family, ...values };
                  return [updatedFamily];
                },
              };
            },
          };
        },
      };
    },
    insert(table: unknown) {
      return {
        values(values: Record<string, unknown>) {
          assert.equal(table, auditLogsTable);
          auditRows.push(values);
          return Promise.resolve([]);
        },
      };
    },
  });

  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.id = "invite-reissue-request";
    req.user = actingUser;
    req.isAuthenticated = () => true;
    next();
  });
  app.use(entitiesRouter);
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const success = await fetch(`http://127.0.0.1:${address.port}/manage-client-record`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "regenerateFamilyInvite", entity_id: family.id }),
    });
    assert.equal(success.status, 200);
    assert.equal(updatedFamily.inviteStatus, "pending");
    assert.equal(auditRows.length, 1);
    assert.equal(auditRows[0].action, "family_invitation_reissued");
    assert.equal(auditRows[0].userId, family.clinicianId);
    assert.equal(auditRows[0].userRole, "clinician");
    assert.equal(auditRows[0].tenantId, family.tenantId);
    assert.equal(auditRows[0].targetId, family.id);
    assert.equal(auditRows[0].success, true);
    assert.deepEqual(auditRows[0].metadata, {
      previous_status: "revoked",
      new_status: "pending",
      request_id: "invite-reissue-request",
    });

    actingUser = {
      id: "unrelated-clinician",
      appRole: "clinician",
      tenantId: "unrelated-clinic",
    };
    (db as any).select = () => {
      let table: unknown;
      return {
        from(value: unknown) { table = value; return this; },
        innerJoin() { return this; },
        where() {
          if (table === userProfilesTable) return Promise.resolve([{
            id: "unrelated-clinician", appRole: "clinician", tenantId: "unrelated-clinic",
          }]);
          if (table === familiesTable) return Promise.resolve([{
            ...family, clinicianId: "family-owner", tenantId: "family-clinic",
            inviteStatus: "accepted",
          }]);
          return Promise.resolve([]);
        },
        limit() { return Promise.resolve([]); },
      };
    };
    (db as any).insert = (table: unknown) => ({
      values(values: Record<string, unknown>) {
        assert.equal(table, auditLogsTable);
        auditRows.push(values);
        return Promise.resolve([]);
      },
    });
    const denied = await fetch(`http://127.0.0.1:${address.port}/manage-client-record`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "regenerateFamilyInvite", entity_id: family.id }),
    });
    assert.equal(denied.status, 403);
    assert.equal(auditRows.length, 2);
    assert.equal(auditRows[1].action, "family_invitation_reissue_denied");
    assert.equal(auditRows[1].userId, "unrelated-clinician");
    assert.equal(auditRows[1].tenantId, "unrelated-clinic");
    assert.equal(auditRows[1].targetId, family.id);
    assert.equal(auditRows[1].success, false);
    assert.equal(auditRows[1].reason, "family_outside_authorized_clinical_scope");

    const revokeDenied = await fetch(`http://127.0.0.1:${address.port}/manage-client-record`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "deleteFamily", entity_id: family.id }),
    });
    assert.equal(revokeDenied.status, 403);
    assert.equal(auditRows.length, 3);
    assert.equal(auditRows[2].action, "family_access_revocation_denied");
    assert.equal(auditRows[2].userId, "unrelated-clinician");
    assert.equal(auditRows[2].tenantId, "unrelated-clinic");
    assert.equal(auditRows[2].targetId, family.id);
    assert.equal(auditRows[2].success, false);
    assert.equal(auditRows[2].reason, "family_outside_authorized_clinical_scope");
  } finally {
    (db as any).select = originalSelect;
    (db as any).insert = originalInsert;
    (db as any).transaction = originalTransaction;
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("reset-link replay after family revocation is attributed without logging the token", async () => {
  const originalInsert = (db as any).insert;
  const originalTransaction = (db as any).transaction;
  const rawToken = "synthetic-reset-link-token";
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const resetTargetId = accessCodeResetAuditTargetId(tokenHash);
  const auditRows: Record<string, unknown>[] = [];
  (db as any).transaction = async (callback: (tx: any) => Promise<unknown>) => callback({
    select() {
      let table: unknown;
      const query: any = {
        from(value: unknown) { table = value; return query; },
        where() { return query; },
        orderBy() { return query; },
        limit() {
          if (table === auditLogsTable) {
            return Promise.resolve([{
              tenantId: "clinic-reset",
              metadata: { family_id: "family-reset", child_id: "child-reset" },
            }]);
          }
          return Promise.resolve([]);
        },
        then(resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) {
          return Promise.resolve([]).then(resolve, reject);
        },
      };
      return query;
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
    req.id = "reset-replay-request";
    next();
  });
  app.use(entitiesRouter);
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/client-access-code-reset/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: rawToken, new_access_code: "new-secure-code" }),
    });
    assert.equal(response.status, 400);
    assert.equal(auditRows.length, 1);
    assert.equal(auditRows[0].action, "access_code_reset_failed");
    assert.equal(auditRows[0].userRole, "client");
    assert.equal(auditRows[0].tenantId, "clinic-reset");
    assert.equal(auditRows[0].targetType, "access_code_reset");
    assert.equal(auditRows[0].targetId, resetTargetId);
    assert.equal(auditRows[0].success, false);
    assert.deepEqual(auditRows[0].metadata, {
      reset_record_id: resetTargetId,
      family_id: "family-reset",
      child_id: "child-reset",
      request_id: "reset-replay-request",
    });
    assert.equal(JSON.stringify(auditRows).includes(rawToken), false);
    assert.equal(JSON.stringify(auditRows).includes(tokenHash), false);
  } finally {
    (db as any).insert = originalInsert;
    (db as any).transaction = originalTransaction;
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("successful access-code reset writes its audit event in the credential transaction", async () => {
  const originalTransaction = (db as any).transaction;
  const token = "synthetic-valid-reset-link";
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const reset = {
    id: "reset-record-audit",
    childId: "reset-child-audit",
    familyId: null,
    clinicianId: "reset-clinician",
    tenantId: "reset-clinic",
    tokenHash,
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
  };
  const child = {
    id: reset.childId,
    clinicianId: reset.clinicianId,
    familyId: null,
    username: "synthetic-reset-user",
  };
  const auditRows: Record<string, unknown>[] = [];
  (db as any).transaction = async (callback: (tx: any) => Promise<unknown>) => callback({
    execute: async () => [],
    select() {
      let table: unknown;
      const query: any = {
        from(value: unknown) { table = value; return query; },
        where() {
          return Promise.resolve(
            table === clientAccessCodeResetsTable ? [reset] :
              table === childrenTable ? [child] : [],
          );
        },
      };
      return query;
    },
    update(table: unknown) {
      return {
        set() {
          return {
            where() {
              const query: any = {
                returning: async () => table === clientAccessCodeResetsTable ? [reset] : [],
                then(resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) {
                  return Promise.resolve([]).then(resolve, reject);
                },
              };
              return query;
            },
          };
        },
      };
    },
    delete() {
      return { where: async () => [] };
    },
    insert(table: unknown) {
      return {
        values(values: Record<string, unknown>) {
          assert.equal(table, auditLogsTable);
          auditRows.push(values);
          return Promise.resolve([]);
        },
      };
    },
  });

  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.id = "reset-complete-request";
    next();
  });
  app.use(entitiesRouter);
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/client-access-code-reset/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, new_access_code: "new-synthetic-code" }),
    });
    assert.equal(response.status, 200);
    assert.equal(auditRows.length, 1);
    assert.equal(auditRows[0].action, "access_code_reset_completed");
    assert.equal(auditRows[0].userId, child.id);
    assert.equal(auditRows[0].userRole, "client");
    assert.equal(auditRows[0].tenantId, reset.tenantId);
    assert.equal(auditRows[0].targetType, "child");
    assert.equal(auditRows[0].targetId, child.id);
    assert.equal(auditRows[0].success, true);
    assert.deepEqual(auditRows[0].metadata, {
      username: child.username,
      affectedChildCount: 1,
      family_id: null,
      reset_link_fingerprint: accessCodeResetAuditTargetId(tokenHash),
      request_id: "reset-complete-request",
    });
    assert.equal(JSON.stringify(auditRows).includes(token), false);
    assert.equal(JSON.stringify(auditRows).includes(tokenHash), false);
    assert.equal(JSON.stringify(auditRows).includes("new-synthetic-code"), false);
  } finally {
    (db as any).transaction = originalTransaction;
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
