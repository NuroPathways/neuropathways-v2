import { Router } from "express";
import crypto from "crypto";
import {
  db,
  usersTable,
  sessionsTable,
  clinicMembershipsTable,
  clinicsTable,
} from "@workspace/db";
import { writeAuditEvent, writeAuditEventBestEffort } from "../lib/auditEvents";
import { respondWithInternalError } from "../lib/apiError";
import { userProfilesTable, clinicianCredentialsTable, consentEventsTable } from "@workspace/db";
import { and, eq, ne, sql } from "drizzle-orm";
import { createSession, deleteSession, getSessionId, SESSION_COOKIE, SESSION_TTL } from "../lib/auth";
import { isDisabledPublicDemoClinicianEmail } from "../lib/publicDemoAccountPolicy";
import { accountAuthorityEvent, validateAccountAuthority } from "../lib/accountAuthority";
import { createClinicianPasswordHash, verifyClinicianPassword } from "../lib/clinicianPassword";
import { PENDING_CLINICIAN_ROLE } from "../lib/securityPolicies";
import { getClinicianAccessibleChildren } from "../lib/clinicAuthorization";

const router = Router();

function setSessionCookie(res: any, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

async function clinicianHasActiveAccess(userId: string): Promise<boolean> {
  const [membership] = await db.select({ id: clinicMembershipsTable.id })
    .from(clinicMembershipsTable)
    .innerJoin(clinicsTable, eq(clinicsTable.id, clinicMembershipsTable.clinicId))
    .where(and(
      eq(clinicMembershipsTable.userId, userId),
      eq(clinicMembershipsTable.status, "active"),
      eq(clinicsTable.status, "active"),
    ))
    .limit(1);
  if (membership) return true;
  return (await getClinicianAccessibleChildren(userId)).length > 0;
}

async function registerClinician(req: any, res: any) {
  const { email, password, firstName, lastName } = req.body;
  const authority = validateAccountAuthority(req.body, "clinician");
  if (!authority.ok) {
    return res.status(authority.error.startsWith("A parent or guardian must create this account") ? 403 : 400)
      .json({ error: authority.error });
  }
  if (typeof email !== "string" || !email.trim() || typeof password !== "string" || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const normalizedEmail = email.toLowerCase().trim();
  if (
    normalizedEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ||
    isDisabledPublicDemoClinicianEmail(normalizedEmail)
  ) {
    return res.status(400).json({ error: "Enter a valid work email address." });
  }
  if (
    typeof firstName !== "string" ||
    typeof lastName !== "string" ||
    !firstName.trim() ||
    !lastName.trim() ||
    firstName.length > 100 ||
    lastName.length > 100
  ) {
    return res.status(400).json({ error: "First and last name are required." });
  }

  const cleanFirstName = firstName.trim();
  const cleanLastName = lastName.trim();

  try {
    const [existingCredentials] = await db
      .select()
      .from(clinicianCredentialsTable)
      .where(eq(clinicianCredentialsTable.email, normalizedEmail));
    if (existingCredentials) {
      return res.status(409).json({ error: "An account with this email already exists. Please sign in." });
    }

    const [existingUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, normalizedEmail));
    if (existingUser) {
      return res.status(409).json({
        error: 'An account with this email already exists. If you previously signed in with Replit, use "Continue with Replit Account" to sign in.',
      });
    }

    const userId = crypto.randomUUID();
    const passwordHash = await createClinicianPasswordHash(password);
    const authorityRecord = accountAuthorityEvent("clinician", authority.ageGroup, false, false);

    // The account is created in a non-privileged state. It receives no session
    // and cannot access client records until an authorized approver activates it.
    await db.transaction(async (tx) => {
      await tx.insert(usersTable).values({
        id: userId,
        email: normalizedEmail,
        firstName: cleanFirstName,
        lastName: cleanLastName,
      });
      await tx.insert(userProfilesTable).values({
        id: userId,
        appRole: PENDING_CLINICIAN_ROLE,
        accountType: "clinician",
        displayName: `${cleanFirstName} ${cleanLastName}`,
      });
      await tx.insert(clinicianCredentialsTable).values({
        userId,
        email: normalizedEmail,
        passwordHash,
      });
      await tx.insert(consentEventsTable).values({
        subjectId: userId,
        eventType: authorityRecord.eventType,
        policyType: "account_holder_authority",
        version: "1.0",
        acceptanceMethod: "signup_checkbox",
        source: "signup",
        actorType: "user",
        metadata: authorityRecord.metadata,
      });
      await writeAuditEvent(tx, {
        userId,
        userRole: PENDING_CLINICIAN_ROLE,
        action: "clinician_access_requested",
        targetType: "clinician_account",
        targetId: userId,
        metadata: { status: "pending_approval" },
        requestId: req.id,
      });
    });

    return res.status(202).json({
      ok: true,
      pendingApproval: true,
      message: "Your request was received. Your clinician account is pending approval and remains locked until a clinic administrator approves it.",
    });
  } catch (error: any) {
    if (error?.code === "23505") {
      return res.status(409).json({ error: "An account with this email already exists. Please sign in." });
    }
    return res.status(500).json({ error: "Could not submit the clinician access request. Please try again." });
  }
}

router.post("/clinician/register", registerClinician);
router.post("/mobile/clinician/register", registerClinician);

async function loginClinician(req: any, res: any) {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email and password are required" });

  const normalizedEmail = String(email).toLowerCase().trim();
  if (isDisabledPublicDemoClinicianEmail(normalizedEmail)) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  try {
    const [creds] = await db
      .select()
      .from(clinicianCredentialsTable)
      .where(eq(clinicianCredentialsTable.email, normalizedEmail));

    if (!creds) {
      await writeAuditEventBestEffort({
        userRole: "clinician",
        action: "failed_login",
        targetType: "clinician_account",
        success: false,
        reason: "Invalid login credentials.",
        metadata: { method: "email_password" },
        ipAddress: req.ip,
        requestId: req.id,
      });
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (!await verifyClinicianPassword(password, creds.passwordHash)) {
      await writeAuditEventBestEffort({
        userId: creds.userId,
        userRole: "clinician",
        action: "failed_login",
        targetType: "clinician_account",
        targetId: creds.userId,
        success: false,
        reason: "Invalid login credentials.",
        metadata: { method: "email_password" },
        ipAddress: req.ip,
        requestId: req.id,
      });
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, creds.userId));
    if (!user)
      return res.status(401).json({ error: "Account not found" });
    const [profile] = await db.select().from(userProfilesTable).where(eq(userProfilesTable.id, user.id));
    if (profile?.appRole === PENDING_CLINICIAN_ROLE) {
      return res.status(403).json({
        error: "This clinician account is awaiting clinic administrator approval.",
        pendingApproval: true,
      });
    }
    if (profile?.appRole !== "clinician")
      return res.status(403).json({ error: "This account is not a clinician account" });

    if (!(await clinicianHasActiveAccess(user.id))) {
      await writeAuditEventBestEffort({
        userId: user.id,
        userRole: "clinician",
        tenantId: profile?.tenantId ?? null,
        action: "clinician_login_denied_no_active_access",
        targetType: "clinician_account",
        targetId: user.id,
        success: false,
        reason: "No active clinic membership or authorized client access",
        metadata: { method: "email_password" },
        ipAddress: req.ip,
        requestId: req.id,
      });
      return res.status(403).json({
        error: "This clinician account has no active clinic or client access.",
      });
    }

    const sid = await createSession({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
      },
      access_token: "email_auth",
    });
    if (req.path.startsWith("/mobile/")) {
      res.json({ token: sid, clinician: { id: user.id, email: user.email, first_name: user.firstName, last_name: user.lastName, role: "clinician" } });
    } else {
      setSessionCookie(res, sid);
      res.json({ ok: true, redirect: "/ClinicianDashboard" });
    }
    await writeAuditEventBestEffort({
      userId: user.id,
      userRole: "clinician",
      action: "login",
      targetType: "clinician_account",
      targetId: user.id,
      metadata: { method: "email_password" },
      ipAddress: req.ip,
      requestId: req.id,
    });
  } catch (e: any) {
    return respondWithInternalError(req, res, e, "clinician-login");
  }
}

