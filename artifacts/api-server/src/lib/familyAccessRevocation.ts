import { and, eq, gt, isNull } from "drizzle-orm";
import { clientAccessCodeResetsTable, familiesTable } from "@workspace/db";
import { writeAuditEvent } from "./auditEvents";
import { accessCodeResetAuditTargetId } from "./accessCodeResetAudit";
import { revokeClientSessionsForChildren } from "./clientSessionRevocation";

type RevokeFamilyAccessInput = {
  familyId: string;
  childIds: string[];
  actorId: string;
  tenantId: string | null;
  requestId?: string | number | null;
};

/**
 * Revoke family authentication while retaining all clinical and parent data.
 * The caller supplies a database transaction so the account state, sessions,
 * password-reset tokens, and audit record change atomically.
 */
export async function revokeFamilyAccess(tx: any, input: RevokeFamilyAccessInput): Promise<void> {
  await revokeClientSessionsForChildren(tx, input.childIds);
  const now = new Date();
  const pendingResetLinks = await tx.select({
    childId: clientAccessCodeResetsTable.childId,
    tokenHash: clientAccessCodeResetsTable.tokenHash,
  }).from(clientAccessCodeResetsTable).where(and(
    eq(clientAccessCodeResetsTable.familyId, input.familyId),
    isNull(clientAccessCodeResetsTable.usedAt),
    gt(clientAccessCodeResetsTable.expiresAt, now),
  ));
  await tx.delete(clientAccessCodeResetsTable)
    .where(eq(clientAccessCodeResetsTable.familyId, input.familyId));
  await tx.update(familiesTable)
    .set({ inviteToken: null, inviteStatus: "revoked" })
    .where(eq(familiesTable.id, input.familyId));
  for (const resetLink of pendingResetLinks) {
    await writeAuditEvent(tx, {
      userId: input.actorId,
      userRole: "clinician",
      action: "access_code_reset_invalidated",
      targetType: "access_code_reset",
      targetId: accessCodeResetAuditTargetId(resetLink.tokenHash),
      tenantId: input.tenantId,
      metadata: {
        family_id: input.familyId,
        child_id: resetLink.childId,
        reason: "family_access_revoked",
      },
      requestId: input.requestId,
    });
  }
  await writeAuditEvent(tx, {
    userId: input.actorId,
    userRole: "clinician",
    action: "family_access_revoked",
    targetType: "family",
    targetId: input.familyId,
    tenantId: input.tenantId,
    metadata: {
      child_count: input.childIds.length,
      active_sessions_revoked: true,
      invalidated_reset_link_count: pendingResetLinks.length,
      clinical_history_retained: true,
    },
    requestId: input.requestId,
  });
}
