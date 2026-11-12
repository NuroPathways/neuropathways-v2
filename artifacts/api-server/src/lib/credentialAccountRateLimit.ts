import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { eq } from "drizzle-orm";
import {
  clientAccessCodeResetsTable,
  db,
  passwordResetTokensTable,
} from "@workspace/db";
import { writeAuditEventBestEffort } from "./auditEvents";

type Identity = { scope: string; identifier: string; limit?: number };
type LimiterOptions = {
  identity: (req: Request) => Identity | null;
  limit: number | ((req: Request) => number);
  windowMs: number;
  onLimit?: (req: Request, res: Response, limit: number, windowMs: number) => void | Promise<void>;
};

const processKey = crypto.randomBytes(32);
const WINDOW_MS = 15 * 60 * 1000;

// This uses express-rate-limit's default in-memory store: limits are process-local
// and reset on process restart. A multi-instance AWS deployment must configure a
// shared store (for example Redis/ElastiCache) before treating these as fleet-wide.
function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().toLowerCase();
  return cleaned ? cleaned.slice(0, 320) : null;
}

function requestPath(req: Request): string {
  return `${req.baseUrl || ""}${req.path || ""}`.split("?")[0].slice(0, 180);
}

function requestBody(req: Request): Record<string, unknown> {
  return req.body && typeof req.body === "object" && !Array.isArray(req.body)
    ? req.body as Record<string, unknown>
    : {};
}

function tokenDigest(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return crypto.createHash("sha256").update(value.trim()).digest("hex");
}

function attachIdentity(req: Request, identity: Identity | null): void {
  (req as any).credentialAccountIdentity = identity;
}

function getIdentity(req: Request): Identity | null {
  const attached = (req as any).credentialAccountIdentity as Identity | null | undefined;
  if (attached) return attached;

  const path = requestPath(req).replace(/^\/api(?=\/|$)/, "");
  const body = requestBody(req);
  const email = cleanString(body.email);
  const username = cleanString(body.username);
  const userId = cleanString((req as any).user?.id);

  if (path === "/parent/auth/login" && email) return { scope: "parent-login", identifier: email, limit: 10 };
  if (path === "/parent/auth/register" && email) return { scope: "parent-registration", identifier: email, limit: 10 };
  if (path === "/parent-signup" && username) return { scope: "legacy-parent-signup", identifier: username, limit: 5 };
  if ((path === "/clinician/login" || path === "/mobile/clinician/login") && email) {
    return { scope: "clinician-login", identifier: email, limit: 10 };
  }
  if ((path === "/clinician/register" || path === "/mobile/clinician/register") && email) {
    return { scope: "clinician-registration", identifier: email, limit: 10 };
  }
  if (path === "/clinician/change-password" && userId) {
    return { scope: "clinician-password-change", identifier: userId, limit: 5 };
  }
  if (
    path === "/client-session/login" ||
    path === "/verify-client-credentials" ||
    path === "/mobile/auth/login" ||
    path === "/client-session/change-access-code"
  ) {
    return username ? { scope: "family-access-code", identifier: username, limit: 10 } : null;
  }
  if (path === "/client-access-code-reset/request") {
    const childId = cleanString(body.child_id);
    return childId ? { scope: "client-code-reset-request", identifier: childId, limit: 10 } : null;
  }
  if (path === "/auth/password-reset/request" && email) {
    const accountType = cleanString(body.accountType) || "unspecified";
    return { scope: `password-reset-request:${accountType}`, identifier: email, limit: 5 };
  }

  const resolved = (req as any).credentialAccountIdentity as Identity | null | undefined;
  return resolved ?? null;
}

/**
 * Resolves body-supplied credential identifiers after JSON parsing and before
 * account-based limiting. Reset links are looked up by their one-way digest;
 * neither the raw link nor the digest is written to logs or audit metadata.
 */
