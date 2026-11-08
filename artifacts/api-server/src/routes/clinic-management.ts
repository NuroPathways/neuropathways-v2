import { Router } from "express";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import {
  auditLogsTable,
  childrenTable,
  clinicMembershipsTable,
  clinicsTable,
  clinicalAssignmentsTable,
  documentsTable,
  db,
  parentClinicConsentsTable,
  parentDocumentsTable,
  sessionsTable,
  userProfilesTable,
} from "@workspace/db";
import {
  clinicalRecordClinicId,
  clinicianCanManageClinic,
} from "../lib/clinicAuthorization";

const router = Router();

function authenticatedUserId(req: any, res: any): string | null {
  if (typeof req.user?.id !== "string" || !req.user.id) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return req.user.id;
}

async function actorIsActiveClinicAdmin(tx: any, userId: string, clinicId: string) {
  const [[clinic], [membership]] = await Promise.all([
    tx.select({ id: clinicsTable.id }).from(clinicsTable).where(and(
      eq(clinicsTable.id, clinicId),
      eq(clinicsTable.status, "active"),
    )),
    tx.select({ id: clinicMembershipsTable.id }).from(clinicMembershipsTable).where(and(
      eq(clinicMembershipsTable.userId, userId),
      eq(clinicMembershipsTable.clinicId, clinicId),
      eq(clinicMembershipsTable.role, "clinic_admin"),
      eq(clinicMembershipsTable.status, "active"),
    )),
  ]);
  return Boolean(clinic && membership);
}

