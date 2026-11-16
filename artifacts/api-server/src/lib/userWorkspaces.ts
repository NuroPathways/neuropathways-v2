import { and, eq, isNull } from "drizzle-orm";
import {
  db,
  clinicMembershipsTable,
  clinicsTable,
  platformAdministratorGrantsTable,
  userProfilesTable,
} from "@workspace/db";
import { getClinicianAccessibleChildren } from "./clinicAuthorization";

export type AuthorizedWorkspace = {
  id: "platform-administration" | "clinic-administration" | "clinical-workspace";
  type: "platform_admin" | "clinic_admin" | "clinician";
  label: string;
  homePath: "/PlatformAdminClinics" | "/ClinicianUsers" | "/ClinicianDashboard";
};

export async function listAuthorizedWorkspaces(userId: string): Promise<AuthorizedWorkspace[]> {
  const [[profile], [platformGrant], memberships] = await Promise.all([
    db.select({
      appRole: userProfilesTable.appRole,
      accountType: userProfilesTable.accountType,
    }).from(userProfilesTable).where(eq(userProfilesTable.id, userId)),
    db.select({ id: platformAdministratorGrantsTable.id })
      .from(platformAdministratorGrantsTable).where(and(
        eq(platformAdministratorGrantsTable.userId, userId),
        eq(platformAdministratorGrantsTable.status, "active"),
        isNull(platformAdministratorGrantsTable.revokedAt),
      )),
    db.select({
      role: clinicMembershipsTable.role,
      clinicName: clinicsTable.displayName,
    }).from(clinicMembershipsTable)
      .innerJoin(clinicsTable, eq(clinicsTable.id, clinicMembershipsTable.clinicId))
      .where(and(
        eq(clinicMembershipsTable.userId, userId),
        eq(clinicMembershipsTable.status, "active"),
        eq(clinicsTable.status, "active"),
      )),
  ]);

  const profileIsClinician = profile?.appRole === "clinician" && profile?.accountType === "clinician";
  const workspaces: AuthorizedWorkspace[] = [];
  if (profileIsClinician && platformGrant) {
    workspaces.push({
      id: "platform-administration",
      type: "platform_admin",
      label: "Platform administration",
      homePath: "/PlatformAdminClinics",
    });
  }
  if (profileIsClinician && memberships.some((membership) => membership.role === "clinic_admin")) {
    workspaces.push({
      id: "clinic-administration",
      type: "clinic_admin",
      label: memberships.filter((membership) => membership.role === "clinic_admin").length > 1
        ? "Clinic administration"
        : `${memberships.find((membership) => membership.role === "clinic_admin")!.clinicName} administration`,
      homePath: "/ClinicianUsers",
    });
  }
  const hasTreatingMembership = profileIsClinician && memberships.some((membership) =>
    membership.role === "treating_clinician" || membership.role === "clinical_supervisor"
  );
  const hasLegacyClinicalAccess = profileIsClinician && (await getClinicianAccessibleChildren(userId)).length > 0;
  if (hasTreatingMembership || hasLegacyClinicalAccess) {
    workspaces.push({
      id: "clinical-workspace",
      type: "clinician",
      label: "Clinician workspace",
      homePath: "/ClinicianDashboard",
    });
  }
  return workspaces;
}

export function defaultWorkspace(workspaces: AuthorizedWorkspace[]): AuthorizedWorkspace | null {
  return workspaces.find((workspace) => workspace.type === "platform_admin")
    ?? workspaces.find((workspace) => workspace.type === "clinic_admin")
    ?? workspaces[0]
    ?? null;
}
