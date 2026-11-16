import { Router } from "express";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import {
  clinicInvitationsTable,
  clinicRequestsTable,
  clinicsTable,
  db,
} from "@workspace/db";
import {
  CreatePlatformClinicBody,
  ApprovePlatformClinicRequestBody,
  ApprovePlatformClinicRequestParams,
  DeclinePlatformClinicRequestParams,
  ListPlatformClinicRequestsResponse,
  ListPlatformClinicsResponse,
  ReissuePlatformClinicInvitationBody,
  ReissuePlatformClinicInvitationParams,
  ReissuePlatformClinicInvitationResponse,
  RevokePlatformClinicInvitationParams,
  RevokePlatformClinicInvitationResponse,
} from "@workspace/api-zod";
import { writeAuditEvent, writeAuditEventBestEffort } from "../lib/auditEvents";
import { deliverClinicInvitation } from "../lib/clinicInvitationActions";
import {
  FIRST_ADMIN_INVITATION_TTL_MS,
  hasPlatformAuthority,
  provisionClinicAndFirstAdminInTransaction,
} from "../lib/platformClinicProvisioning";
import {
  createClinicInvitationToken,
  hashClinicInvitationToken,
  normalizeInvitationEmail,
} from "../lib/clinicInvitationSecurity";

const router = Router();

function actorId(req: any): string | null {
  return typeof req.user?.id === "string" && req.user.id ? req.user.id : null;
}

function invitationRecord(row: any) {
  return {
    id: row.id,
    clinicId: row.clinicId,
    invitedEmail: row.invitedEmail,
    role: row.role,
    status: row.status,
    deliveryStatus: row.deliveryStatus,
    deliveryAttemptedAt: row.deliveryAttemptedAt ? new Date(row.deliveryAttemptedAt).toISOString() : null,
    createdAt: new Date(row.createdAt).toISOString(),
    expiresAt: new Date(row.expiresAt).toISOString(),
  };
}

async function auditDenied(req: any, userId: string | null, clinicId: string | null, action: string, targetId?: string) {
  await writeAuditEventBestEffort({
    userId,
    userRole: userId ? (req.user?.appRole ?? "authenticated") : "unauthenticated",
    tenantId: clinicId,
    action,
    targetType: targetId ? "clinic_invitation" : "clinic",
    targetId: targetId ?? clinicId,
    success: false,
    reason: userId ? "Platform administrator permission required" : "Authentication required",
    metadata: clinicId ? { requested_clinic_id: clinicId } : null,
    ipAddress: req.ip,
    requestId: req.id,
  });
}

router.get("/platform-management/clinic-requests", async (req: any, res): Promise<void> => {
  const userId = actorId(req);
  if (!userId) {
    await auditDenied(req, null, null, "platform_clinic_requests_list_denied");
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!(await hasPlatformAuthority(userId, db))) {
    await auditDenied(req, userId, null, "platform_clinic_requests_list_denied");
    res.status(403).json({ error: "Platform administrator permission required" });
    return;
  }
  try {
    const requests = await db.select().from(clinicRequestsTable)
      .where(eq(clinicRequestsTable.status, "pending"))
      .orderBy(asc(clinicRequestsTable.createdAt));
    res.json(ListPlatformClinicRequestsResponse.parse({
      requests: requests.map((row) => ({
        requestId: row.id,
        clinicName: row.clinicName,
        contactName: row.contactName,
        workEmail: row.workEmail,
        website: row.website,
        status: row.status,
        createdAt: new Date(row.createdAt).toISOString(),
      })),
    }));
  } catch (error) {
    req.log?.error?.({ err: error }, "Clinic requests could not be loaded");
    res.status(500).json({ error: "Clinic requests could not be loaded" });
  }
});

