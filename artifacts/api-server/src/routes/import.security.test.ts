import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { test } from "node:test";
import importRouter from "./import";

test("bulk imports fail closed until role and ownership scoping is implemented", async (t) => {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { id: "isolated-security-test-user" };
    next();
  });
  app.use(importRouter);

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const response = await fetch(`http://127.0.0.1:${address.port}/import/User`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ records: [{ id: "synthetic-user" }] }),
  });

  assert.equal(response.status, 503);
  const payload = await response.json() as { error?: string };
  assert.match(payload.error ?? "", /temporarily unavailable/i);
});
