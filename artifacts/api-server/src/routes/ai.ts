import { Router } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  behaviorPlansTable,
  childrenTable,
  clientSessionsTable,
  clientProfilesTable,
  db,
  documentExtractionRunsTable,
  documentsTable,
  familiesTable,
  interventionPlansTable,
  userProfilesTable,
} from "@workspace/db";
import { AiChatBody } from "@workspace/api-zod";
import { sessionMayAccessChild, validateClientSession } from "./entities-helpers";
import { requireMobileAuth } from "./mobile";
import { ownedParentChild, resolveParentActor } from "../lib/parentAuth";
import { classifyFamilyAccount, familyOwnerId, isFamilyAccessRevoked } from "../lib/familyParentAuth";
import { writeAuditEventBestEffort } from "../lib/auditEvents";
import { aiOperationalControls, AiOperationalError } from "../lib/aiOperationalControls";
import { getAnthropicClient, CLAUDE_MODEL } from "../lib/anthropic";
import { clinicianCanAccessChild } from "../lib/clinicAuthorization";
import { legacyVisibleDocuments } from "../lib/documentVisibility";
import { parentChat } from "../lib/parentDocuments";
import {
  isBareModelRefusal,
  isDirectPhysicalInterventionRequest,
  relevantParentChatDocumentIds,
} from "../lib/parentChatPolicy";
import type { SourceReference } from "../lib/parentStarterLibrary";
import {
  buildAiChatSafeFallback,
  buildAiChatSystemPrompt,
  containsUnsafePhysicalInstructions,
  serializeUntrustedAiChatInput,
  type AiChatActorRole,
  type AiChatMode,
} from "../lib/aiChatPolicy";

const router = Router();

async function auditAiAuthenticationDenial(req: any, actorChildId?: string | null) {
  const [child] = actorChildId
    ? await db.select({ tenantId: childrenTable.tenantId }).from(childrenTable)
      .where(eq(childrenTable.id, actorChildId))
    : [];
  await writeAuditEventBestEffort({
    userId: actorChildId || undefined,
    userRole: actorChildId ? "client" : "unauthenticated",
    tenantId: child?.tenantId,
    action: "ai_chat_access_denied",
    targetType: actorChildId ? "child" : "ai_workflow",
    targetId: actorChildId || "chat",
    success: false,
    reason: "AI chat authentication failed or the session was revoked.",
    metadata: { feature: "chat", provider: "none", model: "none", outcome: "denied", source_document_ids: [] },
    requestId: String(req.id),
  });
}

async function requireAiAuth(req: any, res: any, next: any) {
  if (req.headers["x-mobile-token"]) {
    return requireMobileAuth(req, res, next);
  }
  const clientOrFamilyToken = req.get("x-client-session") || req.get("x-family-token");
  const [sessionHint] = typeof clientOrFamilyToken === "string"
    ? await db.select({ childId: clientSessionsTable.childId }).from(clientSessionsTable)
      .where(eq(clientSessionsTable.inviteToken, clientOrFamilyToken))
    : [];
  let denialAudited = false;
  try {
    const parent = await resolveParentActor(req);
    if (parent) {
      req.parentAccount = parent;
      if (parent.accountType === "legacy_family") req.familyParent = parent;
      return next();
    }
    if (req.user) return next();

    const clientSessionToken = req.get("x-client-session");
    if (typeof clientSessionToken === "string" && clientSessionToken) {
      const session = await validateClientSession(clientSessionToken);
      if (session) {
        req.clientSession = session;
        return next();
      }
      await auditAiAuthenticationDenial(req, sessionHint?.childId);
      denialAudited = true;
    }
  } catch (error) {
    req.log?.warn?.({ request_id: String(req.id), code: "ai_chat_auth_failed" }, "AI chat authentication failed");
    if (clientOrFamilyToken) {
      await auditAiAuthenticationDenial(req, sessionHint?.childId);
      denialAudited = true;
    }
  }
  if (!denialAudited) {
    await auditAiAuthenticationDenial(req);
  }
  return res.status(401).json({ error: "Authentication required" });
}

type AiActorScope = {
  actorId: string;
  userId: string;
  userRole: string;
  tenantId?: string | null;
  parentId?: string | null;
};