router.post("/clinic-management/:clinicId/staff/:staffUserId/revoke", async (req: any, res) => {
  const actorId = authenticatedUserId(req, res);
  if (!actorId) return;
  const clinicId = String(req.params.clinicId || "");
  const staffUserId = String(req.params.staffUserId || "");
  if (!clinicId || !staffUserId) return res.status(400).json({ error: "Clinic and staff IDs are required" });
  if (!(await clinicianCanManageClinic(actorId, clinicId))) {
    return res.status(403).json({ error: "An active clinic administrator is required" });
  }

  const [staffProfile] = await db.select({ appRole: userProfilesTable.appRole })
    .from(userProfilesTable).where(eq(userProfilesTable.id, staffUserId));
  if (staffProfile?.appRole !== "clinician") {
    return res.status(404).json({ error: "Clinician membership not found" });
  }

  const directChildren = await db.select({ id: childrenTable.id })
    .from(childrenTable).where(eq(childrenTable.clinicianId, staffUserId));
  const legacyChildIds: string[] = [];
  for (const child of directChildren) {
    if (await clinicalRecordClinicId(child.id) === clinicId) legacyChildIds.push(child.id);
  }
  const [assignedChildren, consentedChildren] = await Promise.all([
    db.select({ childId: clinicalAssignmentsTable.clientId })
      .from(clinicalAssignmentsTable).where(and(
        eq(clinicalAssignmentsTable.clinicId, clinicId),
        eq(clinicalAssignmentsTable.userId, staffUserId),
      )),
    db.select({ childId: parentClinicConsentsTable.childId })
      .from(parentClinicConsentsTable).where(eq(parentClinicConsentsTable.clinicianId, staffUserId)),
  ]);
  const affectedChildIds = new Set<string>([
    ...legacyChildIds,
    ...assignedChildren.map((row) => row.childId),
  ]);
  for (const grant of consentedChildren) {
    if (await clinicalRecordClinicId(grant.childId) === clinicId) affectedChildIds.add(grant.childId);
  }

  try {
    const result = await db.transaction(async (tx: any) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${clinicId}))`);
      if (!(await actorIsActiveClinicAdmin(tx, actorId, clinicId))) {
        throw Object.assign(new Error("An active clinic administrator is required"), { status: 403 });
      }

      const memberships = await tx.select().from(clinicMembershipsTable).where(and(
        eq(clinicMembershipsTable.clinicId, clinicId),
        eq(clinicMembershipsTable.userId, staffUserId),
      ));
      const targetIsAdmin = memberships.some((row: any) =>
        row.role === "clinic_admin" && row.status === "active"
      );
      if (targetIsAdmin) {
        const otherAdmins = await tx.select({ id: clinicMembershipsTable.id })
          .from(clinicMembershipsTable).where(and(
            eq(clinicMembershipsTable.clinicId, clinicId),
            eq(clinicMembershipsTable.role, "clinic_admin"),
            eq(clinicMembershipsTable.status, "active"),
            ne(clinicMembershipsTable.userId, staffUserId),
          ));
        if (!otherAdmins.length) {
          throw Object.assign(new Error("The clinic must retain at least one active administrator"), { status: 409 });
        }
      }

      const now = new Date();
      const revokedMemberships = await tx.update(clinicMembershipsTable).set({
        status: "revoked",
        updatedAt: now,
      }).where(and(
        eq(clinicMembershipsTable.clinicId, clinicId),
        eq(clinicMembershipsTable.userId, staffUserId),
        ne(clinicMembershipsTable.status, "revoked"),
      )).returning({ id: clinicMembershipsTable.id });

      if (!memberships.length) {
        await tx.insert(clinicMembershipsTable).values({
          clinicId,
          userId: staffUserId,
          role: "treating_clinician",
          status: "revoked",
          createdBy: actorId,
          updatedAt: now,
        });
      }

      const revokedAssignments = await tx.update(clinicalAssignmentsTable).set({
        status: "revoked",
        revokedAt: now,
        updatedAt: now,
      }).where(and(
        eq(clinicalAssignmentsTable.clinicId, clinicId),
        eq(clinicalAssignmentsTable.userId, staffUserId),
        ne(clinicalAssignmentsTable.status, "revoked"),
      )).returning({ clientId: clinicalAssignmentsTable.clientId });

      let revokedParentDocumentShareCount = 0;
      if (affectedChildIds.size) {
        const affectedIds = [...affectedChildIds];
        const sharedDocuments = await tx.select({
          documentId: parentDocumentsTable.documentId,
          workspaceId: parentDocumentsTable.workspaceId,
        }).from(parentDocumentsTable).where(and(
          inArray(parentDocumentsTable.childId, affectedIds),
          eq(parentDocumentsTable.sharedClinicianId, staffUserId),
        ));
        revokedParentDocumentShareCount = sharedDocuments.length;
        for (const document of sharedDocuments) {
          if (document.workspaceId) {
            await tx.update(documentsTable).set({
              tenantId: document.workspaceId,
              clinicianId: null,
            }).where(eq(documentsTable.id, document.documentId));
          }
        }
        await tx.update(parentDocumentsTable).set({
          sharedClinicianId: null,
          reviewedBy: null,
          reviewedAt: null,
        }).where(and(
          inArray(parentDocumentsTable.childId, affectedIds),
          eq(parentDocumentsTable.sharedClinicianId, staffUserId),
        ));
        await tx.update(parentClinicConsentsTable).set({
          scopes: [],
          revokedAt: now,
        }).where(and(
          inArray(parentClinicConsentsTable.childId, affectedIds),
          eq(parentClinicConsentsTable.clinicianId, staffUserId),
        ));
      }

      for (const childId of legacyChildIds) {
        await tx.insert(clinicalAssignmentsTable).values({
          clinicId,
          clientId: childId,
          userId: staffUserId,
          role: "treating_clinician",
          status: "revoked",
          assignedBy: actorId,
          revokedAt: now,
          updatedAt: now,
        }).onConflictDoUpdate({
          target: [
            clinicalAssignmentsTable.clinicId,
            clinicalAssignmentsTable.clientId,
            clinicalAssignmentsTable.userId,
            clinicalAssignmentsTable.role,
          ],
          set: { status: "revoked", assignedBy: actorId, revokedAt: now, updatedAt: now },
        });
      }
      await tx.delete(sessionsTable)
        .where(sql`${sessionsTable.sess} -> 'user' ->> 'id' = ${staffUserId}`);

      await tx.insert(auditLogsTable).values({
        tenantId: clinicId,
        userId: actorId,
        userRole: "clinic_admin",
        action: "clinic_staff_access_revoked",
        targetType: "clinic_membership",
        targetId: staffUserId,
        success: true,
        metadata: {
          revokedMembershipCount: revokedMemberships.length,
          revokedAssignmentCount: revokedAssignments.length,
          legacyChildAccessBlockedCount: legacyChildIds.length,
          parentDocumentSharesRevokedCount: revokedParentDocumentShareCount,
          correlation_id: String(req.id),
        },
      });
      return {
        membershipsRevoked: revokedMemberships.length,
        assignmentsRevoked: revokedAssignments.length,
        legacyChildrenBlocked: legacyChildIds.length,
      };
    });
    return res.json({ ok: true, ...result });
  } catch (error: any) {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    if (status === 500) req.log?.error?.({ err: error }, "Clinic staff access revocation failed");
    return res.status(status).json({
      error: status === 500 ? "Staff access could not be revoked" : error.message,
    });
  }
});

router.post("/clinic-management/:clinicId/clients/:childId/reassign", async (req: any, res) => {
  const actorId = authenticatedUserId(req, res);
  if (!actorId) return;
  const clinicId = String(req.params.clinicId || "");
  const childId = String(req.params.childId || "");
  const clinicianId = typeof req.body?.clinicianId === "string" ? req.body.clinicianId : "";
  if (!clinicId || !childId || !clinicianId) {
    return res.status(400).json({ error: "Clinic, client, and new clinician IDs are required" });
  }
  if (!(await clinicianCanManageClinic(actorId, clinicId))) {
    return res.status(403).json({ error: "An active clinic administrator is required" });
  }
  if (await clinicalRecordClinicId(childId) !== clinicId) {
    return res.status(404).json({ error: "Client is not in this clinic" });
  }
  const [child] = await db.select({ status: childrenTable.status }).from(childrenTable)
    .where(eq(childrenTable.id, childId));
  if (!child || child.status === "merged") return res.status(404).json({ error: "Client not found" });
  const [newClinician] = await db.select({ appRole: userProfilesTable.appRole })
    .from(userProfilesTable).where(eq(userProfilesTable.id, clinicianId));
  if (newClinician?.appRole !== "clinician") {
    return res.status(404).json({ error: "Active treating clinician not found" });
  }

  try {
    await db.transaction(async (tx: any) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${clinicId}))`);
      if (!(await actorIsActiveClinicAdmin(tx, actorId, clinicId))) {
        throw Object.assign(new Error("An active clinic administrator is required"), { status: 403 });
      }
      const [targetMembership] = await tx.select({ id: clinicMembershipsTable.id })
        .from(clinicMembershipsTable).where(and(
          eq(clinicMembershipsTable.userId, clinicianId),
          eq(clinicMembershipsTable.clinicId, clinicId),
          eq(clinicMembershipsTable.role, "treating_clinician"),
          eq(clinicMembershipsTable.status, "active"),
        ));
      if (!targetMembership) {
        throw Object.assign(new Error("The selected clinician is not an active treating member of this clinic"), { status: 409 });
      }

      const now = new Date();
      const [currentChild] = await tx.select({
        id: childrenTable.id,
        clinicianId: childrenTable.clinicianId,
      }).from(childrenTable).where(eq(childrenTable.id, childId)).for("update");
      if (!currentChild) throw Object.assign(new Error("Client not found"), { status: 404 });

      const priorTreatingAssignments = await tx.select({
        userId: clinicalAssignmentsTable.userId,
      }).from(clinicalAssignmentsTable).where(and(
        eq(clinicalAssignmentsTable.clinicId, clinicId),
        eq(clinicalAssignmentsTable.clientId, childId),
        eq(clinicalAssignmentsTable.role, "treating_clinician"),
        eq(clinicalAssignmentsTable.status, "active"),
      ));
      const previousClinicianIds = [...new Set([
        currentChild.clinicianId,
        ...priorTreatingAssignments.map((assignment: any) => assignment.userId),
      ].filter((id): id is string => typeof id === "string" && id.length > 0 && id !== clinicianId))];
      let revokedParentDocumentShareCount = 0;

      await tx.update(clinicalAssignmentsTable).set({
        status: "revoked",
        revokedAt: now,
        updatedAt: now,
      }).where(and(
        eq(clinicalAssignmentsTable.clinicId, clinicId),
        eq(clinicalAssignmentsTable.clientId, childId),
        eq(clinicalAssignmentsTable.role, "treating_clinician"),
        eq(clinicalAssignmentsTable.status, "active"),
      ));

      if (previousClinicianIds.length) {
        const previouslySharedDocuments = await tx.select({
          documentId: parentDocumentsTable.documentId,
          workspaceId: parentDocumentsTable.workspaceId,
        }).from(parentDocumentsTable).where(and(
          eq(parentDocumentsTable.childId, childId),
          inArray(parentDocumentsTable.sharedClinicianId, previousClinicianIds),
        ));
        revokedParentDocumentShareCount = previouslySharedDocuments.length;
        for (const document of previouslySharedDocuments) {
          if (document.workspaceId) {
            await tx.update(documentsTable).set({
              tenantId: document.workspaceId,
              clinicianId: null,
            }).where(eq(documentsTable.id, document.documentId));
          }
        }
        await tx.update(parentDocumentsTable).set({
          sharedClinicianId: null,
          reviewedBy: null,
          reviewedAt: null,
        }).where(and(
          eq(parentDocumentsTable.childId, childId),
          inArray(parentDocumentsTable.sharedClinicianId, previousClinicianIds),
        ));
        await tx.update(parentClinicConsentsTable).set({
          scopes: [],
          revokedAt: now,
        }).where(and(
          eq(parentClinicConsentsTable.childId, childId),
          inArray(parentClinicConsentsTable.clinicianId, previousClinicianIds),
        ));
      }

      if (currentChild.clinicianId && currentChild.clinicianId !== clinicianId) {
        await tx.insert(clinicalAssignmentsTable).values({
          clinicId,
          clientId: childId,
          userId: currentChild.clinicianId,
          role: "treating_clinician",
          status: "revoked",
          assignedBy: actorId,
          revokedAt: now,
          updatedAt: now,
        }).onConflictDoUpdate({
          target: [
            clinicalAssignmentsTable.clinicId,
            clinicalAssignmentsTable.clientId,
            clinicalAssignmentsTable.userId,
            clinicalAssignmentsTable.role,
          ],
          set: { status: "revoked", assignedBy: actorId, revokedAt: now, updatedAt: now },
        });
      }

      await tx.insert(clinicalAssignmentsTable).values({
        clinicId,
        clientId: childId,
        userId: clinicianId,
        role: "treating_clinician",
        status: "active",
        assignedBy: actorId,
        updatedAt: now,
        revokedAt: null,
      }).onConflictDoUpdate({
        target: [
          clinicalAssignmentsTable.clinicId,
          clinicalAssignmentsTable.clientId,
          clinicalAssignmentsTable.userId,
          clinicalAssignmentsTable.role,
        ],
        set: { status: "active", assignedBy: actorId, revokedAt: null, updatedAt: now },
      });

      await tx.update(childrenTable)
        .set({ clinicianId })
        .where(eq(childrenTable.id, childId));

      await tx.insert(auditLogsTable).values({
        tenantId: clinicId,
        userId: actorId,
        userRole: "clinic_admin",
        action: "clinical_assignment_reassigned",
        targetType: "clinical_assignment",
        targetId: childId,
        success: true,
        metadata: {
          previousClinicianIds,
          clinicianId,
          revokedParentDocumentShareCount,
          correlation_id: String(req.id),
        },
      });
    });
    return res.json({ ok: true, childId, clinicianId });
  } catch (error: any) {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    if (status === 500) req.log?.error?.({ err: error }, "Clinical assignment reassignment failed");
    return res.status(status).json({
      error: status === 500 ? "Client assignment could not be changed" : error.message,
    });
  }
});

export default router;
