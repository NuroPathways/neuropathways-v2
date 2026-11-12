import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { once } from "node:events";
import { test } from "node:test";
import { ReplitConnectors } from "@replit/connectors-sdk";
import {
  auditLogsTable,
  childrenTable,
  clinicMembershipsTable,
  clinicianCredentialsTable,
  clinicsTable,
  db,
  familiesTable,
  parentAccountsTable,
  userProfilesTable,
  usersTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashClientAccessCode } from "../lib/clientAccessCode";
import { createClinicianPasswordHash } from "../lib/clinicianPassword";
import { hashParentPassword } from "../lib/parentAuth";

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

    const accountName = `synthetic-parent-signup-${crypto.randomUUID()}`;
    const accountStatuses: number[] = [];
    for (let index = 0; index < 5; index += 1) {
      const response = await fetch(`${origin}/api/parent-signup`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `192.0.2.199, 203.0.113.${160 + index}`,
        },
        body: JSON.stringify({ username: accountName }),
      });
      accountStatuses.push(response.status);
      await response.arrayBuffer();
    }
    const accountSixth = await fetch(`${origin}/api/parent-signup`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "192.0.2.199, 203.0.113.165",
      },
      body: JSON.stringify({ username: accountName.toUpperCase() }),
    });
    accountStatuses.push(accountSixth.status);
    await accountSixth.arrayBuffer();
    assert.equal(accountStatuses.slice(0, 5).every((status) => status !== 429), true);
    assert.equal(accountStatuses[5], 429, "legacy signup must throttle one normalized username across IP changes");
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
    { path: "/api/parent/auth/login", limit: 60 },
    { path: "/api/parent/auth/register", limit: 20 },
    { path: "/api/parent/auth/change-password", limit: 5 },
    { path: "/api/parent-signup", limit: 5 },
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

