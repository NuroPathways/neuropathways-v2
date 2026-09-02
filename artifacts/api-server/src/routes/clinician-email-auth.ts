import { Router } from "express";
import crypto from "crypto";
import { db, usersTable } from "@workspace/db";
import { userProfilesTable, clinicianCredentialsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createSession, SESSION_COOKIE, SESSION_TTL } from "../lib/auth";

const router = Router();

function hashPassword(password: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      else resolve(key.toString("hex"));
    });
  });
}

function setSessionCookie(res: any, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

router.post("/clinician/register", async (req, res) => {
  const { email, password, firstName, lastName } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email and password are required" });
  if (password.length < 8)
    return res.status(400).json({ error: "Password must be at least 8 characters" });

  const normEmail = email.toLowerCase().trim();

  try {
    const [existingCreds] = await db
      .select()
      .from(clinicianCredentialsTable)
      .where(eq(clinicianCredentialsTable.email, normEmail));
    if (existingCreds)
      return res.status(409).json({ error: "An account with this email already exists. Please sign in." });

    // The users table also enforces a unique email. A row can already exist
    // here from a prior Replit (OIDC) sign-in even when no password credentials
    // exist. Detect that explicitly instead of failing on the DB constraint.
    const [existingUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, normEmail));
    if (existingUser)
      return res.status(409).json({
        error:
          'An account with this email already exists. If you previously signed in with Replit, use "Continue with Replit Account" to sign in.',
      });

    const userId = crypto.randomUUID();
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = await hashPassword(password, salt);

    // Create the three rows atomically so a mid-way failure can't leave an
    // orphan users row that blocks future registration attempts.
    await db.transaction(async (tx) => {
      await tx.insert(usersTable).values({
        id: userId,
        email: normEmail,
        firstName: firstName?.trim() || null,
        lastName: lastName?.trim() || null,
      });

      await tx.insert(userProfilesTable).values({
        id: userId,
        appRole: "clinician",
        accountType: "clinician",
        displayName:
          firstName && lastName
            ? `${firstName.trim()} ${lastName.trim()}`
            : firstName?.trim() || null,
      });

      await tx.insert(clinicianCredentialsTable).values({
        userId,
        email: normEmail,
        passwordHash: `${salt}:${hash}`,
      });
    });

    const sid = await createSession({
      user: {
        id: userId,
        email: normEmail,
        firstName: firstName?.trim() || null,
        lastName: lastName?.trim() || null,
        profileImageUrl: null,
      },
      access_token: "email_auth",
    });
    setSessionCookie(res, sid);

    res.status(201).json({ ok: true, redirect: "/ClinicianDashboard" });
  } catch (e: any) {
    // Postgres unique_violation — e.g. a concurrent registration for the same
    // email slipped past the pre-checks. Return a clean 409 instead of a 500.
    if (e?.code === "23505")
      return res.status(409).json({ error: "An account with this email already exists. Please sign in." });
    res.status(500).json({ error: e.message });
  }
});

router.post("/clinician/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email and password are required" });

  try {
    const [creds] = await db
      .select()
      .from(clinicianCredentialsTable)
      .where(eq(clinicianCredentialsTable.email, email.toLowerCase().trim()));

    if (!creds)
      return res.status(401).json({ error: "Invalid email or password" });

    const [salt, storedHash] = creds.passwordHash.split(":");
    const inputHash = await hashPassword(password, salt);

    if (inputHash !== storedHash)
      return res.status(401).json({ error: "Invalid email or password" });

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, creds.userId));
    if (!user)
      return res.status(401).json({ error: "Account not found" });

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
    setSessionCookie(res, sid);

    res.json({ ok: true, redirect: "/ClinicianDashboard" });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/clinician/change-password", async (req: any, res) => {
  if (!req.user?.id) return res.status(401).json({ error: "Not authenticated" });
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: "current_password and new_password required" });
  if (new_password.length < 8) return res.status(400).json({ error: "New password must be at least 8 characters" });

  try {
    const [creds] = await db.select().from(clinicianCredentialsTable).where(eq(clinicianCredentialsTable.userId, req.user.id));
    if (!creds) return res.status(404).json({ error: "No email/password account found. You may have signed in with a different method." });

    const [salt, storedHash] = creds.passwordHash.split(":");
    const inputHash = await hashPassword(current_password, salt);
    if (inputHash !== storedHash) return res.status(401).json({ error: "Current password is incorrect" });

    const newSalt = crypto.randomBytes(16).toString("hex");
    const newHash = await hashPassword(new_password, newSalt);
    await db.update(clinicianCredentialsTable).set({ passwordHash: `${newSalt}:${newHash}` }).where(eq(clinicianCredentialsTable.userId, req.user.id));

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