function identityForAi(req: any): AiActorScope | null {
  if (req.parentAccount?.id) {
    return {
      actorId: `parent:${req.parentAccount.id}`,
      userId: req.parentAccount.id,
      userRole: "parent",
      tenantId: req.parentAccount.workspaceId,
      parentId: req.parentAccount.id,
    };
  }
  if (req.mobileUser?.childId) {
    const childId = req.mobileUser?.childId;
    if (!childId) return null;
    return {
      actorId: `client:${childId}`,
      userId: childId,
      userRole: "client",
    };
  }
  if (req.clientSession?.childId) {
    return {
      actorId: `client:${req.clientSession.childId}`,
      userId: req.clientSession.childId,
      userRole: "client",
    };
  }
  if (req.user?.id) {
    return {
      actorId: `clinician:${req.user.id}`,
      userId: req.user.id,
      userRole: "clinician",
    };
  }
  return null;
}

async function authorizeAiChild(req: any, childId: string): Promise<AiActorScope | null> {
  if (req.parentAccount?.id) {
    if (!(await ownedParentChild(req.parentAccount.id, childId))) return null;
    return identityForAi(req);
  }

  const sessionChildId = req.mobileUser?.childId || req.clientSession?.childId;
  if (sessionChildId) {
    if (!(await sessionMayAccessChild(sessionChildId, childId))) return null;
    const [[sessionChild], [targetChild]] = await Promise.all([
      db.select().from(childrenTable).where(eq(childrenTable.id, sessionChildId)),
      db.select().from(childrenTable).where(eq(childrenTable.id, childId)),
    ]);
    if (!sessionChild || !targetChild || (targetChild.status && targetChild.status !== "active")) return null;
    if (sessionChild.id !== targetChild.id && (
      !sessionChild.familyId ||
      sessionChild.familyId !== targetChild.familyId ||
      sessionChild.clinicianId !== targetChild.clinicianId ||
      sessionChild.tenantId !== targetChild.tenantId
    )) return null;

    const familyAuth = Boolean(req.mobileUser?.experience === "parent" || req.clientSession);
    if (familyAuth && sessionChild.familyId && sessionChild.accountType !== "individual") {
      const [family] = await db.select().from(familiesTable).where(eq(familiesTable.id, sessionChild.familyId));
      if (
        !family ||
        family.clinicianId !== sessionChild.clinicianId ||
        isFamilyAccessRevoked(family) ||
        classifyFamilyAccount(family.accountType) !== "family"
      ) return null;
      const ownerId = familyOwnerId(family.id);
      if (!(await ownedParentChild(ownerId, childId))) return null;
      return {
        actorId: `parent:${ownerId}`,
        userId: ownerId,
        userRole: "parent",
        tenantId: targetChild.tenantId ?? targetChild.clinicianId,
        parentId: ownerId,
      };
    }

    const scope = identityForAi(req);
    if (!scope) return null;
    scope.tenantId = targetChild.tenantId ?? targetChild.clinicianId;
    return scope;
  }

  if (req.user?.id) {
    if (!(await clinicianCanAccessChild(req.user.id, childId))) return null;
    const [child] = await db.select({ tenantId: childrenTable.tenantId })
      .from(childrenTable).where(eq(childrenTable.id, childId));
    const scope = identityForAi(req);
    if (!scope) return null;
    scope.tenantId = child?.tenantId ?? req.user.id;
    return scope;
  }
  return null;
}

type ScopedSource = { documentId: string; title: string; content: string; reviewStatus: string };

function boundedText(value: unknown, limit = 1600): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function recordContext(record: any): string {
  const parts = [
    boundedText(record?.category, 100),
    boundedText(record?.sourceSection, 160),
    boundedText(record?.sourceExcerpt, 900),
  ].filter(Boolean);
  if (record?.interpretation && typeof record.interpretation === "object") {
    try {
      parts.push(JSON.stringify(record.interpretation).slice(0, 1400));
    } catch {
      // Malformed stored JSON is omitted from model context.
    }
  }
  return parts.join("\n").slice(0, 2400);
}