test("registration and reset endpoints enforce account budgets across IP changes", async () => {
  const { server, origin } = await listen();
  const suffix = crypto.randomUUID();
  const clinicianEmail = `synthetic-register-${suffix}@example.test`;
  const parentEmail = `synthetic-parent-register-${suffix}@example.test`;
  const resetEmail = `synthetic-reset-request-${suffix}@example.test`;
  const accessToken = `fictional-access-token-${suffix}`;
  const childId = crypto.randomUUID();
  const evidence: Record<string, unknown> = {};
  const request = (path: string, ip: string, body: Record<string, unknown>) => fetch(`${origin}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `192.0.2.199, ${ip}`,
    },
    body: JSON.stringify(body),
  });
  try {
    const clinicianStatuses: number[] = [];
    for (let index = 0; index < 10; index += 1) {
      const path = index < 5 ? "/api/clinician/register" : "/api/mobile/clinician/register";
      const response = await request(path, `203.0.113.${40 + index}`, {
        email: index % 2 ? clinicianEmail.toUpperCase() : clinicianEmail,
        password: "",
      });
      clinicianStatuses.push(response.status);
      await response.arrayBuffer();
    }
    const clinicianThreshold = await request("/api/clinician/register", "203.0.113.50", {
      email: clinicianEmail,
      password: "",
    });
    const clinicianThresholdStatus = clinicianThreshold.status;
    await clinicianThreshold.arrayBuffer();

    const parentRegistrationStatuses: number[] = [];
    for (let index = 0; index < 10; index += 1) {
      const response = await request("/api/parent/auth/register", `198.51.100.${40 + index}`, {
        email: parentEmail,
      });
      parentRegistrationStatuses.push(response.status);
      await response.arrayBuffer();
    }
    const parentRegistrationThreshold = await request("/api/parent/auth/register", "198.51.100.50", {
      email: parentEmail.toUpperCase(),
    });
    const parentRegistrationThresholdStatus = parentRegistrationThreshold.status;
    await parentRegistrationThreshold.arrayBuffer();

    const resetRequestStatuses: number[] = [];
    for (let index = 0; index < 5; index += 1) {
      const response = await request("/api/auth/password-reset/request", `203.0.113.${60 + index}`, {
        email: resetEmail,
        accountType: "parent",
      });
      resetRequestStatuses.push(response.status);
      await response.arrayBuffer();
    }
    const resetRequestThreshold = await request("/api/auth/password-reset/request", "203.0.113.65", {
      email: resetEmail,
      accountType: "parent",
    });
    const resetRequestThresholdStatus = resetRequestThreshold.status;
    await resetRequestThreshold.arrayBuffer();

    const clientResetRequestStatuses: number[] = [];
    for (let index = 0; index < 10; index += 1) {
      const response = await request("/api/client-access-code-reset/request", `198.51.100.${60 + index}`, {
        child_id: childId,
      });
      clientResetRequestStatuses.push(response.status);
      await response.arrayBuffer();
    }
    const clientResetRequestThreshold = await request("/api/client-access-code-reset/request", "198.51.100.70", {
      child_id: childId,
    });
    const clientResetRequestThresholdStatus = clientResetRequestThreshold.status;
    await clientResetRequestThreshold.arrayBuffer();

    const accessResetCompleteStatuses: number[] = [];
    for (let index = 0; index < 10; index += 1) {
      const response = await request("/api/client-access-code-reset/complete", `203.0.113.${80 + index}`, {
        token: accessToken,
        new_access_code: "FictionalCode-38",
      });
      accessResetCompleteStatuses.push(response.status);
      await response.arrayBuffer();
    }
    const accessResetCompleteThreshold = await request("/api/client-access-code-reset/complete", "203.0.113.90", {
      token: accessToken,
      new_access_code: "FictionalCode-38",
    });
    const accessResetCompleteThresholdStatus = accessResetCompleteThreshold.status;
    const accessThresholdBody = await accessResetCompleteThreshold.text();

    const auditRows = await db.select().from(auditLogsTable)
      .where(eq(auditLogsTable.action, "credential_account_rate_limited"));
    const auditPayload = JSON.stringify(auditRows);
    Object.assign(evidence, {
      clinicianRegistrationStatuses: clinicianStatuses,
      clinicianRegistrationThresholdStatus: clinicianThresholdStatus,
      parentRegistrationStatuses,
      parentRegistrationThresholdStatus,
      resetRequestStatuses,
      resetRequestThresholdStatus,
      clientResetRequestStatuses,
      clientResetRequestThresholdStatus,
      clientResetCompletionStatuses: accessResetCompleteStatuses,
      clientResetCompletionThresholdStatus: accessResetCompleteThresholdStatus,
      thresholdBodyContainsCredential: accessThresholdBody.includes(accessToken) ||
        accessThresholdBody.includes(clinicianEmail) ||
        accessThresholdBody.includes(parentEmail) || accessThresholdBody.includes(resetEmail),
      auditContainsCredential: auditPayload.includes(accessToken) ||
        auditPayload.includes(clinicianEmail) ||
        auditPayload.includes(parentEmail) || auditPayload.includes(resetEmail),
      rateLimitAuditPaths: auditRows.map((row) => row.targetId),
    });
    const evidenceDir = process.env.P0_ACCESS_EVIDENCE_DIR;
    if (evidenceDir) {
      await fs.writeFile(`${evidenceDir}/registration-and-reset-throttle-results.json`, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
    }
    assert.equal(clinicianStatuses.every((status) => status !== 429), true);
    assert.equal(clinicianThresholdStatus, 429, "web and mobile clinician registration should share a normalized email budget");
    assert.equal(parentRegistrationStatuses.every((status) => status !== 429), true);
    assert.equal(parentRegistrationThresholdStatus, 429);
    assert.deepEqual(resetRequestStatuses, Array(5).fill(202));
    assert.equal(resetRequestThresholdStatus, 429);
    assert.deepEqual(clientResetRequestStatuses, Array(10).fill(401));
    assert.equal(clientResetRequestThresholdStatus, 429);
    assert.deepEqual(accessResetCompleteStatuses, Array(10).fill(400));
    assert.equal(accessResetCompleteThresholdStatus, 429);
    assert.equal(evidence.thresholdBodyContainsCredential, false);
    assert.equal(evidence.auditContainsCredential, false);
  } finally {
    await close(server);
  }
});

test("one clinician account cannot evade its credential-attempt budget by changing IP or login surface", async () => {
  const { server, origin } = await listen();
  const suffix = crypto.randomUUID();
  const email = `synthetic-${suffix}@example.test`;
  const password = `fictional-password-${suffix}`;
  const results: Record<string, unknown> = {
    scenario: "same synthetic clinician email, case/whitespace variants and web/mobile login surfaces",
    accountAttempts: [],
    separateAccountStatus: null,
    sharedIpStatuses: [],
    rateLimitResponseContainsCredential: null,
    accountLimitAuditRows: [],
  };
  const post = async (path: string, ip: string, body: Record<string, string>) => fetch(`${origin}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `192.0.2.199, ${ip}`,
    },
    body: JSON.stringify(body),
  });

  try {
    const attemptStatuses: number[] = [];
    for (let index = 0; index < 10; index += 1) {
      const emailVariant = index % 2 === 0 ? email : `  ${email.toUpperCase()}  `;
      const path = index % 2 === 0 ? "/api/clinician/login" : "/api/mobile/clinician/login";
      const response = await post(path, `203.0.113.${101 + index}`, {
        email: emailVariant,
        password,
      });
      attemptStatuses.push(response.status);
      await response.arrayBuffer();
    }
    const accountBlocked = await post("/api/clinician/login", "203.0.113.111", {
      email: ` ${email.toUpperCase()} `,
      password,
    });
    const blockedBody = await accountBlocked.text();
    const separateAccount = await post("/api/clinician/login", "203.0.113.112", {
      email: `other-${suffix}@example.test`,
      password,
    });
    const separateAccountStatus = separateAccount.status;
    await separateAccount.arrayBuffer();

    const sharedIpStatuses: number[] = [];
    for (let index = 0; index < 11; index += 1) {
      const response = await post("/api/clinician/login", "198.51.100.220", {
        email: `shared-ip-${index}-${suffix}@example.test`,
        password,
      });
      sharedIpStatuses.push(response.status);
      await response.arrayBuffer();
    }

    const accountLimitAuditRows = await db.select().from(auditLogsTable)
      .where(eq(auditLogsTable.action, "credential_account_rate_limited"));
    const accountAuditPayload = JSON.stringify(accountLimitAuditRows);
    Object.assign(results, {
      accountAttempts: attemptStatuses,
      sameAccountChangedIpStatus: accountBlocked.status,
      separateAccountStatus,
      sharedIpStatuses,
      rateLimitResponseContainsCredential:
        blockedBody.includes(email) || blockedBody.includes(password),
      rateLimitResponseIsGeneric:
        blockedBody === '{"error":"Too many attempts. Please try again later."}',
      accountLimitAuditRows: accountLimitAuditRows.map((row) => ({
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        success: row.success,
        metadata: row.metadata,
      })),
      accountAuditContainsCredential:
        accountAuditPayload.includes(email) || accountAuditPayload.includes(password),
    });

    const evidenceDir = process.env.P0_ACCESS_EVIDENCE_DIR;
    if (evidenceDir) {
      await fs.writeFile(
        `${evidenceDir}/credential-account-throttle-results.json`,
        `${JSON.stringify(results, null, 2)}\n`,
        { mode: 0o600 },
      );
    }

    assert.deepEqual(attemptStatuses, Array(10).fill(401));
    assert.equal(accountBlocked.status, 429, "the same normalized account must remain throttled across IPs and web/mobile login aliases");
    assert.equal(separateAccountStatus, 401, "a separate account must retain its own account budget");
    assert.deepEqual(sharedIpStatuses.slice(0, 10), Array(10).fill(401));
    assert.equal(sharedIpStatuses[10], 429, "the IP limiter must still block one source rotating account names");
    assert.equal(results.rateLimitResponseContainsCredential, false);
    assert.equal(results.rateLimitResponseIsGeneric, true);
    assert.equal(results.accountAuditContainsCredential, false);
    assert.ok(accountLimitAuditRows.some((row) =>
      row.targetType === "auth_route" &&
      row.targetId === "/api/clinician/login" &&
      row.success === false,
    ), "the account limiter must create a sanitized denial audit event");
  } finally {
    await close(server);
  }
});

