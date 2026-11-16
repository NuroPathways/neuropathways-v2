import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { test } from "node:test";
import { eq, inArray } from "drizzle-orm";
import {
  auditLogsTable,
  clinicInvitationsTable,
  clinicMembershipsTable,
  clinicsTable,
  clinicalAssignmentsTable,
  clinicianCredentialsTable,
  db,
  platformAdministratorGrantsTable,
  usersTable,
  userProfilesTable,
} from "@workspace/db";
import { createSession } from "../lib/auth.js";
import { createClinicianPasswordHash } from "../lib/clinicianPassword.js";
import { createClinicInvitationToken, hashClinicInvitationToken } from "../lib/clinicInvitationSecurity.js";

const expectedDatabaseName = "np_clinic_onboarding_test";
const databaseUrl = new URL(process.env.DATABASE_URL || "http://invalid");
const evidenceDir = process.env.NP_TEST_EVIDENCE_DIR;
const root = path.resolve(process.cwd(), "../..");
const checks: Array<{ name: string; status: "PASS" | "FAIL"; detail?: string }> = [];
const fixtureUserIds: string[] = [];
const invitationTokens: string[] = [];
let app: any;
let appServer: Server | undefined;
let sinkServer: Server | undefined;
let sinkPort = 0;
let appPort = 0;
let latestMessage: any = null;
let tempDir = "";
let invitedAdminPassword = "";
let currentScenario = "test setup";
let platformAdminId = "";

function assertIsolatedDatabase() {
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.REPLIT_CONNECTORS_ENABLED !== "false" ||
    databaseUrl.hostname !== "127.0.0.1" ||
    databaseUrl.pathname !== `/${expectedDatabaseName}` ||
    !evidenceDir ||
    !process.env.NP_TEST_STORAGE_DIR
  ) {
    throw new Error("Clinic onboarding integration test refused: the exact loopback test database, isolated storage, and disabled connectors are required.");
  }
}

async function listen(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const address = server.address();
  assert(address && typeof address === "object");
  return address.port;
}

async function createFixtureUser(options: {
  email: string;
  appRole: string;
  accountType: string;
  firstName: string;
  lastName: string;
  verified?: boolean;
  password?: string;
}) {
  const id = crypto.randomUUID();
  fixtureUserIds.push(id);
  await db.insert(usersTable).values({
    id,
    email: options.email,
    firstName: options.firstName,
    lastName: options.lastName,
    emailVerified: options.verified ?? true,
  });
  await db.insert(userProfilesTable).values({
    id,
    appRole: options.appRole,
    accountType: options.accountType,
    firstName: options.firstName,
    lastName: options.lastName,
    displayName: `${options.firstName} ${options.lastName}`,
  });
  if (options.password) {
    await db.insert(clinicianCredentialsTable).values({
      userId: id,
      email: options.email.toLowerCase(),
      passwordHash: await createClinicianPasswordHash(options.password),
    });
  }
  return { id, email: options.email, firstName: options.firstName, lastName: options.lastName };
}

