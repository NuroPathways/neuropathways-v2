import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { and, eq, gt } from "drizzle-orm";
import {
  childrenTable,
  db,
  parentAccountsTable,
  parentChildSettingsTable,
  parentSessionsTable,
} from "@workspace/db";
import { starterLibrary } from "./parentStarterLibrary";

export const PARENT_SESSION_COOKIE = "np_parent_sid";
export const PARENT_SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
export const CURRENT_PRIVACY_POLICY_VERSION = "1.0";
export const CURRENT_HEALTH_CONSENT_VERSION = "1.0";

export interface ParentIdentity {
  id: string;
  firstName: string;
  email: string;
  workspaceId: string;
  accountType: "parent_free";
}

declare global {
  namespace Express {
    interface Request {
      parentAccount?: ParentIdentity;
    }
  }
}

export function normalizeParentEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length < 6 || email.length > 254 || /[\s\u0000-\u001f\u007f]/.test(email)) return null;

  const parts = email.split("@");
  if (parts.length !== 2) return null;
  const [local, domain] = parts;
  if (
    local.length < 1 ||
    local.length > 64 ||
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..") ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)
  ) {
    return null;
  }

  if (domain.length < 3 || domain.length > 253 || !domain.includes(".")) return null;
  const labels = domain.split(".");
  if (labels.some((label) =>
    label.length < 1 ||
    label.length > 63 ||
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
  )) return null;

  return email;
}

export function validateParentPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 128;
}

export function hashParentPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("base64url");
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) return reject(error);
      resolve(`scrypt$16384$8$1$${salt}$${key.toString("base64url")}`);
    });
  });
}

export async function verifyParentPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, cost, blockSize, parallelization, salt, stored] = encoded.split("$");
  if (
    algorithm !== "scrypt" ||
    cost !== "16384" ||
    blockSize !== "8" ||
    parallelization !== "1" ||
    !salt ||
    !stored
  ) {
    return false;
  }

  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) return reject(error);
      const actual = Buffer.from(key);
      const expected = Buffer.from(stored, "base64url");
      resolve(actual.length === expected.length && crypto.timingSafeEqual(actual, expected));
    });
  });
}

export async function performParentPasswordCheck(password: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    crypto.scrypt(password, "parent-auth-timing-equalization-salt", 64, {
      N: 16_384,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    }, (error) => {
      if (error) return reject(error);
      resolve();
    });
  });
}

function readParentToken(req: Request): string | null {
  const explicit = req.headers["x-parent-token"];
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  const authorization = req.headers.authorization;
  if (typeof authorization === "string") {
    const match = authorization.match(/^Bearer\s+(\S+)$/i);
    if (match) return match[1];
  }
  const cookieToken = req.cookies?.[PARENT_SESSION_COOKIE];
  return typeof cookieToken === "string" && cookieToken ? cookieToken : null;
}

export function hashParentSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export async function createParentSession(parentId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + PARENT_SESSION_TTL);
  await db.insert(parentSessionsTable).values({
    tokenHash: hashParentSessionToken(token),
    parentId,
    expiresAt,
  });
  return { token, expiresAt };
}

export async function revokeParentSession(token: string | null | undefined): Promise<void> {
  if (!token) return;
  await db.delete(parentSessionsTable).where(eq(parentSessionsTable.tokenHash, hashParentSessionToken(token)));
}

export async function resolveParent(req: Request): Promise<ParentIdentity | null> {
  const token = readParentToken(req);
  if (!token || token.length > 512) return null;
  const tokenHash = hashParentSessionToken(token);
  const now = new Date();
  const [session] = await db
    .select({ parentId: parentSessionsTable.parentId, expiresAt: parentSessionsTable.expiresAt })
    .from(parentSessionsTable)
    .where(and(eq(parentSessionsTable.tokenHash, tokenHash), gt(parentSessionsTable.expiresAt, now)));
  if (!session) {
    await db.delete(parentSessionsTable).where(eq(parentSessionsTable.tokenHash, tokenHash));
    return null;
  }

  const [parent] = await db
    .select({
      id: parentAccountsTable.id,
      firstName: parentAccountsTable.firstName,
      email: parentAccountsTable.email,
      workspaceId: parentAccountsTable.workspaceId,
    })
    .from(parentAccountsTable)
    .where(eq(parentAccountsTable.id, session.parentId));
  if (!parent) {
    await db.delete(parentSessionsTable).where(eq(parentSessionsTable.tokenHash, tokenHash));
    return null;
  }
  return { ...parent, accountType: "parent_free" };
}

export async function ownedParentChild(parentId: string, childId: string) {
  const [owned] = await db
    .select({ child: childrenTable, settings: parentChildSettingsTable })
    .from(childrenTable)
    .innerJoin(
      parentChildSettingsTable,
      and(
        eq(parentChildSettingsTable.childId, childrenTable.id),
        eq(parentChildSettingsTable.parentId, parentId),
      ),
    )
    .where(and(eq(childrenTable.id, childId), eq(childrenTable.parentId, parentId)));
  return owned ? { ...owned.child, child: owned.child, settings: owned.settings } : null;
}

export function serializeParentChild(
  child: typeof childrenTable.$inferSelect,
  settings: typeof parentChildSettingsTable.$inferSelect | null,
) {
  const behaviorKey = settings?.behaviorKey ?? null;
  const behaviorName = settings?.customBehavior ??
    starterLibrary.find((template) => template.key === behaviorKey)?.name ??
    behaviorKey;
  return {
    id: child.id,
    name: child.childName?.trim() || [child.firstName, child.lastName].filter(Boolean).join(" ").trim(),
    age: child.age ?? null,
    notes: child.notes ?? "",
    behaviorKey,
    behaviorName: behaviorName || null,
    goal: settings?.goal ?? null,
    workspaceId: settings?.workspaceId ?? child.tenantId ?? child.familyId ?? "",
    parentId: child.parentId ?? "",
    familyId: child.familyId ?? "",
    clinicianId: child.clinicianId ?? null,
  };
}

export async function requireParent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parent = await resolveParent(req);
    if (!parent) {
      res.status(401).json({ error: "Parent authentication required" });
      return;
    }
    req.parentAccount = parent;
    next();
  } catch (error) {
    next(error);
  }
}