router.post("/platform-management/clinic-requests/:requestId/approve", async (req: any, res): Promise<void> => {
  const userId = actorId(req);
  const params = ApprovePlatformClinicRequestParams.safeParse(req.params);
  const body = ApprovePlatformClinicRequestBody.safeParse(req.body);
  const firstAdminEmail = normalizeInvitationEmail(body.success ? body.data.firstAdminEmail : null);
  if (!params.success || !body.success || !firstAdminEmail) {
    res.status(400).json({ error: "A valid request ID and first-administrator email are required" });
    return;
  }
  if (!userId) {
    await auditDenied(req, null, null, "platform_clinic_request_approval_denied", params.data.requestId);
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!(await hasPlatformAuthority(userId, db))) {
    await auditDenied(req, userId, null, "platform_clinic_request_approval_denied", params.data.requestId);
    res.status(403).json({ error: "Platform administrator permission required" });
    return;
  }

  const token = createClinicInvitationToken();
  try {
    const result = await db.transaction(async (tx) => {
      const [request] = await tx.select().from(clinicRequestsTable)
        .where(eq(clinicRequestsTable.id, params.data.requestId))
        .for("update");
      if (!request) throw Object.assign(new Error("Clinic request not found"), { status: 404 });
      if (request.status === "approved" && request.clinicId) {
        const [[clinic], [invitation]] = await Promise.all([
          tx.select().from(clinicsTable).where(eq(clinicsTable.id, request.clinicId)),
          tx.select().from(clinicInvitationsTable).where(and(
            eq(clinicInvitationsTable.clinicId, request.clinicId),
            eq(clinicInvitationsTable.role, "clinic_admin"),
            eq(clinicInvitationsTable.requestKey, `platform-create:${request.id}`),
          )),
        ]);
        if (!clinic || !invitation || invitation.invitedEmail !== firstAdminEmail) {
          throw Object.assign(new Error("Request was already reviewed"), { status: 409 });
        }
        return { clinic, invitation, created: false };
      }
      if (request.status !== "pending") {
        throw Object.assign(new Error("Request is no longer pending"), { status: 409 });
      }

      const provisioned = await provisionClinicAndFirstAdminInTransaction(tx, {
        userId,
        clinicName: request.clinicName,
        invitedEmail: firstAdminEmail,
        requestKey: `platform-create:${request.id}`,
        token,
        request: req,
      });
      const reviewedAt = new Date();
      await tx.update(clinicRequestsTable).set({
        status: "approved",
        reviewedBy: userId,
        reviewedAt,
        clinicId: provisioned.clinic.id,
        updatedAt: reviewedAt,
      }).where(eq(clinicRequestsTable.id, request.id));
      await writeAuditEvent(tx, {
        userId,
        userRole: "platform_admin",
        tenantId: provisioned.clinic.id,
        action: "clinic_request_approved",
        targetType: "clinic_request",
        targetId: request.id,
        metadata: { clinic_id: provisioned.clinic.id, first_admin_invitation_id: provisioned.invitation.id },
        ipAddress: req.ip,
        requestId: req.id,
      });
      return provisioned;
    });

    let invitation = result.invitation;
    if (result.created) {
      await deliverClinicInvitation({
        invitationId: invitation.id,
        clinicId: result.clinic.id,
        createdBy: userId,
        invitedEmail: firstAdminEmail,
        clinicName: result.clinic.displayName,
        role: "clinic_admin",
        token,
        request: req,
      });
      [invitation] = await db.select().from(clinicInvitationsTable)
        .where(eq(clinicInvitationsTable.id, invitation.id));
    }
    res.status(result.created ? 201 : 200).json({
      clinicId: result.clinic.id,
      clinicName: result.clinic.displayName,
      clinicStatus: result.clinic.status,
      invitation: invitationRecord(invitation),
      message: result.created
        ? deliveryMessage(invitation.deliveryStatus)
        : "This request was already approved; no new invitation was issued.",
    });
  } catch (error: any) {
    const status = [403, 404, 409].includes(error?.status) ? error.status : 500;
    if (status === 500) req.log?.error?.({ err: error }, "Clinic request approval failed");
    if (status === 403) await auditDenied(req, userId, null, "platform_clinic_request_approval_denied", params.data.requestId);
    res.status(status).json({
      error: status === 404 ? "Clinic request not found"
        : status === 409 ? "This clinic request is no longer pending"
          : status === 403 ? "Platform administrator permission required"
            : "Clinic request could not be approved",
    });
  }
});

