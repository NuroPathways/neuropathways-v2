import { eq } from "drizzle-orm";
import { clientAccessCodeResetsTable, familiesTable } from "@workspace/db";
import { writeAuditEvent } from "./auditEvents";
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
  await tx.delete(clientAccessCodeResetsTable)
    .where(eq(clientAccessCodeResetsTable.familyId, input.familyId));
  await tx.update(familiesTable)
    .set({ inviteToken: null, inviteStatus: "revoked" })
    .where(eq(familiesTable.id, input.familyId));
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
      clinical_history_retained: true,
    },
    requestId: input.requestId,
  });
}
