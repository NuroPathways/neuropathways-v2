import { and, eq, inArray } from "drizzle-orm";
import { db, parentDocumentsTable, parentChildSettingsTable, childrenTable } from "@workspace/db";

/**
 * Old clinician and invited-child APIs must not infer permission to a
 * parent-owned document from the fact that its child is linked to a clinic.
 */
export async function legacyVisibleDocuments<T extends { id: string; childId: string | null }>(
  rows: T[],
  clinicianId: string | null,
): Promise<T[]> {
  if (!rows.length) return rows;
  const metadata = await db.select().from(parentDocumentsTable)
    .where(inArray(parentDocumentsTable.documentId, rows.map(row => row.id)));
  const permissions = new Map(metadata.map(row => [row.documentId, row]));
  return rows.filter(row => {
    const owned = permissions.get(row.id);
    return !owned || Boolean(clinicianId && owned.sharedClinicianId === clinicianId && owned.childId === row.childId);
  });
}

export async function isParentOwnedChild(childId: string): Promise<boolean> {
  const [settings] = await db.select({ id: parentChildSettingsTable.childId })
    .from(parentChildSettingsTable).where(eq(parentChildSettingsTable.childId, childId));
  return Boolean(settings);
}

export async function isParentOwnedDocument(documentId: string): Promise<boolean> {
  const [metadata] = await db.select({ id: parentDocumentsTable.documentId })
    .from(parentDocumentsTable).where(eq(parentDocumentsTable.documentId, documentId));
  return Boolean(metadata);
}

export async function familyHasParentOwnedChildren(familyId: string): Promise<boolean> {
  const rows = await db.select({ id: parentChildSettingsTable.childId }).from(parentChildSettingsTable)
    .innerJoin(childrenTable, and(eq(childrenTable.id, parentChildSettingsTable.childId), eq(childrenTable.familyId, familyId)))
    .limit(1);
  return rows.length > 0;
}