async function loginCookie(email: string, password: string, invitationToken?: string) {
  const response = await fetch(`http://127.0.0.1:${appPort}/api/clinician/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, ...(invitationToken ? { invitationToken } : {}) }),
  });
  const body: any = await response.json();
  const cookie = response.headers.get("set-cookie")?.match(/(?:^|,\s*)sid=([^;]+)/)?.[1];
  return { response, body, cookie };
}

async function api(pathname: string, options: {
  method?: string;
  body?: unknown;
  cookie?: string;
} = {}) {
  const response = await fetch(`http://127.0.0.1:${appPort}/api${pathname}`, {
    method: options.method || "GET",
    headers: {
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(options.cookie ? { cookie: `sid=${options.cookie}` } : {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  let body: any = null;
  try { body = await response.json(); } catch { /* Non-JSON response is recorded as status only. */ }
  return { status: response.status, body, text: JSON.stringify(body) };
}

async function getInvitationToken() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (latestMessage?.text) {
      const match = latestMessage.text.match(/#token=([A-Za-z0-9_-]+)/);
      if (match) {
        invitationTokens.push(match[1]);
        return match[1];
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Loopback test mail sink did not capture an invitation.");
}

async function collectSanitizedEvidence() {
  if (!evidenceDir) return;
  const audit = await db.select({
    userId: auditLogsTable.userId,
    userRole: auditLogsTable.userRole,
    tenantId: auditLogsTable.tenantId,
    action: auditLogsTable.action,
    targetType: auditLogsTable.targetType,
    targetId: auditLogsTable.targetId,
    success: auditLogsTable.success,
    reason: auditLogsTable.reason,
    metadata: auditLogsTable.metadata,
    createdAt: auditLogsTable.createdDate,
  }).from(auditLogsTable).where(
    fixtureUserIds.length
      ? inArray(auditLogsTable.userId, fixtureUserIds)
      : eq(auditLogsTable.userId, "no-fixtures"),
  );
  const serialized = JSON.stringify(audit);
  for (const token of invitationTokens) assert(!serialized.includes(token), "Raw invitation token found in audit evidence");
  await writeFile(path.join(evidenceDir, "clinic-onboarding-api-checks.json"), JSON.stringify({
    startedAt: startedAt.toISOString(),
    endedAt: new Date().toISOString(),
    testEnvironment: "isolated disposable loopback PostgreSQL; fictional data; local test mail sink; disabled connectors",
    checks: checks.length ? checks : [{ name: currentScenario, status: "FAIL", detail: "Test did not complete the scenario." }],
  }, null, 2), { mode: 0o600 });
  await writeFile(path.join(evidenceDir, "clinic-onboarding-genuine-audit-events.json"), JSON.stringify(audit, null, 2), { mode: 0o600 });
}

const startedAt = new Date();

test("isolated real-backend clinic onboarding flow", async (t) => {
  assertIsolatedDatabase();
  t.after(async () => {
    try {
      if (checks.length < 5) checks.push({ name: currentScenario, status: "FAIL", detail: "Scenario did not complete before the runner stopped." });
      await collectSanitizedEvidence();
    } finally {
      if (appServer) await new Promise((resolve) => appServer?.close(resolve));
      if (sinkServer) await new Promise((resolve) => sinkServer?.close(resolve));
      if (tempDir) await import("node:fs/promises").then(({ rm }) => rm(tempDir, { recursive: true, force: true }));
    }
  });

  await t.test("prepare private test services and refuse non-empty fixtures", async () => {
    currentScenario = "isolated database, loopback mail sink, API boot";
    const { db: connection } = await import("@workspace/db");
    const state = await connection.execute<{ current_database: string; server_ip: string | null }>(
      await import("drizzle-orm").then(({ sql }) => sql`select current_database(), host(inet_server_addr()) as server_ip`),
    );
    assert.equal(state.rows[0]?.current_database, expectedDatabaseName);
    assert.equal(state.rows[0]?.server_ip, "127.0.0.1");
    const users = await db.select({ id: usersTable.id }).from(usersTable).limit(1);
    const clinics = await db.select({ id: clinicsTable.id }).from(clinicsTable).limit(1);
    assert.equal(users.length, 0, "test database must start without user fixtures");
    assert.equal(clinics.length, 0, "test database must start without clinic fixtures");
    tempDir = await mkdtemp(path.join(os.tmpdir(), "np-clinic-onboarding-test-"));
    sinkServer = createServer(async (request, response) => {
      if (request.method !== "POST" || request.url !== "/messages") {
        response.writeHead(404).end();
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      latestMessage = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      response.writeHead(202).end();
    });
    sinkPort = await listen(sinkServer);
    process.env.NP_CLINIC_INVITATION_TEST_SINK_URL = `http://127.0.0.1:${sinkPort}/messages`;
    process.env.NP_CLINIC_INVITATION_BASE_URL = "http://127.0.0.1:3000/ClinicInvitation";
    process.env.TEST_DB_NAME = expectedDatabaseName;
    app = (await import("../app.js")).default;
    appServer = app.listen(0, "127.0.0.1");
    const address = appServer?.address();
    assert(address && typeof address === "object");
    appPort = address.port;
    checks.push({ name: currentScenario, status: "PASS" });
  });

  await t.test("operator bootstrap, authenticated platform clinic provisioning, and idempotency", async () => {
    currentScenario = "operator bootstrap, platform clinic provisioning, denied user, idempotency";
    const platformPassword = `T-demo-${crypto.randomBytes(18).toString("base64url")}`;
    const platform = await createFixtureUser({
      email: `platform-${crypto.randomUUID()}@example.test`,
      appRole: "clinician",
      accountType: "clinician",
      firstName: "Platform",
      lastName: "Operator",
      password: platformPassword,
    });
    platformAdminId = platform.id;
    const bootstrap = spawnSync("pnpm", [
      "--filter", "@workspace/api-server", "run", "bootstrap:platform-admin", "--",
      `--user-id=${platform.id}`,
      "--approval-reference=TEST-APPROVED-001",
      "--confirm=BOOTSTRAP-ONE-PLATFORM-ADMIN",
    ], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, NP_ALLOW_PLATFORM_ADMIN_BOOTSTRAP: "approved" },
      timeout: 60_000,
    });
    assert.equal(bootstrap.status, 0, "operator CLI should grant only the explicit verified test account");
    assert(!bootstrap.stdout.includes(platformPassword) && !bootstrap.stderr.includes(platformPassword));
    const grantRows = await db.select().from(platformAdministratorGrantsTable)
      .where(eq(platformAdministratorGrantsTable.userId, platform.id));
    assert.equal(grantRows.length, 1);
    const platformLogin = await loginCookie(platform.email, platformPassword);
    assert.equal(platformLogin.response.status, 200);
    assert.equal(platformLogin.body.redirect, "/PlatformAdminClinics");
    assert(platformLogin.cookie);
    const emptyList = await api("/platform-management/clinics", { cookie: platformLogin.cookie });
    assert.equal(emptyList.status, 200);
    assert.deepEqual(emptyList.body.clinics, []);

    const unauthorized = await createFixtureUser({
      email: `unprivileged-${crypto.randomUUID()}@example.test`,
      appRole: "clinician",
      accountType: "clinician",
      firstName: "Unprivileged",
      lastName: "Clinician",
    });
    const unauthorizedSession = await createSession({
      user: { id: unauthorized.id, email: unauthorized.email, firstName: unauthorized.firstName, lastName: unauthorized.lastName, profileImageUrl: null, isPlatformAdministrator: false },
      access_token: "isolated-test",
    });
    const denied = await api("/platform-management/clinics", { cookie: unauthorizedSession });
    assert.equal(denied.status, 403);
    const requestKey = crypto.randomUUID();
    const createBody = {
      displayName: "Northstar Fictional Clinic",
      firstAdminEmail: `first-admin-${crypto.randomUUID()}@example.test`,
      requestKey,
    };
    latestMessage = null;
    const [create, concurrentRetry] = await Promise.all([
      api("/platform-management/clinics", { method: "POST", cookie: platformLogin.cookie, body: createBody }),
      api("/platform-management/clinics", { method: "POST", cookie: platformLogin.cookie, body: createBody }),
    ]);
    assert.equal(create.status, 201);
    assert.equal(concurrentRetry.status, 200);
    assert.equal(concurrentRetry.body.clinicId, create.body.clinicId);
    assert.equal(concurrentRetry.body.invitation.id, create.body.invitation.id);
    const token = await getInvitationToken();
    assert(!create.text.includes(token));
    assert.equal(create.body.clinicStatus, "pending");
    assert.equal(create.body.invitation.role, "clinic_admin");
    assert.equal(create.body.invitation.deliveryStatus, "test_sink_accepted");
    const rawInviteRows = await db.select().from(clinicInvitationsTable)
      .where(eq(clinicInvitationsTable.id, create.body.invitation.id));
    assert.equal(rawInviteRows.length, 1);
    assert.equal(rawInviteRows[0].tokenHash, hashClinicInvitationToken(token));
    assert(!create.text.includes(rawInviteRows[0].tokenHash));
    const repeated = await api("/platform-management/clinics", { method: "POST", cookie: platformLogin.cookie, body: createBody });
    assert.equal(repeated.status, 200);
    assert.equal(repeated.body.clinicId, create.body.clinicId);
    assert.equal(repeated.body.invitation.id, create.body.invitation.id);
    const clinicRows = await db.select().from(clinicsTable);
    assert.equal(clinicRows.length, 1);
    const roleInjection = await api("/platform-management/clinics", {
      method: "POST",
      cookie: unauthorizedSession,
      body: { ...createBody, requestKey: crypto.randomUUID(), role: "platform_admin", clinicId: "forged" },
    });
    assert.equal(roleInjection.status, 403);
    assert.equal((await db.select().from(clinicsTable)).length, 1);
    checks.push({ name: currentScenario, status: "PASS" });
  });

  await t.test("wrong identity is denied; invited administrator activates one clinic role", async () => {
    currentScenario = "first administrator invitation identity, activation, replay, and chart isolation";
    const clinic = (await db.select().from(clinicsTable))[0];
    const invitation = (await db.select().from(clinicInvitationsTable))[0];
    const token = invitationTokens[0];
    const invitedUser = await createFixtureUser({
      email: invitation.invitedEmail,
      appRole: "pending_clinician",
      accountType: "clinician",
      firstName: "Clinic",
      lastName: "Administrator",
      verified: false,
    });
    const wrongIdentity = await createFixtureUser({
      email: `wrong-${crypto.randomUUID()}@example.test`,
      appRole: "parent",
      accountType: "parent",
      firstName: "Wrong",
      lastName: "Identity",
    });
    const wrongSession = await createSession({
      user: { id: wrongIdentity.id, email: wrongIdentity.email, firstName: wrongIdentity.firstName, lastName: wrongIdentity.lastName, profileImageUrl: null, isPlatformAdministrator: false },
      access_token: "isolated-test",
    });
    const wrong = await api("/clinic-invitations/accept", {
      method: "POST",
      cookie: wrongSession,
      body: { token, clinicId: "forged-clinic", role: "platform_admin" },
    });
    assert.equal(wrong.status, 403);
    assert.equal(wrong.body.clinicId, undefined);
    assert.equal((await db.select().from(clinicMembershipsTable).where(eq(clinicMembershipsTable.userId, wrongIdentity.id))).length, 0);

    invitedAdminPassword = `T-invite-${crypto.randomBytes(18).toString("base64url")}`;
    await db.insert(clinicianCredentialsTable).values({
      userId: invitedUser.id,
      email: invitedUser.email,
      passwordHash: await createClinicianPasswordHash(invitedAdminPassword),
    });
    const invitedLogin = await loginCookie(invitedUser.email, invitedAdminPassword, token);
    assert.equal(invitedLogin.response.status, 200);
    assert.equal(invitedLogin.body.redirect, "/ClinicInvitation");
    assert(invitedLogin.cookie);
    const accepted = await api("/clinic-invitations/accept", {
      method: "POST",
      cookie: invitedLogin.cookie,
      body: { token, clinicId: "forged-clinic", role: "platform_admin" },
    });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.role, "clinic_admin");
    assert.equal(accepted.body.clinicId, clinic.id);
    const [activeClinic] = await db.select().from(clinicsTable).where(eq(clinicsTable.id, clinic.id));
    assert.equal(activeClinic.status, "active");
    const memberships = await db.select().from(clinicMembershipsTable)
      .where(eq(clinicMembershipsTable.userId, invitedUser.id));
    assert.deepEqual(memberships.map((membership) => [membership.clinicId, membership.role, membership.status]), [[clinic.id, "clinic_admin", "active"]]);
    assert.equal((await db.select().from(platformAdministratorGrantsTable).where(eq(platformAdministratorGrantsTable.userId, invitedUser.id))).length, 0);
    const replay = await api("/clinic-invitations/accept", { method: "POST", cookie: invitedLogin.cookie, body: { token } });
    assert.equal(replay.status, 409);
    const postAcceptLogin = await loginCookie(invitedUser.email, invitedAdminPassword);
    assert.equal(postAcceptLogin.response.status, 200, "active clinic admin can return through regular sign-in");
    assert.equal(postAcceptLogin.body.redirect, "/ClinicianDashboard");
    const clientDirectory = await api(`/clinic-management/${clinic.id}/clients`, { cookie: postAcceptLogin.cookie });
    assert.equal(clientDirectory.status, 200);
    assert.deepEqual(clientDirectory.body.clients, []);
    checks.push({ name: currentScenario, status: "PASS" });
  });

  await t.test("staff invites are restricted, single-use, revocable, and do not create chart assignments", async () => {
    currentScenario = "staff invitation, pending signup, role boundary, revocation, and clinic isolation";
    const clinic = (await db.select().from(clinicsTable))[0];
    const admin = (await db.select().from(usersTable).where(eq(usersTable.email, (await db.select().from(clinicInvitationsTable))[0].invitedEmail)))[0];
    const adminCookie = (await loginCookie(admin.email!, invitedAdminPassword)).cookie;
    assert(adminCookie);
    const staffOneEmail = `clinician-one-${crypto.randomUUID()}@example.test`;
    latestMessage = null;
    const staffInvite = await api(`/clinic-management/${clinic.id}/invitations`, {
      method: "POST",
      cookie: adminCookie,
      body: { invitedEmail: staffOneEmail, requestKey: crypto.randomUUID(), role: "clinic_admin" },
    });
    assert.equal(staffInvite.status, 201);
    assert.equal(staffInvite.body.invitation.role, "treating_clinician");
    assert.equal(staffInvite.body.invitation.deliveryStatus, "test_sink_accepted");
    const staffToken = await getInvitationToken();
    assert(!staffInvite.text.includes(staffToken));
    const [stored] = await db.select().from(clinicInvitationsTable)
      .where(eq(clinicInvitationsTable.id, staffInvite.body.invitation.id));
    assert.equal(stored.tokenHash, hashClinicInvitationToken(staffToken));
    const duplicate = await api(`/clinic-management/${clinic.id}/invitations`, {
      method: "POST",
      cookie: adminCookie,
      body: { invitedEmail: staffOneEmail, requestKey: crypto.randomUUID() },
    });
    assert.equal(duplicate.status, 409);
    const registered = await api("/clinician/register", {
      method: "POST",
      body: {
        email: staffOneEmail,
        password: "Test-only-Clinician-Password-49",
        firstName: "Fictional",
        lastName: "Clinician One",
        accountHolderType: "clinician",
        accountHolderAgeGroup: "18_plus",
        adultOrGuardianConfirmed: true,
        appRole: "platform_admin",
        clinicId: "forged",
      },
    });
    assert.equal(registered.status, 202);
    const pending = (await db.select().from(usersTable).where(eq(usersTable.email, staffOneEmail)))[0];
    const [pendingProfile] = await db.select().from(userProfilesTable).where(eq(userProfilesTable.id, pending.id));
    assert.equal(pendingProfile.appRole, "pending_clinician");
    assert.equal((await db.select().from(clinicMembershipsTable).where(eq(clinicMembershipsTable.userId, pending.id))).length, 0);
    const loggedIn = await loginCookie(staffOneEmail, "Test-only-Clinician-Password-49", staffToken);
    assert.equal(loggedIn.response.status, 200);
    const accepted = await api("/clinic-invitations/accept", { method: "POST", cookie: loggedIn.cookie, body: { token: staffToken } });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.role, "treating_clinician");
    assert.equal((await db.select().from(clinicalAssignmentsTable).where(eq(clinicalAssignmentsTable.userId, pending.id))).length, 0);
    assert.equal((await api(`/clinic-management/${clinic.id}/clients`, { cookie: loggedIn.cookie })).status, 403);

    const revokedEmail = `revoked-${crypto.randomUUID()}@example.test`;
    latestMessage = null;
    const revokedInvite = await api(`/clinic-management/${clinic.id}/invitations`, {
      method: "POST",
      cookie: adminCookie,
      body: { invitedEmail: revokedEmail, requestKey: crypto.randomUUID() },
    });
    assert.equal(revokedInvite.status, 201);
    const revokedToken = await getInvitationToken();
    const revoked = await api(`/clinic-management/${clinic.id}/invitations/${revokedInvite.body.invitation.id}/revoke`, {
      method: "POST",
      cookie: adminCookie,
    });
    assert.equal(revoked.status, 200);
    const revokedUser = await createFixtureUser({
      email: revokedEmail,
      appRole: "pending_clinician",
      accountType: "clinician",
      firstName: "Revoked",
      lastName: "Invitee",
    });
    const revokedSession = await createSession({
      user: { id: revokedUser.id, email: revokedUser.email, firstName: revokedUser.firstName, lastName: revokedUser.lastName, profileImageUrl: null, isPlatformAdministrator: false },
      access_token: "isolated-test",
    });
    const revokedAccept = await api("/clinic-invitations/accept", { method: "POST", cookie: revokedSession, body: { token: revokedToken } });
    assert.equal(revokedAccept.status, 409);
    assert.equal((await db.select().from(clinicMembershipsTable).where(eq(clinicMembershipsTable.userId, revokedUser.id))).length, 0);

    const otherClinic = await createFixtureUser({
      email: `other-admin-${crypto.randomUUID()}@example.test`,
      appRole: "clinician",
      accountType: "clinician",
      firstName: "Other",
      lastName: "Clinic",
    });
    const otherClinicId = crypto.randomUUID();
    await db.insert(clinicsTable).values({
      id: otherClinicId,
      displayName: "Fictional Second Clinic",
      status: "active",
      createdBy: platformAdminId,
    });
    await db.insert(clinicMembershipsTable).values({
      clinicId: otherClinicId,
      userId: otherClinic.id,
      role: "clinic_admin",
      status: "active",
      createdBy: platformAdminId,
    });
    const otherClinicSession = await createSession({
      user: { id: otherClinic.id, email: otherClinic.email, firstName: otherClinic.firstName, lastName: otherClinic.lastName, profileImageUrl: null, isPlatformAdministrator: false },
      access_token: "isolated-test",
    });
    const crossClinic = await api(`/clinic-management/${clinic.id}/invitations`, {
      method: "POST",
      cookie: otherClinicSession,
      body: { invitedEmail: `cross-${crypto.randomUUID()}@example.test`, requestKey: crypto.randomUUID() },
    });
    assert.equal(crossClinic.status, 403);
    const ownClinicStaff = await api("/clinic-management/staff", { cookie: otherClinicSession });
    assert.equal(ownClinicStaff.status, 200);
    assert.deepEqual(ownClinicStaff.body.clinics.map((entry: any) => entry.clinicId), [otherClinicId]);
    checks.push({ name: currentScenario, status: "PASS" });
  });

  await t.test("sanitized genuine audit evidence records success and denial with no tokens", async () => {
    currentScenario = "genuine audit events and token redaction";
    const events = await db.select().from(auditLogsTable);
    const actions = new Set(events.map((event) => event.action));
    for (const requiredAction of [
      "platform_admin_bootstrapped",
      "clinic_provisioned",
      "clinic_first_admin_invitation_created",
      "clinic_invitation_accepted",
      "clinic_invitation_accept_denied",
      "clinic_staff_invitation_created",
      "clinic_staff_invitation_revoked",
    ]) assert(actions.has(requiredAction), `missing genuine audit action ${requiredAction}`);
    const serialized = JSON.stringify(events);
    for (const token of invitationTokens) assert(!serialized.includes(token), "raw invitation token leaked to audit");
    checks.push({ name: currentScenario, status: "PASS" });
  });

});
