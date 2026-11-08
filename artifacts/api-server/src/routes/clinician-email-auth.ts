import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { userProfilesTable, clinicianCredentialsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createSession, deleteSession, getSessionId, SESSION_COOKIE, SESSION_TTL } from "../lib/auth";
import { isDisabledPublicDemoClinicianEmail } from "../lib/publicDemoAccountPolicy";
import { createClinicianPasswordHash, verifyClinicianPassword } from "../lib/clinicianPassword";

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

async function registerClinician(_req: any, res: any) {
  return res.status(403).json({
    error: "Clinician registration is paused pending clinic administrator approval.",
  });
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

    if (!creds)
      return res.status(401).json({ error: "Invalid email or password" });

    if (!await verifyClinicianPassword(password, creds.passwordHash))
      return res.status(401).json({ error: "Invalid email or password" });

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, creds.userId));
    if (!user)
      return res.status(401).json({ error: "Account not found" });
    const [profile] = await db.select().from(userProfilesTable).where(eq(userProfilesTable.id, user.id));
    if (profile?.appRole !== "clinician")
      return res.status(403).json({ error: "This account is not a clinician account" });

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
  } catch (e: any) {
    res.status(500).json({ error: e.message });
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
    await db.update(clinicianCredentialsTable).set({ passwordHash }).where(eq(clinicianCredentialsTable.userId, req.user.id));

    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
