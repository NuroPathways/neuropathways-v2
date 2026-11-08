import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { test } from "node:test";
import { pendingClinicianAccessGuard } from "./pendingClinicianAccessGuard";

test("pending clinician sessions can only read their status or sign out", async (t) => {
  const app = express();
  app.use((req: any, _res, next) => {
    req.user = { id: "synthetic-pending-clinician", appRole: "pending_clinician" };
    next();
  });
  app.use(pendingClinicianAccessGuard);
  app.get("/api/users/me", (_req, res) => res.json({ appRole: "pending_clinician" }));
  app.patch("/api/users/me", (_req, res) => res.json({ ok: true }));
  app.all("/api/logout", (_req, res) => res.json({ ok: true }));
  app.get("/api/children", (_req, res) => res.json([{ id: "must-not-be-reached" }]));

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;

  assert.equal((await fetch(`${base}/api/users/me`)).status, 200);
  assert.equal((await fetch(`${base}/api/users/me`, { method: "PATCH" })).status, 200);
  assert.equal((await fetch(`${base}/api/logout`, { method: "POST" })).status, 200);
  const protectedResponse = await fetch(`${base}/api/children`);
  assert.equal(protectedResponse.status, 403);
  assert.equal((await protectedResponse.json() as { accountStatus?: string }).accountStatus, "pending_approval");
});

test("active clinician and parent roles are not blocked by the pending-access guard", async (t) => {
  const app = express();
  app.use((req: any, _res, next) => {
    req.user = { appRole: req.header("x-test-role") };
    next();
  });
  app.use(pendingClinicianAccessGuard);
  app.get("/api/records", (_req, res) => res.json({ ok: true }));

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/api/records`;
  for (const role of ["clinician", "parent"]) {
    const response = await fetch(url, { headers: { "x-test-role": role } });
    assert.equal(response.status, 200);
  }
});
