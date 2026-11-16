import { and, eq, sql } from "drizzle-orm";
import { Router } from "express";
import { SubmitClinicRequestBody } from "@workspace/api-zod";
import { db, clinicRequestsTable } from "@workspace/db";
import { writeAuditEvent } from "../lib/auditEvents";
import { normalizeInvitationEmail } from "../lib/clinicInvitationSecurity";
import { respondWithInternalError } from "../lib/apiError";

const router = Router();

function normalizeWebsite(value: unknown): string | null | undefined {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.length > 500) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

router.post("/clinic-requests", async (req: any, res) => {
  const parsed = SubmitClinicRequestBody.safeParse(req.body);
  const workEmail = normalizeInvitationEmail(parsed.success ? parsed.data.workEmail : null);
  const website = normalizeWebsite(parsed.success ? parsed.data.website : undefined);
  if (!parsed.success || !workEmail || website === undefined) {
    return res.status(400).json({ error: "Clinic name, contact name, work email, and request ID are required" });
  }
  const clinicName = parsed.data.clinicName.trim();
  const contactName = parsed.data.contactName.trim();
  if (clinicName.length < 2 || contactName.length < 2) {
    return res.status(400).json({ error: "Enter a clinic name and contact name" });
  }

  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${parsed.data.requestKey}))`);
      let [existing] = await tx.select().from(clinicRequestsTable)
        .where(eq(clinicRequestsTable.requestKey, parsed.data.requestKey));
      if (existing) {
        if (existing.clinicName !== clinicName || existing.workEmail.toLowerCase() !== workEmail) {
          throw Object.assign(new Error("Request ID already used"), { status: 409 });
        }
        return existing;
      }
      [existing] = await tx.select().from(clinicRequestsTable).where(and(
        eq(clinicRequestsTable.clinicName, clinicName),
        eq(clinicRequestsTable.workEmail, workEmail),
        eq(clinicRequestsTable.status, "pending"),
      ));
      if (existing) return existing;

      const [created] = await tx.insert(clinicRequestsTable).values({
        clinicName,
        contactName,
        workEmail,
        website: website ?? null,
        requestKey: parsed.data.requestKey,
      }).returning();
      await writeAuditEvent(tx, {
        userRole: "anonymous",
        action: "clinic_request_submitted",
        targetType: "clinic_request",
        targetId: created.id,
        metadata: { request_status: "pending" },
        ipAddress: req.ip,
        requestId: req.id,
      });
      return created;
    });
    res.status(202).json({
      requestId: result.id,
      status: result.status,
      message: "Request received. A platform administrator must review it before any clinic or account is created.",
    });
  } catch (error: any) {
    if (error?.status === 409) return res.status(409).json({ error: "This request could not be submitted" });
    return respondWithInternalError(req, res, error, "clinic-request");
  }
});

export default router;
