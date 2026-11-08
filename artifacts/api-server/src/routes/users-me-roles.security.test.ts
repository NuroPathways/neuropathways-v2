import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { test } from "node:test";
import {
  db,
  consentEventsTable,
  userProfilesTable,
  usersTable,
} from "@workspace/db";
import entitiesRouter from "./entities";

test("self-service profile requests cannot activate or elevate clinician roles", async (t) => {
  const originalSelect = (db as any).select;
  const originalTransaction = (db as any).transaction;
  const profiles = new Map<string, Record<string, any>>([
    ["synthetic-parent", { id: "synthetic-parent", appRole: "parent", accountType: "parent_family" }],
    ["synthetic-clinician", { id: "synthetic-clinician", appRole: "clinician", accountType: "clinician", tenantId: "trusted-tenant" }],
  ]);
  const consentEvents: Record<string, unknown>[] = [];

  (db as any).select = () => {
    let table: unknown;
    return {
      from(value: unknown) {
        table = value;
        return this;
      },
      where(_condition: unknown) {
        if (table === userProfilesTable) {
          const profile = profiles.get((globalThis as any).__roleTestUserId);
          return Promise.resolve(profile ? [profile] : []);
        }
        if (table === usersTable) {
          const id = (globalThis as any).__roleTestUserId;
          return Promise.resolve([{ id, email: `${id}@example.test`, firstName: "Synthetic" }]);
        }
        return Promise.resolve([]);
      },
    };
  };
  (db as any).transaction = async (callback: (tx: any) => Promise<unknown>) => callback({
    insert(table: unknown) {
      let staged: Record<string, any> | null = null;
      const builder: any = {
        values(values: Record<string, any>) {
          if (table === consentEventsTable) {
            consentEvents.push(values);
            return Promise.resolve([]);
          }
          staged = values;
          return builder;
        },
        onConflictDoUpdate({ set }: { set: Record<string, any> }) {
          if (staged) {
            const id = String(staged.id);
            profiles.set(id, { ...profiles.get(id), ...staged, ...set });
          }
          return Promise.resolve([]);
        },
      };
      return builder;
    },
  });

  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    const id = String(req.header("x-test-user") || "synthetic-roleless");
    (globalThis as any).__roleTestUserId = id;
    req.user = { id, email: `${id}@example.test` };
    req.isAuthenticated = () => true;
    next();
  });
  app.use(entitiesRouter);

  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const request = (id: string, body: Record<string, unknown>) => fetch(
      `http://127.0.0.1:${address.port}/users/me`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-test-user": id,
        },
        body: JSON.stringify(body),
      },
    );

    assert.equal((await request("synthetic-roleless", {
      app_role: "clinician",
      account_type: "clinician",
    })).status, 403);

    const pendingResponse = await request("synthetic-roleless", {
      app_role: "pending_clinician",
      account_type: "clinician",
      account_holder_type: "clinician",
      account_holder_age_group: "18_plus",
      adult_or_guardian_confirmed: true,
    });
    assert.equal(pendingResponse.status, 200);
    assert.equal(profiles.get("synthetic-roleless")?.appRole, "pending_clinician");
    assert.equal(profiles.get("synthetic-roleless")?.accountType, "clinician");
    assert.equal(consentEvents.length, 1);

    assert.equal((await request("synthetic-roleless", {
      app_role: "clinician",
      account_type: "clinician",
    })).status, 403);
    assert.equal((await request("synthetic-clinician", {
      app_role: "platform_admin",
    })).status, 403);
    assert.equal((await request("synthetic-parent", {
      app_role: "pending_clinician",
      account_type: "clinician",
    })).status, 403);

    const profileUpdate = await request("synthetic-clinician", {
      display_name: "Updated Name",
      tenant_id: "attacker-tenant",
      clinician_id: "attacker-clinician",
    });
    assert.equal(profileUpdate.status, 200);
    assert.equal(profiles.get("synthetic-clinician")?.displayName, "Updated Name");
    assert.equal(profiles.get("synthetic-clinician")?.tenantId, "trusted-tenant");
    assert.equal(profiles.get("synthetic-clinician")?.clinicianId, undefined);
  } finally {
    (db as any).select = originalSelect;
    (db as any).transaction = originalTransaction;
    delete (globalThis as any).__roleTestUserId;
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