router.post("/clinician/login", loginClinician);
router.post("/mobile/clinician/login", loginClinician);

router.delete("/mobile/clinician/logout", async (req: any, res) => {
  if (!req.user?.id) return res.status(401).json({ error: "Not authenticated" });
  const sid = getSessionId(req);
  if (sid) await deleteSession(sid);
  return res.json({ ok: true });
});

router.post("/clinician/change-password", async (req: any, res) => {
  if (!req.user?.id) return res.status(401).json({ error: "Not authenticated" });
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: "current_password and new_password required" });
  if (new_password.length < 8) return res.status(400).json({ error: "New password must be at least 8 characters" });

  try {
    const [creds] = await db.select().from(clinicianCredentialsTable).where(eq(clinicianCredentialsTable.userId, req.user.id));
    if (!creds) return res.status(404).json({ error: "No email/password account found. You may have signed in with a different method." });

    if (!await verifyClinicianPassword(current_password, creds.passwordHash)) return res.status(401).json({ error: "Current password is incorrect" });

    const passwordHash = await createClinicianPasswordHash(new_password);
    const currentSessionId = getSessionId(req);
    const changed = await db.transaction(async (tx) => {
      const [updated] = await tx.update(clinicianCredentialsTable)
        .set({ passwordHash })
        .where(and(
          eq(clinicianCredentialsTable.userId, req.user.id),
          eq(clinicianCredentialsTable.passwordHash, creds.passwordHash),
        ))
        .returning({ userId: clinicianCredentialsTable.userId });
      if (!updated) return false;

      const userSessions = sql`${sessionsTable.sess} -> 'user' ->> 'id' = ${req.user.id}`;
      await tx.delete(sessionsTable).where(currentSessionId
        ? and(userSessions, ne(sessionsTable.sid, currentSessionId))
        : userSessions);
      await writeAuditEvent(tx, {
        userId: req.user.id,
        userRole: "clinician",
        action: "clinician_password_changed",
        targetType: "clinician_account",
        targetId: req.user.id,
        metadata: { other_sessions_revoked: true },
        requestId: req.id,
      });
      return true;
    });
    if (!changed) return res.status(409).json({ error: "Your password changed in another session. Sign in again before trying once more." });

    return res.json({ ok: true, otherSessionsRevoked: true });
  } catch (e: any) {
    return respondWithInternalError(req, res, e, "clinician-password-change");
  }
});

export default router;
