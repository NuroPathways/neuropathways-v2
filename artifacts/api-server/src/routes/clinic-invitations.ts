import { Router } from "express";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  clinicInvitationsTable,
  clinicMembershipsTable,
  clinicsTable,
  db,
  platformAdministratorGrantsTable,
  usersTable,
  userProfilesTable,
} from "@workspace/db";
import {
  AcceptClinicInvitationBody,
  AcceptClinicInvitationResponse,
} from "@workspace/api-zod";
import { writeAuditEvent, writeAuditEventBestEffort } from "../lib/auditEvents";
import { hashClinicInvitationToken, normalizeInvitationEmail } from "../lib/clinicInvitationSecurity";

const router = Router();

type AcceptanceOutcome =
  | { accepted: true; clinicId: string; clinicName: string; role: "clinic_admin" | "treating_clinician" }
  | { accepted: false; status: number; reason: string; clinicId?: string; invitationId?: string };

async function inviterStillAuthorized(tx: any, invitation: any): Promise<boolean> {
  if (invitation.role === "clinic_admin") {
    const [grant] = await tx.select({ id: platformAdministratorGrantsTable.id })
      .from(platformAdministratorGrantsTable).where(and(
        eq(platformAdministratorGrantsTable.userId, invitation.createdBy),
        eq(platformAdministratorGrantsTable.status, "active"),
        isNull(platformAdministratorGrantsTable.revokedAt),
      ));
    const [profile] = await tx.select({ appRole: userProfilesTable.appRole, accountType: userProfilesTable.accountType })
      .from(userProfilesTable).where(eq(userProfilesTable.id, invitation.createdBy));
    return Boolean(grant && profile?.appRole === "clinician" && profile.accountType === "clinician");
  }
  const [membership] = await tx.select({ id: clinicMembershipsTable.id })
    .from(clinicMembershipsTable).where(and(
      eq(clinicMembershipsTable.userId, invitation.createdBy),
      eq(clinicMembershipsTable.clinicId, invitation.clinicId),
      eq(clinicMembershipsTable.role, "clinic_admin"),
      eq(clinicMembershipsTable.status, "active"),
    ));
  const [clinic] = await tx.select({ status: clinicsTable.status })
    .from(clinicsTable).where(eq(clinicsTable.id, invitation.clinicId));
  const [profile] = await tx.select({
    appRole: userProfilesTable.appRole,
    accountType: userProfilesTable.accountType,
  }).from(userProfilesTable).where(eq(userProfilesTable.id, invitation.createdBy));
  return Boolean(
    membership &&
    clinic?.status === "active" &&
    profile?.appRole === "clinician" &&
    profile.accountType === "clinician",
  );
}

async function denialAudit(req: any, input: {
  actorId: string;
  action: string;
  reason: string;
  clinicId?: string;
  invitationId?: string;
  role?: string;
}) {
  await writeAuditEventBestEffort({
    userId: input.actorId,
    userRole: req.user?.appRole ?? "authenticated",
    tenantId: input.clinicId ?? null,
    action: input.action,
    targetType: "clinic_invitation",
    targetId: input.invitationId ?? null,
    success: false,
    reason: input.reason,
    metadata: input.role ? { invitation_role: input.role } : null,
    ipAddress: req.ip,
    requestId: req.id,
  });
}

