import { and, eq, inArray, isNull, or } from "drizzle-orm";
import {
  db,
  childrenTable,
  clinicMembershipsTable,
  clinicsTable,
  clinicalAssignmentsTable,
  familiesTable,
  parentAccountsTable,
  parentClinicConsentsTable,
  platformAdministratorGrantsTable,
  userProfilesTable,
} from "@workspace/db";
import { classifyFamilyAccount } from "./familyParentAuth";
import {
  canAccessClinicalRecord,
  isPlatformAdministrator,
  resolveClinicIdForTenant,
  resolveLegacyClinicId,
} from "./clinicAccessPolicy";

export async function clinicianCanAccessChild(userId: string, childId: string): Promise<boolean> {
  const [[child], [profile]] = await Promise.all([
    db.select().from(childrenTable).where(eq(childrenTable.id, childId)),
    db.select({
      appRole: userProfilesTable.appRole,
      tenantId: userProfilesTable.tenantId,
    }).from(userProfilesTable).where(eq(userProfilesTable.id, userId)),
  ]);
  if (!child || profile?.appRole !== "clinician") return false;

  const legacyTenantKey = resolveLegacyClinicId(child.tenantId, child.clinicianId);
  const clinicRows = legacyTenantKey
    ? await db.select({
        id: clinicsTable.id,
        legacyTenantId: clinicsTable.legacyTenantId,
        status: clinicsTable.status,
      }).from(clinicsTable).where(or(
        eq(clinicsTable.id, legacyTenantKey),
        eq(clinicsTable.legacyTenantId, legacyTenantKey),
      ))
    : [];
  const clinicId = resolveClinicIdForTenant(legacyTenantKey, clinicRows);
  if (!clinicId) return false;
  const clinic = clinicRows.find((row) => row.id === clinicId);

  const [memberships, assignments] = await Promise.all([
    db.select({
      clinicId: clinicMembershipsTable.clinicId,
      userId: clinicMembershipsTable.userId,
      role: clinicMembershipsTable.role,
      status: clinicMembershipsTable.status,
    }).from(clinicMembershipsTable).where(and(
      eq(clinicMembershipsTable.userId, userId),
      eq(clinicMembershipsTable.clinicId, clinicId),
    )),
    db.select({
      clinicId: clinicalAssignmentsTable.clinicId,
      clientId: clinicalAssignmentsTable.clientId,
      userId: clinicalAssignmentsTable.userId,
      role: clinicalAssignmentsTable.role,
      status: clinicalAssignmentsTable.status,
    }).from(clinicalAssignmentsTable).where(and(
      eq(clinicalAssignmentsTable.userId, userId),
      eq(clinicalAssignmentsTable.clientId, childId),
      eq(clinicalAssignmentsTable.clinicId, clinicId),
    )),
  ]);

  let linkedParentWorkspaceConsent = false;
  if (child.parentId && child.tenantId && child.clinicianId === userId) {
    const [parent] = await db.select({
      workspaceId: parentAccountsTable.workspaceId,
    }).from(parentAccountsTable).where(eq(parentAccountsTable.id, child.parentId));
    if (parent?.workspaceId === child.tenantId) {
      const [grant] = await db.select({ parentId: parentClinicConsentsTable.parentId })
        .from(parentClinicConsentsTable).where(and(
          eq(parentClinicConsentsTable.parentId, child.parentId),
          eq(parentClinicConsentsTable.childId, childId),
          eq(parentClinicConsentsTable.clinicianId, userId),
          isNull(parentClinicConsentsTable.revokedAt),
        ));
      linkedParentWorkspaceConsent = Boolean(grant);
    }
  }

  return canAccessClinicalRecord({
    userId,
    clinicId,
    clientId: childId,
    recordClinicId: clinicId,
    clinicStatus: clinic?.status ?? "active",
    memberships: memberships as any,
    assignments: assignments as any,
    legacy: {
      profileRole: profile.appRole,
      profileTenantId: profile.tenantId,
      recordTenantId: child.tenantId,
      recordClinicianId: child.clinicianId,
      canonicalClinicId: clinicId,
      linkedParentWorkspaceConsent,
    },
  });
}

