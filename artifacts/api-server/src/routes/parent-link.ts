import { Router } from "express";
import crypto from "node:crypto";
import {
  db,
  auditLogsTable,
  behaviorLogsTable,
  behaviorPlansTable,
  childrenTable,
  clientAccessCodeResetsTable,
  clientProfilesTable,
  clientSessionsTable,
  dailyCheckInsTable,
  documentsTable,
  engagementEventsTable,
  familiesTable,
  invitationsTable,
  interventionPlansTable,
  messagesTable,
  mobileTokensTable,
  parentClinicInvitesTable,
  parentClinicConsentsTable,
  parentChildSettingsTable,
  parentDocumentsTable,
  parentLogsTable,
  rewardTokensTable,
  userProfilesTable,
  usersTable,
  aiConversationsTable,
  winLogsTable,
} from "@workspace/db";
import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { normalizeParentEmail, requireParent } from "../lib/parentAuth";
import { ownedParentChild, serializeParentChild } from "./parent";

const router = Router();
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type InviteRecord = {
  id: string;
  familyId: string;
  clinicianId: string;
  invitedEmail: string;
  expiresAt: Date | null;
  usedAt?: Date | null;
  legacy: boolean;
};

const normalizeEmail = normalizeParentEmail;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

function displayChildName(child: any): string {
  return child.childName?.trim() ||
    [child.firstName, child.lastName].filter(Boolean).join(" ").trim() ||
    "Child";
}

function sameName(a: string, b: string): boolean {
  return a.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase() ===
    b.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function isStrongLegacyToken(token: string): boolean {
  return token.length >= 32 && /^[A-Za-z0-9_-]+$/.test(token);
}

async function resolveInvite(tokenValue: unknown, emailValue: unknown): Promise<{
  invite: InviteRecord;
  family: any;
  children: any[];
  clinician: any;
}> {
  if (typeof tokenValue !== "string" || tokenValue.length < 32 || tokenValue.length > 512) {
    throw Object.assign(new Error("Invalid or expired invite"), { status: 400 });
  }
  const email = normalizeEmail(emailValue);
  if (!email) throw Object.assign(new Error("Parent email is not available"), { status: 403 });

  let invite: InviteRecord | undefined;
  const [hashedInvite] = await db.select()
    .from(parentClinicInvitesTable)
    .where(eq(parentClinicInvitesTable.tokenHash, hashToken(tokenValue)));
  if (hashedInvite) {
    invite = {
      id: hashedInvite.id,
      familyId: hashedInvite.familyId,
      clinicianId: hashedInvite.clinicianId,
      invitedEmail: hashedInvite.invitedEmail,
      expiresAt: hashedInvite.expiresAt,
      usedAt: hashedInvite.usedAt,
      legacy: false,
    };
  } else if (isStrongLegacyToken(tokenValue)) {
    const [legacyInvite] = await db.select()
      .from(invitationsTable)
      .where(and(
        eq(invitationsTable.inviteToken, tokenValue),
        eq(invitationsTable.inviteStatus, "pending"),
        gt(invitationsTable.expiresAt, new Date()),
      ));
    if (legacyInvite?.familyId && legacyInvite.clinicianId && legacyInvite.expiresAt &&
        normalizeEmail(legacyInvite.invitedEmail) === email) {
      invite = {
        id: legacyInvite.id,
        familyId: legacyInvite.familyId,
        clinicianId: legacyInvite.clinicianId,
        invitedEmail: legacyInvite.invitedEmail!,
        expiresAt: legacyInvite.expiresAt,
        legacy: true,
      };
    }
  }
  if (!invite) throw Object.assign(new Error("Invalid or expired invite"), { status: 400 });
  if (invite.usedAt) throw Object.assign(new Error("This invite has already been used"), { status: 410 });
  if (!invite.expiresAt || invite.expiresAt <= new Date()) {
    throw Object.assign(new Error("This invite has expired"), { status: 410 });
  }
  if (normalizeEmail(invite.invitedEmail) !== email) {
    throw Object.assign(new Error("This invite was sent to a different email address"), { status: 403 });
  }

  const [[family], [clinicianProfile], [clinicianUser]] = await Promise.all([
    db.select().from(familiesTable).where(and(
      eq(familiesTable.id, invite.familyId),
      eq(familiesTable.clinicianId, invite.clinicianId),
    )),
    db.select().from(userProfilesTable).where(and(
      eq(userProfilesTable.id, invite.clinicianId),
      eq(userProfilesTable.appRole, "clinician"),
    )),
    db.select().from(usersTable).where(eq(usersTable.id, invite.clinicianId)),
  ]);
  if (!family || !clinicianProfile || !clinicianUser) {
    throw Object.assign(new Error("The invited clinic is no longer available"), { status: 403 });
  }
  const familyChildren = await db.select().from(childrenTable).where(and(
    eq(childrenTable.familyId, invite.familyId),
    eq(childrenTable.clinicianId, invite.clinicianId),
  ));
  return { invite, family, children: familyChildren.filter((child) => child.status !== "merged"), clinician: { ...clinicianProfile, email: clinicianUser.email } };
}

async function logAudit(
  tx: any,
  values: {
    userId: string;
    userRole: string;
    action: string;
    targetType: string;
    targetId: string;
    tenantId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  await tx.insert(auditLogsTable).values({
    ...values,
    success: true,
  });
}

function clinicianDisplayName(clinician: any): string {
  return clinician.displayName?.trim() ||
    [clinician.firstName, clinician.lastName].filter(Boolean).join(" ").trim() ||
    "Your clinician";
}

function familyDisplayName(family: any): string {
  return family.familyName?.trim() ||
    [family.firstName, family.lastName].filter(Boolean).join(" ").trim() ||
    "Your clinic";
}

router.post("/parent/clinic-invites", async (req: any, res) => {
  if (!req.user?.id) return res.status(401).json({ error: "Authentication required" });
  try {
    const clinicianId = req.user.id as string;
    const [[profile], [clinician]] = await Promise.all([
      db.select().from(userProfilesTable).where(and(
        eq(userProfilesTable.id, clinicianId),
        eq(userProfilesTable.appRole, "clinician"),
      )),
      db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, clinicianId)),
    ]);
    if (!req.user.id || !profile || !clinician) {
      return res.status(403).json({ error: "A clinician account is required to issue a parent invite" });
    }

    const familyId = typeof req.body?.familyId === "string" ? req.body.familyId.trim() : "";
    const email = normalizeEmail(req.body?.email);
    if (!familyId || !email) {
      return res.status(400).json({ error: "familyId and a valid email are required" });
    }
    const [family] = await db.select().from(familiesTable).where(and(
      eq(familiesTable.id, familyId),
      eq(familiesTable.clinicianId, clinicianId),
    ));
    if (!family) return res.status(404).json({ error: "Family not found for this clinician" });

    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    await db.insert(parentClinicInvitesTable).values({
      tokenHash: hashToken(token),
      familyId,
      clinicianId,
      invitedEmail: email,
      expiresAt,
    });
    return res.status(201).json({
      inviteToken: token,
      expiresAt: expiresAt.toISOString(),
      inviteUrl: `/ParentQuickStart?invite=${encodeURIComponent(token)}`,
    });
  } catch (error: any) {
    return res.status(500).json({ error: "Unable to create invite" });
  }
});

