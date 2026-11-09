import { and, eq, inArray } from "drizzle-orm";
import { db, parentDocumentsTable, parentChildSettingsTable, childrenTable } from "@workspace/db";

export function parentVisibleScanDocumentIds(
  rows: readonly { id: string; childId: string | null; uploadedBy: string; canScan?: boolean }[],
  childId: string,
): Set<string> {
  return new Set(rows
    .filter((row) => row.childId === childId && row.uploadedBy === "clinician" && row.canScan === true)
    .map((row) => row.id));
}

export function allSourceDocumentsVisible(
  sourceDocumentIds: unknown,
  visibleDocumentIds: readonly string[],
): boolean {
  if (!Array.isArray(sourceDocumentIds)) return true;
  const sourceIds = [...new Set(sourceDocumentIds)];
  if (sourceIds.length === 0) return true;
  if (sourceIds.some((id) => typeof id !== "string" || !id)) return false;
  const visible = new Set(visibleDocumentIds);
  return sourceIds.every((id) => visible.has(id));
}

export type LegacyDocumentViewerRole = "clinician" | "parent" | "client";

export function documentAccessRolesPermit(
  accessRoles: string | null | undefined,
  viewerRole: LegacyDocumentViewerRole,
): boolean {
  if (viewerRole === "clinician" || !accessRoles?.trim()) return true;

  const configuredRoles = new Set(
    accessRoles.toLowerCase().match(/[a-z]+/g) ?? [],
  );
  if (configuredRoles.has("all") || configuredRoles.has("everyone")) return true;
  return ["parent", "caregiver", "family", "client", "guardian"].some((role) => configuredRoles.has(role));
}

export function filterDocumentsForViewerRole<T extends { accessRoles?: string | null }>(
  rows: readonly T[],
  viewerRole: LegacyDocumentViewerRole,
): T[] {
  return rows.filter((row) => documentAccessRolesPermit(row.accessRoles, viewerRole));
}

/**
 * Old clinician and invited-child APIs must not infer permission to a
 * parent-owned document from the fact that its child is linked to a clinic.
 */
export async function legacyVisibleDocuments<T extends {
  id: string;
  childId: string | null;
  accessRoles?: string | null;
}>(
  rows: T[],
  clinicianId: string | null,
  viewerRole: LegacyDocumentViewerRole = "clinician",
): Promise<T[]> {
  if (!rows.length) return rows;
  const metadata = await db.select().from(parentDocumentsTable)
    .where(inArray(parentDocumentsTable.documentId, rows.map(row => row.id)));
  const permissions = new Map(metadata.map(row => [row.documentId, row]));
  return filterDocumentsForViewerRole(
    rows,
    viewerRole,
  ).filter(row => {
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