router.post("/platform-management/clinic-requests/:requestId/decline", async (req: any, res): Promise<void> => {
  const userId = actorId(req);
  const params = DeclinePlatformClinicRequestParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "A valid clinic request ID is required" });
    return;
  }
  if (!userId) {
    await auditDenied(req, null, null, "platform_clinic_request_decline_denied", params.data.requestId);
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!(await hasPlatformAuthority(userId, db))) {
    await auditDenied(req, userId, null, "platform_clinic_request_decline_denied", params.data.requestId);
    res.status(403).json({ error: "Platform administrator permission required" });
    return;
  }
  try {
    const outcome = await db.transaction(async (tx) => {
      const [request] = await tx.select().from(clinicRequestsTable)
        .where(eq(clinicRequestsTable.id, params.data.requestId))
        .for("update");
      if (!request) return "not_found" as const;
      if (request.status === "declined") return "declined" as const;
      if (request.status !== "pending") return "conflict" as const;
      const reviewedAt = new Date();
      await tx.update(clinicRequestsTable).set({
        status: "declined",
        reviewedBy: userId,
        reviewedAt,
        updatedAt: reviewedAt,
      }).where(eq(clinicRequestsTable.id, request.id));
      await writeAuditEvent(tx, {
        userId,
        userRole: "platform_admin",
        action: "clinic_request_declined",
        targetType: "clinic_request",
        targetId: request.id,
        ipAddress: req.ip,
        requestId: req.id,
      });
      return "declined" as const;
    });
    if (outcome === "not_found") {
      res.status(404).json({ error: "Clinic request not found" });
      return;
    }
    if (outcome === "conflict") {
      res.status(409).json({ error: "This clinic request is no longer pending" });
      return;
    }
    res.json({ ok: true, requestId: params.data.requestId, status: outcome });
  } catch (error) {
    req.log?.error?.({ err: error }, "Clinic request could not be declined");
    res.status(500).json({ error: "Clinic request could not be declined" });
  }
});

router.get("/platform-management/clinics", async (req: any, res): Promise<void> => {
  const userId = actorId(req);
  if (!userId) {
    await auditDenied(req, null, null, "platform_clinic_list_denied");
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!(await hasPlatformAuthority(userId, db))) {
    await auditDenied(req, userId, null, "platform_clinic_list_denied");
    res.status(403).json({ error: "Platform administrator permission required" });
    return;
  }

  try {
    const clinics = await db.select({
      clinicId: clinicsTable.id,
      clinicName: clinicsTable.displayName,
      status: clinicsTable.status,
      createdAt: clinicsTable.createdAt,
    }).from(clinicsTable).orderBy(asc(clinicsTable.createdAt));
    const invites = clinics.length
      ? await db.select().from(clinicInvitationsTable)
        .where(eq(clinicInvitationsTable.role, "clinic_admin"))
        .orderBy(asc(clinicInvitationsTable.createdAt))
      : [];
    const invitationsByClinic = new Map<string, any[]>();
    for (const invitation of invites) {
      const existing = invitationsByClinic.get(invitation.clinicId) ?? [];
      existing.push(invitationRecord(invitation));
      invitationsByClinic.set(invitation.clinicId, existing);
    }
    res.json(ListPlatformClinicsResponse.parse({
      clinics: clinics.map((clinic) => ({
        ...clinic,
        createdAt: new Date(clinic.createdAt).toISOString(),
        invitations: invitationsByClinic.get(clinic.clinicId) ?? [],
      })),
    }));
  } catch (error) {
    req.log?.error?.({ err: error }, "Platform clinic directory could not be loaded");
    res.status(500).json({ error: "Clinic information could not be loaded" });
  }
});

router.post("/platform-management/clinics", async (req: any, res): Promise<void> => {
  const userId = actorId(req);
  if (!userId) {
    await auditDenied(req, null, null, "platform_clinic_provisioning_denied");
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!(await hasPlatformAuthority(userId, db))) {
    await auditDenied(req, userId, null, "platform_clinic_provisioning_denied");
    res.status(403).json({ error: "Platform administrator permission required" });
    return;
  }
  const parsed = CreatePlatformClinicBody.safeParse(req.body);
  const invitedEmail = normalizeInvitationEmail(parsed.success ? parsed.data.firstAdminEmail : null);
  if (!parsed.success || !invitedEmail) {
    res.status(400).json({ error: "A clinic name, valid first-administrator email, and request key are required" });
    return;
  }

  const requestKey = `platform-create:${parsed.data.requestKey}`;
  const clinicName = parsed.data.displayName.trim();
  if (clinicName.length < 2) {
    res.status(400).json({ error: "A clinic name of at least two characters is required" });
    return;
  }
  const token = createClinicInvitationToken();
  try {
    const result = await db.transaction(async (tx) =>
      provisionClinicAndFirstAdminInTransaction(tx, {
        userId,
        clinicName,
        invitedEmail,
        requestKey,
        token,
        request: req,
      })
    );

    let currentInvitation = result.invitation;
    if (result.created) {
      await deliverClinicInvitation({
        invitationId: currentInvitation.id,
        clinicId: result.clinic.id,
        createdBy: userId,
        invitedEmail,
        clinicName: result.clinic.displayName,
        role: "clinic_admin",
        token,
        request: req,
      });
      [currentInvitation] = await db.select().from(clinicInvitationsTable)
        .where(eq(clinicInvitationsTable.id, currentInvitation.id));
    }
    res.status(result.created ? 201 : 200).json({
      clinicId: result.clinic.id,
      clinicName: result.clinic.displayName,
      clinicStatus: result.clinic.status,
      invitation: invitationRecord(currentInvitation),
      message: deliveryMessage(currentInvitation.deliveryStatus),
    });
  } catch (error: any) {
    const status = error?.status === 403 || error?.status === 409 ? error.status : 500;
    if (status === 500) req.log?.error?.({ err: error }, "Clinic provisioning failed");
    if (status === 403) {
      await auditDenied(req, userId, null, "platform_clinic_provisioning_denied");
    }
    if (status === 409) {
      await writeAuditEventBestEffort({
        userId,
        userRole: "platform_admin",
        action: "clinic_provisioning_conflict",
        targetType: "clinic",
        success: false,
        reason: "Idempotency request conflicts with previously stored clinic details",
        metadata: { request_key_fingerprint: hashClinicInvitationToken(parsed.data.requestKey).slice(0, 16) },
        ipAddress: req.ip,
        requestId: req.id,
      });
    }
    res.status(status).json({
      error: status === 409
        ? "This request key is already associated with a different clinic invitation"
        : status === 403
          ? "Platform administrator permission required"
          : "Clinic could not be created",
    });
  }
});

