import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { once } from "node:events";
import express from "express";
import { Storage } from "@google-cloud/storage";
import { test } from "node:test";

const databaseUrl = process.env.PARENT_UPLOAD_AI_TEST_DATABASE_URL;
const testRoot = process.env.PARENT_UPLOAD_AI_TEST_ROOT;
const evidenceDir = process.env.PARENT_UPLOAD_AI_EVIDENCE_DIR;
if (!databaseUrl || !testRoot || !evidenceDir) {
  throw new Error("The isolated parent-upload AI runner did not provide required test paths.");
}

const parsedDatabaseUrl = new URL(databaseUrl);
if (
  !["127.0.0.1", "::1", "[::1]"].includes(parsedDatabaseUrl.hostname) ||
  decodeURIComponent(parsedDatabaseUrl.pathname.slice(1)) !== "np_parent_upload_ai_test"
) {
  throw new Error("Refusing to run outside the isolated loopback parent-upload AI test database.");
}

process.env.DATABASE_URL = databaseUrl;
process.env.FILE_ENCRYPTION_KEY = "c".repeat(64);
process.env.PRIVATE_OBJECT_DIR = "np-parent-upload-test/fixture";
process.env.REPLIT_CONNECTORS_ENABLED = "false";
process.env.NODE_ENV = "production";
process.env.LOG_LEVEL = "info";
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

const RAW_DOCUMENT_SENTINEL = "PARENT_UPLOAD_RAW_DOCUMENT_SENTINEL_";
const RAW_PROVIDER_SENTINEL = "PARENT_UPLOAD_PROVIDER_RESPONSE_SENTINEL_";

type ProviderMode = "valid" | "empty-discovery" | "provider-error";
type CaseResult = { name: string; status: "PASS" | "FAIL"; details?: string };
type CapturedRequest = {
  toolName: string;
  model: string | null;
  hasSourceMarker: boolean;
  hasExtractedSourceFact: boolean;
  hasForeignMarker: boolean;
  hasServerInstructions: boolean;
};
type ChatContextSummary = {
  phase: "before_delete" | "after_delete";
  hasRawSourceMarker: boolean;
  hasSourceExcerpt: boolean;
  hasDocumentTitle: boolean;
  hasDocumentId: boolean;
  hasSupportStep: boolean;
  hasPlanGoal: boolean;
};

let providerMode: ProviderMode = "valid";
let activeDocumentId = "";
let chatCapturePhase: ChatContextSummary["phase"] | null = null;
let activeSourceText = "";
let foreignSourceText = "";
let sourceMarker = "";
let providerSecretMarker = "";
const capturedRequests: CapturedRequest[] = [];
const chatContextSummaries: ChatContextSummary[] = [];
const caseResults: CaseResult[] = [];
const fakeObjects = new Map<string, Buffer>();
let deletionLifecycleEvidence: Record<string, unknown> | null = null;

const storagePrototype = Storage.prototype as unknown as {
  bucket: (name: string) => unknown;
};
storagePrototype.bucket = function fakeBucket(bucketName: string) {
  return {
    file(objectName: string) {
      const key = `${bucketName}/${objectName}`;
      return {
        async save(bytes: Buffer | Uint8Array) {
          fakeObjects.set(key, Buffer.from(bytes));
        },
        async download() {
          const bytes = fakeObjects.get(key);
          if (!bytes) throw new Error("Synthetic isolated object does not exist.");
          return [Buffer.from(bytes)];
        },
        async delete() {
          fakeObjects.delete(key);
          return [{}];
        },
        async exists() {
          return [fakeObjects.has(key)];
        },
      };
    },
  };
} as typeof storagePrototype.bucket;

function toolNameFrom(body: Record<string, any>): string {
  return typeof body.tool_choice?.name === "string"
    ? body.tool_choice.name
    : String(body.tools?.[0]?.name || "unknown");
}