async function loadScopedAiContext(childId: string, scope: AiActorScope): Promise<{
  context: Record<string, unknown>;
  sources: ScopedSource[];
  sourceDocumentIds: string[];
}> {
  const [child] = await db.select().from(childrenTable).where(eq(childrenTable.id, childId));
  if (!child) throw new Error("Authorized child disappeared before context retrieval");

  const [allDocuments, behaviorPlans, interventions, profiles] = await Promise.all([
    db.select().from(documentsTable).where(eq(documentsTable.childId, childId))
      .orderBy(desc(documentsTable.createdDate)).limit(100),
    db.select().from(behaviorPlansTable).where(eq(behaviorPlansTable.childId, childId))
      .orderBy(desc(behaviorPlansTable.updatedAt)).limit(20),
    db.select().from(interventionPlansTable).where(eq(interventionPlansTable.childId, childId))
      .orderBy(desc(interventionPlansTable.createdDate)).limit(20),
    db.select().from(clientProfilesTable).where(eq(clientProfilesTable.childId, childId)).limit(1),
  ]);

  const visibleDocuments = await legacyVisibleDocuments(
    allDocuments,
    scope.userRole === "clinician" ? scope.userId : null,
    scope.userRole === "client" ? "client" : "clinician",
  );
  const readableDocuments = visibleDocuments
    .filter((document) => document.scanStatus === "done")
    .slice(0, 12);
  const readableDocumentIds = readableDocuments.map((document) => document.id);
  const runs = readableDocumentIds.length
    ? await db.select().from(documentExtractionRunsTable).where(and(
      eq(documentExtractionRunsTable.childId, childId),
      inArray(documentExtractionRunsTable.documentId, readableDocumentIds),
    )).orderBy(desc(documentExtractionRunsTable.createdAt)).limit(40)
    : [];

  const recordContentByDocument = new Map<string, string[]>();
  for (const run of runs) {
    if (!["completed", "partial"].includes(run.scanStatus)) continue;
    for (const record of Array.isArray(run.records) ? run.records : []) {
      if (!record || record.childId !== childId || record.documentId !== run.documentId) continue;
      const content = recordContext(record);
      if (!content) continue;
      const current = recordContentByDocument.get(run.documentId) ?? [];
      if (current.length < 8) current.push(content);
      recordContentByDocument.set(run.documentId, current);
    }
  }

  const sources: ScopedSource[] = readableDocuments.map((document) => {
    const title = boundedText(document.title || document.fileName, 180) || "Uploaded document";
    const extraction = (recordContentByDocument.get(document.id) ?? []).join("\n\n");
    const content = [
      boundedText(document.notes, 2400),
      extraction,
    ].filter(Boolean).join("\n\n").slice(0, 4200);
    return {
      documentId: document.id,
      title,
      content,
      reviewStatus: extraction ? "extracted; review status is shown per finding" : "scanned; no structured findings available",
    };
  }).filter((source) => source.content.length > 0);

  const visibleSourceIds = new Set(readableDocumentIds);
  const profile = profiles[0];
  const profileSourceIds = Array.isArray(profile?.sourceDocIds)
    ? profile.sourceDocIds.filter((id): id is string => typeof id === "string")
    : [];
  const profileSourcesAuthorized = profileSourceIds.every((id) => visibleSourceIds.has(id));
  const profileContext = profile && profileSourcesAuthorized
    ? {
      strengths: boundedText(profile.strengths, 1200),
      challenges: boundedText(profile.challenges, 1200),
      communicationStyle: boundedText(profile.communicationStyle, 900),
      sensoryNeeds: boundedText(profile.sensoryNeeds, 900),
      preferredStrategies: boundedText(profile.preferredStrategies, 1200),
      behaviors: profile.behaviors,
      goals: profile.goals,
      diagnoses: profile.diagnoses,
      objectives: profile.objectives,
      safetyProcedures: profile.safetyProcedures,
    }
    : null;

  const sourceDocumentIds = sources.map((source) => source.documentId);
  if (profileContext) {
    for (const id of profileSourceIds) {
      if (!sourceDocumentIds.includes(id)) sourceDocumentIds.push(id);
    }
  }

  const context = {
    child: {
      name: boundedText(child.childName, 100),
      age: child.age,
      recordedDiagnosis: boundedText(child.diagnosis, 500),
      recordedTriggers: boundedText(child.triggers, 1000),
    },
    behaviorPlans: behaviorPlans.map((plan) => ({
      behavior: boundedText(plan.behaviorName, 180),
      description: boundedText(plan.behaviorDescription, 1000),
      recordedFunction: boundedText(plan.behaviorFunction, 700),
      recordedTriggers: boundedText(plan.commonTriggers, 700),
      strategies: boundedText(plan.strategySteps, 1800),
      deescalation: boundedText(plan.deescalationSteps, 1400),
      avoid: boundedText(plan.avoidActions, 1000),
    })),
    interventionPlans: interventions.map((plan) => ({
      title: boundedText(plan.title, 180),
      description: boundedText(plan.description, 1000),
      immediateSteps: boundedText(plan.immediateSteps, 1400),
      deescalation: boundedText(plan.deescalationSteps, 1400),
      prevention: boundedText(plan.preventionTips, 1000),
      avoid: boundedText(plan.thingsToAvoid, 1000),
    })),
    clientProfile: profileContext,
    documents: sources.map(({ title, content, reviewStatus }) => ({ title, content, reviewStatus })),
  };

  return { context, sources, sourceDocumentIds: sourceDocumentIds.slice(0, 20) };
}