router.post("/parent/children/:childId/link-preview", requireParent, async (req: any, res) => {
  if (req.familyParent) return res.status(403).json({ error: "This family is already managed by its clinic" });
  const parentId = req.parentAccount?.id;
  if (!parentId) return res.status(401).json({ error: "Parent authentication required" });
  try {
    const owned = await ownedParentChild(parentId, req.params.childId);
    const parentChild = owned?.child;
    if (!parentChild || parentChild.status === "merged") {
      return res.status(404).json({ error: "Child not found" });
    }
    if (!req.parentAccount.workspaceId || parentChild.tenantId !== req.parentAccount.workspaceId) {
      return res.status(403).json({ error: "This child is not in the parent workspace" });
    }
    const email = normalizeEmail(req.parentAccount.email);
    if (!email) return res.status(403).json({ error: "Parent account email is not available" });
    const { invite, family, children, clinician } = await resolveInvite(req.body?.inviteToken, email);
    if (parentChild.clinicianId && parentChild.clinicianId !== invite.clinicianId) {
      return res.status(403).json({ error: "This child is already linked to a different clinic" });
    }

    const parentName = displayChildName(parentChild);
    const possibleDuplicates = children.filter((candidate) =>
      sameName(displayChildName(candidate), parentName),
    );
    return res.json({
      clinicianName: clinicianDisplayName(clinician),
      familyName: familyDisplayName(family),
      children: children.map((child) => ({ id: child.id, name: displayChildName(child) })),
      requiresMergeReview: possibleDuplicates.length > 0,
    });
  } catch (error: any) {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    return res.status(status).json({
      error: status === 500 ? "Unable to preview clinic connection" : error.message,
    });
  }
});

