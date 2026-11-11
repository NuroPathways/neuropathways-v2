import { writeAuditEventBestEffort } from "./auditEvents";

type IntegrityDocument = {
  id: string;
  childId: string | null;
  tenantId: string | null;
};

type IntegrityRequest = {
  id?: string | number;
  user?: { id?: string; appRole?: string } | null;
  mobileUser?: { id?: string } | null;
  clientSession?: { childId?: string } | null;
};

export async function auditDocumentIntegrityFailure(
  req: IntegrityRequest,
  document: IntegrityDocument,
  operation: "download" | "scan",
): Promise<void> {
  await writeAuditEventBestEffort({
    userId: req.user?.id ?? req.mobileUser?.id ?? req.clientSession?.childId ?? document.childId,
    userRole: req.user?.id
      ? (req.user.appRole === "clinician" ? "clinician" : "parent")
      : req.mobileUser?.id
        ? "clinician_mobile"
        : "client",
    tenantId: document.tenantId,
    action: "document_integrity_failure",
    targetType: "document",
    targetId: document.id,
    success: false,
    reason: "Encrypted document authentication failed.",
    metadata: {
      child_id: document.childId,
      operation,
    },
    requestId: req.id,
  });
}
