import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { auditLogsTable, db } from "@workspace/db";
import { eq } from "drizzle-orm";

const { default: app } = await import("../app");

async function listen() {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

async function close(server: ReturnType<typeof app.listen>) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

test("parent signup rate limit uses the trusted client address, not a spoofed forwarded prefix", async () => {
  const { server, origin } = await listen();

  const trustedClientAddress = "203.0.113.44";
  const attempt = async (untrustedPrefix: string) => fetch(`${origin}/api/parent-signup`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `${untrustedPrefix}, ${trustedClientAddress}`,
    },
    body: JSON.stringify({}),
  });

  try {
    for (let index = 1; index <= 5; index += 1) {
      const response = await attempt(`198.51.100.${index}`);
      assert.equal(response.status, 400, `attempt ${index} should reach normal signup validation`);
    }

    const sixth = await attempt("192.0.2.88");
    assert.equal(
      sixth.status,
      429,
      "Changing the untrusted leftmost forwarded address must not reset the signup limit",
    );
  } finally {
    await close(server);
  }
});

test("every configured credential route applies its expected request limit", async () => {
  const { server, origin } = await listen();
  const routes = [
    { path: "/api/client-session/login", limit: 10 },
    { path: "/api/client-session/change-access-code", limit: 10 },
    { path: "/api/verify-client-credentials", limit: 10 },
    { path: "/api/clinician/login", limit: 10 },
    { path: "/api/mobile/clinician/login", limit: 10 },
    { path: "/api/clinician/change-password", limit: 10 },
    { path: "/api/clinician/register", limit: 10 },
    { path: "/api/mobile/clinician/register", limit: 10 },
    { path: "/api/mobile/auth/login", limit: 10 },
    { path: "/api/mobile/auth/change-access-code", limit: 10 },
    { path: "/api/login", limit: 10 },
    { path: "/api/client-access-code-reset/request", limit: 10 },
    { path: "/api/client-access-code-reset/complete", limit: 10 },
    { path: "/api/auth/password-reset/request", limit: 5 },
    { path: "/api/auth/password-reset/complete", limit: 8 },
  ];

  try {
    for (const [index, route] of routes.entries()) {
      const clientAddress = `198.51.100.${index + 1}`;
      const request = () => fetch(`${origin}${route.path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `192.0.2.199, ${clientAddress}`,
        },
        body: JSON.stringify({}),
      });

      for (let attemptNumber = 1; attemptNumber <= route.limit; attemptNumber += 1) {
        const response = await request();
        assert.notEqual(
          response.status,
          429,
          `${route.path} must allow its configured ${route.limit} attempts before throttling`,
        );
      }
      const blocked = await request();
      assert.equal(blocked.status, 429, `${route.path} must throttle attempt ${route.limit + 1}`);
      const payload = await blocked.json() as { error?: string };
      assert.equal(typeof payload.error, "string");
      assert.ok(!JSON.stringify(payload).includes("198.51.100") && !JSON.stringify(payload).includes("192.0.2"));
    }

    const routeAudits = await db.select().from(auditLogsTable).where(eq(auditLogsTable.action, "login_rate_limited"));
    const auditedPaths = new Set(routeAudits.map((row) =>
      (row.metadata as Record<string, unknown> | null)?.request_path,
    ));
    for (const route of routes.filter(({ path }) => [
      "/api/client-session/login",
      "/api/client-session/change-access-code",
      "/api/verify-client-credentials",
      "/api/clinician/login",
      "/api/mobile/clinician/login",
      "/api/clinician/change-password",
      "/api/clinician/register",
      "/api/mobile/clinician/register",
      "/api/mobile/auth/login",
      "/api/mobile/auth/change-access-code",
      "/api/login",
    ].includes(path))) {
      assert.ok(auditedPaths.has(route.path), `rate-limit event should identify ${route.path}`);
    }
  } finally {
    await close(server);
  }
});