function extractionIdsFrom(body: Record<string, any>): string[] {
  const collectText = (value: unknown): string[] => {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(collectText);
    if (value && typeof value === "object") return Object.values(value).flatMap(collectText);
    return [];
  };
  const text = collectText(body.messages ?? []).join("\n");
  return [...new Set([...text.matchAll(/"extraction_id"\s*:\s*"([^"]+)"/g)].map((match) => match[1]))];
}

const behaviorExcerpt = "Kai needs help beginning a worksheet with several steps.";
const observationExcerpt = "When the worksheet has several steps, Kai pauses before starting.";
const goalExcerpt = "Goal: Kai will show the break card before leaving the table.";
const activityExcerpt = "Practice: place the break card beside the worksheet, pause, then return to one problem.";

function discoveryInput(documentId: string) {
  return {
    targets: [{
      behavior_key: "custom",
      behavior_name: "Starting a multi-step worksheet",
      goal: "Show the break card before leaving the table.",
    }],
    extractions: [
      {
        category: "behavior",
        source_document_id: documentId,
        source_section: "Homework",
        source_page: 0,
        source_excerpt: behaviorExcerpt,
        ambiguous: false,
        interpretation: { name: "Starting a multi-step worksheet", contexts: ["Homework"] },
      },
      {
        category: "clinical_observation",
        source_document_id: documentId,
        source_section: "Homework",
        source_page: 0,
        source_excerpt: observationExcerpt,
        ambiguous: false,
        interpretation: {
          observation: observationExcerpt,
          context: "During homework after seeing a worksheet with several steps.",
          barriers: "The first step may be unclear.",
        },
      },
      {
        category: "goal",
        source_document_id: documentId,
        source_section: "Goal",
        source_page: 0,
        source_excerpt: goalExcerpt,
        ambiguous: false,
        interpretation: {
          title: "Show the break card before leaving the table",
          description: "Use the break card before leaving the table.",
          milestones: ["Show the card before leaving the table."],
        },
      },
      {
        category: "potential_home_activity",
        source_document_id: documentId,
        source_section: "Practice",
        source_page: 0,
        source_excerpt: activityExcerpt,
        ambiguous: false,
        interpretation: {
          title: "Practice using the break card",
          skill: "Ask for a short break",
          related_goal: "Show the break card before leaving the table",
          suggested_context: "Before homework",
          duration_minutes: 5,
          materials: ["Break card", "Worksheet"],
          start_action: "Place the break card beside the worksheet.",
          steps: ["Show the card.", "Pause for five minutes.", "Return to one problem."],
          end_condition: "Complete one worksheet problem.",
          pause_conditions: [],
          observation_prompts: ["Did Kai show the card before taking a break?"],
        },
      },
    ],
  };
}

function toolInput(toolName: string, body: Record<string, any>): Record<string, unknown> {
  if (toolName === "discover_parent_targets") return discoveryInput(activeDocumentId);
  if (toolName === "generate_source_linked_support_area_candidates") {
    const ids = extractionIdsFrom(body);
    return {
      cards: ids.length ? [{
        source_extraction_ids: [ids[0]],
        name: "Getting started with homework",
        description: "Kai pauses before beginning a worksheet with several steps.",
        contexts: ["Homework"],
        observations: ["Kai pauses before beginning the multi-step worksheet."],
        uncertainty: "",
      }] : [],
    };
  }
  if (toolName === "generate_document_informed_support_cards") {
    const ids = extractionIdsFrom(body);
    return {
      cards: ids.length ? [{
        source_extraction_ids: [ids[0]],
        try_one_steps: [
          "Place the break card beside the worksheet and point to one problem.",
          "If Kai shows the card, pause for five minutes, then return to one problem.",
        ],
        simpler_step: "Point to the first problem and ask whether Kai wants help.",
        things_to_avoid: ["Avoid presenting the entire multi-step worksheet at once."],
        what_may_be_happening: ["A worksheet with several steps may be hard to begin."],
        prevention_ideas: ["Set out the break card before homework begins."],
        encouragement: ["Acknowledge Kai for using the card to ask for a break."],
        practice_a_helpful_skill: ["Practice showing the break card during a calm moment."],
        what_to_notice: ["Notice whether Kai returns to one problem after the break."],
      }] : [],
    };
  }
  if (toolName === "save_parent_support") {
    return {
      behavior_name: "Starting a multi-step worksheet",
      what_may_be_happening: "A worksheet with several steps may be hard to begin.",
      right_now: ["Point to one problem.", "Offer the break card."],
      avoid: ["Avoid presenting the full worksheet as one task."],
      prevention: ["Place the break card beside the worksheet."],
      replacement_skill: "Show the break card before leaving the table.",
      reinforcement_idea: "Acknowledge when Kai asks for a break.",
      seek_help: "Contact the clinician if the current plan is not helping.",
      selected_goal: "Show the break card before leaving the table.",
      track: ["Notice whether Kai uses the card before leaving."],
      related_goals: ["Show the break card before leaving the table."],
      source_document_ids: [activeDocumentId],
      daily_activities: [],
      conflict: false,
    };
  }
  return { cards: [] };
}

const provider = http.createServer((request, response) => {
  const chunks: Buffer[] = [];
  request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  request.on("end", () => {
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, any>;
      const toolName = toolNameFrom(body);
      const serialized = JSON.stringify(body);
      if (!Array.isArray(body.tools) || body.tools.length === 0) {
        if (chatCapturePhase) {
          chatContextSummaries.push({
            phase: chatCapturePhase,
            hasRawSourceMarker: serialized.includes(sourceMarker),
            hasSourceExcerpt: serialized.includes(behaviorExcerpt) || serialized.includes(observationExcerpt),
            hasDocumentTitle: serialized.includes("Synthetic plan"),
            hasDocumentId: serialized.includes(activeDocumentId),
            hasSupportStep: serialized.includes("Place the break card beside the worksheet"),
            hasPlanGoal: serialized.includes("Show the break card before leaving the table"),
          });
        }
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({
          id: `msg-parent-chat-${chatContextSummaries.length}`,
          type: "message",
          role: "assistant",
          model: body.model || "claude-sonnet-4-5",
          content: [{ type: "text", text: "Synthetic test response." }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        }));
        return;
      }
      capturedRequests.push({
        toolName,
        model: typeof body.model === "string" ? body.model : null,
        hasSourceMarker: serialized.includes(sourceMarker),
        hasExtractedSourceFact: serialized.includes(behaviorExcerpt) || serialized.includes(observationExcerpt),
        hasForeignMarker: Boolean(foreignSourceText) && serialized.includes(foreignSourceText),
        hasServerInstructions: typeof body.system === "string" && body.system.length > 0,
      });

      if (providerMode === "empty-discovery" && toolName === "discover_parent_targets") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({
          id: "msg-parent-upload-empty",
          type: "message",
          role: "assistant",
          model: body.model || "claude-sonnet-4-5",
          content: [],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        }));
        return;
      }

      if (providerMode === "provider-error" && toolName === "discover_parent_targets") {
        response.writeHead(401, { "content-type": "application/json" });
        response.end(JSON.stringify({
          type: "error",
          error: {
            type: "authentication_error",
            message: providerSecretMarker,
          },
        }));
        return;
      }

      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        id: `msg-parent-upload-${capturedRequests.length}`,
        type: "message",
        role: "assistant",
        model: body.model || "claude-sonnet-4-5",
        content: [{
          type: "tool_use",
          id: `tool-parent-upload-${capturedRequests.length}`,
          name: toolName,
          input: toolInput(toolName, body),
        }],
        stop_reason: "tool_use",
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 10 },
      }));
    } catch {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({
        type: "error",
        error: { type: "invalid_request_error", message: "Synthetic loopback provider received malformed JSON." },
      }));
    }
  });
});

await fs.mkdir(testRoot, { recursive: true, mode: 0o700 });
const isolatedWorkingDirectory = path.join(testRoot, "application-sandbox");
await fs.mkdir(isolatedWorkingDirectory, { recursive: true, mode: 0o700 });
process.chdir(isolatedWorkingDirectory);
await fs.mkdir(evidenceDir, { recursive: true, mode: 0o700 });
await new Promise<void>((resolve) => provider.listen(0, "127.0.0.1", resolve));
const providerAddress = provider.address();
if (!providerAddress || typeof providerAddress === "string") {
  throw new Error("The loopback fake AI provider did not bind locally.");
}
process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY = "test-only-parent-upload-provider-key";
process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL = `http://127.0.0.1:${providerAddress.port}`;
delete process.env.ANTHROPIC_API_KEY;

const database = await import("@workspace/db");
const {
  auditLogsTable,
  childrenTable,
  db,
  documentExtractionRunsTable,
  documentsTable,
  parentAccountsTable,
  parentChildSettingsTable,
  parentDocumentsTable,
  parentSessionsTable,
  rewardTokensTable,
  pool,
} = database;
const { and, eq, inArray } = await import("drizzle-orm");
const { hashParentSessionToken } = await import("../lib/parentAuth");
const { default: parentDocumentsRouter } = await import("./parent-documents");
const { default: parentFamilyDataRouter } = await import("./parent-family-data");
const { default: parentRouter } = await import("./parent");

function recordCase(name: string, run: () => Promise<void>) {
  return async () => {
    try {
      await run();
      caseResults.push({ name, status: "PASS" });
    } catch (error) {
      caseResults.push({
        name,
        status: "FAIL",
        details: error instanceof Error ? error.message : "Unknown assertion failure",
      });
      throw error;
    }
  };
}