router.delete("/parent/children/:childId/clinic-link", requireParent, async (req: any, res) => {
  if (req.familyParent) return res.status(403).json({ error: "Your clinic manages this family relationship" });
  const parentId = req.parentAccount?.id;
  if (!parentId) return res.status(401).json({ error: "Parent authentication required" });
  try {
    const owned = await ownedParentChild(parentId, req.params.childId);
    const child = owned?.child;
    if (!child || child.status === "merged") return res.status(404).json({ error: "Child not found" });
    const workspaceId = req.parentAccount.workspaceId as string;
    if (!workspaceId || child.tenantId !== workspaceId) {
      return res.status(403).json({ error: "This child is not in the parent workspace" });
    }

    await db.transaction(async (tx: any) => {
      await tx.update(parentDocumentsTable).set({ sharedClinicianId: null })
        .where(and(
          eq(parentDocumentsTable.parentId, parentId),
          eq(parentDocumentsTable.childId, child.id),
        ));
      await tx.update(parentClinicConsentsTable).set({
        scopes: [],
        revokedAt: new Date(),
      }).where(and(
        eq(parentClinicConsentsTable.parentId, parentId),
        eq(parentClinicConsentsTable.childId, child.id),
      ));
      await tx.update(childrenTable).set({ clinicianId: null, familyId: null })
        .where(and(
          eq(childrenTable.id, child.id),
          eq(childrenTable.parentId, parentId),
          eq(childrenTable.tenantId, workspaceId),
        ));
      await logAudit(tx, {
        userId: parentId,
        userRole: "parent",
        action: "parent_clinic_link_revoked",
        targetType: "child",
        targetId: child.id,
        tenantId: workspaceId,
        metadata: { clinicianId: child.clinicianId ?? null, familyId: child.familyId ?? null },
      });
    });
    return res.json({ ok: true, message: "Clinic access was disconnected. Your parent account and records are unchanged." });
  } catch (error: any) {
    req.log?.error?.({ err: error }, "Unable to revoke parent clinic link");
    return res.status(500).json({ error: "Unable to disconnect the clinic" });
  }
});

async function moveAuthorizedChildData(
  tx: any,
  duplicateChildId: string,
  parentChildId: string,
  clinicianId: string,
  familyId: string,
  parentId: string,
  workspaceId: string,
) {
  const childScopedTables = [
    behaviorPlansTable,
    documentsTable,
    interventionPlansTable,
    behaviorLogsTable,
    rewardTokensTable,
    messagesTable,
    aiConversationsTable,
    dailyCheckInsTable,
    winLogsTable,
    engagementEventsTable,
    clientProfilesTable,
  ];
  for (const table of childScopedTables) {
    const scopedTable = table as any;
    const clinicianScope = scopedTable.clinicianId
      ? and(
          or(
            and(
              eq(scopedTable.clinicianId, clinicianId),
              or(eq(scopedTable.tenantId, clinicianId), isNull(scopedTable.tenantId)),
            ),
            and(isNull(scopedTable.clinicianId), eq(scopedTable.tenantId, clinicianId)),
          ),
        )
      : eq(scopedTable.tenantId, clinicianId);
    // A validated legacy child identity may appear in parent_id on client-session
    // rows. It is safe to rebind only that exact alias, never another parent's ID.
    const ownerScope = scopedTable.parentId
      ? or(
          isNull(scopedTable.parentId),
          eq(scopedTable.parentId, parentId),
          eq(scopedTable.parentId, duplicateChildId),
        )
      : undefined;
    const updates: Record<string, unknown> = { childId: parentChildId };
    if (scopedTable.parentId) {
      updates.parentId = sql`CASE
        WHEN ${scopedTable.parentId} = ${duplicateChildId} THEN ${parentId}
        ELSE ${scopedTable.parentId}
      END`;
    }
    await tx.update(scopedTable).set(updates).where(and(
      eq(scopedTable.childId, duplicateChildId),
      clinicianScope,
      ownerScope,
    ));
  }
  await tx.update(parentLogsTable).set({
    childId: parentChildId,
    parentId: sql`CASE
      WHEN ${parentLogsTable.parentId} = ${duplicateChildId} THEN ${parentId}
      ELSE ${parentLogsTable.parentId}
    END`,
  }).where(and(
    eq(parentLogsTable.childId, duplicateChildId),
    or(
      eq(parentLogsTable.parentId, parentId),
      eq(parentLogsTable.parentId, duplicateChildId),
    ),
    eq(parentLogsTable.workspaceId, workspaceId),
  ));

  // Keep existing invited-child credentials and client-side sessions working,
  // but attach them to the retained parent-owned child record.
  await tx.update(clientSessionsTable).set({ childId: parentChildId }).where(eq(clientSessionsTable.childId, duplicateChildId));
  await tx.update(mobileTokensTable).set({ childId: parentChildId }).where(eq(mobileTokensTable.childId, duplicateChildId));
  await tx.update(clientAccessCodeResetsTable).set({
    childId: parentChildId,
    familyId,
  }).where(and(
    eq(clientAccessCodeResetsTable.childId, duplicateChildId),
    eq(clientAccessCodeResetsTable.clinicianId, clinicianId),
    eq(clientAccessCodeResetsTable.familyId, familyId),
  ));
  await tx.update(invitationsTable).set({ clientId: parentChildId }).where(and(
    eq(invitationsTable.clientId, duplicateChildId),
    eq(invitationsTable.clinicianId, clinicianId),
    eq(invitationsTable.familyId, familyId),
  ));
}

