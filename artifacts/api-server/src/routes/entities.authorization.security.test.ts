import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { test } from "node:test";
import {
  auditLogsTable,
  childrenTable,
  clinicMembershipsTable,
  clinicalAssignmentsTable,
  clinicsTable,
  db,
  interventionPlansTable,
  behaviorPlansTable,
  documentsTable,
  behaviorLogsTable,
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
