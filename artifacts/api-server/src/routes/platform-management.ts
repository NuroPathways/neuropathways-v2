import { Router } from "express";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import {
  clinicInvitationsTable,
  clinicsTable,
  db,
  platformAdministratorGrantsTable,
  userProfilesTable,
} from "@workspace/db";
import {
  CreatePlatformClinicBody,
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
  createClinicInvitationToken,
  hashClinicInvitationToken,
  normalizeInvitationEmail,
} from "../lib/clinicInvitationSecurity";

const router = Router();
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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
    createdAt: new Date(row.createdAt).toISOString(),
    expiresAt: new Date(row.expiresAt).toISOString(),
  };
}

async function hasPlatformAuthority(userId: string, executor: any = db): Promise<boolean> {
  const [[grant], [profile]] = await Promise.all([
    executor.select({ id: platformAdministratorGrantsTable.id })
      .from(platformAdministratorGrantsTable)
      .where(and(
        eq(platformAdministratorGrantsTable.userId, userId),
        eq(platformAdministratorGrantsTable.status, "active"),
        isNull(platformAdministratorGrantsTable.revokedAt),
      )),
    executor.select({ appRole: userProfilesTable.appRole, accountType: userProfilesTable.accountType })
      .from(userProfilesTable).where(eq(userProfilesTable.id, userId)),
  ]);
  return Boolean(grant && profile?.appRole === "clinician" && profile?.accountType === "clinician");
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

router.get("/platform-management/clinics", async (req: any, res): Promise<void> => {
  const userId = actorId(req);
  if (!userId) {
    await auditDenied(req, null, null, "platform_clinic_list_denied");
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!(await hasPlatformAuthority(userId))) {
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
  if (!(await hasPlatformAuthority(userId))) {
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
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);

  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${requestKey}))`);
      if (!(await hasPlatformAuthority(userId, tx))) {
        throw Object.assign(new Error("Platform administrator permission required"), { status: 403 });
      }
      let [clinic] = await tx.select().from(clinicsTable)
        .where(eq(clinicsTable.creationRequestKey, parsed.data.requestKey));
      let [invitation] = clinic
        ? await tx.select().from(clinicInvitationsTable)
          .where(and(
            eq(clinicInvitationsTable.clinicId, clinic.id),
            eq(clinicInvitationsTable.requestKey, requestKey),
          ))
        : [];

      if (clinic) {
        if (clinic.displayName !== clinicName || invitation?.invitedEmail !== invitedEmail) {
          throw Object.assign(new Error("Request key was already used for another clinic invitation"), { status: 409 });
        }
        if (!invitation) {
          invitation = (await tx.insert(clinicInvitationsTable).values({
            clinicId: clinic.id,
            invitedEmail,
            role: "clinic_admin",
            tokenHash: hashClinicInvitationToken(token),
            requestKey,
            createdBy: userId,
            expiresAt,
          }).returning())[0];
          await writeAuditEvent(tx, {
            userId,
            userRole: "platform_admin",
            tenantId: clinic.id,
            action: "clinic_first_admin_invitation_created",
            targetType: "clinic_invitation",
            targetId: invitation.id,
            metadata: { role: "clinic_admin", retry_recovered: true },
            ipAddress: req.ip,
            requestId: req.id,
          });
        }
        return { clinic, invitation, created: false };
      }

      clinic = (await tx.insert(clinicsTable).values({
        displayName: clinicName,
        status: "pending",
        createdBy: userId,
        creationRequestKey: parsed.data.requestKey,
      }).returning())[0];
      invitation = (await tx.insert(clinicInvitationsTable).values({
        clinicId: clinic.id,
        invitedEmail,
        role: "clinic_admin",
        tokenHash: hashClinicInvitationToken(token),
        requestKey,
        createdBy: userId,
        expiresAt,
      }).returning())[0];
      await writeAuditEvent(tx, {
        userId,
        userRole: "platform_admin",
        tenantId: clinic.id,
        action: "clinic_provisioned",
        targetType: "clinic",
        targetId: clinic.id,
        metadata: { status: "pending", first_admin_invitation_id: invitation.id },
        ipAddress: req.ip,
        requestId: req.id,
      });
      await writeAuditEvent(tx, {
        userId,
        userRole: "platform_admin",
        tenantId: clinic.id,
        action: "clinic_first_admin_invitation_created",
        targetType: "clinic_invitation",
        targetId: invitation.id,
        metadata: { role: "clinic_admin" },
        ipAddress: req.ip,
        requestId: req.id,
      });
      return { clinic, invitation, created: true };
    });

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
  if (!(await hasPlatformAuthority(userId))) {
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
        expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
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
  if (!(await hasPlatformAuthority(userId))) {
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
