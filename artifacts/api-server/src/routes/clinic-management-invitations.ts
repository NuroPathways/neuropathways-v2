import { Router } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  childrenTable,
  clinicInvitationsTable,
  clinicMembershipsTable,
  clinicsTable,
  clinicalAssignmentsTable,
  db,
  usersTable,
  userProfilesTable,
} from "@workspace/db";
import {
  InviteClinicClinicianBody,
  InviteClinicClinicianParams,
  InviteClinicClinicianResponse,
  GetManagedClinicClientsParams,
  GetManagedClinicClientsResponse,
  ReissueClinicStaffInvitationBody,
  ReissueClinicStaffInvitationParams,
  ReissueClinicStaffInvitationResponse,
  RevokeClinicStaffInvitationParams,
  RevokeClinicStaffInvitationResponse,
} from "@workspace/api-zod";
import { clinicalRecordClinicId } from "../lib/clinicAuthorization";
import { writeAuditEvent, writeAuditEventBestEffort } from "../lib/auditEvents";
import { deliverClinicInvitation } from "../lib/clinicInvitationActions";
import {
  createClinicInvitationToken,
  hashClinicInvitationToken,
  normalizeInvitationEmail,
} from "../lib/clinicInvitationSecurity";

const router = Router();
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function record(row: any) {
  return {
    id: row.id,
    clinicId: row.clinicId,
    invitedEmail: row.invitedEmail,
    role: row.role,
    status: row.status,
    deliveryStatus: row.deliveryStatus,
    createdAt: new Date(row.createdAt).toISOString(),
    expiresAt: new Date(row.expiresAt).toISOString(),
  };
}

async function activeClinicAdmin(tx: any, userId: string, clinicId: string): Promise<boolean> {
  const [[clinic], [profile], [membership]] = await Promise.all([
    tx.select({ id: clinicsTable.id }).from(clinicsTable).where(and(
      eq(clinicsTable.id, clinicId),
      eq(clinicsTable.status, "active"),
    )),
    tx.select({ appRole: userProfilesTable.appRole, accountType: userProfilesTable.accountType })
      .from(userProfilesTable).where(eq(userProfilesTable.id, userId)),
    tx.select({ id: clinicMembershipsTable.id }).from(clinicMembershipsTable).where(and(
      eq(clinicMembershipsTable.clinicId, clinicId),
      eq(clinicMembershipsTable.userId, userId),
      eq(clinicMembershipsTable.role, "clinic_admin"),
      eq(clinicMembershipsTable.status, "active"),
    )),
  ]);
  return Boolean(
    clinic &&
    profile?.appRole === "clinician" &&
    profile?.accountType === "clinician" &&
    membership,
  );
}

async function denied(req: any, userId: string | null, clinicId: string, action: string, targetId?: string) {
  await writeAuditEventBestEffort({
    userId,
    userRole: userId ? (req.user?.appRole ?? "authenticated") : "unauthenticated",
    tenantId: clinicId,
    action,
    targetType: targetId ? "clinic_invitation" : "clinic",
    targetId: targetId ?? clinicId,
    success: false,
    reason: userId ? "Active clinic administrator permission required" : "Authentication required",
    metadata: { requested_clinic_id: clinicId },
    ipAddress: req.ip,
    requestId: req.id,
  });
}

function deliveryMessage(status: string) {
  if (status === "test_sink_accepted") return "Invitation created; test email captured locally, not sent externally.";
  if (status === "provider_accepted") return "Invitation created and accepted by the configured email sender.";
  if (status === "failed") return "Invitation created, but email delivery failed.";
  return "Invitation created, email not sent.";
}