router.post("/parent/children/:childId/connect", requireParent, async (req: any, res) => {
  if (req.familyParent) return res.status(403).json({ error: "This family is already managed by its clinic" });
  const parentId = req.parentAccount?.id;
  if (!parentId) return res.status(401).json({ error: "Parent authentication required" });

  const sharing = req.body?.sharing;
  if (!["all", "selected", "none"].includes(sharing)) {
    return res.status(400).json({ error: 'sharing must be "all", "selected", or "none"' });
  }
  const documentIds: unknown = req.body?.documentIds;
  if (sharing === "selected" && documentIds !== undefined &&
      (!Array.isArray(documentIds) || documentIds.some((id) => typeof id !== "string" || !id))) {
    return res.status(400).json({ error: "documentIds must be an array of document IDs" });
  }
  if (sharing !== "selected" && documentIds !== undefined) {
    return res.status(400).json({ error: "documentIds may only be provided when sharing is selected" });
  }
  if (req.body?.shareObservations !== undefined && typeof req.body.shareObservations !== "boolean") {
    return res.status(400).json({ error: "shareObservations must be a boolean" });
  }
  const selectedIds = sharing === "selected" ? [...new Set((documentIds ?? []) as string[])] : [];
  if (selectedIds.length > 500) return res.status(400).json({ error: "Too many selected documents" });
  if (req.body?.mergeChildId !== undefined && typeof req.body.mergeChildId !== "string") {
    return res.status(400).json({ error: "mergeChildId must be a child ID" });
  }
  if (req.body?.confirmMerge !== undefined && typeof req.body.confirmMerge !== "boolean") {
    return res.status(400).json({ error: "confirmMerge must be a boolean" });
  }

  try {
    const owned = await ownedParentChild(parentId, req.params.childId);
    const parentChild = owned?.child;
    if (!parentChild || parentChild.status === "merged") return res.status(404).json({ error: "Child not found" });
    const workspaceId = req.parentAccount.workspaceId as string;
    if (!workspaceId || parentChild.tenantId !== workspaceId) {
      return res.status(403).json({ error: "This child is not in the parent workspace" });
    }
    const email = normalizeEmail(req.parentAccount.email);
    if (!email) return res.status(403).json({ error: "Parent account email is not available" });
    const { invite, family, children } = await resolveInvite(req.body?.inviteToken, email);
    if (parentChild.clinicianId && parentChild.clinicianId !== invite.clinicianId) {
      return res.status(403).json({ error: "This child is already linked to a different clinic" });
    }
    if (parentChild.clinicianId === invite.clinicianId && parentChild.familyId === invite.familyId) {
      return res.status(409).json({ error: "This child is already linked to this clinic family" });
    }

    const duplicateCandidates = children.filter((candidate) =>
      sameName(displayChildName(candidate), displayChildName(parentChild)),
    );
    let duplicateChild: any | undefined;
    if (duplicateCandidates.length > 0) {
      if (!req.body?.mergeChildId || req.body?.confirmMerge !== true) {
        return res.status(409).json({
          error: "A matching clinic child exists. Select that child and confirm the merge before connecting.",
          requiresMergeReview: true,
          children: duplicateCandidates.map((child) => ({ id: child.id, name: displayChildName(child) })),
        });
      }
      duplicateChild = duplicateCandidates.find((candidate) => candidate.id === req.body.mergeChildId);
      if (!duplicateChild) {
        return res.status(403).json({ error: "The selected merge child is not a matching child in this invited family" });
      }
      if (duplicateChild.parentId && duplicateChild.parentId !== parentId) {
        return res.status(403).json({ error: "The selected clinic child is owned by another parent" });
      }
      const [duplicateSettings] = await db.select().from(parentChildSettingsTable)
        .where(eq(parentChildSettingsTable.childId, duplicateChild.id));
      if (duplicateSettings &&
          (duplicateSettings.parentId !== parentId || duplicateSettings.workspaceId !== workspaceId)) {
        return res.status(403).json({ error: "The selected clinic child has parent-owned settings outside this account" });
      }
    } else if (req.body?.mergeChildId || req.body?.confirmMerge === true) {
      return res.status(400).json({ error: "There is no matching clinic child to merge" });
    }

    const currentInviteParentId = parentId;
    const connectedChild = await db.transaction(async (tx: any) => {
      const now = new Date();
      if (invite.legacy) {
        const [claimedLegacy] = await tx.update(invitationsTable).set({
          inviteStatus: "accepted",
        }).where(and(
          eq(invitationsTable.id, invite.id),
          eq(invitationsTable.inviteStatus, "pending"),
          sql`lower(${invitationsTable.invitedEmail}) = ${email}`,
          eq(invitationsTable.clinicianId, invite.clinicianId),
          eq(invitationsTable.familyId, invite.familyId),
          gt(invitationsTable.expiresAt, now),
        )).returning({ id: invitationsTable.id });
        if (!claimedLegacy) throw Object.assign(new Error("This invite is expired or has already been used"), { status: 410 });
      } else {
        const [claimed] = await tx.update(parentClinicInvitesTable).set({
          usedAt: now,
        }).where(and(
          eq(parentClinicInvitesTable.id, invite.id),
          isNull(parentClinicInvitesTable.usedAt),
          eq(parentClinicInvitesTable.invitedEmail, email),
          gt(parentClinicInvitesTable.expiresAt, now),
        )).returning({ id: parentClinicInvitesTable.id });
        if (!claimed) throw Object.assign(new Error("This invite is expired or has already been used"), { status: 410 });
      }

      if (duplicateChild) {
        const [currentDuplicate] = await tx.select().from(childrenTable).where(and(
          eq(childrenTable.id, duplicateChild.id),
          eq(childrenTable.familyId, invite.familyId),
          eq(childrenTable.clinicianId, invite.clinicianId),
        )).for("update");
        if (!currentDuplicate || currentDuplicate.status === "merged" ||
            !sameName(displayChildName(currentDuplicate), displayChildName(parentChild))) {
          throw Object.assign(new Error("The selected clinic child changed during merge review"), { status: 409 });
        }
        if (currentDuplicate.parentId && currentDuplicate.parentId !== parentId) {
          throw Object.assign(new Error("The selected clinic child is owned by another parent"), { status: 403 });
        }
        const [currentSettings] = await tx.select().from(parentChildSettingsTable)
          .where(eq(parentChildSettingsTable.childId, currentDuplicate.id))
          .for("update");
        if (currentSettings &&
            (currentSettings.parentId !== parentId || currentSettings.workspaceId !== workspaceId)) {
          throw Object.assign(new Error("The selected clinic child has parent-owned settings outside this account"), { status: 403 });
        }
        await moveAuthorizedChildData(
          tx,
          currentDuplicate.id,
          parentChild.id,
          invite.clinicianId,
          invite.familyId,
          parentId,
          workspaceId,
        );
        await tx.update(childrenTable).set({
          username: parentChild.username ?? duplicateChild.username ?? null,
          accessCode: parentChild.accessCode ?? duplicateChild.accessCode ?? null,
        }).where(and(
          eq(childrenTable.id, parentChild.id),
          eq(childrenTable.parentId, parentId),
          eq(childrenTable.tenantId, workspaceId),
        ));
        const [markedDuplicate] = await tx.update(childrenTable).set({
          status: "merged",
          username: null,
          accessCode: null,
        }).where(and(
          eq(childrenTable.id, duplicateChild.id),
          eq(childrenTable.familyId, invite.familyId),
          eq(childrenTable.clinicianId, invite.clinicianId),
        )).returning({ id: childrenTable.id });
        if (!markedDuplicate) {
          throw Object.assign(new Error("The selected clinic child changed during merge review"), { status: 409 });
        }
      }

      // Keep the parent workspace/tenant intact. Only establish the clinical
      // relationship; parent ownership and the original child ID do not change.
      const [updatedChild] = await tx.update(childrenTable).set({
        familyId: invite.familyId,
        clinicianId: invite.clinicianId,
      }).where(and(
        eq(childrenTable.id, parentChild.id),
        eq(childrenTable.parentId, currentInviteParentId),
        eq(childrenTable.tenantId, workspaceId),
        isNull(childrenTable.clinicianId),
      )).returning();
      if (!updatedChild) throw Object.assign(new Error("Child ownership changed during connection"), { status: 409 });

      let sharedIds: string[] = [];
      if (sharing === "all") {
        const metadataRows = await tx.select({ documentId: parentDocumentsTable.documentId })
          .from(parentDocumentsTable)
          .where(and(
            eq(parentDocumentsTable.parentId, parentId),
            eq(parentDocumentsTable.childId, parentChild.id),
          ));
        sharedIds = metadataRows.map((row: any) => row.documentId);
      } else if (sharing === "selected") {
        if (selectedIds.length > 0) {
          const rows = await tx.select({ documentId: parentDocumentsTable.documentId })
            .from(parentDocumentsTable)
            .where(and(
              eq(parentDocumentsTable.parentId, parentId),
              eq(parentDocumentsTable.childId, parentChild.id),
              inArray(parentDocumentsTable.documentId, selectedIds),
            ));
          if (rows.length !== selectedIds.length) {
            throw Object.assign(new Error("One or more selected documents do not belong to this child"), { status: 403 });
          }
          sharedIds = rows.map((row: any) => row.documentId);
        }
      }

      if (sharedIds.length > 0) {
        await tx.update(parentDocumentsTable).set({ sharedClinicianId: invite.clinicianId })
          .where(and(
            eq(parentDocumentsTable.parentId, parentId),
            eq(parentDocumentsTable.childId, parentChild.id),
            inArray(parentDocumentsTable.documentId, sharedIds),
          ));
        await tx.update(documentsTable).set({
          tenantId: invite.clinicianId,
          clinicianId: invite.clinicianId,
        }).where(and(
          eq(documentsTable.childId, parentChild.id),
          inArray(documentsTable.id, sharedIds),
        ));
      }

      const scopes = [
        ...(sharing !== "none" ? ["documents"] : []),
        ...(req.body?.shareObservations === true ? ["observations"] : []),
      ];
      await tx.insert(parentClinicConsentsTable).values({
        parentId,
        childId: parentChild.id,
        clinicianId: invite.clinicianId,
        scopes,
        consentedAt: now,
        revokedAt: null,
      }).onConflictDoUpdate({
        target: [parentClinicConsentsTable.parentId, parentClinicConsentsTable.childId],
        set: { clinicianId: invite.clinicianId, scopes, consentedAt: now, revokedAt: null },
      });

      await logAudit(tx, {
        userId: parentId,
        userRole: "parent",
        action: "parent_clinic_linked",
        targetType: "child",
        targetId: parentChild.id,
        tenantId: workspaceId,
        metadata: {
          clinicianId: invite.clinicianId,
          familyId: invite.familyId,
          mergedChildId: duplicateChild?.id ?? null,
        },
      });
      await logAudit(tx, {
        userId: parentId,
        userRole: "parent",
        action: "parent_clinic_document_sharing_consent",
        targetType: "child",
        targetId: parentChild.id,
        tenantId: workspaceId,
        metadata: {
          clinicianId: invite.clinicianId,
          sharing,
          documentIds: sharedIds,
          shareObservations: req.body?.shareObservations === true,
        },
      });

      return updatedChild;
    });
    const [settings] = await db.select().from(parentChildSettingsTable)
      .where(eq(parentChildSettingsTable.childId, parentChild.id));
    return res.json({
      ok: true,
      child: serializeParentChild(connectedChild, settings ?? null),
      message: duplicateChild
        ? "Your child profile was connected. The selected clinic profile was merged without removing its record."
        : "Your child profile was connected to the clinic.",
    });
  } catch (error: any) {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    return res.status(status).json({
      error: status === 500 ? "Unable to connect to clinic" : error.message,
    });
  }
});

export default router;