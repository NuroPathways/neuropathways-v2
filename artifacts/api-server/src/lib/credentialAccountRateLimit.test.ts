import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { test } from "node:test";
import {
  createCredentialAccountLimiter,
  credentialAccountRateLimitKey,
} from "./credentialAccountRateLimit";

test("account limiter keys are pseudonymous and include the action scope", () => {
  const key = credentialAccountRateLimitKey("Clinician-Login", "Example@Example.Test");
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.equal(key.includes("example"), false);
  assert.notEqual(key, credentialAccountRateLimitKey("parent-login", "Example@Example.Test"));
});

test("credential account budget recovers after its configured window", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setInterval"] });
  const app = express();
  app.use(express.json());
  const accountLimiter = createCredentialAccountLimiter({
    limit: 1,
    windowMs: 1_000,
    identity: (req) => {
      const account = req.get("x-synthetic-account");
      return account ? { scope: "test-login", identifier: account } : null;
    },
    onLimit: (_req, res) => {
      res.status(429).json({ error: "Too many attempts. Please try again later." });
    },
  });
  app.post("/login", accountLimiter, (_req, res) => res.status(401).json({ error: "Invalid credentials" }));
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const post = () => fetch(`http://127.0.0.1:${address.port}/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-synthetic-account": "fictional-window-reset@example.test",
      },
      body: "{}",
    });

    assert.equal((await post()).status, 401);
    const limited = await post();
    assert.equal(limited.status, 429);
    assert.deepEqual(await limited.json(), { error: "Too many attempts. Please try again later." });

    t.mock.timers.tick(1_001);
    assert.equal((await post()).status, 401);
  } finally {
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    t.mock.timers.reset();
  }
});
