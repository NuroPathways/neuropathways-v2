import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { test } from "node:test";
import clinicianEmailAuthRouter from "./clinician-email-auth";

test("web and mobile clinician registration require approval", async (t) => {
  const app = express();
  app.use(express.json());
  app.use(clinicianEmailAuthRouter);

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const body = JSON.stringify({
    email: "pending-clinician@example.test",
    password: "synthetic-test-password",
    accountHolderType: "clinician",
    accountHolderAgeGroup: "18_plus",
    adultOrGuardianConfirmed: true,
  });

  for (const route of ["/clinician/register", "/mobile/clinician/register"]) {
    const response = await fetch(`http://127.0.0.1:${address.port}${route}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    assert.equal(response.status, 403);
    const payload = await response.json() as { error?: string };
    assert.match(payload.error ?? "", /approval/i);
  }
});
