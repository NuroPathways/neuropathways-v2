import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { test } from "node:test";
import { db, userProfilesTable } from "@workspace/db";
import clinicianEmailAuthRouter from "./clinician-email-auth";
import { PENDING_CLINICIAN_ROLE } from "../lib/securityPolicies";

test("web and mobile clinician registrations create locked pending accounts without sessions", async (t) => {
  const originalSelect = (db as any).select;
  const originalTransaction = (db as any).transaction;
  const insertedRows: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  (db as any).select = () => ({
    from() { return this; },
    where() { return Promise.resolve([]); },
  });
  (db as any).transaction = async (callback: (tx: any) => Promise<unknown>) => callback({
    insert(table: unknown) {
      return {
        values: async (values: Record<string, unknown>) => {
          insertedRows.push({ table, values });
          return [];
        },
      };
    },
  });

  const app = express();
  app.use(express.json());
  app.use(clinicianEmailAuthRouter);

  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    for (const [route, email] of [
      ["/clinician/register", "pending-web@example.test"],
      ["/mobile/clinician/register", "pending-mobile@example.test"],
    ]) {
      const response = await fetch(`http://127.0.0.1:${address.port}${route}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password: "synthetic-test-password",
          firstName: "Synthetic",
          lastName: "Pending",
          accountHolderType: "clinician",
          accountHolderAgeGroup: "18_plus",
          adultOrGuardianConfirmed: true,
        }),
      });
      assert.equal(response.status, 202);
      assert.equal(response.headers.get("set-cookie"), null);
      const payload = await response.json() as { pendingApproval?: boolean; message?: string };
      assert.equal(payload.pendingApproval, true);
      assert.match(payload.message ?? "", /pending/i);
    }

    const profileRows = insertedRows.filter((row) => row.table === userProfilesTable);
    assert.equal(profileRows.length, 2);
    assert.deepEqual(profileRows.map((row) => row.values.appRole), [
      PENDING_CLINICIAN_ROLE,
      PENDING_CLINICIAN_ROLE,
    ]);
  } finally {
    (db as any).select = originalSelect;
    (db as any).transaction = originalTransaction;
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