function deliveryMessage(deliveryStatus: string) {
  if (deliveryStatus === "test_sink_accepted") return "Invitation created; test email captured locally, not sent externally.";
  if (deliveryStatus === "provider_accepted") return "Invitation created and accepted by the configured email sender.";
  if (deliveryStatus === "failed") return "Invitation created, but email delivery failed.";
  return "Invitation created, email not sent.";
}

router.post("/platform-management/clinics/:clinicId/invitations/:invitationId/reissue", async (req: any, res): Promise<void> => {
  const userId = actorId(req);
  const params = ReissuePlatformClinicInvitationParams.safeParse(req.params);
  const body = ReissuePlatformClinicInvitationBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Clinic, invitation, and request IDs are required" });
    return;
  }
  if (!userId) {
    await auditDenied(req, null, params.data.clinicId, "clinic_invitation_reissue_denied", params.data.invitationId);
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!(await hasPlatformAuthority(userId, db))) {
    await auditDenied(req, userId, params.data.clinicId, "clinic_invitation_reissue_denied", params.data.invitationId);
    res.status(403).json({ error: "Platform administrator permission required" });
    return;
  }

  const token = createClinicInvitationToken();
  const requestKey = `platform-reissue:${body.data.requestKey}`;
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${requestKey}))`);
      if (!(await hasPlatformAuthority(userId, tx))) throw Object.assign(new Error("Forbidden"), { status: 403 });
      const [priorRequest] = await tx.select().from(clinicInvitationsTable)
        .where(eq(clinicInvitationsTable.requestKey, requestKey));
      if (priorRequest) {
        if (priorRequest.clinicId !== params.data.clinicId) throw Object.assign(new Error("Conflict"), { status: 409 });
        return { invitation: priorRequest, created: false, clinicName: "" };
      }
      const [old] = await tx.select().from(clinicInvitationsTable).where(and(
        eq(clinicInvitationsTable.id, params.data.invitationId),
        eq(clinicInvitationsTable.clinicId, params.data.clinicId),
        eq(clinicInvitationsTable.role, "clinic_admin"),
        eq(clinicInvitationsTable.status, "pending"),
      )).for("update");
      if (!old) throw Object.assign(new Error("Not found"), { status: 404 });
      const [clinic] = await tx.select().from(clinicsTable).where(eq(clinicsTable.id, old.clinicId));
      if (!clinic || clinic.status !== "pending") throw Object.assign(new Error("Not found"), { status: 404 });
      const now = new Date();
      await tx.update(clinicInvitationsTable).set({
        status: old.expiresAt <= now ? "expired" : "superseded",
        updatedAt: now,
      }).where(eq(clinicInvitationsTable.id, old.id));
      const [invitation] = await tx.insert(clinicInvitationsTable).values({
        clinicId: old.clinicId,
        invitedEmail: old.invitedEmail,
        role: "clinic_admin",
        tokenHash: hashClinicInvitationToken(token),
        requestKey,
        createdBy: userId,
        expiresAt: new Date(now.getTime() + FIRST_ADMIN_INVITATION_TTL_MS),
      }).returning();
      await writeAuditEvent(tx, {
        userId,
        userRole: "platform_admin",
        tenantId: old.clinicId,
        action: "clinic_invitation_reissued",
        targetType: "clinic_invitation",
        targetId: invitation.id,
        metadata: { role: "clinic_admin", superseded_invitation_id: old.id },
        ipAddress: req.ip,
        requestId: req.id,
      });
      return { invitation, created: true, clinicName: clinic.displayName };
    });

    let invitation = result.invitation;
    if (result.created) {
      await deliverClinicInvitation({
        invitationId: invitation.id,
        clinicId: invitation.clinicId,
        createdBy: userId,
        invitedEmail: invitation.invitedEmail,
        clinicName: result.clinicName,
        role: "clinic_admin",
        token,
        request: req,
      });
      [invitation] = await db.select().from(clinicInvitationsTable)
        .where(eq(clinicInvitationsTable.id, invitation.id));
    }
    res.json(ReissuePlatformClinicInvitationResponse.parse({
      invitation: invitationRecord(invitation),
      message: deliveryMessage(invitation.deliveryStatus),
    }));
  } catch (error: any) {
    const status = [403, 404, 409].includes(error?.status) ? error.status : 500;
    if (status === 403) {
      await auditDenied(req, userId, params.data.clinicId, "clinic_invitation_reissue_denied", params.data.invitationId);
    }
    if (status === 500) req.log?.error?.({ err: error }, "First-administrator invitation could not be reissued");
    res.status(status).json({ error: status === 404 ? "Pending invitation not found" : status === 403 ? "Platform administrator permission required" : status === 409 ? "Invitation request could not be repeated" : "Invitation could not be reissued" });
  }
});

router.post("/platform-management/clinics/:clinicId/invitations/:invitationId/revoke", async (req: any, res): Promise<void> => {
  const userId = actorId(req);
  const params = RevokePlatformClinicInvitationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Clinic and invitation IDs are required" });
    return;
  }
  if (!userId) {
    await auditDenied(req, null, params.data.clinicId, "clinic_invitation_revocation_denied", params.data.invitationId);
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!(await hasPlatformAuthority(userId, db))) {
    await auditDenied(req, userId, params.data.clinicId, "clinic_invitation_revocation_denied", params.data.invitationId);
    res.status(403).json({ error: "Platform administrator permission required" });
    return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${params.data.invitationId}))`);
      if (!(await hasPlatformAuthority(userId, tx))) {
        await writeAuditEvent(tx, {
          userId,
          userRole: "platform_admin",
          tenantId: params.data.clinicId,
          action: "clinic_invitation_revocation_denied",
          targetType: "clinic_invitation",
          targetId: params.data.invitationId,
          success: false,
          reason: "Platform administrator permission required",
          ipAddress: req.ip,
          requestId: req.id,
        });
        return { error: 403 as const };
      }
      const now = new Date();
      const [row] = await tx.update(clinicInvitationsTable).set({
        status: "revoked",
        revokedBy: userId,
        revokedAt: now,
        updatedAt: now,
      }).where(and(
        eq(clinicInvitationsTable.id, params.data.invitationId),
        eq(clinicInvitationsTable.clinicId, params.data.clinicId),
        eq(clinicInvitationsTable.role, "clinic_admin"),
        eq(clinicInvitationsTable.status, "pending"),
      )).returning();
      if (!row) {
        await writeAuditEvent(tx, {
          userId,
          userRole: "platform_admin",
          tenantId: params.data.clinicId,
          action: "clinic_invitation_revocation_denied",
          targetType: "clinic_invitation",
          targetId: params.data.invitationId,
          success: false,
          reason: "Pending first-administrator invitation not found",
          ipAddress: req.ip,
          requestId: req.id,
        });
        return { error: 404 as const };
      }
      await writeAuditEvent(tx, {
        userId,
        userRole: "platform_admin",
        tenantId: row.clinicId,
        action: "clinic_invitation_revoked",
        targetType: "clinic_invitation",
        targetId: row.id,
        metadata: { role: row.role },
        ipAddress: req.ip,
        requestId: req.id,
      });
      return { invitation: row };
    });
    if ("error" in result) {
      const status = result.error === 404 ? 404 : 403;
      res.status(status).json({ error: status === 404 ? "Pending invitation not found" : "Platform administrator permission required" });
      return;
    }
    res.json(RevokePlatformClinicInvitationResponse.parse({
      invitation: invitationRecord(result.invitation),
      message: "Pending first-administrator invitation revoked.",
    }));
  } catch (error: any) {
    req.log?.error?.({ err: error }, "First-administrator invitation could not be revoked");
    res.status(500).json({ error: "Invitation could not be revoked" });
  }
});

export default router;