async function auditAiChat(
  req: any,
  scope: AiActorScope | null,
  childId: string,
  outcome: "success" | "safety_fallback" | "service_fallback" | "failed" | "denied",
  sourceDocumentIds: string[] = [],
  providerContacted = false,
) {
  const success = outcome === "success" || outcome === "safety_fallback";
  const identity = identityForAi(req);
  let tenantId = scope?.tenantId || identity?.tenantId || null;
  if (!tenantId && identity?.userRole === "clinician") {
    const [profile] = await db.select({ tenantId: userProfilesTable.tenantId })
      .from(userProfilesTable).where(eq(userProfilesTable.id, identity.userId));
    tenantId = profile?.tenantId ?? null;
  } else if (!tenantId && identity?.userRole === "client") {
    const [child] = await db.select({ tenantId: childrenTable.tenantId })
      .from(childrenTable).where(eq(childrenTable.id, identity.userId));
    tenantId = child?.tenantId ?? null;
  }
  await writeAuditEventBestEffort({
    userId: scope?.userId || identity?.userId,
    userRole: scope?.userRole || identity?.userRole || "authenticated",
    tenantId,
    action: outcome === "denied"
      ? "ai_chat_access_denied"
      : outcome === "failed" || outcome === "service_fallback"
        ? "ai_chat_failed"
        : "ai_chat_completed",
    targetType: "child",
    targetId: childId,
    success,
    reason: outcome === "denied"
      ? "The authenticated actor is not authorized for the requested child or the chat input is invalid."
      : outcome === "failed" || outcome === "service_fallback"
        ? "The AI service did not complete the chat request."
        : undefined,
    metadata: {
      feature: "chat",
      provider: providerContacted ? "anthropic" : "none",
      model: providerContacted ? CLAUDE_MODEL : "none",
      outcome,
      source_document_ids: providerContacted ? sourceDocumentIds.slice(0, 20) : [],
    },
    requestId: String(req.id),
  });
}

function makeSourceReferences(
  question: string,
  answer: string,
  sources: ScopedSource[],
): SourceReference[] {
  const selected = new Set(relevantParentChatDocumentIds(question, answer, sources));
  return sources.filter((source) => selected.has(source.documentId)).map((source) => ({
    documentId: source.documentId,
    title: source.title,
    excerpt: source.content.slice(0, 500) || null,
  }));
}