router.post("/clinic-management/:clinicId/invitations", async (req: any, res): Promise<void> => {
  const params = InviteClinicClinicianParams.safeParse(req.params);
  const body = InviteClinicClinicianBody.safeParse(req.body);
  const userId = typeof req.user?.id === "string" ? req.user.id : null;
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Clinic, valid clinician email, and request key are required" });
    return;
  }
  const { clinicId } = params.data;
  if (!userId) {
    await denied(req, null, clinicId, "clinic_staff_invitation_denied");
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!(await activeClinicAdmin(db, userId, clinicId))) {
    await denied(req, userId, clinicId, "clinic_staff_invitation_denied");
    res.status(403).json({ error: "An active clinic administrator is required" });
    return;
  }
  const invitedEmail = normalizeInvitationEmail(body.data.invitedEmail);
  if (!invitedEmail) {
    res.status(400).json({ error: "Enter a valid clinician email address" });
    return;
  }
  const token = createClinicInvitationToken();
  const requestKey = `clinic-staff:${clinicId}:${body.data.requestKey}`;
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${requestKey}))`);
      if (!(await activeClinicAdmin(tx, userId, clinicId))) throw Object.assign(new Error("Forbidden"), { status: 403 });
      const [priorRequest] = await tx.select().from(clinicInvitationsTable)
        .where(eq(clinicInvitationsTable.requestKey, requestKey));
      if (priorRequest) {
        if (priorRequest.invitedEmail !== invitedEmail || priorRequest.clinicId !== clinicId) {
          throw Object.assign(new Error("Conflict"), { status: 409 });
        }
        return { invitation: priorRequest, created: false, clinicName: "" };
      }
      const [activeMembership] = await tx.select({ id: clinicMembershipsTable.id })
        .from(clinicMembershipsTable)
        .innerJoin(usersTable, eq(usersTable.id, clinicMembershipsTable.userId))
        .where(and(
          eq(clinicMembershipsTable.clinicId, clinicId),
          eq(clinicMembershipsTable.role, "treating_clinician"),
          eq(clinicMembershipsTable.status, "active"),
          sql`lower(${usersTable.email}) = ${invitedEmail}`,
        ));
      if (activeMembership) throw Object.assign(new Error("Existing membership"), { status: 409 });

      const [pendingInvite] = await tx.select({ id: clinicInvitationsTable.id })
        .from(clinicInvitationsTable).where(and(
          eq(clinicInvitationsTable.clinicId, clinicId),
          eq(clinicInvitationsTable.invitedEmail, invitedEmail),
          eq(clinicInvitationsTable.role, "treating_clinician"),
          eq(clinicInvitationsTable.status, "pending"),
        ));
      if (pendingInvite) throw Object.assign(new Error("Existing invitation"), { status: 409 });

      const [clinic] = await tx.select({ displayName: clinicsTable.displayName })
        .from(clinicsTable).where(eq(clinicsTable.id, clinicId));
      if (!clinic) throw Object.assign(new Error("Clinic not found"), { status: 404 });
      const [invitation] = await tx.insert(clinicInvitationsTable).values({
        clinicId,
        invitedEmail,
        role: "treating_clinician",
        tokenHash: hashClinicInvitationToken(token),
        requestKey,
        createdBy: userId,
        expiresAt,
      }).returning();
      await writeAuditEvent(tx, {
        userId,
        userRole: "clinic_admin",
        tenantId: clinicId,
        action: "clinic_staff_invitation_created",
        targetType: "clinic_invitation",
        targetId: invitation.id,
        metadata: { role: "treating_clinician" },
        ipAddress: req.ip,
        requestId: req.id,
      });
      return { invitation, created: true, clinicName: clinic.displayName };
    });

    let invitation = result.invitation;
    if (result.created) {
      await deliverClinicInvitation({
        invitationId: invitation.id,
        clinicId,
        createdBy: userId,
        invitedEmail,
        clinicName: result.clinicName,
        role: "treating_clinician",
        token,
        request: req,
      });
      [invitation] = await db.select().from(clinicInvitationsTable)
        .where(eq(clinicInvitationsTable.id, invitation.id));
    }
    res.status(result.created ? 201 : 200).json(InviteClinicClinicianResponse.parse({
      invitation: record(invitation),
      message: deliveryMessage(invitation.deliveryStatus),
    }));
  } catch (error: any) {
    const status = [403, 404, 409].includes(error?.status) ? error.status : 500;
    if (status === 403) await denied(req, userId, clinicId, "clinic_staff_invitation_denied");
    if (status === 500) req.log?.error?.({ err: error }, "Clinic staff invitation could not be created");
    if (status === 409) {
      await writeAuditEventBestEffort({
        userId,
        userRole: "clinic_admin",
        tenantId: clinicId,
        action: "clinic_staff_invitation_creation_denied",
        targetType: "clinic",
        targetId: clinicId,
        success: false,
        reason: "Duplicate membership, pending invitation, or conflicting request key",
        metadata: { request_key_fingerprint: hashClinicInvitationToken(body.data.requestKey).slice(0, 16) },
        ipAddress: req.ip,
        requestId: req.id,
      });
    }
    res.status(status).json({ error: status === 409 ? "A pending invitation or active membership already exists for this clinician" : status === 403 ? "An active clinic administrator is required" : status === 404 ? "Clinic not found" : "Invitation could not be created" });
  }
});

router.post("/clinic-management/:clinicId/invitations/:invitationId/reissue", async (req: any, res): Promise<void> => {
  const params = ReissueClinicStaffInvitationParams.safeParse(req.params);
  const body = ReissueClinicStaffInvitationBody.safeParse(req.body);
  const userId = typeof req.user?.id === "string" ? req.user.id : null;
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Clinic, invitation, and request IDs are required" });
    return;
  }
  const { clinicId, invitationId } = params.data;
  if (!userId) {
    await denied(req, null, clinicId, "clinic_staff_invitation_reissue_denied", invitationId);
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!(await activeClinicAdmin(db, userId, clinicId))) {
    await denied(req, userId, clinicId, "clinic_staff_invitation_reissue_denied", invitationId);
    res.status(403).json({ error: "An active clinic administrator is required" });
    return;
  }
  const requestKey = `clinic-staff-reissue:${clinicId}:${body.data.requestKey}`;
  const token = createClinicInvitationToken();
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${requestKey}))`);
      if (!(await activeClinicAdmin(tx, userId, clinicId))) throw Object.assign(new Error("Forbidden"), { status: 403 });
      const [priorRequest] = await tx.select().from(clinicInvitationsTable)
        .where(eq(clinicInvitationsTable.requestKey, requestKey));
      if (priorRequest) {
        if (priorRequest.clinicId !== clinicId || priorRequest.role !== "treating_clinician") {
          throw Object.assign(new Error("Conflict"), { status: 409 });
        }
        return { invitation: priorRequest, created: false, clinicName: "" };
      }
      const [old] = await tx.select().from(clinicInvitationsTable).where(and(
        eq(clinicInvitationsTable.id, invitationId),
        eq(clinicInvitationsTable.clinicId, clinicId),
        eq(clinicInvitationsTable.role, "treating_clinician"),
        eq(clinicInvitationsTable.status, "pending"),
      )).for("update");
      if (!old) throw Object.assign(new Error("Not found"), { status: 404 });
      const [clinic] = await tx.select({ displayName: clinicsTable.displayName })
        .from(clinicsTable).where(eq(clinicsTable.id, clinicId));
      if (!clinic) throw Object.assign(new Error("Not found"), { status: 404 });
      const now = new Date();
      await tx.update(clinicInvitationsTable).set({
        status: old.expiresAt <= now ? "expired" : "superseded",
        updatedAt: now,
      }).where(eq(clinicInvitationsTable.id, old.id));
      const [invitation] = await tx.insert(clinicInvitationsTable).values({
        clinicId,
        invitedEmail: old.invitedEmail,
        role: "treating_clinician",
        tokenHash: hashClinicInvitationToken(token),
        requestKey,
        createdBy: userId,
        expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
      }).returning();
      await writeAuditEvent(tx, {
        userId,
        userRole: "clinic_admin",
        tenantId: clinicId,
        action: "clinic_staff_invitation_reissued",
        targetType: "clinic_invitation",
        targetId: invitation.id,
        metadata: { role: "treating_clinician", superseded_invitation_id: old.id },
        ipAddress: req.ip,
        requestId: req.id,
      });
      return { invitation, created: true, clinicName: clinic.displayName };
    });
    let invitation = result.invitation;
    if (result.created) {
      await deliverClinicInvitation({
        invitationId: invitation.id,
        clinicId,
        createdBy: userId,
        invitedEmail: invitation.invitedEmail,
        clinicName: result.clinicName,
        role: "treating_clinician",
        token,
        request: req,
      });
      [invitation] = await db.select().from(clinicInvitationsTable)
        .where(eq(clinicInvitationsTable.id, invitation.id));
    }
    res.json(ReissueClinicStaffInvitationResponse.parse({
      invitation: record(invitation),
      message: deliveryMessage(invitation.deliveryStatus),
    }));
  } catch (error: any) {
    const status = [403, 404, 409].includes(error?.status) ? error.status : 500;
    if (status === 403) await denied(req, userId, clinicId, "clinic_staff_invitation_reissue_denied", invitationId);
    if (status === 500) req.log?.error?.({ err: error }, "Clinic staff invitation could not be reissued");
    res.status(status).json({ error: status === 404 ? "Pending invitation not found" : status === 403 ? "An active clinic administrator is required" : status === 409 ? "Invitation request could not be repeated" : "Invitation could not be reissued" });
  }
});