export async function getClinicianAccessibleChildren(userId: string) {
  const [profile] = await db.select({ appRole: userProfilesTable.appRole })
    .from(userProfilesTable).where(eq(userProfilesTable.id, userId));
  if (profile?.appRole !== "clinician") return [];

  const [directChildren, assignments] = await Promise.all([
    db.select({ id: childrenTable.id }).from(childrenTable)
      .where(eq(childrenTable.clinicianId, userId)),
    db.select({ clientId: clinicalAssignmentsTable.clientId })
      .from(clinicalAssignmentsTable).where(and(
        eq(clinicalAssignmentsTable.userId, userId),
        eq(clinicalAssignmentsTable.status, "active"),
      )),
  ]);
  const candidateIds = [...new Set([
    ...directChildren.map((child) => child.id),
    ...assignments.map((assignment) => assignment.clientId),
  ])];
  if (candidateIds.length === 0) return [];

  const candidates = await db.select().from(childrenTable)
    .where(inArray(childrenTable.id, candidateIds));
  const access = await Promise.all(candidates.map((child) =>
    clinicianCanAccessChild(userId, child.id)
  ));
  return candidates.filter((_child, index) => access[index]);
}

export async function clinicianCanManageClinicalWorkspace(userId: string): Promise<boolean> {
  const [profile] = await db.select({
    appRole: userProfilesTable.appRole,
    tenantId: userProfilesTable.tenantId,
  }).from(userProfilesTable).where(eq(userProfilesTable.id, userId));
  if (profile?.appRole !== "clinician") return false;
  const tenantKey = profile.tenantId?.trim() || userId;
  const clinicRows = await db.select({
    id: clinicsTable.id,
    legacyTenantId: clinicsTable.legacyTenantId,
    status: clinicsTable.status,
  }).from(clinicsTable).where(or(
    eq(clinicsTable.id, tenantKey),
    eq(clinicsTable.legacyTenantId, tenantKey),
  ));
  const clinic = clinicRows[0];
  if (!clinic) {
    // Compatibility for existing single-clinician tenants until their
    // server-owned tenant identifier is mapped to a clinic record.
    return true;
  }
  if (clinic.status !== "active") return false;
  const [membership] = await db.select({ id: clinicMembershipsTable.id })
    .from(clinicMembershipsTable).where(and(
      eq(clinicMembershipsTable.userId, userId),
      eq(clinicMembershipsTable.clinicId, clinic.id),
      eq(clinicMembershipsTable.role, "treating_clinician"),
      eq(clinicMembershipsTable.status, "active"),
    ));
  return Boolean(membership);
}

export async function userIsActivePlatformAdministrator(userId: string): Promise<boolean> {
  const grants = await db.select({
    userId: platformAdministratorGrantsTable.userId,
    status: platformAdministratorGrantsTable.status,
  }).from(platformAdministratorGrantsTable).where(and(
    eq(platformAdministratorGrantsTable.userId, userId),
    eq(platformAdministratorGrantsTable.status, "active"),
    isNull(platformAdministratorGrantsTable.revokedAt),
  ));
  return isPlatformAdministrator(userId, grants);
}

export async function parentCanAccessChild(
  userId: string,
  email: string | null | undefined,
  childId: string,
): Promise<boolean> {
  const [child] = await db.select().from(childrenTable).where(eq(childrenTable.id, childId));
  if (!child) return false;
  if (child.parentId === userId) return true;

  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail || child.parentEmail?.trim().toLowerCase() !== normalizedEmail || !child.familyId) {
    return false;
  }
  const [family] = await db.select().from(familiesTable).where(eq(familiesTable.id, child.familyId));
  return Boolean(
    family &&
    classifyFamilyAccount(family.accountType) === "family" &&
    family.email?.trim().toLowerCase() === normalizedEmail &&
    family.clinicianId === child.clinicianId &&
    family.tenantId === child.tenantId
  );
}

export async function getParentAccessibleChildren(
  userId: string,
  email: string | null | undefined,
) {
  const [direct, emailMatches] = await Promise.all([
    db.select().from(childrenTable).where(eq(childrenTable.parentId, userId)),
    email
      ? db.select().from(childrenTable).where(eq(childrenTable.parentEmail, email))
      : Promise.resolve([]),
  ]);
  const candidates = [...new Map([...direct, ...emailMatches].map((child) => [child.id, child])).values()];
  const access = await Promise.all(candidates.map((child) =>
    parentCanAccessChild(userId, email, child.id)
  ));
  return candidates.filter((_child, index) => access[index]);
}
