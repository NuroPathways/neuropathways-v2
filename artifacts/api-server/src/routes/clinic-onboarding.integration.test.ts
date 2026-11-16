import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { test } from "node:test";
import { and, eq } from "drizzle-orm";
import {
  auditLogsTable,
  clinicInvitationsTable,
  clinicMembershipsTable,
  clinicRequestsTable,
  clinicsTable,
  clinicalAssignmentsTable,
  childrenTable,
  clinicianCredentialsTable,
  db,
  familiesTable,
  parentAccountsTable,
  parentClinicConsentsTable,
  platformAdministratorGrantsTable,
  usersTable,
  userProfilesTable,
} from "@workspace/db";
import { createSession } from "../lib/auth.js";
import { createClinicianPasswordHash } from "../lib/clinicianPassword.js";
import { createClinicInvitationToken, hashClinicInvitationToken } from "../lib/clinicInvitationSecurity.js";
import { clinicalRecordClinicId } from "../lib/clinicAuthorization.js";

const expectedDatabaseName = "np_clinic_onboarding_test";
const databaseUrl = new URL(process.env.DATABASE_URL || "http://invalid");
const evidenceDir = process.env.NP_TEST_EVIDENCE_DIR;
const root = path.resolve(process.cwd(), "../..");
const checks: Array<{ name: string; status: "PASS" | "FAIL"; detail?: string }> = [];
const invitationTokens: string[] = [];
const sensitiveValues: string[] = [];
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
let setupReady = false;
let platformCookie = "";
let staffClinicianCookie = "";
let staffClinicianId = "";
let assignedChildId = "";
let firstAdminInvitationId = "";
let firstAdminClinicId = "";
let firstAdminToken = "";

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
  }).from(auditLogsTable);
  const serialized = JSON.stringify(audit);
  for (const secret of [...invitationTokens, ...sensitiveValues]) {
    if (secret) assert(!serialized.includes(secret), "Sensitive invitation or password material found in audit evidence");
  }
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
    appServer = createServer(app);
    appPort = await listen(appServer);
    setupReady = true;
    checks.push({ name: currentScenario, status: "PASS" });
  });

  await t.test("operator bootstrap, authenticated platform clinic provisioning, and idempotency", async (st) => {
    if (!setupReady) { st.skip("isolated service setup did not pass"); return; }
    currentScenario = "operator bootstrap, platform clinic provisioning, denied user, idempotency";
    const platformPassword = `T-demo-${crypto.randomBytes(18).toString("base64url")}`;
    sensitiveValues.push(platformPassword);
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
    const repeatedBootstrap = spawnSync("pnpm", [
      "--filter", "@workspace/api-server", "run", "bootstrap:platform-admin", "--",
      `--user-id=${platform.id}`,
      "--approval-reference=TEST-APPROVED-002",
      "--confirm=BOOTSTRAP-ONE-PLATFORM-ADMIN",
    ], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, NP_ALLOW_PLATFORM_ADMIN_BOOTSTRAP: "approved" },
      timeout: 60_000,
    });
    assert.notEqual(repeatedBootstrap.status, 0, "bootstrap must refuse once an active grant exists");
    assert(!repeatedBootstrap.stdout.includes(platformPassword) && !repeatedBootstrap.stderr.includes(platformPassword));
    assert.equal((await db.select().from(platformAdministratorGrantsTable)).length, 1);
    const platformLogin = await loginCookie(platform.email, platformPassword);
    assert.equal(platformLogin.response.status, 200);
    assert.equal(platformLogin.body.redirect, "/PlatformAdminClinics");
    assert(platformLogin.cookie);
    platformCookie = platformLogin.cookie;
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
    const concurrentResponses = await Promise.all([
      api("/platform-management/clinics", { method: "POST", cookie: platformLogin.cookie, body: createBody }),
      api("/platform-management/clinics", { method: "POST", cookie: platformLogin.cookie, body: createBody }),
    ]);
    const create = concurrentResponses.find((result) => result.status === 201)!;
    const concurrentRetry = concurrentResponses.find((result) => result.status === 200)!;
    assert.equal(create.status, 201);
    assert.equal(concurrentRetry.status, 200);
    assert.equal(concurrentRetry.body.clinicId, create.body.clinicId);
    assert.equal(concurrentRetry.body.invitation.id, create.body.invitation.id);
    const token = await getInvitationToken();
    firstAdminToken = token;
    firstAdminInvitationId = create.body.invitation.id;
    firstAdminClinicId = create.body.clinicId;
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

  await t.test("wrong identity is denied; invited administrator activates one clinic role", async (st) => {
    if (!setupReady) { st.skip("isolated service setup did not pass"); return; }
    currentScenario = "first administrator invitation identity, activation, replay, and chart isolation";
    const clinic = (await db.select().from(clinicsTable))[0];
    const invitation = (await db.select().from(clinicInvitationsTable))[0];
    const originalToken = firstAdminToken;
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
      body: { token: originalToken },
    });
    assert.equal(wrong.status, 403);
    assert.equal(wrong.body.clinicId, undefined);
    assert.equal((await db.select().from(clinicMembershipsTable).where(eq(clinicMembershipsTable.userId, wrongIdentity.id))).length, 0);

    const invitedSession = await createSession({
      user: { id: invitedUser.id, email: invitedUser.email, firstName: invitedUser.firstName, lastName: invitedUser.lastName, profileImageUrl: null, isPlatformAdministrator: false },
      access_token: "isolated-test",
    });
    latestMessage = null;
    const reissued = await api(`/platform-management/clinics/${clinic.id}/invitations/${invitation.id}/reissue`, {
      method: "POST",
      cookie: platformCookie,
      body: { requestKey: crypto.randomUUID() },
    });
    assert.equal(reissued.status, 200);
    const token = await getInvitationToken();
    assert(!reissued.text.includes(token));
    assert.notEqual(reissued.body.invitation.id, invitation.id);
    const [superseded] = await db.select().from(clinicInvitationsTable).where(eq(clinicInvitationsTable.id, invitation.id));
    assert.equal(superseded.status, "superseded");
    const oldLink = await api("/clinic-invitations/accept", {
      method: "POST",
      cookie: invitedSession,
      body: { token: originalToken },
    });
    assert.equal(oldLink.status, 409);

    invitedAdminPassword = `T-invite-${crypto.randomBytes(18).toString("base64url")}`;
    sensitiveValues.push(invitedAdminPassword);
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
      body: { token },
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

  await t.test("staff invites are restricted, single-use, revocable, and do not create chart assignments", async (st) => {
    if (!setupReady) { st.skip("isolated service setup did not pass"); return; }
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
    let staffToken = await getInvitationToken();
    const firstStaffInvitationId = staffInvite.body.invitation.id;
    assert(!staffInvite.text.includes(staffToken));
    const [stored] = await db.select().from(clinicInvitationsTable)
      .where(eq(clinicInvitationsTable.id, firstStaffInvitationId));
    assert.equal(stored.tokenHash, hashClinicInvitationToken(staffToken));
    const supersededStaffToken = staffToken;
    latestMessage = null;
    const staffReissue = await api(`/clinic-management/${clinic.id}/invitations/${firstStaffInvitationId}/reissue`, {
      method: "POST",
      cookie: adminCookie,
      body: { requestKey: crypto.randomUUID() },
    });
    assert.equal(staffReissue.status, 200);
    staffToken = await getInvitationToken();
    assert(!staffReissue.text.includes(staffToken));
    const [supersededStaffInvite] = await db.select().from(clinicInvitationsTable)
      .where(eq(clinicInvitationsTable.id, firstStaffInvitationId));
    assert.equal(supersededStaffInvite.status, "superseded");
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
        emailVerified: true,
        email_verified: true,
      },
    });
    sensitiveValues.push("Test-only-Clinician-Password-49");
    assert.equal(registered.status, 202);
    const pending = (await db.select().from(usersTable).where(eq(usersTable.email, staffOneEmail)))[0];
    const [pendingProfile] = await db.select().from(userProfilesTable).where(eq(userProfilesTable.id, pending.id));
    assert.equal(pendingProfile.appRole, "pending_clinician");
    assert.equal((await db.select().from(clinicMembershipsTable).where(eq(clinicMembershipsTable.userId, pending.id))).length, 0);
    assert.equal((await db.select().from(platformAdministratorGrantsTable).where(eq(platformAdministratorGrantsTable.userId, pending.id))).length, 0);
    const [pendingUser] = await db.select().from(usersTable).where(eq(usersTable.id, pending.id));
    assert.equal(pendingUser.emailVerified, false, "browser-supplied verification claims must not verify the account");
    const oldStaffSession = await createSession({
      user: { id: pending.id, email: staffOneEmail, firstName: "Fictional", lastName: "Clinician One", profileImageUrl: null, isPlatformAdministrator: false },
      access_token: "isolated-test",
    });
    const oldStaffAccept = await api("/clinic-invitations/accept", { method: "POST", cookie: oldStaffSession, body: { token: supersededStaffToken } });
    assert.equal(oldStaffAccept.status, 409);
    const loggedIn = await loginCookie(staffOneEmail, "Test-only-Clinician-Password-49", staffToken);
    assert.equal(loggedIn.response.status, 200);
    const accepted = await api("/clinic-invitations/accept", { method: "POST", cookie: loggedIn.cookie, body: { token: staffToken } });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.role, "treating_clinician");
    staffClinicianCookie = loggedIn.cookie!;
    staffClinicianId = pending.id;
    const [acceptedClinicianProfile] = await db.select().from(userProfilesTable)
      .where(eq(userProfilesTable.id, staffClinicianId));
    assert.equal(acceptedClinicianProfile.tenantId, clinic.id, "first accepted clinic becomes the legacy default tenant");
    assert.equal((await db.select().from(clinicalAssignmentsTable).where(eq(clinicalAssignmentsTable.userId, pending.id))).length, 0);
    assert.equal((await api(`/clinic-management/${clinic.id}/clients`, { cookie: loggedIn.cookie })).status, 403);

    await st.test("parent-workspace children resolve only to a defensible clinic scope", async () => {
      const [originalProfile] = await db.select().from(userProfilesTable)
        .where(eq(userProfilesTable.id, staffClinicianId));
      const createdParentIds: string[] = [];
      const createdFamilyIds: string[] = [];
      const createdChildIds: string[] = [];
      let secondClinicId: string | null = null;
      try {
        // Exercise records created before clinic invitation acceptance began
        // setting a legacy tenant: the family carries the clinician ID while
        // the linked child correctly remains in the parent's own workspace.
        await db.update(userProfilesTable).set({ tenantId: null })
          .where(eq(userProfilesTable.id, staffClinicianId));

        const createParentLinkedChild = async (familyTenantId: string) => {
          const parentId = `fictional-parent-${crypto.randomUUID()}`;
          const workspaceId = `fictional-parent-workspace-${crypto.randomUUID()}`;
          const [parent] = await db.insert(parentAccountsTable).values({
            id: parentId,
            email: `${parentId}@example.test`,
            firstName: "Fictional",
            workspaceId,
            passwordHash: "unused-fictional-test-hash",
          }).returning({ id: parentAccountsTable.id });
          createdParentIds.push(parent.id);
          const [family] = await db.insert(familiesTable).values({
            tenantId: familyTenantId,
            clinicianId: staffClinicianId,
            familyName: "Fictional Linked Family",
            createdBy: staffClinicianId,
          }).returning({ id: familiesTable.id });
          createdFamilyIds.push(family.id);
          const [child] = await db.insert(childrenTable).values({
            tenantId: workspaceId,
            clinicianId: staffClinicianId,
            familyId: family.id,
            parentId: parent.id,
            childName: "Fictional Linked Child",
            status: "active",
            createdBy: staffClinicianId,
          }).returning({ id: childrenTable.id });
          createdChildIds.push(child.id);
          await db.insert(parentClinicConsentsTable).values({
            parentId: parent.id,
            childId: child.id,
            clinicianId: staffClinicianId,
            scopes: ["documents"],
          });
          return child.id;
        };

        const legacyLinkedChildId = await createParentLinkedChild(staffClinicianId);
        assert.equal(await clinicalRecordClinicId(legacyLinkedChildId), clinic.id);
        const clinicDirectory = await api(`/clinic-management/${clinic.id}/clients`, { cookie: adminCookie });
        assert.equal(clinicDirectory.status, 200);
        assert(
          clinicDirectory.body.clients.some((record: { childId: string }) => record.childId === legacyLinkedChildId),
          "clinic admin directory should include the explicitly linked child",
        );

        const [secondClinic] = await db.insert(clinicsTable).values({
          displayName: "Fictional Second Clinic",
          status: "active",
          createdBy: admin.id,
        }).returning({ id: clinicsTable.id });
        secondClinicId = secondClinic.id;
        await db.insert(clinicMembershipsTable).values({
          clinicId: secondClinic.id,
          userId: staffClinicianId,
          role: "treating_clinician",
          status: "active",
          createdBy: admin.id,
        });

        const ambiguousChildId = await createParentLinkedChild(staffClinicianId);
        assert.equal(await clinicalRecordClinicId(ambiguousChildId), null, "an unscoped legacy family must not be guessed across multiple clinics");
        const explicitlyScopedChildId = await createParentLinkedChild(secondClinic.id);
        assert.equal(await clinicalRecordClinicId(explicitlyScopedChildId), secondClinic.id);
        const explicitlyScopedCurrentClinicChildId = await createParentLinkedChild(clinic.id);
        assert.equal(await clinicalRecordClinicId(explicitlyScopedCurrentClinicChildId), clinic.id);
        const updatedClinicDirectory = await api(`/clinic-management/${clinic.id}/clients`, { cookie: adminCookie });
        assert.equal(updatedClinicDirectory.status, 200);
        assert(!updatedClinicDirectory.body.clients.some((record: { childId: string }) => record.childId === legacyLinkedChildId));
        assert(!updatedClinicDirectory.body.clients.some((record: { childId: string }) => record.childId === ambiguousChildId));
        assert(!updatedClinicDirectory.body.clients.some((record: { childId: string }) => record.childId === explicitlyScopedChildId));
        assert(updatedClinicDirectory.body.clients.some((record: { childId: string }) => record.childId === explicitlyScopedCurrentClinicChildId));
        checks.push({ name: "parent-workspace clinic scope resolution and cross-clinic fail-closed behavior", status: "PASS" });
      } finally {
        for (const childId of createdChildIds) {
          await db.delete(parentClinicConsentsTable).where(eq(parentClinicConsentsTable.childId, childId));
          await db.delete(childrenTable).where(eq(childrenTable.id, childId));
        }
        for (const familyId of createdFamilyIds) {
          await db.delete(familiesTable).where(eq(familiesTable.id, familyId));
        }
        for (const parentId of createdParentIds) {
          await db.delete(parentAccountsTable).where(eq(parentAccountsTable.id, parentId));
        }
        if (secondClinicId) {
          await db.delete(clinicMembershipsTable).where(eq(clinicMembershipsTable.clinicId, secondClinicId));
          await db.delete(clinicsTable).where(eq(clinicsTable.id, secondClinicId));
        }
        await db.update(userProfilesTable).set({ tenantId: originalProfile?.tenantId ?? null })
          .where(eq(userProfilesTable.id, staffClinicianId));
      }
    });

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

    const expiredToken = createClinicInvitationToken();
    const expiredInviteEmail = `expired-${crypto.randomUUID()}@example.test`;
    const expiredUser = await createFixtureUser({
      email: expiredInviteEmail,
      appRole: "pending_clinician",
      accountType: "clinician",
      firstName: "Expired",
      lastName: "Invitee",
    });
    const [expiredInvite] = await db.insert(clinicInvitationsTable).values({
      clinicId: clinic.id,
      invitedEmail: expiredInviteEmail,
      role: "treating_clinician",
      tokenHash: hashClinicInvitationToken(expiredToken),
      requestKey: `clinic-staff-expired:${crypto.randomUUID()}`,
      createdBy: admin.id,
      status: "pending",
      expiresAt: new Date(Date.now() - 60_000),
    }).returning();
    invitationTokens.push(expiredToken);
    const expiredSession = await createSession({
      user: { id: expiredUser.id, email: expiredUser.email, firstName: expiredUser.firstName, lastName: expiredUser.lastName, profileImageUrl: null, isPlatformAdministrator: false },
      access_token: "isolated-test",
    });
    const expiredAccept = await api("/clinic-invitations/accept", { method: "POST", cookie: expiredSession, body: { token: expiredToken } });
    assert.equal(expiredAccept.status, 409);
    const [expiredAfter] = await db.select().from(clinicInvitationsTable).where(eq(clinicInvitationsTable.id, expiredInvite.id));
    assert.equal(expiredAfter.status, "expired");

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

    assignedChildId = crypto.randomUUID();
    await db.insert(childrenTable).values({
      id: assignedChildId,
      tenantId: clinic.id,
      childName: "Fictional Child One",
      status: "active",
      isPatient: true,
    });
    const directory = await api(`/clinic-management/${clinic.id}/clients`, { cookie: adminCookie });
    assert.equal(directory.status, 200);
    assert.deepEqual(directory.body.clients, [{
      childId: assignedChildId,
      displayName: "Fictional Child One",
      treatingClinicianId: null,
    }]);
    const adminChartBefore = await api(`/children/${assignedChildId}`, { cookie: adminCookie });
    assert([403, 404].includes(adminChartBefore.status), "clinic admin membership alone must not grant chart access");
    assert(!adminChartBefore.text.includes("Fictional Child One"));
    const platformChart = await api(`/children/${assignedChildId}`, { cookie: platformCookie });
    assert([403, 404].includes(platformChart.status), "platform admin grant must not grant chart access");
    assert(!platformChart.text.includes("Fictional Child One"));
    const assigned = await api(`/clinic-management/${clinic.id}/clients/${assignedChildId}/reassign`, {
      method: "POST",
      cookie: adminCookie,
      body: { clinicianId: staffClinicianId },
    });
    assert.equal(assigned.status, 200);
    const clinicianChart = await api(`/children/${assignedChildId}`, { cookie: staffClinicianCookie });
    assert.equal(clinicianChart.status, 200);
    assert.equal(clinicianChart.body.id, assignedChildId);
    assert.equal(clinicianChart.body.child_name, "Fictional Child One");
    const crossClinicChart = await api(`/children/${assignedChildId}`, { cookie: otherClinicSession });
    assert([403, 404].includes(crossClinicChart.status));
    assert(!crossClinicChart.text.includes("Fictional Child One"));
    const foreignAssignment = await api(`/clinic-management/${clinic.id}/clients/${assignedChildId}/reassign`, {
      method: "POST",
      cookie: otherClinicSession,
      body: { clinicianId: otherClinic.id },
    });
    assert.equal(foreignAssignment.status, 403);
    const revokedStaff = await api(`/clinic-management/${clinic.id}/staff/${staffClinicianId}/revoke`, {
      method: "POST",
      cookie: adminCookie,
    });
    assert.equal(revokedStaff.status, 200);
    assert.equal(revokedStaff.body.assignmentsRevoked, 1);
    const priorSessionAfterRevoke = await api("/users/me", { cookie: staffClinicianCookie });
    assert.equal(priorSessionAfterRevoke.status, 401);
    assert.equal((await db.select().from(childrenTable).where(eq(childrenTable.id, assignedChildId))).length, 1);
    const [assignmentAfterRevoke] = await db.select().from(clinicalAssignmentsTable).where(and(
      eq(clinicalAssignmentsTable.clinicId, clinic.id),
      eq(clinicalAssignmentsTable.clientId, assignedChildId),
      eq(clinicalAssignmentsTable.userId, staffClinicianId),
    ));
    assert.equal(assignmentAfterRevoke.status, "revoked");
    checks.push({ name: currentScenario, status: "PASS" });
  });

  await t.test("sanitized genuine audit evidence records success and denial with no tokens", async (st) => {
    if (!setupReady) { st.skip("isolated service setup did not pass"); return; }
    currentScenario = "genuine audit events and token redaction";
    const events = await db.select().from(auditLogsTable);
    const actions = new Set(events.map((event) => event.action));
    for (const requiredAction of [
      "platform_admin_bootstrapped",
      "clinic_provisioned",
      "clinic_first_admin_invitation_created",
      "clinic_invitation_reissued",
      "clinic_invitation_accepted",
      "clinic_invitation_accept_denied",
      "clinic_staff_invitation_created",
      "clinic_staff_invitation_reissued",
      "clinic_staff_invitation_creation_denied",
      "clinic_staff_invitation_revoked",
      "clinical_assignment_reassigned",
      "clinical_assignment_reassignment_denied",
      "clinic_staff_access_revoked",
    ]) assert(actions.has(requiredAction), `missing genuine audit action ${requiredAction}`);
    const serialized = JSON.stringify(events);
    for (const secret of [...invitationTokens, ...sensitiveValues]) {
      if (secret) assert(!serialized.includes(secret), "sensitive token or password material leaked to audit");
    }
    checks.push({ name: currentScenario, status: "PASS" });
  });

  await t.test("public clinic requests remain pending until platform review and approved setup uses the existing provisioner", async (st) => {
    if (!setupReady) { st.skip("isolated service setup did not pass"); return; }
    currentScenario = "clinic request intake, pending-only behavior, approval and decline";
    const beforeClinics = await db.select({ id: clinicsTable.id }).from(clinicsTable);
    const beforeInvitations = await db.select({ id: clinicInvitationsTable.id }).from(clinicInvitationsTable);
    const beforeMemberships = await db.select({ id: clinicMembershipsTable.id }).from(clinicMembershipsTable);
    const requestKey = crypto.randomUUID();
    const requestBody = {
      clinicName: "Fictional Request Clinic",
      contactName: "Jordan Test",
      workEmail: `jordan-${crypto.randomUUID()}@example.test`,
      website: "https://fictional-clinic.example.test",
      requestKey,
    };
    const submitted = await api("/clinic-requests", { method: "POST", body: requestBody });
    assert.equal(submitted.status, 202);
    assert.equal(submitted.body.status, "pending");
    assert(!submitted.text.includes(requestBody.workEmail));
    const [requestRecord] = await db.select().from(clinicRequestsTable)
      .where(eq(clinicRequestsTable.id, submitted.body.requestId));
    assert.equal(requestRecord.status, "pending");
    assert.equal(requestRecord.clinicId, null);
    assert.equal((await db.select({ id: clinicsTable.id }).from(clinicsTable)).length, beforeClinics.length);
    assert.equal((await db.select({ id: clinicInvitationsTable.id }).from(clinicInvitationsTable)).length, beforeInvitations.length);
    assert.equal((await db.select({ id: clinicMembershipsTable.id }).from(clinicMembershipsTable)).length, beforeMemberships.length);

    const listingDenied = await api("/platform-management/clinic-requests");
    assert.equal(listingDenied.status, 401);
    const nonPlatform = await createFixtureUser({
      email: `request-viewer-${crypto.randomUUID()}@example.test`,
      appRole: "clinician",
      accountType: "clinician",
      firstName: "Request",
      lastName: "Viewer",
    });
    const nonPlatformSession = await createSession({
      user: { id: nonPlatform.id, email: nonPlatform.email, firstName: nonPlatform.firstName, lastName: nonPlatform.lastName, profileImageUrl: null, isPlatformAdministrator: false },
      access_token: "isolated-test",
    });
    const nonPlatformList = await api("/platform-management/clinic-requests", { cookie: nonPlatformSession });
    assert.equal(nonPlatformList.status, 403);
    assert(!nonPlatformList.text.includes(requestBody.workEmail));
    const unauthorizedApproval = await api(`/platform-management/clinic-requests/${requestRecord.id}/approve`, {
      method: "POST",
      cookie: nonPlatformSession,
      body: { firstAdminEmail: requestBody.workEmail },
    });
    assert.equal(unauthorizedApproval.status, 403);
    assert.equal((await db.select().from(clinicRequestsTable).where(eq(clinicRequestsTable.id, requestRecord.id)))[0].status, "pending");
    const platformQueue = await api("/platform-management/clinic-requests", { cookie: platformCookie });
    assert.equal(platformQueue.status, 200);
    assert(platformQueue.body.requests.some((item: any) => item.requestId === requestRecord.id));

    const firstAdminEmail = `designated-admin-${crypto.randomUUID()}@example.test`;
    latestMessage = null;
    const approved = await api(`/platform-management/clinic-requests/${requestRecord.id}/approve`, {
      method: "POST",
      cookie: platformCookie,
      body: { firstAdminEmail },
    });
    assert.equal(approved.status, 201);
    assert.equal(approved.body.clinicStatus, "pending");
    assert.equal(approved.body.invitation.role, "clinic_admin");
    assert.equal(approved.body.invitation.invitedEmail, firstAdminEmail);
    assert(["test_sink_accepted", "not_sent"].includes(approved.body.invitation.deliveryStatus));
    const requestInvitationToken = approved.body.invitation.deliveryStatus === "test_sink_accepted"
      ? await getInvitationToken()
      : "";
    assert(!requestInvitationToken || !approved.text.includes(requestInvitationToken));
    assert(!approved.text.includes(firstAdminToken));
    const [approvedRequest] = await db.select().from(clinicRequestsTable)
      .where(eq(clinicRequestsTable.id, requestRecord.id));
    assert.equal(approvedRequest.status, "approved");
    assert.equal(approvedRequest.clinicId, approved.body.clinicId);
    assert.equal((await db.select().from(usersTable).where(eq(usersTable.email, firstAdminEmail))).length, 0);
    const [approvedInvitation] = await db.select().from(clinicInvitationsTable)
      .where(eq(clinicInvitationsTable.id, approved.body.invitation.id));
    assert.equal(approvedInvitation.status, "pending");
    assert.equal(approvedInvitation.tokenHash.length, 64);
    assert(!approved.text.includes(approvedInvitation.tokenHash));
    if (approvedInvitation.deliveryStatus === "test_sink_accepted") assert.equal(requestInvitationToken.length > 32, true);
    const clinicCountAfterApproval = (await db.select({ id: clinicsTable.id }).from(clinicsTable)).length;
    const invitationCountAfterApproval = (await db.select({ id: clinicInvitationsTable.id }).from(clinicInvitationsTable)).length;
    const retryApproval = await api(`/platform-management/clinic-requests/${requestRecord.id}/approve`, {
      method: "POST",
      cookie: platformCookie,
      body: { firstAdminEmail },
    });
    assert.equal(retryApproval.status, 200);
    assert.equal(retryApproval.body.invitation.id, approved.body.invitation.id);
    assert.equal((await db.select({ id: clinicsTable.id }).from(clinicsTable)).length, clinicCountAfterApproval);
    assert.equal((await db.select({ id: clinicInvitationsTable.id }).from(clinicInvitationsTable)).length, invitationCountAfterApproval);

    const declineBody = {
      ...requestBody,
      clinicName: "Fictional Declined Clinic",
      workEmail: `declined-${crypto.randomUUID()}@example.test`,
      requestKey: crypto.randomUUID(),
    };
    const declinedRequest = await api("/clinic-requests", { method: "POST", body: declineBody });
    assert.equal(declinedRequest.status, 202);
    const beforeDeclineClinics = (await db.select({ id: clinicsTable.id }).from(clinicsTable)).length;
    const decline = await api(`/platform-management/clinic-requests/${declinedRequest.body.requestId}/decline`, {
      method: "POST",
      cookie: platformCookie,
    });
    assert.equal(decline.status, 200);
    assert.equal((await db.select().from(clinicRequestsTable).where(eq(clinicRequestsTable.id, declinedRequest.body.requestId)))[0].status, "declined");
    assert.equal((await db.select({ id: clinicsTable.id }).from(clinicsTable)).length, beforeDeclineClinics);
    const requestAudits = await db.select().from(auditLogsTable).where(eq(auditLogsTable.targetId, requestRecord.id));
    assert(requestAudits.some((event) => event.action === "clinic_request_submitted" && event.success));
    assert(requestAudits.some((event) => event.action === "clinic_request_approved" && event.success));
    assert(requestAudits.every((event) => !JSON.stringify(event.metadata || {}).toLowerCase().includes("email")));
    const declinedAudits = await db.select().from(auditLogsTable).where(eq(auditLogsTable.targetId, declinedRequest.body.requestId));
    assert(declinedAudits.some((event) => event.action === "clinic_request_submitted" && event.success));
    assert(declinedAudits.some((event) => event.action === "clinic_request_declined" && event.success));
    checks.push({ name: currentScenario, status: "PASS" });
  });

});
