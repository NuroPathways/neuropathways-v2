import crypto from "node:crypto";
import { db } from "@workspace/db";
import { clientSessionsTable, childrenTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function validateClientSession(token: string | undefined | null): Promise<{ childId: string } | null> {
  if (!token || typeof token !== "string") return null;
  if (token.startsWith("cs_")) return null;
  const [row] = await db.select().from(clientSessionsTable).where(eq(clientSessionsTable.inviteToken, token));
  if (!row?.childId) return null;
  if (row.expiresAt && row.expiresAt < new Date()) return null;
  return { childId: row.childId };
}

export async function sessionMayAccessChild(sessionChildId: string, targetChildId: string): Promise<boolean> {
  if (sessionChildId === targetChildId) return true;
  const [auth] = await db.select().from(childrenTable).where(eq(childrenTable.id, sessionChildId));
  const [target] = await db.select().from(childrenTable).where(eq(childrenTable.id, targetChildId));
  if (!auth?.familyId || auth.familyId !== target?.familyId) return false;
  if (auth.clinicianId !== target.clinicianId) return false;
  return true;
}

export async function getChildWithClinician(childId: string) {
  const [child] = await db.select().from(childrenTable).where(eq(childrenTable.id, childId));
  return child;
}