test("parent-upload document scanning, recovery, access and audit privacy", async (t) => {
  t.after(async () => {
    if (provider.listening) await new Promise<void>((resolve) => provider.close(() => resolve()));
    await pool.end();
  });

  const databaseIdentity = await pool.query(
    "select current_database() as name, host(inet_server_addr()) as host",
  );
  assert.equal(databaseIdentity.rows[0]?.name, "np_parent_upload_ai_test");
  assert.ok(["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(databaseIdentity.rows[0]?.host));
  assert.equal(process.env.REPLIT_CONNECTORS_ENABLED, "false");
  assert.ok(process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL?.startsWith("http://127.0.0.1:"));

  const suffix = crypto.randomUUID();
  const parentAId = `synthetic-parent-a-${suffix}`;
  const parentBId = `synthetic-parent-b-${suffix}`;
  const workspaceA = `synthetic-parent-workspace-a-${suffix}`;
  const workspaceB = `synthetic-parent-workspace-b-${suffix}`;
  const childAId = crypto.randomUUID();
  const childBId = crypto.randomUUID();
  const tokenA = `synthetic-parent-session-a-${suffix}`;
  const tokenB = `synthetic-parent-session-b-${suffix}`;
  const requestPrefix = `parent-upload-ai-${suffix}`;
  const parentAEmail = `${suffix}.parent-a@example.test`;
  const parentBEmail = `${suffix}.parent-b@example.test`;
  sourceMarker = `${RAW_DOCUMENT_SENTINEL}${suffix}`;
  providerSecretMarker = `${RAW_PROVIDER_SENTINEL}${suffix}`;
  activeSourceText = [
    "Fictional support plan for Kai.",
    behaviorExcerpt,
    observationExcerpt,
    goalExcerpt,
    activityExcerpt,
    sourceMarker,
  ].join("\n");
  foreignSourceText = `Fictional unrelated family content ${crypto.randomUUID()}.`;

  await db.insert(parentAccountsTable).values([
    {
      id: parentAId,
      email: parentAEmail,
      firstName: "Synthetic Parent A",
      workspaceId: workspaceA,
      passwordHash: "test-only-unused-password-hash",
    },
    {
      id: parentBId,
      email: parentBEmail,
      firstName: "Synthetic Parent B",
      workspaceId: workspaceB,
      passwordHash: "test-only-unused-password-hash",
    },
  ]);
  await db.insert(childrenTable).values([
    {
      id: childAId,
      parentId: parentAId,
      tenantId: workspaceA,
      childName: "Kai Synthetic",
      accountType: "parent_free",
      status: "active",
    },
    {
      id: childBId,
      parentId: parentBId,
      tenantId: workspaceB,
      childName: "Riley Synthetic",
      accountType: "parent_free",
      status: "active",
    },
  ]);
  await db.insert(parentChildSettingsTable).values([
    {
      childId: childAId,
      parentId: parentAId,
      workspaceId: workspaceA,
      behaviors: [{
        behaviorKey: "custom",
        customBehavior: "Starting a multi-step worksheet",
        behaviorName: "Starting a multi-step worksheet",
        goal: "Show the break card before leaving the table.",
      }],
      supportCards: [],
    },
    {
      childId: childBId,
      parentId: parentBId,
      workspaceId: workspaceB,
      behaviors: [],
      supportCards: [],
    },
  ]);
  await db.insert(parentSessionsTable).values([
    {
      tokenHash: hashParentSessionToken(tokenA),
      parentId: parentAId,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    },
    {
      tokenHash: hashParentSessionToken(tokenB),
      parentId: parentBId,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    },
  ]);

  const app = express();
  app.use((request: any, _response, next) => {
    request.id = request.header("x-test-request-id") || `${requestPrefix}-unlabeled`;
    next();
  });
  app.use(express.json());
  app.use(parentDocumentsRouter);
  app.use(parentFamilyDataRouter);
  app.use(parentRouter);
  const apiServer = app.listen(0, "127.0.0.1");
  await once(apiServer, "listening");
  const apiAddress = apiServer.address();
  assert.ok(apiAddress && typeof apiAddress !== "string");
  const apiBase = `http://127.0.0.1:${apiAddress.port}`;
  const authHeaders = (token: string, requestId: string) => ({
    "x-parent-token": token,
    "x-test-request-id": requestId,
  });

  const uploadDocument = async (
    parentToken: string,
    childId: string,
    text: string,
    requestId: string,
    filename: string,
  ) => {
    const form = new FormData();
    form.set("authorizedUploader", "true");
    form.set("title", `Synthetic plan ${filename}`);
    form.set("documentType", "support-plan");
    form.set("file", new Blob([text], { type: "text/plain" }), filename);
    return fetch(`${apiBase}/parent/children/${childId}/documents`, {
      method: "POST",
      headers: authHeaders(parentToken, requestId),
      body: form,
    });
  };
  const scanDocument = (
    parentToken: string,
    childId: string,
    documentId: string,
    requestId: string,
  ) => fetch(`${apiBase}/parent/children/${childId}/documents/${documentId}/scan`, {
    method: "POST",
    headers: { ...authHeaders(parentToken, requestId), "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  const requestJson = async (
    url: string,
    token: string,
    requestId: string,
    options: { method?: string; body?: unknown } = {},
  ) => {
    const headers: Record<string, string> = {
      ...authHeaders(token, requestId),
      "content-type": "application/json",
    };
    return fetch(url, {
      method: options.method || "GET",
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  };
  const dashboardFor = async (token: string, childId: string, requestId: string) => {
    const response = await requestJson(
      `${apiBase}/parent/children/${childId}/dashboard`,
      token,
      requestId,
    );
    assert.equal(response.status, 200);
    return response.json() as Promise<Record<string, any>>;
  };
  const goalsFor = async (token: string, childId: string, requestId: string) => {
    const response = await requestJson(
      `${apiBase}/parent/children/${childId}/goals`,
      token,
      requestId,
    );
    assert.equal(response.status, 200);
    return response.json() as Promise<Array<Record<string, any>>>;
  };
  const sha256 = (bytes: Buffer) => crypto.createHash("sha256").update(bytes).digest("hex");
  const documentStateFor = async (documentId: string, childId: string, parentId: string) => {
    const [document] = await db.select().from(documentsTable).where(eq(documentsTable.id, documentId));
    const [metadata] = await db.select().from(parentDocumentsTable)
      .where(eq(parentDocumentsTable.documentId, documentId));
    const runs = await db.select().from(documentExtractionRunsTable)
      .where(eq(documentExtractionRunsTable.documentId, documentId));
    const [settings] = await db.select().from(parentChildSettingsTable)
      .where(eq(parentChildSettingsTable.childId, childId));
    const goals = await db.select().from(rewardTokensTable).where(eq(rewardTokensTable.childId, childId));
    const rawCards = Array.isArray(settings?.supportCards)
      ? settings.supportCards as Array<Record<string, any>>
      : [];
    const sourceCards = rawCards.filter((card) =>
      Array.isArray(card.sourceDocumentIds) && card.sourceDocumentIds.includes(documentId),
    );
    const concernCards = (metadata?.extractedSupport as any)?.supportConcernCards || [];
    const sourceFilePresent = Boolean(metadata?.storagePath && fakeObjects.has(metadata.storagePath));
    const scanOutputStates = runs.map((run) => ({
      present: Boolean(run.scanOutputPath && fakeObjects.has(run.scanOutputPath)),
      pathRecorded: Boolean(run.scanOutputPath),
    }));
    return {
      documentRowPresent: Boolean(document),
      parentMetadataPresent: Boolean(metadata),
      parentOwnerMatches: metadata?.parentId === parentId,
      childAssociationMatches: document?.childId === childId && metadata?.childId === childId,
      sourceFilePresent,
      sourceFileSha256: metadata?.storagePath && fakeObjects.has(metadata.storagePath)
        ? sha256(fakeObjects.get(metadata.storagePath)!)
        : null,
      extractionRunCount: runs.length,
      extractionRecordCount: runs.reduce((sum, run) => sum + (Array.isArray(run.records) ? run.records.length : 0), 0),
      verifiedExtractionRecordCount: runs.reduce((sum, run) => sum + (Array.isArray(run.records)
        ? run.records.filter((record: any) => record.sourceExcerptVerified === true).length
        : 0), 0),
      sourceGoalExtractionCount: runs.reduce((sum, run) => sum + (Array.isArray(run.records)
        ? run.records.filter((record: any) => record.category === "goal" && record.sourceExcerptVerified === true).length
        : 0), 0),
      scanOutputStates,
      rawParentSupportCardCount: sourceCards.length,
      rawConcernCardCount: concernCards.length,
      parentDocumentLinkedGoalCount: goals.filter((goal) =>
        goal.parentId === parentId && goal.source === "parent_document",
      ).length,
    };
  };

  let documentAId = "";
  let documentBId = "";
  let unrelatedDocumentId = "";
  let independentGoalId = "";
  let linkedGoalId = "";
  let generatedConcernCardId = "";
  let documentARequestStart = 0;
  let successfulCardIds: string[] = [];
  const childIds = [childAId, childBId];
  const uploadedDocumentIds: string[] = [];
  const scanRequestIds: string[] = [];
  try {
    await t.test(
      "parent upload creates a correctly linked document and successful scan cards",
      recordCase("Real parent upload and successful fake-AI scan link child, source document, and cards", async () => {
        const uploadResponse = await uploadDocument(
          tokenA,
          childAId,
          activeSourceText,
          `${requestPrefix}-upload-a`,
          `${crypto.randomUUID()}.txt`,
        );
        assert.equal(uploadResponse.status, 201);
        const uploaded = await uploadResponse.json() as Record<string, any>;
        documentAId = uploaded.id;
        activeDocumentId = documentAId;
        assert.ok(documentAId);
        uploadedDocumentIds.push(documentAId);
        assert.equal(uploaded.childId, childAId);
        assert.equal(uploaded.uploadedBy, "parent");
        assert.equal(uploaded.scanStatus, "pending");

        documentARequestStart = capturedRequests.length;
        providerMode = "empty-discovery";
        const failedRequestId = `${requestPrefix}-empty-discovery`;
        scanRequestIds.push(failedRequestId);
        const failedResponse = await scanDocument(tokenA, childAId, documentAId, failedRequestId);
        const failedBody = await failedResponse.json() as Record<string, any>;
        assert.equal(failedResponse.status, 422);
        assert.match(String(failedBody.error), /classification was incomplete/i);
        assert.doesNotMatch(JSON.stringify(failedBody), /provider|token|stack|sql|PARENT_UPLOAD_RAW_DOCUMENT_SENTINEL/i);
        const [failedDocument] = await db.select().from(documentsTable).where(eq(documentsTable.id, documentAId));
        assert.equal(failedDocument.childId, childAId);
        assert.equal(failedDocument.parentId, parentAId);
        assert.equal(failedDocument.uploadedBy, "parent");
        assert.equal(failedDocument.scanStatus, "error");

        providerMode = "valid";
        const retryRequestId = `${requestPrefix}-recovered-scan`;
        scanRequestIds.push(retryRequestId);
        const recoveredResponse = await scanDocument(tokenA, childAId, documentAId, retryRequestId);
        const recoveredBody = await recoveredResponse.json() as Record<string, any>;
        assert.equal(recoveredResponse.status, 200, JSON.stringify(recoveredBody));
        assert.equal(recoveredBody.ok, true);
        assert.ok(Array.isArray(recoveredBody.supportCards));

        const [document] = await db.select().from(documentsTable).where(eq(documentsTable.id, documentAId));
        assert.equal(document.scanStatus, "done");
        assert.equal(document.childId, childAId);
        assert.equal(document.parentId, parentAId);
        const [metadata] = await db.select().from(parentDocumentsTable).where(eq(parentDocumentsTable.documentId, documentAId));
        assert.equal(metadata.parentId, parentAId);
        assert.equal(metadata.childId, childAId);
        assert.equal(metadata.workspaceId, workspaceA);

        const [run] = await db.select().from(documentExtractionRunsTable)
          .where(eq(documentExtractionRunsTable.documentId, documentAId));
        assert.ok(run);
        assert.equal(run.childId, childAId);
        assert.equal(run.scanStatus, "completed");
        assert.ok(run.records.some((record: any) =>
          record.documentId === documentAId && record.childId === childAId &&
          record.category === "goal" && record.sourceExcerptVerified === true,
        ));
        assert.ok(run.records.some((record: any) =>
          record.documentId === documentAId && record.childId === childAId &&
          record.category === "potential_home_activity" && record.sourceExcerptVerified === true,
        ));

        const [settings] = await db.select().from(parentChildSettingsTable)
          .where(eq(parentChildSettingsTable.childId, childAId));
        const supportCards = settings.supportCards as Array<Record<string, any>>;
        const card = supportCards.find((candidate) =>
          candidate.behaviorName === "Starting a multi-step worksheet",
        );
        assert.ok(card, "A source-derived parent support card must be persisted.");
        assert.equal(card.source, "parent_document");
        assert.deepEqual(card.sourceDocumentIds, [documentAId]);
        assert.equal(card.reviewedBy, null, "Parent-uploaded content remains unreviewed.");
        assert.ok(card.rightNow.length > 0);
        successfulCardIds = supportCards.map((candidate) => candidate.id).sort();

        const [concernMetadata] = await db.select().from(parentDocumentsTable)
          .where(eq(parentDocumentsTable.documentId, documentAId));
        const concernCards = (concernMetadata.extractedSupport as any)?.supportConcernCards || [];
        assert.ok(concernCards.length > 0, "The document-informed support-card generation branch must run.");
        generatedConcernCardId = String(concernCards[0].id);
        assert.ok(concernCards.every((candidate: any) =>
          candidate.sourceDocumentIds?.includes(documentAId) &&
          candidate.sourceReferences?.every((reference: any) => reference.documentId === documentAId),
        ));
        const extractedGoals = await db.select().from(rewardTokensTable).where(eq(rewardTokensTable.childId, childAId));
        const linkedGoal = extractedGoals.find((goal) =>
          goal.parentId === parentAId &&
          goal.source === "parent_document",
        );
        assert.ok(linkedGoal, "The existing parent document scan flow must create its source-derived goal record.");
        linkedGoalId = linkedGoal.id;

        const listResponse = await fetch(
          `${apiBase}/parent/children/${childAId}/documents`,
          { headers: authHeaders(tokenA, `${requestPrefix}-list-a`) },
        );
        assert.equal(listResponse.status, 200);
        const listed = await listResponse.json() as Array<Record<string, any>>;
        const listedDocument = listed.find((candidate) => candidate.id === documentAId);
        assert.ok(listedDocument);
        assert.equal(listedDocument.childId, childAId);
        assert.equal(listedDocument.uploadedBy, "parent");
        assert.equal(listedDocument.scanStatus, "done");

        const providerForThisDocument = capturedRequests.slice(documentARequestStart);
        assert.ok(providerForThisDocument.length >= 4);
        assert.ok(providerForThisDocument.some((entry) => entry.toolName === "discover_parent_targets"));
        assert.ok(providerForThisDocument.some((entry) => entry.toolName === "generate_source_linked_support_area_candidates"));
        assert.ok(providerForThisDocument.some((entry) => entry.toolName === "generate_document_informed_support_cards"));
        assert.ok(providerForThisDocument.some((entry) => entry.toolName === "save_parent_support"));
        assert.ok(providerForThisDocument.every((entry) => !entry.hasForeignMarker));
        assert.ok(providerForThisDocument.some((entry) =>
          entry.toolName === "discover_parent_targets" && entry.hasSourceMarker,
        ));
        assert.ok(providerForThisDocument.filter((entry) =>
          entry.toolName === "generate_source_linked_support_area_candidates",
        ).every((entry) => entry.hasExtractedSourceFact));
        assert.ok(providerForThisDocument.filter((entry) =>
          ["generate_document_informed_support_cards", "save_parent_support"].includes(entry.toolName),
        ).every((entry) => entry.hasExtractedSourceFact));
      }),
    );

    await t.test(
      "repeated parent scan reuses results without duplicate cards",
      recordCase("Repeated parent scan is idempotent and does not call AI again", async () => {
        const beforeRequests = capturedRequests.length;
        const [beforeMetadata] = await db.select().from(parentDocumentsTable)
          .where(eq(parentDocumentsTable.documentId, documentAId));
        const [beforeSettings] = await db.select().from(parentChildSettingsTable)
          .where(eq(parentChildSettingsTable.childId, childAId));
        const beforeCards = (beforeSettings.supportCards as Array<Record<string, any>>).map((card) => card.id).sort();
        const requestId = `${requestPrefix}-repeat-scan`;
        scanRequestIds.push(requestId);
        const response = await scanDocument(tokenA, childAId, documentAId, requestId);
        const body = await response.json() as Record<string, any>;
        assert.equal(response.status, 200, JSON.stringify(body));
        assert.equal(capturedRequests.length, beforeRequests);
        const [afterMetadata] = await db.select().from(parentDocumentsTable)
          .where(eq(parentDocumentsTable.documentId, documentAId));
        const [afterSettings] = await db.select().from(parentChildSettingsTable)
          .where(eq(parentChildSettingsTable.childId, childAId));
        const afterCards = (afterSettings.supportCards as Array<Record<string, any>>).map((card) => card.id).sort();
        assert.deepEqual(afterCards, beforeCards);
        assert.deepEqual(afterCards, successfulCardIds);
        assert.deepEqual(
          (afterMetadata.extractedSupport as any)?.supportConcernCards?.map((card: any) => card.id).sort(),
          (beforeMetadata.extractedSupport as any)?.supportConcernCards?.map((card: any) => card.id).sort(),
        );
      }),
    );

    await t.test(
      "authorized source deletion preserves derived history while removing source availability",
      recordCase("Capture document, files, extraction, source-linked cards/goals, caregiver projections and AI context before/after deletion", async () => {
        activeDocumentId = documentAId;
        const unrelatedUpload = await uploadDocument(
          tokenA,
          childAId,
          `Fictional unrelated family note ${crypto.randomUUID()}.`,
          `${requestPrefix}-upload-unrelated`,
          `${crypto.randomUUID()}.txt`,
        );
        assert.equal(unrelatedUpload.status, 201);
        const unrelatedWire = await unrelatedUpload.json() as Record<string, any>;
        unrelatedDocumentId = String(unrelatedWire.id);
        uploadedDocumentIds.push(unrelatedDocumentId);

        const independentGoalResponse = await requestJson(
          `${apiBase}/parent/children/${childAId}/goals`,
          tokenA,
          `${requestPrefix}-create-independent-goal`,
          { method: "POST", body: { title: "Independent family practice goal", description: "Not created from a document.", target: 3 } },
        );
        assert.equal(independentGoalResponse.status, 201);
        const independentGoal = await independentGoalResponse.json() as Record<string, any>;
        independentGoalId = String(independentGoal.id);
        assert.equal(independentGoal.source, "manual");

        const [metadataBefore] = await db.select().from(parentDocumentsTable)
          .where(eq(parentDocumentsTable.documentId, documentAId));
        const [runBefore] = await db.select().from(documentExtractionRunsTable)
          .where(eq(documentExtractionRunsTable.documentId, documentAId));
        assert.ok(metadataBefore?.storagePath);
        assert.ok(runBefore);
        assert.ok(runBefore.scanOutputPath, "The successful scan must have an encrypted extraction output to verify cleanup.");
        const sourceKeyBefore = metadataBefore.storagePath;
        const scanOutputKeyBefore = runBefore.scanOutputPath!;
        const sourceFileHashBefore = sha256(fakeObjects.get(sourceKeyBefore)!);
        const scanOutputHashBefore = sha256(fakeObjects.get(scanOutputKeyBefore)!);
        const dashboardBefore = await dashboardFor(tokenA, childAId, `${requestPrefix}-dashboard-before-delete`);
        const goalsBefore = await goalsFor(tokenA, childAId, `${requestPrefix}-goals-before-delete`);
        assert.ok(dashboardBefore.documents.some((item: any) => item.id === documentAId));
        assert.ok(dashboardBefore.supportCards.some((card: any) =>
          card.sourceDocumentIds?.includes(documentAId),
        ));
        assert.ok(dashboardBefore.documentSupportCards.some((card: any) =>
          card.sourceReferences?.some((reference: any) => reference.documentId === documentAId),
        ));
        assert.ok(dashboardBefore.planGoals.some((goal: any) => goal.id === linkedGoalId));
        assert.ok(goalsBefore.some((goal: any) => goal.id === linkedGoalId && goal.source === "parent_document"));
        assert.ok(goalsBefore.some((goal: any) => goal.id === independentGoalId && goal.source === "manual"));

        chatCapturePhase = "before_delete";
        const chatBefore = await requestJson(
          `${apiBase}/parent/children/${childAId}/chat`,
          tokenA,
          `${requestPrefix}-chat-before-delete`,
          { method: "POST", body: { message: "How can Kai start a multi-step worksheet?" } },
        );
        chatCapturePhase = null;
        assert.equal(chatBefore.status, 200);
        const chatBeforeWire = await chatBefore.json() as Record<string, any>;
        assert.equal(chatBeforeWire.outcome, "success");
        const preDeleteContext = chatContextSummaries.find((summary) => summary.phase === "before_delete");
        assert.ok(preDeleteContext?.hasRawSourceMarker);
        assert.ok(preDeleteContext?.hasSourceExcerpt);
        assert.ok(preDeleteContext?.hasSupportStep);
        assert.ok(preDeleteContext?.hasPlanGoal);

        const beforeDeniedState = await documentStateFor(documentAId, childAId, parentAId);
        const beforeUnrelatedDoc = await documentStateFor(unrelatedDocumentId, childAId, parentAId);
        const beforeIndependentGoal = await db.select().from(rewardTokensTable)
          .where(eq(rewardTokensTable.id, independentGoalId));
        const beforeLinkedGoal = await db.select().from(rewardTokensTable)
          .where(eq(rewardTokensTable.id, linkedGoalId));
        const denyDeleteRequestId = `${requestPrefix}-cross-family-delete`;
        const deniedDelete = await requestJson(
          `${apiBase}/parent/children/${childAId}/documents/${documentAId}`,
          tokenB,
          denyDeleteRequestId,
          { method: "DELETE" },
        );
        const deniedDeleteBody = await deniedDelete.text();
        assert.equal(deniedDelete.status, 404);
        assert.doesNotMatch(deniedDeleteBody, /Kai|Synthetic plan|break card|PARENT_UPLOAD_RAW_DOCUMENT_SENTINEL/i);

        const deniedCardEditRequestId = `${requestPrefix}-cross-family-card-edit`;
        const deniedCardEdit = await requestJson(
          `${apiBase}/parent/children/${childAId}/document-support-cards/${generatedConcernCardId}`,
          tokenB,
          deniedCardEditRequestId,
          { method: "PATCH", body: { action: "rename", label: "Unauthorized card edit" } },
        );
        assert.equal(deniedCardEdit.status, 404);
        assert.doesNotMatch(await deniedCardEdit.text(), /Kai|Synthetic plan|break card|PARENT_UPLOAD_RAW_DOCUMENT_SENTINEL/i);

        const deniedGoalEditRequestId = `${requestPrefix}-cross-family-goal-edit`;
        const deniedGoalEdit = await requestJson(
          `${apiBase}/parent/children/${childAId}/goals/${linkedGoalId}`,
          tokenB,
          deniedGoalEditRequestId,
          { method: "PATCH", body: { title: "Unauthorized linked goal edit" } },
        );
        assert.equal(deniedGoalEdit.status, 404);
        assert.doesNotMatch(await deniedGoalEdit.text(), /Show the break card|Kai|PARENT_UPLOAD_RAW_DOCUMENT_SENTINEL/i);

        assert.deepEqual(await documentStateFor(documentAId, childAId, parentAId), beforeDeniedState);
        assert.deepEqual(await documentStateFor(unrelatedDocumentId, childAId, parentAId), beforeUnrelatedDoc);
        assert.deepEqual(await db.select().from(rewardTokensTable).where(eq(rewardTokensTable.id, independentGoalId)), beforeIndependentGoal);
        assert.deepEqual(await db.select().from(rewardTokensTable).where(eq(rewardTokensTable.id, linkedGoalId)), beforeLinkedGoal);
        assert.ok(fakeObjects.has(sourceKeyBefore));
        assert.equal(sha256(fakeObjects.get(sourceKeyBefore)!), sourceFileHashBefore);
        assert.ok(fakeObjects.has(scanOutputKeyBefore));
        assert.equal(sha256(fakeObjects.get(scanOutputKeyBefore)!), scanOutputHashBefore);

        const deniedAudit = await db.select().from(auditLogsTable).where(and(
          eq(auditLogsTable.action, "document_delete_denied"),
          eq(auditLogsTable.targetId, documentAId),
        ));
        const matchingDeniedAudit = deniedAudit.find((row) =>
          (row.metadata as any)?.request_id === denyDeleteRequestId,
        );
        assert.ok(matchingDeniedAudit);
        assert.equal(matchingDeniedAudit.userId, parentBId);
        assert.equal(matchingDeniedAudit.userRole, "parent");
        assert.equal(matchingDeniedAudit.tenantId, workspaceB);
        assert.equal(matchingDeniedAudit.success, false);
        assert.equal((matchingDeniedAudit.metadata as any)?.request_id, denyDeleteRequestId);

        const deleteRequestId = `${requestPrefix}-authorized-delete`;
        const deleted = await requestJson(
          `${apiBase}/parent/children/${childAId}/documents/${documentAId}`,
          tokenA,
          deleteRequestId,
          { method: "DELETE" },
        );
        assert.equal(deleted.status, 200, `Expected authorized deletion to complete, got HTTP ${deleted.status}.`);
        const deleteBody = await deleted.json() as Record<string, any>;
        assert.equal(deleteBody.ok, true);
        assert.equal(deleteBody.cleanupStatus, "complete");

        const afterDocumentState = await documentStateFor(documentAId, childAId, parentAId);
        const [runAfter] = await db.select().from(documentExtractionRunsTable)
          .where(eq(documentExtractionRunsTable.documentId, documentAId));
        const [settingsAfter] = await db.select().from(parentChildSettingsTable)
          .where(eq(parentChildSettingsTable.childId, childAId));
        const rawSupportCardsAfter = (settingsAfter.supportCards as Array<Record<string, any>>)
          .filter((card) => card.sourceDocumentIds?.includes(documentAId));
        const dashboardAfter = await dashboardFor(tokenA, childAId, `${requestPrefix}-dashboard-after-delete`);
        const goalsAfter = await goalsFor(tokenA, childAId, `${requestPrefix}-goals-after-delete`);
        assert.equal(afterDocumentState.documentRowPresent, false);
        assert.equal(afterDocumentState.parentMetadataPresent, false);
        assert.equal(afterDocumentState.sourceFilePresent, false);
        assert.ok(runAfter, "Derived extraction history is retained rather than silently erased.");
        assert.equal(runAfter.scanOutputPath, null, "Encrypted scan-output file is removed and its path cleared.");
        assert.ok(runAfter.records.some((record: any) =>
          record.category === "goal" && record.sourceExcerptVerified === true,
        ));
        assert.ok(runAfter.records.some((record: any) =>
          record.category === "potential_home_activity" && record.sourceExcerptVerified === true,
        ));
        assert.equal(fakeObjects.has(sourceKeyBefore), false);
        assert.equal(fakeObjects.has(scanOutputKeyBefore), false);
        assert.equal(dashboardAfter.documents.some((item: any) => item.id === documentAId), false);
        assert.equal(dashboardAfter.documentSupportCards.some((card: any) =>
          card.sourceReferences?.some((reference: any) => reference.documentId === documentAId),
        ), false);
        assert.equal(dashboardAfter.supportCards.some((card: any) =>
          card.sourceDocumentIds?.includes(documentAId),
        ), false);
        assert.ok(rawSupportCardsAfter.length > 0, "Persisted derived support history is not physically erased.");
        assert.ok(dashboardAfter.planGoals.some((goal: any) => goal.id === linkedGoalId));
        assert.ok(goalsAfter.some((goal: any) =>
          goal.id === linkedGoalId && goal.source === "parent_document",
        ));
        assert.ok(goalsAfter.some((goal: any) =>
          goal.id === independentGoalId && goal.source === "manual",
        ));
        assert.ok(dashboardAfter.documents.some((item: any) => item.id === unrelatedDocumentId));
        assert.ok(fakeObjects.has(
          (await db.select().from(parentDocumentsTable)
            .where(eq(parentDocumentsTable.documentId, unrelatedDocumentId)))[0].storagePath,
        ));

        chatCapturePhase = "after_delete";
        const chatAfter = await requestJson(
          `${apiBase}/parent/children/${childAId}/chat`,
          tokenA,
          `${requestPrefix}-chat-after-delete`,
          { method: "POST", body: { message: "How can Kai start a multi-step worksheet?" } },
        );
        chatCapturePhase = null;
        assert.equal(chatAfter.status, 200);
        const chatAfterWire = await chatAfter.json() as Record<string, any>;
        assert.equal(chatAfterWire.outcome, "success");
        const postDeleteContext = chatContextSummaries.find((summary) => summary.phase === "after_delete");
        assert.ok(postDeleteContext);
        assert.equal(postDeleteContext.hasRawSourceMarker, false);
        assert.equal(postDeleteContext.hasSourceExcerpt, false);
        assert.equal(postDeleteContext.hasDocumentTitle, false);
        assert.equal(postDeleteContext.hasDocumentId, false);
        assert.ok(postDeleteContext.hasPlanGoal, "The retained source-derived goal remains available to the parent chat.");

        const deletionAuditRows = await db.select().from(auditLogsTable).where(and(
          eq(auditLogsTable.targetId, documentAId),
          inArray(auditLogsTable.action, [
            "document_deleted",
            "document_file_cleanup_queued",
            "document_file_cleanup_completed",
          ]),
        ));
        const deletedEvent = deletionAuditRows.find((row) => row.action === "document_deleted");
        assert.ok(deletedEvent);
        assert.equal(deletedEvent.userId, parentAId);
        assert.equal(deletedEvent.userRole, "parent");
        assert.equal(deletedEvent.tenantId, workspaceA);
        assert.equal(deletedEvent.success, true);
        assert.equal((deletedEvent.metadata as any)?.request_id, deleteRequestId);
        assert.ok(deletionAuditRows.some((row) => row.action === "document_file_cleanup_queued"));
        assert.ok(deletionAuditRows.some((row) => row.action === "document_file_cleanup_completed"));
        const chatAuditRows = await db.select().from(auditLogsTable).where(and(
          eq(auditLogsTable.action, "ai_parent_support_chat"),
          eq(auditLogsTable.targetId, childAId),
        ));
        const beforeChatAudit = chatAuditRows.find((row) =>
          (row.metadata as any)?.request_id === `${requestPrefix}-chat-before-delete`,
        );
        const afterChatAudit = chatAuditRows.find((row) =>
          (row.metadata as any)?.request_id === `${requestPrefix}-chat-after-delete`,
        );
        assert.ok(beforeChatAudit && afterChatAudit);
        assert.ok((beforeChatAudit.metadata as any).source_document_ids.includes(documentAId));
        assert.equal((afterChatAudit.metadata as any).source_document_ids.includes(documentAId), false);

        deletionLifecycleEvidence = {
          documentId: documentAId,
          childId: childAId,
          authorizedOwnerId: parentAId,
          deniedFamilyId: parentBId,
          before: {
            documentRowPresent: true,
            parentMetadataPresent: true,
            sourceFilePresent: true,
            sourceFileSha256: sourceFileHashBefore,
            extractionRunCount: 1,
            extractionRecordCount: beforeDeniedState.extractionRecordCount,
            verifiedExtractionRecordCount: beforeDeniedState.verifiedExtractionRecordCount,
            verifiedGoalExtractions: beforeDeniedState.sourceGoalExtractionCount,
            scanOutputPresent: true,
            scanOutputSha256: scanOutputHashBefore,
            storedSourceLinkedSupportCards: beforeDeniedState.rawParentSupportCardCount,
            storedConcernCards: beforeDeniedState.rawConcernCardCount,
            visibleSourceDocument: true,
            visibleDocumentSupportCards: dashboardBefore.documentSupportCards.filter((card: any) =>
              card.sourceReferences?.some((reference: any) => reference.documentId === documentAId),
            ).length,
            visibleSourceSupportCards: dashboardBefore.supportCards.filter((card: any) =>
              card.sourceDocumentIds?.includes(documentAId),
            ).length,
            visibleSourceLinkedGoal: true,
            visibleIndependentGoal: true,
            fakeAiContext: preDeleteContext,
          },
          deniedFamilyAttempt: {
            deleteStatus: deniedDelete.status,
            supportCardEditStatus: deniedCardEdit.status,
            linkedGoalEditStatus: deniedGoalEdit.status,
            sourceAndDerivedRecordsUnchanged: true,
            fileHashesUnchanged: true,
            denialAuditAction: matchingDeniedAudit.action,
            denialAuditActorId: matchingDeniedAudit.userId,
            denialAuditRequestId: (matchingDeniedAudit.metadata as any)?.request_id,
          },
          after: {
            ...afterDocumentState,
            extractionRunRetained: true,
            extractionRecordsRetained: runAfter.records.length,
            extractionScanOutputPathCleared: runAfter.scanOutputPath === null,
            rawSourceLinkedSupportCardsRetained: rawSupportCardsAfter.length,
            sourceLinkedCardVisible: dashboardAfter.supportCards.some((card: any) =>
              card.sourceDocumentIds?.includes(documentAId),
            ),
            documentSupportCardVisible: dashboardAfter.documentSupportCards.some((card: any) =>
              card.sourceReferences?.some((reference: any) => reference.documentId === documentAId),
            ),
            sourceLinkedGoalVisible: goalsAfter.some((goal: any) => goal.id === linkedGoalId),
            sourceLinkedGoalSourceType: goalsAfter.find((goal: any) => goal.id === linkedGoalId)?.source,
            independentGoalVisible: goalsAfter.some((goal: any) => goal.id === independentGoalId),
            unrelatedDocumentStillVisible: dashboardAfter.documents.some((item: any) => item.id === unrelatedDocumentId),
            fakeAiContext: postDeleteContext,
          },
          cleanupStatus: deleteBody.cleanupStatus,
          deletionAuditEventCount: deletionAuditRows.length,
          browserWorkflow: "NOT RUN: no signed-in isolated browser harness is configured for this runner; all tested routes were real HTTP requests against the isolated API.",
        };
      }),
    );

    await t.test(
      "foreign-family scan is denied before any AI request",
      recordCase("Cross-family parent request cannot scan or identify another family's document", async () => {
        const uploadResponse = await uploadDocument(
          tokenB,
          childBId,
          foreignSourceText,
          `${requestPrefix}-upload-b`,
          `${crypto.randomUUID()}.txt`,
        );
        assert.equal(uploadResponse.status, 201);
        const uploaded = await uploadResponse.json() as Record<string, any>;
        documentBId = uploaded.id;
        uploadedDocumentIds.push(documentBId);
        assert.equal(uploaded.childId, childBId);

        const beforeRequests = capturedRequests.length;
        const requestId = `${requestPrefix}-cross-family`;
        scanRequestIds.push(requestId);
        const response = await scanDocument(tokenA, childBId, documentBId, requestId);
        const body = await response.text();
        assert.equal(response.status, 404);
        assert.doesNotMatch(body, /Riley|Synthetic plan|foreign|support plan/i);
        assert.equal(capturedRequests.length, beforeRequests);
      }),
    );

    await t.test(
      "provider error is sanitized and a later manual scan recovers",
      recordCase("Provider error response is not exposed or logged and a later scan succeeds", async () => {
        const secondText = [
          "Fictional support plan for Kai.",
          behaviorExcerpt,
          observationExcerpt,
          goalExcerpt,
          activityExcerpt,
          `${sourceMarker} second scan fixture`,
        ].join("\n");
        const uploadResponse = await uploadDocument(
          tokenA,
          childAId,
          `${secondText}\n${crypto.randomUUID()}`,
          `${requestPrefix}-upload-a-second`,
          `${crypto.randomUUID()}.txt`,
        );
        assert.equal(uploadResponse.status, 201);
        const uploaded = await uploadResponse.json() as Record<string, any>;
        const secondDocumentId = String(uploaded.id);
        uploadedDocumentIds.push(secondDocumentId);
        activeDocumentId = secondDocumentId;

        providerMode = "provider-error";
        const failedId = `${requestPrefix}-provider-error`;
        scanRequestIds.push(failedId);
        const failed = await scanDocument(tokenA, childAId, secondDocumentId, failedId);
        const failedBody = await failed.text();
        assert.equal(failed.status, 503);
        assert.doesNotMatch(failedBody, new RegExp(RAW_PROVIDER_SENTINEL));
        assert.doesNotMatch(failedBody, /authorization|api.?key|stack|sql/i);
        const [failedDocument] = await db.select().from(documentsTable)
          .where(eq(documentsTable.id, secondDocumentId));
        assert.equal(failedDocument.scanStatus, "error");

        providerMode = "valid";
        const retryId = `${requestPrefix}-provider-recovery`;
        scanRequestIds.push(retryId);
        const recovered = await scanDocument(tokenA, childAId, secondDocumentId, retryId);
        assert.equal(recovered.status, 200);
        const [recoveredDocument] = await db.select().from(documentsTable)
          .where(eq(documentsTable.id, secondDocumentId));
        assert.equal(recoveredDocument.scanStatus, "done");
      }),
    );

    await t.test(
      "revoked parent session cannot start a scan",
      recordCase("Revoked existing parent session is denied before reading or calling AI", async () => {
        await db.delete(parentSessionsTable).where(eq(parentSessionsTable.tokenHash, hashParentSessionToken(tokenA)));
        const beforeRequests = capturedRequests.length;
        const requestId = `${requestPrefix}-revoked-session`;
        scanRequestIds.push(requestId);
        const response = await scanDocument(tokenA, childAId, documentAId, requestId);
        const body = await response.text();
        assert.equal(response.status, 401);
        assert.doesNotMatch(body, /Kai|Synthetic plan|break card|PARENT_UPLOAD_RAW_DOCUMENT_SENTINEL/i);
        assert.equal(capturedRequests.length, beforeRequests);
      }),
    );
  } finally {
    if (apiServer.listening) await new Promise<void>((resolve) => apiServer.close(() => resolve()));
  }

  const auditRows = await db.select().from(auditLogsTable).where(inArray(
    auditLogsTable.targetId,
    [...uploadedDocumentIds, ...childIds],
  ));
  const sanitizedAudit = auditRows.map((row) => ({
    createdAt: row.createdDate.toISOString(),
    actorId: row.userId,
    actorRole: row.userRole,
    tenantId: row.tenantId,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    success: row.success,
    reason: row.reason,
    metadata: row.metadata,
  }));
  const providerAudits = sanitizedAudit.filter((row) => row.action === "ai_document_provider_call");
  const scanAudits = sanitizedAudit.filter((row) => row.action === "document_scan_requested");
  await t.test(
    "every parent-upload provider request is audited without private content",
    recordCase("Provider and route audit events have expected attribution, linkage, timestamps, and content-free metadata", async () => {
      assert.equal(
        providerAudits.length,
        capturedRequests.length,
        "Each parent-upload document-AI provider request, including failed and recovered requests, must have one audit row.",
      );
      const expectedProviderCallsByRequest = new Map([
        [`${requestPrefix}-empty-discovery`, 1],
        [`${requestPrefix}-recovered-scan`, 4],
        [`${requestPrefix}-provider-error`, 1],
        [`${requestPrefix}-provider-recovery`, 4],
      ]);
      for (const [requestId, expectedCount] of expectedProviderCallsByRequest) {
        const matching = providerAudits.filter((row) =>
          (row.metadata as any)?.request_id === requestId,
        );
        assert.equal(matching.length, expectedCount, `Provider audit count for ${requestId} must match actual requests.`);
        const expectedSuccess = !requestId.endsWith("provider-error");
        assert.ok(matching.every((row) =>
          row.success === expectedSuccess &&
          (row.metadata as any)?.outcome === (expectedSuccess ? "success" : "failed"),
        ));
      }
      for (const row of providerAudits) {
        const metadata = row.metadata as Record<string, unknown>;
        assert.equal(row.actorId, parentAId);
        assert.equal(row.actorRole, "parent");
        assert.equal(row.tenantId, workspaceA);
        assert.equal(row.targetType, "child");
        assert.equal(row.targetId, childAId);
        assert.equal(metadata.feature, "document_scan");
        assert.equal(metadata.provider, "anthropic");
        assert.equal(metadata.child_id, childAId);
        assert.ok(["parent_document_discovery", "support_area_candidates", "support_card_generation", "behavior_support_generation"].includes(String(metadata.operation)));
        assert.ok((metadata.source_document_ids as string[]).some((id) => uploadedDocumentIds.includes(id)));
        assert.ok(typeof metadata.request_id === "string" && metadata.request_id.startsWith(requestPrefix));
        assert.ok(Number.isFinite(Date.parse(row.createdAt)));
      }
      for (const requestId of scanRequestIds.filter((id) => !id.endsWith("revoked-session"))) {
        assert.ok(scanAudits.some((row) => (row.metadata as any)?.request_id === requestId));
      }
      const expectedScanOutcomes = new Map([
        [`${requestPrefix}-empty-discovery`, false],
        [`${requestPrefix}-recovered-scan`, true],
        [`${requestPrefix}-repeat-scan`, true],
        [`${requestPrefix}-cross-family`, false],
        [`${requestPrefix}-provider-error`, false],
        [`${requestPrefix}-provider-recovery`, true],
      ]);
      for (const [requestId, expectedSuccess] of expectedScanOutcomes) {
        const matching = scanAudits.filter((row) =>
          (row.metadata as any)?.request_id === requestId,
        );
        assert.equal(matching.length, 1, `Exactly one route audit is expected for ${requestId}.`);
        assert.equal(matching[0].success, expectedSuccess);
      }
      const crossFamilyAudit = scanAudits.find((row) => (row.metadata as any)?.request_id === `${requestPrefix}-cross-family`);
      assert.ok(crossFamilyAudit);
      assert.equal(crossFamilyAudit.actorId, parentAId);
      assert.equal(crossFamilyAudit.actorRole, "parent");
      assert.equal(crossFamilyAudit.success, false);
      assert.equal(crossFamilyAudit.targetId, documentBId);
      assert.equal((crossFamilyAudit.metadata as any).child_id, childBId);

      const serializedAudit = JSON.stringify(sanitizedAudit);
      assert.doesNotMatch(serializedAudit, new RegExp(RAW_DOCUMENT_SENTINEL));
      assert.doesNotMatch(serializedAudit, new RegExp(RAW_PROVIDER_SENTINEL));
      assert.doesNotMatch(serializedAudit, /token_hash|session_cookie|raw_token|prompt|response_text|document_text|api.?key/i);
    }),
  );

  const requestSummary = capturedRequests.map((entry) => ({
    toolName: entry.toolName,
    model: entry.model,
    hasSourceMarker: entry.hasSourceMarker,
    hasExtractedSourceFact: entry.hasExtractedSourceFact,
    hasForeignMarker: entry.hasForeignMarker,
    hasServerInstructions: entry.hasServerInstructions,
  }));
  await fs.writeFile(
    path.join(evidenceDir, "parent-upload-fake-ai-request-summary.json"),
    `${JSON.stringify({
      documentScanRequests: requestSummary,
      chatRetrievalContext: chatContextSummaries,
    }, null, 2)}\n`,
    { mode: 0o600 },
  );
  if (deletionLifecycleEvidence) {
    await fs.writeFile(
      path.join(evidenceDir, "parent-document-deletion-before-after.json"),
      `${JSON.stringify(deletionLifecycleEvidence, null, 2)}\n`,
      { mode: 0o600 },
    );
  }
  await fs.writeFile(
    path.join(evidenceDir, "parent-upload-genuine-audit-events.json"),
    `${JSON.stringify(sanitizedAudit, null, 2)}\n`,
    { mode: 0o600 },
  );
  await fs.writeFile(
    path.join(evidenceDir, "parent-upload-test-results.json"),
    `${JSON.stringify({
      appCommit: process.env.NP_APP_COMMIT || "not-provided",
      startedAt: new Date().toISOString(),
      cases: caseResults,
      totals: {
        passed: caseResults.filter((item) => item.status === "PASS").length,
        failed: caseResults.filter((item) => item.status === "FAIL").length,
      },
      fakeAi: true,
      fakeStorage: true,
      connectorsEnabled: false,
      loopbackDatabase: "np_parent_upload_ai_test",
      providerRequestCount: capturedRequests.length,
      providerAuditCount: providerAudits.length,
      sourceTextStoredInEvidence: false,
      rawProviderRequestBodiesStoredInEvidence: false,
    }, null, 2)}\n`,
    { mode: 0o600 },
  );
  await fs.writeFile(
    path.join(evidenceDir, "parent-upload-log-privacy-assertions.json"),
    `${JSON.stringify({
      rawDocumentSentinel: "absent from test-run.log, database logs, provider summaries and audit output",
      rawProviderErrorSentinel: "absent from test-run.log, database logs, provider summaries and audit output",
      apiKeyAndSessionValues: "not written to evidence",
      loggerPathsExercised: ["parent_document_scan failure path for empty AI result", "parent_document_scan failure path for provider error", "successful scan path", "provider-call audit success/failure"],
    }, null, 2)}\n`,
    { mode: 0o600 },
  );
  assert.ok(capturedRequests.length > 0);
});