router.post("/clinic-management/:clinicId/invitations/:invitationId/revoke", async (req: any, res): Promise<void> => {
  const params = RevokeClinicStaffInvitationParams.safeParse(req.params);
  const userId = typeof req.user?.id === "string" ? req.user.id : null;
  if (!params.success) {
    res.status(400).json({ error: "Clinic and invitation IDs are required" });
    return;
  }
  const { clinicId, invitationId } = params.data;
  if (!userId) {
    await denied(req, null, clinicId, "clinic_staff_invitation_revocation_denied", invitationId);
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!(await activeClinicAdmin(db, userId, clinicId))) {
    await denied(req, userId, clinicId, "clinic_staff_invitation_revocation_denied", invitationId);
    res.status(403).json({ error: "An active clinic administrator is required" });
    return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${invitationId}))`);
      if (!(await activeClinicAdmin(tx, userId, clinicId))) {
        await writeAuditEvent(tx, {
          userId,
          userRole: "clinic_admin",
          tenantId: clinicId,
          action: "clinic_staff_invitation_revocation_denied",
          targetType: "clinic_invitation",
          targetId: invitationId,
          success: false,
          reason: "Active clinic administrator permission required",
          ipAddress: req.ip,
          requestId: req.id,
        });
        return { error: 403 as const };
      }
      const now = new Date();
      const [invitation] = await tx.update(clinicInvitationsTable).set({
        status: "revoked",
        revokedBy: userId,
        revokedAt: now,
        updatedAt: now,
      }).where(and(
        eq(clinicInvitationsTable.id, invitationId),
        eq(clinicInvitationsTable.clinicId, clinicId),
        eq(clinicInvitationsTable.role, "treating_clinician"),
        eq(clinicInvitationsTable.status, "pending"),
      )).returning();
      if (!invitation) {
        await writeAuditEvent(tx, {
          userId,
          userRole: "clinic_admin",
          tenantId: clinicId,
          action: "clinic_staff_invitation_revocation_denied",
          targetType: "clinic_invitation",
          targetId: invitationId,
          success: false,
          reason: "Pending treating-clinician invitation not found",
          ipAddress: req.ip,
          requestId: req.id,
        });
        return { error: 404 as const };
      }
      await writeAuditEvent(tx, {
        userId,
        userRole: "clinic_admin",
        tenantId: clinicId,
        action: "clinic_staff_invitation_revoked",
        targetType: "clinic_invitation",
        targetId: invitation.id,
        metadata: { role: invitation.role },
        ipAddress: req.ip,
        requestId: req.id,
      });
      return { invitation };
    });
    if ("error" in result) {
      const status = result.error === 404 ? 404 : 403;
      res.status(status).json({ error: status === 404 ? "Pending invitation not found" : "An active clinic administrator is required" });
      return;
    }
    res.json(RevokeClinicStaffInvitationResponse.parse({
      invitation: record(result.invitation),
      message: "Pending clinician invitation revoked.",
    }));
  } catch (error) {
    req.log?.error?.({ err: error }, "Clinic staff invitation could not be revoked");
    res.status(500).json({ error: "Invitation could not be revoked" });
  }
});

router.get("/clinic-management/:clinicId/clients", async (req: any, res): Promise<void> => {
  const params = GetManagedClinicClientsParams.safeParse(req.params);
  const userId = typeof req.user?.id === "string" ? req.user.id : null;
  if (!params.success) {
    res.status(400).json({ error: "Clinic ID is required" });
    return;
  }
  const { clinicId } = params.data;
  if (!userId) {
    await denied(req, null, clinicId, "clinic_assignment_directory_denied");
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!(await activeClinicAdmin(db, userId, clinicId))) {
    await denied(req, userId, clinicId, "clinic_assignment_directory_denied");
    res.status(403).json({ error: "An active clinic administrator is required" });
    return;
  }
  try {
    const candidates = await db.select({
      id: childrenTable.id,
      name: childrenTable.childName,
      status: childrenTable.status,
      clinicianId: childrenTable.clinicianId,
    }).from(childrenTable).orderBy(asc(childrenTable.childName));
    const clinicChildren = [];
    for (const child of candidates) {
      if (child.status === "merged") continue;
      if (await clinicalRecordClinicId(child.id) !== clinicId) continue;
      const assignments = await db.select({
        clinicianId: clinicalAssignmentsTable.userId,
      }).from(clinicalAssignmentsTable).where(and(
        eq(clinicalAssignmentsTable.clinicId, clinicId),
        eq(clinicalAssignmentsTable.clientId, child.id),
        eq(clinicalAssignmentsTable.role, "treating_clinician"),
        eq(clinicalAssignmentsTable.status, "active"),
      ));
      clinicChildren.push({
        childId: child.id,
        displayName: child.name || "Child",
        treatingClinicianId: assignments[0]?.clinicianId ?? child.clinicianId ?? null,
      });
    }
    await writeAuditEventBestEffort({
      userId,
      userRole: "clinic_admin",
      tenantId: clinicId,
      action: "clinic_assignment_directory_viewed",
      targetType: "clinic",
      targetId: clinicId,
      metadata: { client_count: clinicChildren.length, minimal_assignment_fields_only: true },
      ipAddress: req.ip,
      requestId: req.id,
    });
    res.json(GetManagedClinicClientsResponse.parse({ clinicId, clients: clinicChildren }));
  } catch (error) {
    req.log?.error?.({ err: error }, "Clinic assignment directory could not be loaded");
    res.status(500).json({ error: "Client assignment information could not be loaded" });
  }
});

export default router;
