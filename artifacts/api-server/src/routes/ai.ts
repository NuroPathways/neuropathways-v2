import crypto from "node:crypto";
import { Router } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { childrenTable, db, documentsTable } from "@workspace/db";
import { sessionMayAccessChild, validateClientSession } from "./entities-helpers";
import { requireMobileAuth } from "./mobile";
import { ownedParentChild, resolveParent } from "../lib/parentAuth";
import { writeAuditEventBestEffort } from "../lib/auditEvents";
import { aiOperationalControls, AiOperationalError } from "../lib/aiOperationalControls";
import { getAnthropicClient, CLAUDE_MODEL } from "../lib/anthropic";
import { clinicianCanAccessChild } from "../lib/clinicAuthorization";
import { legacyVisibleDocuments } from "../lib/documentVisibility";
import { listParentDocuments } from "../lib/parentDocuments";

const router = Router();

async function requireAiAuth(req: any, res: any, next: any) {
  const parent = await resolveParent(req);
  if (parent) {
    req.parentAccount = parent;
    return next();
  }
  if (req.user) return next();
  if (req.headers["x-mobile-token"]) {
    return requireMobileAuth(req, res, next);
  }
  const inviteToken = req.body?.invite_token;
  if (typeof inviteToken === "string") {
    const session = await validateClientSession(inviteToken);
    if (session) {
      req.clientSession = session;
      return next();
    }
  }
  return res.status(401).json({ error: "Authentication required" });
}

type AiActorScope = {
  actorId: string;
  userId: string;
  userRole: string;
  tenantId?: string | null;
};

async function sourceDocumentsAreAuthorized(
  childId: string,
  sourceDocumentIds: string[],
  scope: AiActorScope,
): Promise<boolean> {
  if (!sourceDocumentIds.length) return true;
  const rows = await db.select().from(documentsTable).where(and(
    eq(documentsTable.childId, childId),
    inArray(documentsTable.id, sourceDocumentIds),
  ));
  if (rows.length !== sourceDocumentIds.length) return false;

  if (scope.userRole === "parent") {
    const visible = await listParentDocuments(scope.userId, childId);
    const visibleIds = new Set(visible.map((document) => document.id));
    return sourceDocumentIds.every((id) => visibleIds.has(id));
  }

  const [child] = scope.userRole === "clinician"
    ? []
    : await db.select({ clinicianId: childrenTable.clinicianId })
      .from(childrenTable).where(eq(childrenTable.id, childId));
  const visibleClinicianId = scope.userRole === "clinician"
    ? scope.userId
    : child?.clinicianId ?? null;
  const visible = await legacyVisibleDocuments(
    rows,
    visibleClinicianId,
    scope.userRole === "clinician" ? "clinician" : "client",
  );
  const visibleIds = new Set(visible.map((document) => document.id));
  return sourceDocumentIds.every((id) => visibleIds.has(id));
}

async function authorizeAiChild(req: any, childId: string, sourceDocumentIds: string[]): Promise<AiActorScope | null> {
  if (req.parentAccount?.id) {
    if (!(await ownedParentChild(req.parentAccount.id, childId))) return null;
    const scope: AiActorScope = {
      actorId: `parent:${req.parentAccount.id}`,
      userId: req.parentAccount.id,
      userRole: "parent",
      tenantId: req.parentAccount.workspaceId,
    };
    return await sourceDocumentsAreAuthorized(childId, sourceDocumentIds, scope) ? scope : null;
  }

  const sessionChildId = req.mobileUser?.childId || req.clientSession?.childId;
  if (sessionChildId) {
    if (!(await sessionMayAccessChild(sessionChildId, childId))) return null;
    const [[sessionChild], [targetChild]] = await Promise.all([
      db.select().from(childrenTable).where(eq(childrenTable.id, sessionChildId)),
      db.select().from(childrenTable).where(eq(childrenTable.id, childId)),
    ]);
    if (!sessionChild || !targetChild) return null;
    if (sessionChild.id !== targetChild.id && (
      !sessionChild.familyId ||
      sessionChild.familyId !== targetChild.familyId ||
      sessionChild.clinicianId !== targetChild.clinicianId ||
      sessionChild.tenantId !== targetChild.tenantId
    )) return null;
    const actorId = req.clientSession
      ? `client:${crypto.createHash("sha256").update(String(req.body?.invite_token)).digest("hex")}`
      : `mobile-client:${sessionChild.id}`;
    const scope: AiActorScope = {
      actorId,
      userId: sessionChild.id,
      userRole: "client",
      tenantId: targetChild.tenantId ?? targetChild.clinicianId,
    };
    return await sourceDocumentsAreAuthorized(childId, sourceDocumentIds, scope) ? scope : null;
  }

  if (req.user?.id) {
    if (!(await clinicianCanAccessChild(req.user.id, childId))) return null;
    const [child] = await db.select({ tenantId: childrenTable.tenantId })
      .from(childrenTable).where(eq(childrenTable.id, childId));
    const scope: AiActorScope = {
      actorId: `clinician:${req.user.id}`,
      userId: req.user.id,
      userRole: "clinician",
      tenantId: child?.tenantId ?? req.user.id,
    };
    return await sourceDocumentsAreAuthorized(childId, sourceDocumentIds, scope) ? scope : null;
  }
  return null;
}

