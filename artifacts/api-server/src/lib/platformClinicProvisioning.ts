import { and, eq, isNull, sql } from "drizzle-orm";
import {
  clinicInvitationsTable,
  clinicsTable,
  platformAdministratorGrantsTable,
  userProfilesTable,
} from "@workspace/db";
import { writeAuditEvent } from "./auditEvents";
import { hashClinicInvitationToken } from "./clinicInvitationSecurity";

export const FIRST_ADMIN_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function hasPlatformAuthority(userId: string, executor: any): Promise<boolean> {
  const [[grant], [profile]] = await Promise.all([
    executor.select({ id: platformAdministratorGrantsTable.id })
      .from(platformAdministratorGrantsTable).where(and(
        eq(platformAdministratorGrantsTable.userId, userId),
        eq(platformAdministratorGrantsTable.status, "active"),
        isNull(platformAdministratorGrantsTable.revokedAt),
      )),
    executor.select({
      appRole: userProfilesTable.appRole,
      accountType: userProfilesTable.accountType,
    }).from(userProfilesTable).where(eq(userProfilesTable.id, userId)),
  ]);
  return Boolean(grant && profile?.appRole === "clinician" && profile?.accountType === "clinician");
}

export async function provisionClinicAndFirstAdminInTransaction(
  tx: any,
  input: {
    userId: string;
    clinicName: string;
    invitedEmail: string;
    requestKey: string;
    token: string;
    request: { ip?: string; id?: string | number };
  },
) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.requestKey}))`);
  if (!(await hasPlatformAuthority(input.userId, tx))) {
    throw Object.assign(new Error("Platform administrator permission required"), { status: 403 });
  }

  let [clinic] = await tx.select().from(clinicsTable)
    .where(eq(clinicsTable.creationRequestKey, input.requestKey.replace(/^platform-create:/, "")));
  let [invitation] = clinic
    ? await tx.select().from(clinicInvitationsTable).where(and(
        eq(clinicInvitationsTable.clinicId, clinic.id),
        eq(clinicInvitationsTable.requestKey, input.requestKey),
      ))
    : [];

  if (clinic) {
    if (clinic.displayName !== input.clinicName || invitation?.invitedEmail !== input.invitedEmail) {
      throw Object.assign(new Error("Request key was already used for another clinic invitation"), { status: 409 });
    }
    if (!invitation) {
      invitation = (await tx.insert(clinicInvitationsTable).values({
        clinicId: clinic.id,
        invitedEmail: input.invitedEmail,
        role: "clinic_admin",
        tokenHash: hashClinicInvitationToken(input.token),
        requestKey: input.requestKey,
        createdBy: input.userId,
        expiresAt: new Date(Date.now() + FIRST_ADMIN_INVITATION_TTL_MS),
      }).returning())[0];
      await writeAuditEvent(tx, {
        userId: input.userId,
        userRole: "platform_admin",
        tenantId: clinic.id,
        action: "clinic_first_admin_invitation_created",
        targetType: "clinic_invitation",
        targetId: invitation.id,
        metadata: { role: "clinic_admin", retry_recovered: true },
        ipAddress: input.request.ip,
        requestId: input.request.id,
      });
    }
    return { clinic, invitation, created: false };
  }

  clinic = (await tx.insert(clinicsTable).values({
    displayName: input.clinicName,
    status: "pending",
    createdBy: input.userId,
    creationRequestKey: input.requestKey.replace(/^platform-create:/, ""),
  }).returning())[0];
  invitation = (await tx.insert(clinicInvitationsTable).values({
    clinicId: clinic.id,
    invitedEmail: input.invitedEmail,
    role: "clinic_admin",
    tokenHash: hashClinicInvitationToken(input.token),
    requestKey: input.requestKey,
    createdBy: input.userId,
    expiresAt: new Date(Date.now() + FIRST_ADMIN_INVITATION_TTL_MS),
  }).returning())[0];
  await writeAuditEvent(tx, {
    userId: input.userId,
    userRole: "platform_admin",
    tenantId: clinic.id,
    action: "clinic_provisioned",
    targetType: "clinic",
    targetId: clinic.id,
    metadata: { status: "pending", first_admin_invitation_id: invitation.id },
    ipAddress: input.request.ip,
    requestId: input.request.id,
  });
  await writeAuditEvent(tx, {
    userId: input.userId,
    userRole: "platform_admin",
    tenantId: clinic.id,
    action: "clinic_first_admin_invitation_created",
    targetType: "clinic_invitation",
    targetId: invitation.id,
    metadata: { role: "clinic_admin" },
    ipAddress: input.request.ip,
    requestId: input.request.id,
  });
  return { clinic, invitation, created: true };
}