test("a synthetic clinician can sign in below the account threshold and is throttled only after ten attempts", async () => {
  const { server, origin } = await listen();
  const suffix = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const clinicId = crypto.randomUUID();
  const tenantId = `synthetic-tenant-${suffix}`;
  const email = `verified-clinician-${suffix}@example.test`;
  const password = `valid-fictional-${suffix}-P@ss`;
  const evidence: Record<string, unknown> = {};
  try {
    await db.insert(usersTable).values({
      id: userId,
      email,
      firstName: "Fictional",
      lastName: "Clinician",
    });
    await db.insert(userProfilesTable).values({
      id: userId,
      appRole: "clinician",
      accountType: "clinician",
      tenantId,
      displayName: "Fictional Clinician",
    });
    await db.insert(clinicsTable).values({
      id: clinicId,
      displayName: "Synthetic Credential Test Clinic",
      legacyTenantId: tenantId,
      status: "active",
    });
    await db.insert(clinicMembershipsTable).values({
      clinicId,
      userId,
      role: "treating_clinician",
      status: "active",
    });
    await db.insert(clinicianCredentialsTable).values({
      userId,
      email,
      passwordHash: await createClinicianPasswordHash(password),
    });

    const statuses: number[] = [];
    let knownInvalidBody = "";
    for (let index = 0; index < 9; index += 1) {
      const response = await fetch(`${origin}/api/clinician/login`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `192.0.2.199, 203.0.113.${140 + index}`,
        },
        body: JSON.stringify({ email: ` ${email.toUpperCase()} `, password: "wrong-fictional-password" }),
      });
      statuses.push(response.status);
      const body = await response.text();
      if (index === 0) knownInvalidBody = body;
    }
    const unknownLogin = await fetch(`${origin}/api/clinician/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "192.0.2.199, 203.0.113.139",
      },
      body: JSON.stringify({ email: `missing-${suffix}@example.test`, password: "wrong-fictional-password" }),
    });
    const unknownLoginBody = await unknownLogin.text();
    const valid = await fetch(`${origin}/api/clinician/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "192.0.2.199, 203.0.113.149",
      },
      body: JSON.stringify({ email: ` ${email.toUpperCase()} `, password }),
    });
    const validStatus = valid.status;
    await valid.arrayBuffer();
    const clinicianCookie = valid.headers.get("set-cookie")?.split(";")[0];
    assert.ok(clinicianCookie, "valid synthetic clinician login should establish a session");
    const blocked = await fetch(`${origin}/api/clinician/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "192.0.2.199, 203.0.113.150",
      },
      body: JSON.stringify({ email, password }),
    });
    const blockedBody = await blocked.text();
    const passwordChangeStatuses: number[] = [];
    for (let index = 0; index < 5; index += 1) {
      const response = await fetch(`${origin}/api/clinician/change-password`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: clinicianCookie!,
          "x-forwarded-for": `192.0.2.199, 203.0.113.${170 + index}`,
        },
        body: JSON.stringify({ current_password: "wrong-current-password", new_password: "new-fictional-password-123" }),
      });
      passwordChangeStatuses.push(response.status);
      await response.arrayBuffer();
    }
    const passwordChangeThreshold = await fetch(`${origin}/api/clinician/change-password`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: clinicianCookie!,
        "x-forwarded-for": "192.0.2.199, 203.0.113.175",
      },
      body: JSON.stringify({ current_password: "wrong-current-password", new_password: "new-fictional-password-123" }),
    });
    const passwordChangeThresholdStatus = passwordChangeThreshold.status;
    const passwordChangeThresholdBody = await passwordChangeThreshold.text();
    const auditRows = await db.select().from(auditLogsTable)
      .where(eq(auditLogsTable.action, "credential_account_rate_limited"));
    const failedLoginRows = await db.select().from(auditLogsTable)
      .where(eq(auditLogsTable.action, "failed_login"));
    const auditPayload = JSON.stringify([...auditRows, ...failedLoginRows]);
    Object.assign(evidence, {
      wrongPasswordStatuses: statuses,
      knownVsUnknownInvalidLoginResponseSame:
        unknownLogin.status === statuses[0] && unknownLoginBody === knownInvalidBody,
      validLoginStatus: validStatus,
      thresholdStatus: blocked.status,
      genericRateLimitResponse: blockedBody === '{"error":"Too many attempts. Please try again later."}',
      passwordChangeStatuses,
      passwordChangeThresholdStatus,
      passwordChangeThresholdBodyContainsCredential:
        passwordChangeThresholdBody.includes(email) || passwordChangeThresholdBody.includes(password),
      auditCount: auditRows.length,
      auditPathRecorded: auditRows.some((row) => row.targetId === "/api/clinician/login"),
      auditContainsCredentials: auditPayload.includes(email) || auditPayload.includes(password),
    });
    const evidenceDir = process.env.P0_ACCESS_EVIDENCE_DIR;
    if (evidenceDir) {
      await fs.writeFile(`${evidenceDir}/valid-clinician-login-results.json`, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
    }
    assert.deepEqual(statuses, Array(9).fill(401));
    assert.equal(evidence.knownVsUnknownInvalidLoginResponseSame, true);
    assert.equal(validStatus, 200, "a correct password must still work before the account threshold");
    assert.deepEqual(passwordChangeStatuses, Array(5).fill(401));
    assert.equal(passwordChangeThresholdStatus, 429);
    assert.equal(evidence.passwordChangeThresholdBodyContainsCredential, false);
    assert.equal(blocked.status, 429);
    assert.equal(evidence.genericRateLimitResponse, true);
    assert.equal(evidence.auditContainsCredentials, false);
    assert.equal(evidence.auditPathRecorded, true);
  } finally {
    await close(server);
  }
});

test("family username aliases share a normalized account budget while valid sign-in still works", async () => {
  const { server, origin } = await listen();
  const suffix = crypto.randomUUID();
  const familyId = crypto.randomUUID();
  const childId = crypto.randomUUID();
  const username = `synthetic-client-${suffix}`;
  const accessCode = `Client-${suffix}-4827`;
  const evidence: Record<string, unknown> = {};
  const post = async (path: string, index: number, body: Record<string, string>) => fetch(`${origin}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `192.0.2.199, 198.51.100.${101 + index}`,
    },
    body: JSON.stringify(body),
  });
  try {
    await db.insert(familiesTable).values({
      id: familyId,
      familyName: "Fictional Standalone Family",
      accountType: "independent",
    });
    await db.insert(childrenTable).values({
      id: childId,
      familyId,
      childName: "Fictional Standalone Child",
      username,
      accessCode: await hashClientAccessCode(accessCode),
      accountType: "independent",
      status: "active",
    });

    const attempts: Array<{ status: number; bodyError?: string | null }> = [];
    for (let index = 0; index < 9; index += 1) {
      const path = index % 2 === 0 ? "/api/client-session/login" : "/api/verify-client-credentials";
      const response = await post(path, index, {
        username: index % 2 === 0 ? ` ${username.toUpperCase()} ` : username,
        access_code: "wrong-fictional-access-code",
      });
      const body = await response.json() as { error?: string };
      attempts.push({ status: response.status, bodyError: body.error ?? null });
    }
    const valid = await post("/api/client-session/login", 9, {
      username: ` ${username.toUpperCase()} `,
      access_code: accessCode,
    });
    const validStatus = valid.status;
    const validBody = await valid.json() as { id?: string; invite_token?: string };
    const blocked = await post("/api/verify-client-credentials", 10, {
      username,
      access_code: accessCode,
    });
    const blockedBody = await blocked.text();
    const changeCodeBlocked = await post("/api/client-session/change-access-code", 12, {
      username,
      current_access_code: accessCode,
      new_access_code: `New-${suffix}-6754`,
    });
    const changeCodeBlockedStatus = changeCodeBlocked.status;
    const changeCodeBlockedBody = await changeCodeBlocked.text();

    const mobileFamilyId = crypto.randomUUID();
    const mobileChildId = crypto.randomUUID();
    const mobileUsername = `synthetic-mobile-${suffix}`;
    const mobileAccessCode = `Mobile-${suffix}-6341`;
    await db.insert(familiesTable).values({
      id: mobileFamilyId,
      familyName: "Fictional Mobile Family",
      accountType: "independent",
    });
    await db.insert(childrenTable).values({
      id: mobileChildId,
      familyId: mobileFamilyId,
      childName: "Fictional Mobile Child",
      username: mobileUsername,
      accessCode: await hashClientAccessCode(mobileAccessCode),
      accountType: "individual",
      status: "active",
    });
    const mobileLogin = await post("/api/mobile/auth/login", 11, {
      username: mobileUsername,
      access_code: mobileAccessCode,
    });
    const mobileLoginBody = await mobileLogin.json() as { token?: string };
    assert.ok(mobileLoginBody.token);
    const mobileChange = async (index: number, current_access_code: string) => fetch(
      `${origin}/api/mobile/auth/change-access-code`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-mobile-token": mobileLoginBody.token!,
          "x-forwarded-for": `192.0.2.199, 198.51.100.${120 + index}`,
        },
        body: JSON.stringify({ current_access_code, new_access_code: `Updated-${suffix}-8745` }),
      },
    );
    const mobileChangeStatuses: number[] = [];
    for (let index = 0; index < 9; index += 1) {
      const response = await mobileChange(index, "wrong-mobile-code");
      mobileChangeStatuses.push(response.status);
      await response.arrayBuffer();
    }
    const mobileChangeValid = await mobileChange(9, mobileAccessCode);
    const mobileChangeValidStatus = mobileChangeValid.status;
    await mobileChangeValid.arrayBuffer();
    const mobileChangeBlocked = await mobileChange(10, mobileAccessCode);
    const mobileChangeBlockedStatus = mobileChangeBlocked.status;
    const mobileChangeBlockedBody = await mobileChangeBlocked.text();
    const auditRows = await db.select().from(auditLogsTable)
      .where(eq(auditLogsTable.action, "credential_account_rate_limited"));
    const auditPayload = JSON.stringify(auditRows);
    Object.assign(evidence, {
      attemptStatuses: attempts.map(({ status }) => status),
      invalidBodyStatusVariants: [...new Set(attempts.map(({ status }) => status))],
      validLoginStatus: validStatus,
      validChildMatchesFixture: validBody.id === childId,
      crossAliasThresholdStatus: blocked.status,
      thresholdBodyContainsCredential: blockedBody.includes(username) || blockedBody.includes(accessCode),
      changeCodeAliasThresholdStatus: changeCodeBlockedStatus,
      changeCodeThresholdBodyContainsCredential:
        changeCodeBlockedBody.includes(username) || changeCodeBlockedBody.includes(accessCode),
      mobileLoginStatus: mobileLogin.status,
      mobileWrongCodeStatuses: mobileChangeStatuses,
      mobileValidCodeChangeStatus: mobileChangeValidStatus,
      mobileCodeChangeThresholdStatus: mobileChangeBlockedStatus,
      mobileThresholdBodyContainsCredential: mobileChangeBlockedBody.includes(mobileAccessCode),
      clientRouteAuditRecorded: auditRows.some((row) => row.targetId === "/api/verify-client-credentials"),
      clientChangeRouteAuditRecorded: auditRows.some((row) => row.targetId === "/api/client-session/change-access-code"),
      mobileChangeAuditRecorded: auditRows.some((row) => row.targetId === "/api/mobile/auth/change-access-code"),
      auditContainsCredential: auditPayload.includes(username) || auditPayload.includes(accessCode),
      auditContainsMobileCredential: auditPayload.includes(mobileUsername) || auditPayload.includes(mobileAccessCode),
    });
    const evidenceDir = process.env.P0_ACCESS_EVIDENCE_DIR;
    if (evidenceDir) {
      await fs.writeFile(`${evidenceDir}/valid-client-login-results.json`, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
    }
    assert.equal(attempts.length, 9);
    assert.equal(attempts.every((attempt) => attempt.bodyError !== null), true);
    assert.equal(validStatus, 200);
    assert.equal(evidence.validChildMatchesFixture, true);
    assert.equal(blocked.status, 429, "legacy client login aliases must share one normalized username budget");
    assert.equal(evidence.thresholdBodyContainsCredential, false);
    assert.equal(changeCodeBlockedStatus, 429, "access-code changes must not bypass the same family credential budget");
    assert.equal(evidence.changeCodeThresholdBodyContainsCredential, false);
    assert.equal(mobileLogin.status, 200);
    assert.deepEqual(mobileChangeStatuses, Array(9).fill(401));
    assert.equal(mobileChangeValidStatus, 200);
    assert.equal(mobileChangeBlockedStatus, 429);
    assert.equal(evidence.mobileThresholdBodyContainsCredential, false);
    assert.equal(evidence.clientRouteAuditRecorded, true);
    assert.equal(evidence.clientChangeRouteAuditRecorded, true);
    assert.equal(evidence.mobileChangeAuditRecorded, true);
    assert.equal(evidence.auditContainsCredential, false);
    assert.equal(evidence.auditContainsMobileCredential, false);
  } finally {
    await close(server);
  }
});

