import { eq } from "drizzle-orm";
import { db, clinicInvitationsTable } from "@workspace/db";
import { writeAuditEventBestEffort } from "./auditEvents";
import { createClinicInvitationLink } from "./clinicInvitationSecurity";
import { isIsolatedClinicInvitationDemo } from "./demoClinicInvitationInbox";
import {
  hasLoopbackClinicInvitationTestSink,
  sendClinicInvitationEmail,
  type ClinicInvitationDeliveryStatus,
} from "./clinicInvitationDelivery";

type RequestAuditContext = {
  id?: string | number;
  ip?: string;
};

export async function deliverClinicInvitation(input: {
  invitationId: string;
  clinicId: string;
  createdBy: string;
  invitedEmail: string;
  clinicName: string;
  role: "clinic_admin" | "treating_clinician";
  token: string;
  request: RequestAuditContext;
}): Promise<ClinicInvitationDeliveryStatus> {
  let deliveryStatus: ClinicInvitationDeliveryStatus = "not_sent";
  let deliveryAttemptedAt: Date | null = null;
  const baseUrl = process.env.NP_CLINIC_INVITATION_BASE_URL;
  const isolatedDemoInbox = isIsolatedClinicInvitationDemo();
  const testMailSinkEnabled = process.env.NODE_ENV === "test" && hasLoopbackClinicInvitationTestSink();
  if (
    baseUrl &&
    (isolatedDemoInbox || (process.env.NODE_ENV === "test" && process.env.NP_CLINIC_INVITATION_TEST_SINK_URL))
  ) {
    try {
      const roleLabel = input.role === "clinic_admin" ? "clinic administrator" : "treating clinician";
      const invitationUrl = createClinicInvitationLink(baseUrl, input.token);
      deliveryStatus = await sendClinicInvitationEmail({
        to: input.invitedEmail,
        clinicName: input.clinicName,
        roleLabel,
        invitationUrl,
      });
      if (testMailSinkEnabled && deliveryStatus !== "not_sent") {
        deliveryAttemptedAt = new Date();
      }
    } catch {
      deliveryStatus = "failed";
    }
  }

  await db.update(clinicInvitationsTable)
    .set({
      deliveryStatus,
      updatedAt: new Date(),
      ...(deliveryAttemptedAt ? { deliveryAttemptedAt } : {}),
    })
    .where(eq(clinicInvitationsTable.id, input.invitationId));

  await writeAuditEventBestEffort({
    userId: input.createdBy,
    userRole: input.role === "clinic_admin" ? "platform_admin" : "clinic_admin",
    tenantId: input.clinicId,
    action: "clinic_invitation_delivery_status_recorded",
    targetType: "clinic_invitation",
    targetId: input.invitationId,
    success: deliveryStatus === "test_sink_accepted" || deliveryStatus === "provider_accepted",
    reason: deliveryStatus === "not_sent" ? "No email sender is configured" : null,
    metadata: { role: input.role, delivery_status: deliveryStatus },
    ipAddress: input.request.ip,
    requestId: input.request.id,
  });
  return deliveryStatus;
}
