import { Router } from "express";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import {
  clinicInvitationsTable,
  clinicMembershipsTable,
  clinicsTable,
  db,
} from "@workspace/db";
import { ListDemoClinicInvitationLinksResponse } from "@workspace/api-zod";
import { writeAuditEventBestEffort } from "../lib/auditEvents";
import {
  getCapturedDemoClinicInvitations,
  isIsolatedClinicInvitationDemo,
} from "../lib/demoClinicInvitationInbox";
import { hasPlatformAuthority } from "../lib/platformClinicProvisioning";

const router = Router();

async function auditInboxAccess(req: any, userId: string | null, success: boolean, linkCount = 0) {
  await writeAuditEventBestEffort({
    userId,
    userRole: success
      ? (req.user?.isPlatformAdministrator ? "platform_admin" : "clinic_admin")
      : (userId ? (req.user?.appRole ?? "authenticated") : "unauthenticated"),
    action: success ? "demo_clinic_invitation_links_viewed" : "demo_clinic_invitation_links_denied",
    targetType: "demo_clinic_invitation_inbox",
    targetId: "list",
    success,
    reason: success ? null : (userId ? "Authorized administrator permission required" : "Authentication required"),
    metadata: success ? { returned_link_count: linkCount } : null,
    ipAddress: req.ip,
    requestId: req.id,
  });
}

router.get("/demo/clinic-invitation-links", async (req: any, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("Vary", "Cookie");
  if (!isIsolatedClinicInvitationDemo()) {
    res.status(404).json({ error: "Local invitation inbox is unavailable" });
    return;
  }

  const userId = typeof req.user?.id === "string" && req.user.id ? req.user.id : null;
  if (!userId) {
    await auditInboxAccess(req, null, false);
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const platformAdmin = await hasPlatformAuthority(userId, db);
    let administeredClinicIds = new Set<string>();
    if (!platformAdmin) {
      if (req.user?.appRole !== "clinician" || req.user?.accountType !== "clinician") {
        await auditInboxAccess(req, userId, false);
        res.status(403).json({ error: "Authorized administrator permission required" });
        return;
      }
      const managedClinics = await db.select({ clinicId: clinicMembershipsTable.clinicId })
        .from(clinicMembershipsTable)
        .innerJoin(clinicsTable, eq(clinicsTable.id, clinicMembershipsTable.clinicId))
        .where(and(
          eq(clinicMembershipsTable.userId, userId),
          eq(clinicMembershipsTable.role, "clinic_admin"),
          eq(clinicMembershipsTable.status, "active"),
          eq(clinicsTable.status, "active"),
        ));
      administeredClinicIds = new Set(managedClinics.map(({ clinicId }) => clinicId));
      if (!administeredClinicIds.size) {
        await auditInboxAccess(req, userId, false);
        res.status(403).json({ error: "Authorized administrator permission required" });
        return;
      }
    }

    const captured = getCapturedDemoClinicInvitations();
    if (!captured.length) {
      await auditInboxAccess(req, userId, true, 0);
      res.json(ListDemoClinicInvitationLinksResponse.parse({ links: [] }));
      return;
    }

    const capturedByHash = new Map(captured.map((entry) => [entry.tokenHash, entry]));
    const rows = await db.select({
      invitationId: clinicInvitationsTable.id,
      clinicId: clinicInvitationsTable.clinicId,
      clinicName: clinicsTable.displayName,
      invitedEmail: clinicInvitationsTable.invitedEmail,
      role: clinicInvitationsTable.role,
      tokenHash: clinicInvitationsTable.tokenHash,
      expiresAt: clinicInvitationsTable.expiresAt,
    }).from(clinicInvitationsTable)
      .innerJoin(clinicsTable, eq(clinicsTable.id, clinicInvitationsTable.clinicId))
      .where(and(
        inArray(clinicInvitationsTable.tokenHash, [...capturedByHash.keys()]),
        eq(clinicInvitationsTable.status, "pending"),
        gt(clinicInvitationsTable.expiresAt, new Date()),
      ))
      .orderBy(asc(clinicInvitationsTable.createdAt));

    const links = rows
      .filter((row) => platformAdmin
        ? row.role === "clinic_admin"
        : row.role === "treating_clinician" && administeredClinicIds.has(row.clinicId))
      .flatMap((row) => {
        const capture = capturedByHash.get(row.tokenHash);
        if (!capture) return [];
        return [{
          invitationId: row.invitationId,
          clinicId: row.clinicId,
          clinicName: row.clinicName,
          invitedEmail: row.invitedEmail,
          role: row.role,
          expiresAt: row.expiresAt.toISOString(),
          href: `/ClinicInvitation#token=${encodeURIComponent(capture.token)}`,
        }];
      });

    await auditInboxAccess(req, userId, true, links.length);
    res.json(ListDemoClinicInvitationLinksResponse.parse({ links }));
  } catch {
    req.log?.error?.("Local invitation inbox could not be loaded");
    res.status(500).json({ error: "Local invitation inbox could not be loaded" });
  }
});

export default router;