test("GE-SEC-099 mobile family login applies the normalized account budget across aliases and expires", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setInterval"] });
  const { server, origin } = await listen();
  const suffix = crypto.randomUUID();
  const familyId = crypto.randomUUID();
  const childId = crypto.randomUUID();
  const separateFamilyId = crypto.randomUUID();
  const separateChildId = crypto.randomUUID();
  const username = `synthetic-mobile-threshold-${suffix}`;
  const accessCode = `Fictional-${suffix}-4827`;
  const separateUsername = `synthetic-mobile-separate-${suffix}`;
  const separateAccessCode = `Separate-${suffix}-5291`;
  const aliases = [
    "/api/mobile/auth/login",
    "/api/client-session/login",
    "/api/verify-client-credentials",
  ];
  const request = async (
    route: string,
    ip: string,
    loginName: string,
    loginCode: string,
  ) => fetch(`${origin}${route}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `192.0.2.199, ${ip}`,
    },
    body: JSON.stringify({ username: loginName, access_code: loginCode }),
  });
  const evidence: Record<string, unknown> = {};

  try {
    await db.insert(familiesTable).values([
      {
        id: familyId,
        familyName: "Fictional mobile login family",
        accountType: "independent",
      },
      {
        id: separateFamilyId,
        familyName: "Fictional separate mobile family",
        accountType: "independent",
      },
    ]);
    await db.insert(childrenTable).values([
      {
        id: childId,
        familyId,
        childName: "Fictional mobile login child",
        username,
        accessCode: await hashClientAccessCode(accessCode),
        accountType: "independent",
        status: "active",
      },
      {
        id: separateChildId,
        familyId: separateFamilyId,
        childName: "Fictional separate mobile child",
        username: separateUsername,
        accessCode: await hashClientAccessCode(separateAccessCode),
        accountType: "independent",
        status: "active",
      },
    ]);

    const accountStatuses: number[] = [];
    const accountBodies: string[] = [];
    for (let index = 0; index < 10; index += 1) {
      const route = aliases[index % aliases.length];
      const accountName = index % 2 === 0 ? username.toUpperCase() : `  ${username}  `;
      const response = await request(
        route,
        `203.0.113.${101 + index}`,
        accountName,
        "wrong-fictional-access-code",
      );
      accountStatuses.push(response.status);
      accountBodies.push(await response.text());
    }

    const separateAccount = await request(
      "/api/mobile/auth/login",
      "203.0.113.120",
      separateUsername,
      separateAccessCode,
    );
    const separateAccountBody = await separateAccount.text();
    const separateAccountJson = JSON.parse(separateAccountBody) as {
      child?: { id?: string };
      token?: string;
    };
    const thresholdResponse = await request(
      "/api/mobile/auth/login",
      "203.0.113.121",
      ` ${username.toUpperCase()} `,
      accessCode,
    );
    const thresholdBody = await thresholdResponse.text();

    const unknownAccountStatuses: number[] = [];
    const unknownAccountBodies: string[] = [];
    const unknownUsername = `synthetic-mobile-unknown-${suffix}`;
    for (let index = 0; index < 10; index += 1) {
      const response = await request(
        "/api/mobile/auth/login",
        `198.51.100.${101 + index}`,
        unknownUsername.toUpperCase(),
        "wrong-fictional-access-code",
      );
      unknownAccountStatuses.push(response.status);
      unknownAccountBodies.push(await response.text());
    }
    const unknownThreshold = await request(
      "/api/mobile/auth/login",
      "198.51.100.111",
      unknownUsername,
      "wrong-fictional-access-code",
    );
    const unknownThresholdBody = await unknownThreshold.text();

    const rotatingAccountStatuses: number[] = [];
    for (let index = 0; index < 11; index += 1) {
      const response = await request(
        "/api/mobile/auth/login",
        "192.0.2.221",
        `synthetic-ip-rotation-${index}-${suffix}`,
        "wrong-fictional-access-code",
      );
      rotatingAccountStatuses.push(response.status);
      await response.arrayBuffer();
    }

    const auditRows = await db.select().from(auditLogsTable)
      .where(eq(auditLogsTable.action, "credential_account_rate_limited"));
    const failedLoginRows = await db.select().from(auditLogsTable)
      .where(eq(auditLogsTable.action, "failed_login"));
    const auditPayload = JSON.stringify([...auditRows, ...failedLoginRows]);
    const accountAuditPaths = auditRows
      .map((row) => (row.metadata as Record<string, unknown> | null)?.request_path)
      .filter((value): value is string => typeof value === "string");
    const genericResponse = '{"error":"Too many attempts. Please try again later."}';

    t.mock.timers.tick(15 * 60 * 1000 + 1);
    const afterWindow = await request(
      "/api/mobile/auth/login",
      "192.0.2.250",
      ` ${username.toUpperCase()} `,
      accessCode,
    );
    const afterWindowBody = await afterWindow.json() as { child?: { id?: string }; token?: string };

    Object.assign(evidence, {
      scenario: "GE-SEC-099",
      accountAttemptStatuses: accountStatuses,
      accountAttemptsReturnedGenericDenial: accountBodies.every((body) => {
        const payload = JSON.parse(body) as Record<string, unknown>;
        return typeof payload.error === "string" &&
          !("session" in payload) &&
          !("token" in payload);
      }),
      accountAliasRoutesExercised: aliases,
      accountAliasInputsNormalized: true,
      accountThresholdStatus: thresholdResponse.status,
      genericAccountThresholdResponse: thresholdBody === genericResponse,
      separateAccountStatus: separateAccount.status,
      separateAccountReceivedItsOwnToken: Boolean(separateAccountJson.token),
      separateAccountMatchedFixture: separateAccountJson.child?.id === separateChildId,
      unknownAccountAttemptStatuses: unknownAccountStatuses,
      knownAndUnknownFirstResponseBodiesMatch: accountBodies[0] === unknownAccountBodies[0],
      unknownThresholdStatus: unknownThreshold.status,
      knownAndUnknownThresholdBodiesMatch: thresholdBody === unknownThresholdBody,
      rotatingAccountStatuses,
      ipThresholdStatus: rotatingAccountStatuses[10],
      afterWindowStatus: afterWindow.status,
      afterWindowMatchedFixture: afterWindowBody.child?.id === childId,
      afterWindowIssuedToken: Boolean(afterWindowBody.token),
      auditedRequestPaths: [...new Set(accountAuditPaths)],
      auditContainsAccountOrCredential: auditPayload.includes(username) ||
        auditPayload.includes(accessCode) ||
        auditPayload.includes(separateUsername) ||
        auditPayload.includes(separateAccessCode) ||
        auditPayload.includes(unknownUsername),
      rateLimitedAuditEventCount: auditRows.length,
      failedLoginAuditEventCount: failedLoginRows.length,
    });

    const evidenceDir = process.env.P0_ACCESS_EVIDENCE_DIR;
    if (evidenceDir) {
      await fs.writeFile(
        `${evidenceDir}/mobile-login-account-threshold-results.json`,
        `${JSON.stringify(evidence, null, 2)}\n`,
        { mode: 0o600 },
      );
    }

    assert.equal(evidence.accountAttemptsReturnedGenericDenial, true,
      "all aliases must return a denial body without issuing a session or token");
    assert.deepEqual(accountStatuses, [401, 401, 200, 401, 401, 200, 401, 401, 200, 401],
      "the legacy verification alias uses HTTP 200 for a generic invalid-credential error response");
    assert.equal(thresholdResponse.status, 429);
    assert.equal(evidence.genericAccountThresholdResponse, true);
    assert.equal(evidence.separateAccountStatus, 200, "a different family account must have an independent counter");
    assert.equal(evidence.separateAccountReceivedItsOwnToken, true);
    assert.equal(evidence.separateAccountMatchedFixture, true);
    assert.deepEqual(unknownAccountStatuses, Array(10).fill(401));
    assert.equal(accountBodies[0], unknownAccountBodies[0], "known and unknown accounts must have indistinguishable invalid-login responses");
    assert.equal(unknownThreshold.status, 429);
    assert.equal(thresholdBody, unknownThresholdBody, "known and unknown account throttles must use the same generic response");
    assert.deepEqual(rotatingAccountStatuses.slice(0, 10), Array(10).fill(401));
    assert.equal(rotatingAccountStatuses[10], 429, "IP throttling must remain effective while an attacker rotates account names");
    assert.equal(afterWindow.status, 200, "a legitimate login must work after the configured account/IP window expires");
    assert.equal(evidence.afterWindowMatchedFixture, true);
    assert.equal(evidence.afterWindowIssuedToken, true);
    assert.ok(accountAuditPaths.includes("/api/mobile/auth/login"), "the mobile threshold must create a route-specific audit event");
    assert.equal(evidence.auditContainsAccountOrCredential, false);
    assert.ok(Number(evidence.rateLimitedAuditEventCount) >= 3);
  } finally {
    t.mock.timers.reset();
    await close(server);
  }
});

test("a fake email provider supports a complete parent password-recovery flow without network access", async () => {
  const { server, origin } = await listen();
  const suffix = crypto.randomUUID();
  const parentId = crypto.randomUUID();
  const email = `recovery-parent-${suffix}@example.test`;
  const oldPassword = `old-fictional-${suffix}-Pass`;
  const newPassword = `new-fictional-${suffix}-Pass`;
  const prototype = ReplitConnectors.prototype as any;
  const originalProxy = prototype.proxy;
  const sentEmails: Array<{ text?: string; html?: string }> = [];
  const evidence: Record<string, unknown> = {};
  try {
    prototype.proxy = async (_service: string, _path: string, options: { body?: string }) => {
      sentEmails.push(JSON.parse(options.body ?? "{}"));
      return { ok: true };
    };
    await db.insert(parentAccountsTable).values({
      id: parentId,
      email,
      firstName: "Fictional Parent",
      workspaceId: `synthetic-workspace-${suffix}`,
      passwordHash: await hashParentPassword(oldPassword),
    });
    const enumerationParentId = crypto.randomUUID();
    const enumerationEmail = `known-account-${suffix}@example.test`;
    await db.insert(parentAccountsTable).values({
      id: enumerationParentId,
      email: enumerationEmail,
      firstName: "Fictional Enumeration Control",
      workspaceId: `synthetic-enumeration-workspace-${suffix}`,
      passwordHash: await hashParentPassword(oldPassword),
    });

    const requestReset = await fetch(`${origin}/api/auth/password-reset/request`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.199, 192.0.2.210" },
      body: JSON.stringify({ email: email.toUpperCase(), accountType: "parent" }),
    });
    const requestMessage = await requestReset.text();
    const unknownReset = await fetch(`${origin}/api/auth/password-reset/request`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.199, 203.0.113.209" },
      body: JSON.stringify({ email: `missing-${suffix}@example.test`, accountType: "parent" }),
    });
    const unknownResetMessage = await unknownReset.text();
    const additionalResetStatuses: number[] = [];
    for (let index = 0; index < 4; index += 1) {
      const response = await fetch(`${origin}/api/auth/password-reset/request`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `192.0.2.199, 203.0.113.${213 + index}`,
        },
        body: JSON.stringify({ email, accountType: "parent" }),
      });
      additionalResetStatuses.push(response.status);
      await response.arrayBuffer();
    }
    const resetThreshold = await fetch(`${origin}/api/auth/password-reset/request`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.199, 203.0.113.217" },
      body: JSON.stringify({ email, accountType: "parent" }),
    });
    const resetThresholdStatus = resetThreshold.status;
    await resetThreshold.arrayBuffer();
    for (let tries = 0; tries < 50 && sentEmails.length < 5; tries += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.ok(sentEmails.length > 0, "the fake email adapter should receive the reset request");
    const latestSentEmail = sentEmails.at(-1);
    assert.ok(latestSentEmail, "the fake adapter should retain the newest one-time reset link");
    const resetUrlLine = latestSentEmail.text?.split("\n").find((line: string) => line.startsWith("Reset your password: "));
    assert.ok(resetUrlLine, "the fake adapter should receive a reset link");
    const resetUrl = new URL(resetUrlLine!.slice("Reset your password: ".length));
    const token = new URLSearchParams(resetUrl.hash.slice(1)).get("token");
    assert.ok(token, "the reset link should contain its one-time token");

    const completion = await fetch(`${origin}/api/auth/password-reset/complete`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.199, 192.0.2.211" },
      body: JSON.stringify({ token, newPassword }),
    });
    const completionBody = await completion.text();
    const resetReplayStatuses: number[] = [];
    for (let index = 0; index < 7; index += 1) {
      const response = await fetch(`${origin}/api/auth/password-reset/complete`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `192.0.2.199, 203.0.113.${230 + index}`,
        },
        body: JSON.stringify({ token, newPassword }),
      });
      resetReplayStatuses.push(response.status);
      await response.arrayBuffer();
    }
    const resetReplayThreshold = await fetch(`${origin}/api/auth/password-reset/complete`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.199, 203.0.113.237" },
      body: JSON.stringify({ token, newPassword }),
    });
    const resetReplayThresholdStatus = resetReplayThreshold.status;
    await resetReplayThreshold.arrayBuffer();
    const login = await fetch(`${origin}/api/parent/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.199, 192.0.2.212" },
      body: JSON.stringify({ email, password: newPassword }),
    });
    await login.arrayBuffer();
    const parentCookie = login.headers.get("set-cookie")?.split(";")[0];
    assert.ok(parentCookie, "successful parent sign-in should provide a session cookie");

    const wrongParentStatuses: number[] = [];
    for (let index = 0; index < 9; index += 1) {
      const response = await fetch(`${origin}/api/parent/auth/login`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `192.0.2.199, 198.51.100.${180 + index}`,
        },
        body: JSON.stringify({ email: email.toUpperCase(), password: "wrong-fictional-parent-password" }),
      });
      wrongParentStatuses.push(response.status);
      await response.arrayBuffer();
    }
    const parentThreshold = await fetch(`${origin}/api/parent/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.199, 198.51.100.189" },
      body: JSON.stringify({ email, password: newPassword }),
    });
    const parentThresholdStatus = parentThreshold.status;
    await parentThreshold.arrayBuffer();

    const passwordChangeStatuses: number[] = [];
    for (let index = 0; index < 5; index += 1) {
      const response = await fetch(`${origin}/api/parent/auth/change-password`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: parentCookie!,
          "x-forwarded-for": `192.0.2.199, 198.51.100.${200 + index}`,
        },
        body: JSON.stringify({ currentPassword: "wrong-current-password", newPassword: "another-valid-fake-password" }),
      });
      passwordChangeStatuses.push(response.status);
      await response.arrayBuffer();
    }
    const passwordChangeThreshold = await fetch(`${origin}/api/parent/auth/change-password`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: parentCookie!,
        "x-forwarded-for": "192.0.2.199, 198.51.100.205",
      },
      body: JSON.stringify({ currentPassword: "wrong-current-password", newPassword: "another-valid-fake-password" }),
    });
    const passwordChangeThresholdStatus = passwordChangeThreshold.status;
    await passwordChangeThreshold.arrayBuffer();

    const knownWrong = await fetch(`${origin}/api/parent/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.199, 203.0.113.218" },
      body: JSON.stringify({ email: enumerationEmail, password: "another-wrong-fictional-password" }),
    });
    const knownWrongBody = await knownWrong.text();
    const unknownWrong = await fetch(`${origin}/api/parent/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.199, 203.0.113.219" },
      body: JSON.stringify({ email: `missing-${suffix}@example.test`, password: "another-wrong-fictional-password" }),
    });
    const unknownWrongBody = await unknownWrong.text();
    const auditRows = await db.select().from(auditLogsTable)
      .where(eq(auditLogsTable.action, "credential_account_rate_limited"));
    const auditPayload = JSON.stringify(auditRows);
    Object.assign(evidence, {
      requestStatus: requestReset.status,
      requestResponseDoesNotEchoEmail: !requestMessage.includes(email),
      knownVsUnknownResetResponseSame:
        requestReset.status === unknownReset.status && requestMessage === unknownResetMessage,
      resetRequestsBeforeLimit: [requestReset.status, ...additionalResetStatuses],
      resetRequestThresholdStatus: resetThresholdStatus,
      fakeProviderCalls: sentEmails.length,
      completionStatus: completion.status,
      completionResponseContainsToken: completionBody.includes(token),
      usedResetLinkReplayStatuses: resetReplayStatuses,
      usedResetLinkReplayThresholdStatus: resetReplayThresholdStatus,
      recoveredLoginStatus: login.status,
      wrongParentLoginStatuses: wrongParentStatuses,
      parentLoginThresholdStatus: parentThresholdStatus,
      parentPasswordChangeStatuses: passwordChangeStatuses,
      parentPasswordChangeThresholdStatus: passwordChangeThresholdStatus,
      knownVsUnknownInvalidLoginResponseSame:
        knownWrong.status === unknownWrong.status && knownWrongBody === unknownWrongBody,
      credentialAuditCount: auditRows.length,
      auditContainsCredentials: auditPayload.includes(email) ||
        auditPayload.includes(oldPassword) || auditPayload.includes(newPassword) ||
        auditPayload.includes(token),
      networkProviderWasFaked: true,
    });
    const evidenceDir = process.env.P0_ACCESS_EVIDENCE_DIR;
    if (evidenceDir) {
      await fs.writeFile(`${evidenceDir}/password-recovery-results.json`, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
    }
    assert.equal(requestReset.status, 202);
    assert.deepEqual([requestReset.status, ...additionalResetStatuses], Array(5).fill(202));
    assert.equal(resetThresholdStatus, 429);
    assert.equal(evidence.requestResponseDoesNotEchoEmail, true);
    assert.equal(evidence.knownVsUnknownResetResponseSame, true);
    assert.equal(completion.status, 200);
    assert.equal(evidence.completionResponseContainsToken, false);
    assert.deepEqual(resetReplayStatuses, Array(7).fill(400));
    assert.equal(resetReplayThresholdStatus, 429);
    assert.equal(login.status, 200, "the recovered password must authenticate successfully");
    assert.deepEqual(wrongParentStatuses, Array(9).fill(401));
    assert.equal(parentThresholdStatus, 429);
    assert.deepEqual(passwordChangeStatuses, Array(5).fill(400));
    assert.equal(passwordChangeThresholdStatus, 429);
    assert.equal(evidence.knownVsUnknownInvalidLoginResponseSame, true);
    assert.equal(evidence.auditContainsCredentials, false);
  } finally {
    prototype.proxy = originalProxy;
    await close(server);
  }
});