export async function resolveCredentialAccountIdentity(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const path = requestPath(req).replace(/^\/api(?=\/|$)/, "");
  const body = requestBody(req);
  try {
    if (path === "/auth/password-reset/complete") {
      const digest = tokenDigest(body.token);
      if (digest) {
        attachIdentity(req, { scope: "password-reset-complete:unknown", identifier: digest, limit: 8 });
        const [reset] = await db.select({
          accountId: passwordResetTokensTable.accountId,
          accountType: passwordResetTokensTable.accountType,
        }).from(passwordResetTokensTable).where(eq(passwordResetTokensTable.tokenHash, digest)).limit(1);
        attachIdentity(req, reset
          ? { scope: `password-reset-complete:${reset.accountType}`, identifier: reset.accountId, limit: 8 }
          : { scope: "password-reset-complete:unknown", identifier: digest, limit: 8 });
      }
    } else if (path === "/client-access-code-reset/complete") {
      const digest = tokenDigest(body.token);
      if (digest) {
        attachIdentity(req, { scope: "client-code-reset-complete:unknown", identifier: digest, limit: 10 });
        const [reset] = await db.select({
          familyId: clientAccessCodeResetsTable.familyId,
          childId: clientAccessCodeResetsTable.childId,
        }).from(clientAccessCodeResetsTable)
          .where(eq(clientAccessCodeResetsTable.tokenHash, digest)).limit(1);
        attachIdentity(req, reset
          ? { scope: "client-code-reset-complete", identifier: reset.familyId || reset.childId, limit: 10 }
          : { scope: "client-code-reset-complete:unknown", identifier: digest, limit: 10 });
      }
    } else if (path === "/parent/auth/change-password") {
      const parent = (req as any).parentAccount || (req as any).familyParent;
      if (parent?.id) attachIdentity(req, { scope: "parent-password-change", identifier: String(parent.id), limit: 5 });
    } else if (path === "/mobile/auth/change-access-code") {
      const mobileUser = (req as any).mobileUser;
      const accountId = mobileUser?.familyId || mobileUser?.authenticatedChildId;
      if (accountId) attachIdentity(req, { scope: "mobile-access-code-change", identifier: String(accountId), limit: 10 });
    }
  } catch {
    // Do not fail a credential route because an optional account lookup failed.
    // A reset request still receives the independent per-IP protection.
  }
  next();
}

export function credentialAccountRateLimitKey(scope: string, identifier: string): string {
  return crypto.createHmac("sha256", processKey)
    .update(`${scope.trim().toLowerCase()}\u0000${identifier.trim().toLowerCase()}`)
    .digest("hex");
}

export function createCredentialAccountLimiter(options: LimiterOptions) {
  return rateLimit({
    windowMs: options.windowMs,
    limit: (req) => options.identity(req)?.limit ?? (
      typeof options.limit === "number" ? options.limit : options.limit(req)
    ),
    keyGenerator(req) {
      const identity = options.identity(req);
      return identity
        ? credentialAccountRateLimitKey(identity.scope, identity.identifier)
        : "credential-account-unidentified";
    },
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip(req) {
      return process.env.DISABLE_RATE_LIMIT === "true" || options.identity(req) === null;
    },
    handler: async (req, res, _next, limiterOptions) => {
      const identity = options.identity(req);
      const path = requestPath(req);
      const max = typeof limiterOptions.limit === "number" ? limiterOptions.limit : 10;
      if (options.onLimit) {
        await options.onLimit(req, res, max, options.windowMs);
        return;
      }
      await writeAuditEventBestEffort({
        userId: (req as any).user?.id ?? (req as any).parentAccount?.id ?? null,
        userRole: (req as any).user?.appRole ?? ((req as any).parentAccount ? "parent" : "anonymous"),
        action: "credential_account_rate_limited",
        targetType: "auth_route",
        targetId: path,
        success: false,
        reason: "Credential account rate limit exceeded.",
        metadata: {
          request_path: path,
          limiter_scope: identity?.scope ?? "unknown",
          limit: max,
          window_ms: options.windowMs,
        },
        ipAddress: req.ip,
        requestId: (req as any).id,
      });
      res.status(limiterOptions.statusCode).json({
        error: "Too many attempts. Please try again later.",
      });
    },
  });
}

const resolvedAccountLimiter = createCredentialAccountLimiter({
  windowMs: WINDOW_MS,
  limit: 10,
  identity: getIdentity,
});

export { resolvedAccountLimiter as credentialAccountLimiter };
