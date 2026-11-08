import type {
  ClinicMembershipRole,
  ClinicalAssignmentRole,
} from "@workspace/db";

export type ClinicMembershipGrant = {
  clinicId: string;
  userId: string;
  role: ClinicMembershipRole;
  status: string;
};

export type ClinicalAssignmentGrant = {
  clinicId: string;
  clientId: string;
  userId: string;
  role: ClinicalAssignmentRole;
  status: string;
};

export type PlatformAdministratorGrant = {
  userId: string;
  status: string;
};

export function isPlatformAdministrator(
  userId: string,
  grants: readonly PlatformAdministratorGrant[],
): boolean {
  return grants.some((grant) => grant.userId === userId && grant.status === "active");
}

export function canManageClinic(
  userId: string,
  clinicId: string,
  memberships: readonly ClinicMembershipGrant[],
): boolean {
  return memberships.some((membership) =>
    membership.userId === userId &&
    membership.clinicId === clinicId &&
    membership.role === "clinic_admin" &&
    membership.status === "active"
  );
}

export function resolveLegacyClinicId(
  tenantId: string | null | undefined,
  clinicianId: string | null | undefined,
): string | null {
  return tenantId?.trim() || clinicianId?.trim() || null;
}

export function resolveClinicIdForTenant(
  tenantId: string | null | undefined,
  clinics: readonly { id: string; legacyTenantId: string | null }[],
): string | null {
  const key = tenantId?.trim();
  if (!key) return null;
  return clinics.find((clinic) => clinic.id === key || clinic.legacyTenantId === key)?.id ?? key;
}

type ClinicalRecordAccessInput = {
  userId: string;
  clinicId: string;
  clientId: string;
  recordClinicId: string | null;
  clinicStatus: string;
  memberships: readonly ClinicMembershipGrant[];
  assignments: readonly ClinicalAssignmentGrant[];
  legacy?: {
    profileRole: string | null;
    profileTenantId: string | null;
    recordTenantId: string | null;
    recordClinicianId: string | null;
    canonicalClinicId?: string | null;
    linkedParentWorkspaceConsent?: boolean;
  } | null;
};

/**
 * Inputs must be resolved from server-owned profile, clinic, child, membership,
 * and assignment records. Clinic administration and platform administration
 * alone never grant clinical-record access.
 */
export function canAccessClinicalRecord(input: ClinicalRecordAccessInput): boolean {
  if (
    input.clinicStatus !== "active" ||
    !input.recordClinicId ||
    input.recordClinicId !== input.clinicId
  ) {
    return false;
  }

  const activeMemberships = input.memberships.filter((membership) =>
    membership.userId === input.userId &&
    membership.clinicId === input.recordClinicId &&
    membership.status === "active"
  );
  const activeAssignments = input.assignments.filter((assignment) =>
    assignment.userId === input.userId &&
    assignment.clinicId === input.recordClinicId &&
    assignment.clientId === input.clientId &&
    assignment.status === "active"
  );

  const assignedTreatingClinician = activeMemberships.some((membership) =>
    membership.role === "treating_clinician"
  ) && activeAssignments.some((assignment) => assignment.role === "treating_clinician");
  if (assignedTreatingClinician) return true;

  const assignedSupervisor = activeMemberships.some((membership) =>
    membership.role === "clinical_supervisor"
  ) && activeAssignments.some((assignment) => assignment.role === "clinical_supervisor");
  if (assignedSupervisor) return true;

  const explicitMemberships = input.memberships.filter((membership) =>
    membership.userId === input.userId &&
    membership.clinicId === input.recordClinicId
  );
  if (explicitMemberships.some((membership) => membership.status !== "active")) {
    return false;
  }

  const legacy = input.legacy;
  if (!legacy || legacy.profileRole !== "clinician") return false;
  if (legacy.recordClinicianId !== input.userId) return false;

  const legacyClinicId = resolveLegacyClinicId(
    legacy.recordTenantId,
    legacy.recordClinicianId,
  );
  const expectedClinicId = legacy.profileTenantId?.trim() || input.userId;
  const clinicId = legacy.canonicalClinicId ?? legacyClinicId;
  const tenantMatches = legacyClinicId === expectedClinicId;
  const authorizedParentWorkspace = legacy.linkedParentWorkspaceConsent === true;
  return (
    (tenantMatches || authorizedParentWorkspace) &&
    clinicId === input.recordClinicId
  );
}
