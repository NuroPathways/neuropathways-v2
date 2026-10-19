import crypto from "node:crypto";
import { Router, type Request } from "express";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import {
  clinicianCredentialsTable,
  db,
  parentAccountsTable,
  parentSessionsTable,
  passwordResetTokensTable,
  sessionsTable,
} from "@workspace/db";
import { CompletePasswordResetBody, RequestPasswordResetBody } from "@workspace/api-zod";
import { createClinicianPasswordHash } from "../lib/clinicianPassword";
import { hashParentPassword, normalizeParentEmail } from "../lib/parentAuth";
import { sendPasswordResetEmail } from "../lib/passwordResetEmail";

const router = Router();
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const GENERIC_REQUEST_MESSAGE = "If an account matches that sign-in type, a password reset link will be sent to that email address.";

function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function passwordResetUrl(token: string, accountType: "parent" | "clinician"): string {
  const configuredBase = process.env.PASSWORD_RESET_BASE_URL
    || process.env.CORS_ORIGIN?.split(",")[0]?.trim()
    || (process.env.NODE_ENV !== "production" && process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : "");
  if (!configuredBase) throw new Error("Password reset base URL is not configured");

  const base = new URL(configuredBase);
  if (base.username || base.password || (process.env.NODE_ENV === "production" && base.protocol !== "https:")) {
    throw new Error("Password reset base URL must be a secure public URL");
  }
  const appPath = base.pathname.replace(/\/+$/, "");
  base.pathname = `${appPath}/ResetPassword`;
  base.search = "";
  base.hash = new URLSearchParams({ token, accountType }).toString();
  return base.toString();
}

router.post("/auth/password-reset/request", async (req, res) => {
  const parsed = RequestPasswordResetBody.safeParse(req.body);
  const email = parsed.success ? normalizeParentEmail(parsed.data.email) : null;
  if (!parsed.success || !email) {
    res.status(400).json({ error: "Enter a valid email address and account type." });
    return;
  }

  try {
    const now = new Date();
    await db.delete(passwordResetTokensTable).where(lt(passwordResetTokensTable.expiresAt, now));

    let account: { id: string; email: string } | undefined;
    if (parsed.data.accountType === "parent") {
      const [parent] = await db
        .select({ id: parentAccountsTable.id, email: parentAccountsTable.email })
        .from(parentAccountsTable)
        .where(eq(parentAccountsTable.email, email));
      account = parent;
    } else {
      const [clinician] = await db
        .select({ id: clinicianCredentialsTable.userId, email: clinicianCredentialsTable.email })
        .from(clinicianCredentialsTable)
        .where(eq(clinicianCredentialsTable.email, email));
      account = clinician;
    }

    if (account) {
      const token = crypto.randomBytes(32).toString("base64url");
      const tokenHash = hashResetToken(token);
      const expiresAt = new Date(now.getTime() + RESET_TOKEN_TTL_MS);

      const created = await db.transaction(async (tx) => {
        const [accountStillExists] = parsed.data.accountType === "parent"
          ? await tx
            .select({ id: parentAccountsTable.id })
            .from(parentAccountsTable)
            .where(eq(parentAccountsTable.id, account.id))
            .for("update")
          : await tx
            .select({ id: clinicianCredentialsTable.userId })
            .from(clinicianCredentialsTable)
            .where(eq(clinicianCredentialsTable.userId, account.id))
            .for("update");
        if (!accountStillExists) return false;

        await tx
          .update(passwordResetTokensTable)
          .set({ usedAt: now })
          .where(and(
            eq(passwordResetTokensTable.accountType, parsed.data.accountType),
            eq(passwordResetTokensTable.accountId, account.id),
            isNull(passwordResetTokensTable.usedAt),
          ));
        await tx.insert(passwordResetTokensTable).values({
          accountType: parsed.data.accountType,
          accountId: account.id,
          tokenHash,
          expiresAt,
        });
        return true;
      });

      if (created) void Promise.resolve()
        .then(() => sendPasswordResetEmail({
          recipient: account.email,
          resetUrl: passwordResetUrl(token, parsed.data.accountType),
          accountType: parsed.data.accountType,
        }))
        .catch(async (error: unknown) => {
          try {
            await db
              .update(passwordResetTokensTable)
              .set({ usedAt: new Date() })
              .where(and(
                eq(passwordResetTokensTable.tokenHash, tokenHash),
                isNull(passwordResetTokensTable.usedAt),
              ));
          } catch {
            // The original reset remains unusable after its expiry even if cleanup fails.
          }
          const statusCode = typeof error === "object" && error !== null && "statusCode" in error
            ? Number((error as { statusCode: unknown }).statusCode)
            : undefined;
          req.log.error({ accountType: parsed.data.accountType, statusCode }, "Password reset email delivery failed");
        });
    }

    res.status(202).json({ ok: true, message: GENERIC_REQUEST_MESSAGE });
  } catch (error) {
    req.log.error({ errorType: error instanceof Error ? error.name : typeof error }, "Unable to create password reset request");
    res.status(500).json({ error: "Unable to process this request right now. Please try again later." });
  }
});

router.post("/auth/password-reset/complete", async (req, res) => {
  const parsed = CompletePasswordResetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a new password with at least 8 characters." });
    return;
  }

  try {
    const tokenHash = hashResetToken(parsed.data.token);
    const now = new Date();
    const [candidate] = await db
      .select()
      .from(passwordResetTokensTable)
      .where(and(
        eq(passwordResetTokensTable.tokenHash, tokenHash),
        isNull(passwordResetTokensTable.usedAt),
        gt(passwordResetTokensTable.expiresAt, now),
      ));
    if (!candidate) {
      res.status(400).json({ error: "This reset link is invalid or has expired. Request a new link and try again." });
      return;
    }

    const passwordHash = candidate.accountType === "parent"
      ? await hashParentPassword(parsed.data.newPassword)
      : await createClinicianPasswordHash(parsed.data.newPassword);

    const updated = await db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(passwordResetTokensTable)
        .where(and(
          eq(passwordResetTokensTable.id, candidate.id),
          eq(passwordResetTokensTable.tokenHash, tokenHash),
          isNull(passwordResetTokensTable.usedAt),
          gt(passwordResetTokensTable.expiresAt, new Date()),
        ))
        .for("update");
      if (!locked) return false;

      if (locked.accountType === "parent") {
        const [parent] = await tx
          .update(parentAccountsTable)
          .set({ passwordHash })
          .where(eq(parentAccountsTable.id, locked.accountId))
          .returning({ id: parentAccountsTable.id });
        if (!parent) return false;
        await tx.delete(parentSessionsTable).where(eq(parentSessionsTable.parentId, locked.accountId));
      } else {
        const [clinician] = await tx
          .update(clinicianCredentialsTable)
          .set({ passwordHash })
          .where(eq(clinicianCredentialsTable.userId, locked.accountId))
          .returning({ userId: clinicianCredentialsTable.userId });
        if (!clinician) return false;
        await tx
          .delete(sessionsTable)
          .where(sql`${sessionsTable.sess} -> 'user' ->> 'id' = ${locked.accountId}`);
      }

      await tx
        .update(passwordResetTokensTable)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokensTable.id, locked.id));
      return true;
    });

    if (!updated) {
      res.status(400).json({ error: "This reset link is invalid or has expired. Request a new link and try again." });
      return;
    }

    res.json({ ok: true });
  } catch (error) {
    req.log.error({ errorType: error instanceof Error ? error.name : typeof error }, "Unable to complete password reset");
    res.status(500).json({ error: "Unable to reset the password right now. Please try again later." });
  }
});

export default router;