router.post("/ai/chat", requireAiAuth, async (req: any, res: any) => {
  const parsed = AiChatBody.strict().safeParse(req.body);
  const requestedChild = typeof req.body?.childId === "string" ? req.body.childId.slice(0, 128) : "unknown";
  if (!parsed.success || !parsed.data.message.trim()) {
    await auditAiChat(req, null, requestedChild, "denied");
    return res.status(400).json({ error: "The chat request is invalid" });
  }

  const { childId, message, priorMessages = [], mode = "chat" } = parsed.data;
  const scope = await authorizeAiChild(req, childId);
  if (!scope) {
    await auditAiChat(req, null, childId, "denied");
    return res.status(403).json({ error: "This child is outside your authorized access" });
  }

  if (scope.userRole === "parent" && scope.parentId) {
    try {
      const result = await parentChat(
        scope.parentId,
        childId,
        message,
        req.get("x-parent-local-date"),
        { priorMessages, mode },
      );
      const { auditSourceDocumentIds, ...publicResult } = result;
      await auditAiChat(req, scope, childId, result.outcome, auditSourceDocumentIds, result.providerContacted);
      return res.json(publicResult);
    } catch (error) {
      const denied = error instanceof Error && error.message === "Child not found";
      await auditAiChat(req, scope, childId, denied ? "denied" : "failed", [], false);
      req.log?.warn?.({
        ai_error_code: denied ? "child_scope_denied" : "parent_chat_unavailable",
        request_id: String(req.id),
      }, "Server-controlled parent AI chat did not complete");
      return res.status(denied ? 403 : 502).json({
        error: denied ? "This child is outside your authorized access" : "The AI support service could not complete the request",
      });
    }
  }

  let scopedContext: Awaited<ReturnType<typeof loadScopedAiContext>>;
  try {
    // No document/profile context is loaded until the current child authorization succeeds.
    scopedContext = await loadScopedAiContext(childId, scope);
  } catch {
    await auditAiChat(req, scope, childId, "failed", [], false);
    req.log?.warn?.({ ai_error_code: "context_unavailable", request_id: String(req.id) }, "AI context could not be loaded");
    return res.status(502).json({ error: "The AI support service could not complete the request" });
  }

  if (isDirectPhysicalInterventionRequest(message)) {
    const answer = buildAiChatSafeFallback(scope.userRole as AiChatActorRole, mode, message);
    await auditAiChat(req, scope, childId, "safety_fallback", [], false);
    return res.json({
      answer,
      sourceReferences: [],
      disclaimer: "This is general support information and not a substitute for an individualized plan or qualified professional.",
      outcome: "safety_fallback",
    });
  }

  let providerContacted = false;
  try {
    const response = await aiOperationalControls.run(scope.actorId, async () => {
      const client = await getAnthropicClient();
      const untrustedContent = serializeUntrustedAiChatInput({
        serverContext: scopedContext.context,
        priorMessages,
        message,
      });
      const pendingResponse = client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        system: buildAiChatSystemPrompt(scope.userRole as AiChatActorRole, mode),
        messages: [{ role: "user", content: untrustedContent }],
      }, { timeout: 60_000, maxRetries: 1 });
      providerContacted = true;
      return pendingResponse;
    });

    const textBlock = response.content.find((block) => block.type === "text") as { type: "text"; text: string } | undefined;
    const rawText = textBlock?.text.trim() ?? "";
    if (!rawText) throw new Error("empty_provider_response");
    const unsafeAnswer = containsUnsafePhysicalInstructions(rawText) || isBareModelRefusal(rawText);
    const answer = unsafeAnswer
      ? buildAiChatSafeFallback(scope.userRole as AiChatActorRole, mode, message)
      : rawText.slice(0, 12000);
    const outcome = unsafeAnswer ? "safety_fallback" : "success";
    const sourceReferences = unsafeAnswer
      ? []
      : makeSourceReferences(message, answer, scopedContext.sources);
    await auditAiChat(req, scope, childId, outcome, scopedContext.sourceDocumentIds, providerContacted);
    return res.json({
      answer,
      sourceReferences,
      disclaimer: "This is support information, not a diagnosis or a substitute for care from a qualified clinician.",
      outcome,
    });
  } catch (error) {
    const isOperational = error instanceof AiOperationalError;
    await auditAiChat(req, scope, childId, "failed", scopedContext.sourceDocumentIds, providerContacted);
    req.log?.warn?.({
      ai_error_code: isOperational ? error.code : "provider_unavailable",
      request_id: String(req.id),
    }, "Authorized AI chat failed");
    return res.status(isOperational ? error.status : 502).json({
      error: "The AI support service could not complete the request",
    });
  }
});

router.post("/ai/invoke-llm", requireAiAuth, async (req: any, res: any) => {
  const childId = typeof req.body?.child_id === "string" ? req.body.child_id.slice(0, 128) : "unknown";
  await writeAuditEventBestEffort({
    userId: identityForAi(req)?.userId,
    userRole: identityForAi(req)?.userRole || "authenticated",
    tenantId: identityForAi(req)?.tenantId,
    action: "ai_legacy_endpoint_disabled",
    targetType: "ai_workflow",
    targetId: "invoke-llm",
    success: false,
    reason: "The generic browser-controlled AI endpoint is retired; use server-scoped chat.",
    metadata: { feature: "legacy_chat", provider: "none", model: "none", outcome: "denied", source_document_ids: [] },
    requestId: String(req.id),
  });
  return res.status(410).json({ error: "This AI endpoint is retired. Use the scoped chat endpoint." });
});

export default router;