router.post("/clinic-invitations/accept", async (req: any, res): Promise<void> => {
  const actorId = typeof req.user?.id === "string" ? req.user.id : null;
  if (!actorId) {
    await writeAuditEventBestEffort({
      userRole: "unauthenticated",
      action: "clinic_invitation_accept_denied",
      targetType: "clinic_invitation",
      success: false,
      reason: "Authentication required",
      metadata: null,
      ipAddress: req.ip,
      requestId: req.id,
    });
    res.status(401).json({ error: "Sign in to accept this invitation" });
    return;
  }

  const parsed = AcceptClinicInvitationBody.safeParse(req.body);
  if (!parsed.success) {
    await denialAudit(req, {
      actorId,
      action: "clinic_invitation_accept_denied",
      reason: "Invitation token request was invalid",
    });
    res.status(400).json({ error: "This invitation cannot be accepted" });
    return;
  }
  const tokenHash = hashClinicInvitationToken(parsed.data.token);
  const now = new Date();

  try {
    const outcome: AcceptanceOutcome = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${tokenHash}))`);
      const [invitation] = await tx.select().from(clinicInvitationsTable)
        .where(eq(clinicInvitationsTable.tokenHash, tokenHash))
        .for("update");
      if (!invitation) {
        await writeAuditEvent(tx, {
          userId: actorId,
          userRole: req.user?.appRole ?? "authenticated",
          action: "clinic_invitation_accept_denied",
          targetType: "clinic_invitation",
          success: false,
          reason: "Invitation token is not valid",
          metadata: null,
          ipAddress: req.ip,
          requestId: req.id,
        });
        return { accepted: false, status: 400, reason: "invalid" };
      }

      const [clinic] = await tx.select().from(clinicsTable).where(eq(clinicsTable.id, invitation.clinicId));
      const [user] = await tx.select().from(usersTable).where(eq(usersTable.id, actorId));
      const [profile] = await tx.select().from(userProfilesTable).where(eq(userProfilesTable.id, actorId));
      const normalizedAccountEmail = normalizeInvitationEmail(user?.email);
      const normalizedInviteEmail = normalizeInvitationEmail(invitation.invitedEmail);

      let status = 403;
      let denialReason = "Invitation identity or current authority does not match";
      if (
        invitation.status !== "pending" ||
        invitation.expiresAt <= now ||
        !clinic ||
        (invitation.role === "clinic_admin" && clinic.status !== "pending") ||
        (invitation.role === "treating_clinician" && clinic.status !== "active")
      ) {
        status = 409;
        denialReason = "Invitation is expired, revoked, superseded, already used, or its clinic is unavailable";
        if (invitation.status === "pending" && invitation.expiresAt <= now) {
          await tx.update(clinicInvitationsTable).set({ status: "expired", updatedAt: now })
            .where(eq(clinicInvitationsTable.id, invitation.id));
        }
      } else if (!user || !normalizedAccountEmail || normalizedAccountEmail !== normalizedInviteEmail) {
        status = 403;
        denialReason = "Authenticated account does not match the invitation identity";
      } else if (
        profile && (
          ![null, "clinician", "pending_clinician"].includes(profile.appRole) ||
          ![null, "clinician"].includes(profile.accountType)
        )
      ) {
        status = 403;
        denialReason = "Invitation is restricted to a clinician identity";
      } else if (!(await inviterStillAuthorized(tx, invitation))) {
        status = 403;
        denialReason = "Invitation creator no longer has the required authority";
      } else {
        const [existingMembership] = await tx.select().from(clinicMembershipsTable).where(and(
          eq(clinicMembershipsTable.clinicId, invitation.clinicId),
          eq(clinicMembershipsTable.userId, actorId),
          eq(clinicMembershipsTable.role, invitation.role),
        ));
        if (existingMembership?.status === "active") {
          status = 409;
          denialReason = "The invitation would duplicate an active membership";
        } else {
          const [membership] = await tx.insert(clinicMembershipsTable).values({
            clinicId: invitation.clinicId,
            userId: actorId,
            role: invitation.role,
            status: "active",
            createdBy: invitation.createdBy,
          }).onConflictDoUpdate({
            target: [
              clinicMembershipsTable.clinicId,
              clinicMembershipsTable.userId,
              clinicMembershipsTable.role,
            ],
            set: { status: "active", createdBy: invitation.createdBy, updatedAt: now },
          }).returning({ id: clinicMembershipsTable.id });
          if (profile) {
            await tx.update(userProfilesTable).set({
              appRole: "clinician",
              accountType: "clinician",
              tenantId: profile.tenantId?.trim() || invitation.clinicId,
              updatedAt: now,
            }).where(eq(userProfilesTable.id, actorId));
          } else {
            await tx.insert(userProfilesTable).values({
              id: actorId,
              appRole: "clinician",
              accountType: "clinician",
              tenantId: invitation.clinicId,
              displayName: [user.firstName, user.lastName].filter(Boolean).join(" ") || null,
              firstName: user.firstName,
              lastName: user.lastName,
            });
          }
          if (!user.emailVerified) {
            // Possession of this single-use token delivered to the matching
            // invitation address establishes mailbox verification.
            await tx.update(usersTable).set({ emailVerified: true, updatedAt: now })
              .where(eq(usersTable.id, actorId));
          }
          if (invitation.role === "clinic_admin") {
            await tx.update(clinicsTable).set({ status: "active", updatedAt: now })
              .where(and(eq(clinicsTable.id, invitation.clinicId), eq(clinicsTable.status, "pending")));
          }
          await tx.update(clinicInvitationsTable).set({
            status: "accepted",
            acceptedBy: actorId,
            acceptedAt: now,
            updatedAt: now,
          }).where(and(
            eq(clinicInvitationsTable.id, invitation.id),
            eq(clinicInvitationsTable.status, "pending"),
          ));
          await writeAuditEvent(tx, {
            userId: actorId,
            userRole: "clinician",
            tenantId: invitation.clinicId,
            action: "clinic_invitation_accepted",
            targetType: "clinic_membership",
            targetId: membership.id,
            metadata: { role: invitation.role, clinic_id: invitation.clinicId, invitation_id: invitation.id },
            ipAddress: req.ip,
            requestId: req.id,
          });
          return {
            accepted: true,
            clinicId: invitation.clinicId,
            clinicName: clinic.displayName,
            role: invitation.role as "clinic_admin" | "treating_clinician",
          };
        }
      }

      await writeAuditEvent(tx, {
        userId: actorId,
        userRole: req.user?.appRole ?? "authenticated",
        tenantId: invitation.clinicId,
        action: "clinic_invitation_accept_denied",
        targetType: "clinic_invitation",
        targetId: invitation.id,
        success: false,
        reason: denialReason,
        metadata: { invitation_role: invitation.role },
        ipAddress: req.ip,
        requestId: req.id,
      });
      return { accepted: false, status, reason: denialReason, clinicId: invitation.clinicId, invitationId: invitation.id };
    });

    if (!outcome.accepted) {
      res.status(outcome.status).json({
        error: outcome.status === 409
          ? "This invitation is no longer available. Ask an authorized clinic administrator for a new invitation."
          : "The signed-in account does not match this invitation.",
      });
      return;
    }
    res.json(AcceptClinicInvitationResponse.parse({
      ok: true,
      clinicId: outcome.clinicId,
      clinicName: outcome.clinicName,
      role: outcome.role,
    }));
  } catch (error) {
    req.log?.error?.({ err: error }, "Clinic invitation acceptance failed");
    res.status(500).json({ error: "Invitation could not be accepted" });
  }
});

export default router;