async function auditUnscopedAiRequest(req: any, reason: string) {
  const actor = req.user?.id || req.parentAccount?.id || req.familyParent?.id ||
    req.mobileUser?.childId || req.clientSession?.childId || null;
  const role = req.user?.id
    ? "clinician"
    : req.parentAccount?.id || req.familyParent?.id
      ? "parent"
      : req.mobileUser
        ? "client"
        : req.clientSession
          ? "client"
        : "authenticated";
  await writeAuditEventBestEffort({
    userId: actor || undefined,
    userRole: role,
    tenantId: req.user?.id || req.parentAccount?.workspaceId || req.familyParent?.workspaceId,
    action: "ai_unscoped_request_denied",
    targetType: "ai_workflow",
    targetId: "invoke-llm",
    success: false,
    reason,
    metadata: { operation: "unscoped_proxy" },
    requestId: String(req.id),
  });
}

router.post("/ai/invoke-llm", requireAiAuth, async (req: any, res: any) => {
  const { prompt, file_urls, child_id, source_document_ids, response_json_schema } = req.body || {};
  if (file_urls?.length) {
    await auditUnscopedAiRequest(req, "Client-supplied file references have no server-verified document scope.");
    return res.status(400).json({ error: "Files must be read through an authorized document workflow." });
  }
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 100_000) {
    return res.status(400).json({ error: "prompt required" });
  }
  if (typeof child_id !== "string" || !child_id.trim()) {
    return res.status(400).json({ error: "child_id required for AI scope verification" });
  }
  if (
    source_document_ids !== undefined &&
    (!Array.isArray(source_document_ids) || source_document_ids.length > 500 ||
      source_document_ids.some((id: unknown) => typeof id !== "string" || !id.trim()))
  ) {
    return res.status(400).json({ error: "Invalid source document scope" });
  }

  const sourceDocumentIds = [...new Set((source_document_ids || []) as string[])];
  const scope = await authorizeAiChild(req, child_id, sourceDocumentIds);
  if (!scope) {
    await writeAuditEventBestEffort({
      userId: req.user?.id || req.parentAccount?.id || req.mobileUser?.childId || req.clientSession?.childId || undefined,
      userRole: req.user?.id ? "clinician" : req.parentAccount ? "parent" : "client",
      action: "ai_access_denied",
      targetType: "child",
      targetId: child_id,
      success: false,
      reason: "AI child or source-document scope verification failed.",
      metadata: { operation: "support_chat", source_document_count: sourceDocumentIds.length },
      requestId: String(req.id),
    });
    return res.status(403).json({ error: "This child or one of the source documents is outside your authorized access." });
  }

  await writeAuditEventBestEffort({
    userId: scope.userId,
    userRole: scope.userRole,
    tenantId: scope.tenantId,
    action: "ai_support_request",
    targetType: "child",
    targetId: child_id,
    metadata: { source_document_count: sourceDocumentIds.length },
    requestId: String(req.id),
  });

  try {
    const response = await aiOperationalControls.run(scope.actorId, async () => {
      const client = await getAnthropicClient();
      let finalPrompt = prompt;
      if (response_json_schema) {
        finalPrompt += `\n\nIMPORTANT: Respond with ONLY valid JSON that exactly matches this JSON Schema (no markdown, no code blocks, no explanation — raw JSON only):\n${JSON.stringify(response_json_schema, null, 2)}`;
      }
      return client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        messages: [{ role: "user", content: finalPrompt }],
      }, { timeout: 60_000, maxRetries: 1 });
    });

    const textContent = response.content.find((block: any) => block.type === "text");
    const rawText = (textContent as any)?.text ?? "";
    if (response_json_schema) {
      try {
        const cleaned = rawText.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
        return res.json(JSON.parse(cleaned));
      } catch {
        return res.status(422).json({ error: "Model returned invalid JSON" });
      }
    }
    return res.json(rawText);
  } catch (error) {
    const isOperational = error instanceof AiOperationalError;
    const status = isOperational ? error.status : 502;
    req.log?.warn?.({
      ai_error_code: isOperational ? error.code : "provider_unavailable",
      request_id: String(req.id),
    }, "Authorized AI support request failed");
    return res.status(status).json({
      error: isOperational
        ? error.message
        : "AI support is temporarily unavailable. Please try again.",
    });
  }
});

export default router;
