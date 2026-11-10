import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { once } from "node:events";
import express from "express";
import { Storage } from "@google-cloud/storage";
import { test } from "node:test";

const databaseUrl = process.env.PARENT_DOCUMENT_AI_TEST_DATABASE_URL;
const testRoot = process.env.PARENT_DOCUMENT_AI_TEST_ROOT;
const evidenceDir = process.env.PARENT_DOCUMENT_AI_EVIDENCE_DIR;
if (!databaseUrl || !testRoot || !evidenceDir) {
  throw new Error("The isolated document-AI test runner did not provide required test paths.");
}

const parsedDatabaseUrl = new URL(databaseUrl);
if (
  !["127.0.0.1", "::1", "[::1]"].includes(parsedDatabaseUrl.hostname) ||
  decodeURIComponent(parsedDatabaseUrl.pathname.slice(1)) !== "np_parent_document_ai_test"
) {
  throw new Error("Refusing to run outside the isolated loopback document-AI test database.");
}

process.env.DATABASE_URL = databaseUrl;
process.env.FILE_ENCRYPTION_KEY = "b".repeat(64);
process.env.PRIVATE_OBJECT_DIR = "np-parent-ai-test/fixture";
process.env.REPLIT_CONNECTORS_ENABLED = "false";
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

type CapturedRequest = {
  path: string;
  body: Record<string, any>;
};
type CaseResult = {
  name: string;
  status: "PASS" | "FAIL";
  details?: string;
};

const fakeObjects = new Map<string, Buffer>();
const capturedRequests: CapturedRequest[] = [];
const caseResults: CaseResult[] = [];
let providerMode: "valid" | "empty-main-response" | "malformed-classification" = "valid";
let activeDocumentId = "";
let activeSourceExcerpt = "";
let activeObservationExcerpt = "";
let activeGoalExcerpt = "";
let activeActivityExcerpt = "";
let activeForeignMarker = "";

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

function inputIdsFromRequest(body: Record<string, any>): string[] {
  const collectText = (value: unknown): string[] => {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(collectText);
    if (value && typeof value === "object") return Object.values(value).flatMap(collectText);
    return [];
  };
  const text = collectText(body.messages ?? []).join("\n");
  return [...new Set([...text.matchAll(/"extraction_id"\s*:\s*"([^"]+)"/g)].map((match) => match[1]))];
}

function profileInput(documentId: string) {
  const sourceExcerpt = activeSourceExcerpt;
  return {
    behaviors: [{
      name: "Starting homework",
      emoji: "📝",
      description: "Kai sometimes needs help starting a multi-step homework page.",
      what_may_be_happening: "A page with several steps may be hard to begin.",
      do_this_right_now: ["Point to one problem to start."],
      interventions: ["Use the break card described in the document."],
      if_it_escalates: [],
      avoid: [],
      prevention_tips: ["Keep the break card nearby."],
      reinforcement_rewards: [],
      practice_a_helpful_skill: "Ask for a break with the break card.",
      practice_skill_steps: ["Show the break card.", "Return to one problem after the break."],
      what_to_notice: ["Notice whether Kai asks for help before leaving the table."],
      clinical_interventions: [],
      when_to_contact_clinician: "",
      linked_goals: ["Request a break with the break card"],
      triggers: ["Multi-step homework worksheets"],
    }],
    goals: [{
      title: "Request a break with the break card",
      description: "Show the break card before leaving the table.",
      milestones: ["Use the card before leaving the table."],
    }],
    diagnoses: [],
    objectives: [],
    safety_procedures: [],
    document_extractions: [
      {
        category: "clinical_observation",
        source_document_id: documentId,
        source_section: "Homework support",
        source_page: 0,
        source_excerpt: activeObservationExcerpt,
        ambiguous: false,
        ambiguity_reason: "",
        interpretation: {
          observation: activeObservationExcerpt,
          context: "During homework after reaching a multi-step worksheet.",
        },
      },
      {
        category: "goal",
        source_document_id: documentId,
        source_section: "Goal",
        source_page: 0,
        source_excerpt: activeGoalExcerpt,
        ambiguous: false,
        ambiguity_reason: "",
        interpretation: {
          title: "Request a break with the break card",
          description: "Show the break card before leaving the table.",
          milestones: ["Use the card before leaving the table."],
        },
      },
      {
        category: "potential_home_activity",
        source_document_id: documentId,
        source_section: "Practice",
        source_page: 0,
        source_excerpt: activeActivityExcerpt,
        ambiguous: false,
        ambiguity_reason: "",
        interpretation: {
          title: "Practice using a break card",
          skill: "Ask for a short break",
          related_goal: "Request a break with the break card",
          suggested_context: "Before homework",
          duration_minutes: 5,
          materials: ["Break card"],
          start_action: "Put the break card beside the worksheet.",
          steps: ["Show the card.", "Take a five-minute break.", "Return to one problem."],
          end_condition: "Finish one worksheet problem.",
          pause_conditions: [],
          observation_prompts: ["Did Kai show the card before leaving the table?"],
        },
      },
    ],
  };
}

function toolInput(toolName: string, body: Record<string, any>): Record<string, unknown> {
  if (toolName === "save_behavioral_profile") {
    const source = JSON.stringify(body.messages ?? []);
    const sourceId = source.match(/id=([0-9a-f-]{36})/i)?.[1] || activeDocumentId;
    const input = profileInput(sourceId);
    if (providerMode === "malformed-classification") {
      (input as Record<string, unknown>).document_extractions = "not-an-array";
    }
    return input;
  }
  if (toolName === "generate_source_linked_support_area_candidates") {
    const ids = inputIdsFromRequest(body);
    if (!ids.length) return { cards: [] };
    return {
      cards: [{
        source_extraction_ids: [ids[0]],
        name: "Homework starting support",
        description: "Kai asked for help after reaching a multi-step homework worksheet.",
        contexts: ["Homework"],
        observations: ["Kai asked for help after reaching a multi-step worksheet."],
        uncertainty: "",
      }],
    };
  }
  if (toolName === "generate_document_informed_support_cards") {
    const ids = inputIdsFromRequest(body);
    if (!ids.length) return { cards: [] };
    return {
      cards: [{
        source_extraction_ids: [ids[0]],
        try_one_steps: [
          "Put the break card beside the worksheet and point to one problem.",
          "If Kai asks for a break, pause for five minutes, then return to one problem.",
        ],
        simpler_step: "Point to the first problem and ask whether Kai wants help.",
        things_to_avoid: ["Avoid presenting the whole multi-step page as one large task."],
        what_may_be_happening: ["A multi-step worksheet may be hard to start."],
        prevention_ideas: ["Keep the break card beside the worksheet before homework begins."],
        encouragement: ["Notice and acknowledge when Kai asks for a break with the card."],
        practice_a_helpful_skill: ["Practice showing the break card before homework."],
        what_to_notice: ["Notice whether Kai returns to one problem after the five-minute break."],
      }],
    };
  }
  if (toolName === "save_document_classification") {
    return {
      document_extractions: providerMode === "malformed-classification" ? "not-an-array" : [],
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
      capturedRequests.push({ path: request.url || "/", body });
      const selectedTool = typeof body.tool_choice?.name === "string"
        ? body.tool_choice.name
        : body.tools?.[0]?.name;
      const isMain = selectedTool === "save_behavioral_profile";
      if (providerMode === "empty-main-response" && isMain) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({
          id: "msg-synthetic-empty",
          type: "message",
          role: "assistant",
          model: "claude-sonnet-4-5",
          content: [],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        }));
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        id: `msg-synthetic-${capturedRequests.length}`,
        type: "message",
        role: "assistant",
        model: "claude-sonnet-4-5",
        content: [{
          type: "tool_use",
          id: `tool-synthetic-${capturedRequests.length}`,
          name: selectedTool,
          input: toolInput(String(selectedTool), body),
        }],
        stop_reason: "tool_use",
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 10 },
      }));
    } catch {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({
        type: "error",
        error: { type: "invalid_request_error", message: "Synthetic provider received malformed JSON." },
      }));
    }
  });
});

await fs.mkdir(testRoot, { recursive: true, mode: 0o700 });
const isolatedWorkingDirectory = path.join(testRoot, "application-sandbox");
const isolatedUploadDirectory = path.join(isolatedWorkingDirectory, "uploads");
await fs.mkdir(isolatedUploadDirectory, { recursive: true, mode: 0o700 });
process.chdir(isolatedWorkingDirectory);
await fs.mkdir(evidenceDir, { recursive: true, mode: 0o700 });

await new Promise<void>((resolve) => provider.listen(0, "127.0.0.1", resolve));
const providerAddress = provider.address();
if (!providerAddress || typeof providerAddress === "string") {
  throw new Error("The loopback fake AI provider did not bind to an available local port.");
}
process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY = "test-only-fake-provider-key";
process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL = `http://127.0.0.1:${providerAddress.port}`;

const database = await import("@workspace/db");
const {
  auditLogsTable,
  childrenTable,
  clientProfilesTable,
  clinicMembershipsTable,
  clinicsTable,
  clinicalAssignmentsTable,
  db,
  documentExtractionRunsTable,
  documentsTable,
  familiesTable,
  pool,
  rewardTokensTable,
  usersTable,
  userProfilesTable,
} = database;
const { default: entitiesRouter } = await import("./entities");
const { eq, inArray, and } = await import("drizzle-orm");

function isLocalDatabase(): Promise<boolean> {
  return pool.query(
    "select current_database() as name, host(inet_server_addr()) as host",
  ).then((result) =>
    result.rows[0]?.name === "np_parent_document_ai_test" &&
    ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(result.rows[0]?.host),
  );
}

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

test("document scan route completes safely with a deterministic loopback AI provider", async (t) => {
  t.after(async () => {
    if (provider.listening) {
      await new Promise<void>((resolve) => provider.close(() => resolve()));
    }
    await pool.end();
  });
  assert.equal(await isLocalDatabase(), true, "Must use only the named loopback test database");
  assert.ok(process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL?.startsWith("http://127.0.0.1:"));
  assert.equal(process.env.REPLIT_CONNECTORS_ENABLED, "false");

  const suffix = crypto.randomUUID();
  const clinicId = `synthetic-clinic-${suffix}`;
  const tenantId = `synthetic-tenant-${suffix}`;
  const clinicianAId = `synthetic-clinician-a-${suffix}`;
  const clinicianBId = `synthetic-clinician-b-${suffix}`;
  const familyAId = `synthetic-family-a-${suffix}`;
  const familyBId = `synthetic-family-b-${suffix}`;
  const childAId = crypto.randomUUID();
  const childBId = crypto.randomUUID();
  activeDocumentId = crypto.randomUUID();
  const foreignDocumentId = crypto.randomUUID();
  const documentFilename = `${crypto.randomUUID()}.txt`;
  const foreignFilename = `${crypto.randomUUID()}.txt`;
  activeForeignMarker = `FOREIGN_FAMILY_MARKER_${suffix}`;
  activeObservationExcerpt = "During homework, Kai asked for help after reaching a multi-step worksheet.";
  activeGoalExcerpt = "Goal: Request a break using the break card before leaving the table.";
  activeActivityExcerpt = "Practice: Show the break card; pause for five minutes; return to one problem.";
  activeSourceExcerpt = [
    activeObservationExcerpt,
    activeGoalExcerpt,
    activeActivityExcerpt,
  ].join(" ");
  const sourceText = [
    "Fictional support plan for Kai.",
    activeObservationExcerpt,
    activeGoalExcerpt,
    activeActivityExcerpt,
  ].join("\n");
  const foreignText = `${activeForeignMarker} Fictional private document for an unrelated family.`;
  await fs.writeFile(path.join(isolatedUploadDirectory, documentFilename), sourceText, { mode: 0o600 });
  await fs.writeFile(path.join(isolatedUploadDirectory, foreignFilename), foreignText, { mode: 0o600 });

  await db.insert(usersTable).values([
    { id: clinicianAId, email: `${suffix}.clinician-a@example.test`, firstName: "Synthetic", lastName: "Clinician A" },
    { id: clinicianBId, email: `${suffix}.clinician-b@example.test`, firstName: "Synthetic", lastName: "Clinician B" },
  ]);
  await db.insert(userProfilesTable).values([
    { id: clinicianAId, appRole: "clinician", tenantId, accountType: "clinician" },
    { id: clinicianBId, appRole: "clinician", tenantId, accountType: "clinician" },
  ]);
  await db.insert(clinicsTable).values({
    id: clinicId,
    displayName: "Synthetic Test Clinic",
    legacyTenantId: tenantId,
    status: "active",
  });
  await db.insert(clinicMembershipsTable).values([
    { clinicId, userId: clinicianAId, role: "treating_clinician", status: "active" },
  ]);
  await db.insert(familiesTable).values([
    { id: familyAId, tenantId, clinicianId: clinicianAId, familyName: "Synthetic Family A", accountType: "clinic_family" },
    { id: familyBId, tenantId, clinicianId: clinicianBId, familyName: "Synthetic Family B", accountType: "clinic_family" },
  ]);
  await db.insert(childrenTable).values([
    {
      id: childAId,
      tenantId,
      clinicianId: clinicianAId,
      familyId: familyAId,
      childName: "Kai Synthetic",
      accountType: "parent_clinician",
      status: "active",
    },
    {
      id: childBId,
      tenantId,
      clinicianId: clinicianBId,
      familyId: familyBId,
      childName: "Riley Synthetic",
      accountType: "parent_clinician",
      status: "active",
    },
  ]);
  await db.insert(clinicalAssignmentsTable).values({
    clinicId,
    clientId: childAId,
    userId: clinicianAId,
    role: "treating_clinician",
    status: "active",
  });
  await db.insert(documentsTable).values([
    {
      id: activeDocumentId,
      tenantId,
      childId: childAId,
      clinicianId: clinicianAId,
      title: "Synthetic homework plan",
      fileName: documentFilename,
      fileUrl: `/uploads/${documentFilename}`,
      uploadedBy: clinicianAId,
      accessRoles: "parent,client,clinician",
      scanStatus: "pending",
    },
    {
      id: foreignDocumentId,
      tenantId,
      childId: childBId,
      clinicianId: clinicianBId,
      title: "Synthetic unrelated plan",
      fileName: foreignFilename,
      fileUrl: `/uploads/${foreignFilename}`,
      uploadedBy: clinicianBId,
      accessRoles: "clinician",
      scanStatus: "pending",
    },
  ]);

  const app = express();
  app.use(express.json());
  app.use((request: any, _response, next) => {
    const actorId = request.header("x-synthetic-clinician");
    if (actorId) {
      request.user = { id: actorId, email: `${actorId}@example.test`, appRole: "clinician" };
      request.isAuthenticated = () => true;
    } else {
      request.isAuthenticated = () => false;
    }
    request.id = request.header("x-test-request-id") || `synthetic-request-${crypto.randomUUID()}`;
    request.log = { info() {}, warn() {}, error() {} };
    next();
  });
  app.use(entitiesRouter);
  const apiServer = app.listen(0, "127.0.0.1");
  await once(apiServer, "listening");
  const apiAddress = apiServer.address();
  assert.ok(apiAddress && typeof apiAddress !== "string");
  const apiBase = `http://127.0.0.1:${apiAddress.port}`;

  const callScan = async (
    actorId: string | null,
    childId: string,
    body: Record<string, unknown>,
    requestId: string,
  ) => fetch(`${apiBase}/build-client-profile`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-test-request-id": requestId,
      ...(actorId ? { "x-synthetic-clinician": actorId } : {}),
    },
    body: JSON.stringify({ child_id: childId, ...body }),
  });

  try {
    await t.test("authorized scan stores source-linked results for only the correct child and document",
      recordCase("Successful scan, derived content ownership, fields, labels, and isolated storage", async () => {
        const start = capturedRequests.length;
        const response = await callScan(clinicianAId, childAId, { force_rebuild: true }, `ai-success-${suffix}`);
        const body = await response.json() as Record<string, any>;
        assert.equal(response.status, 200, JSON.stringify(body));
        assert.deepEqual(body.scanned, [activeDocumentId]);
        assert.deepEqual(body.failed, []);
        assert.ok(body.document_extractions.length >= 3);

        const [profile] = await db.select().from(clientProfilesTable)
          .where(eq(clientProfilesTable.childId, childAId));
        assert.ok(profile);
        assert.deepEqual(profile.sourceDocIds, [activeDocumentId]);
        const [savedChild] = await db.select().from(childrenTable)
          .where(eq(childrenTable.id, childAId));
        assert.equal(savedChild.familyId, familyAId);
        const savedBehaviors = profile.behaviors as Array<Record<string, any>>;
        const savedGoals = profile.goals as Array<Record<string, any>>;
        assert.equal(savedBehaviors[0].name, "Starting homework");
        assert.equal(savedGoals[0].title, "Request a break with the break card");

        const [run] = await db.select().from(documentExtractionRunsTable)
          .where(eq(documentExtractionRunsTable.documentId, activeDocumentId));
        assert.ok(run);
        assert.equal(run.childId, childAId);
        assert.equal(run.scanStatus, "completed");
        assert.ok(run.records.some((record: any) =>
          record.category === "goal" &&
          record.sourceExcerpt === activeGoalExcerpt &&
          record.sourceExcerptVerified &&
          record.reviewStatus === "unreviewed",
        ));
        assert.ok(run.records.some((record: any) =>
          record.category === "potential_home_activity" &&
          record.sourceExcerpt === activeActivityExcerpt &&
          record.sourceExcerptVerified,
        ));
        const foreignRuns = await db.select().from(documentExtractionRunsTable)
          .where(eq(documentExtractionRunsTable.documentId, foreignDocumentId));
        assert.equal(foreignRuns.length, 0, "The other family's document must not receive derived records.");
        const generatedSections = run.records.find((record: any) =>
          record.interpretation.generated_support_sections,
        )?.interpretation.generated_support_sections as Record<string, any> | undefined;
        assert.ok(generatedSections);
        assert.ok(generatedSections.tryOneSteps.length >= 2);
        assert.ok(generatedSections.thingsToAvoid.length);
        assert.ok(generatedSections.whatMayBeHappening.length);
        assert.ok(generatedSections.preventionIdeas.length);
        assert.ok(generatedSections.encouragement.length);
        assert.ok(generatedSections.practiceSkill.length);
        assert.ok(generatedSections.whatToNotice.length);

        const [sourceDocument] = await db.select().from(documentsTable)
          .where(eq(documentsTable.id, activeDocumentId));
        assert.equal(sourceDocument.uploadedBy, clinicianAId);
        assert.equal(sourceDocument.scanStatus, "done");
        assert.ok(fakeObjects.size > 0, "Encrypted scan output must go only to the in-memory fake object store");
        assert.ok([...fakeObjects.keys()].every((key) => key.startsWith("np-parent-ai-test/fixture/")));

        const currentRunRequests = capturedRequests.slice(start);
        assert.ok(currentRunRequests.some((entry) =>
          entry.body.tools?.[0]?.name === "save_behavioral_profile",
        ));
        assert.ok(currentRunRequests.some((entry) =>
          entry.body.tools?.[0]?.name === "generate_source_linked_support_area_candidates",
        ));
        assert.ok(currentRunRequests.some((entry) =>
          entry.body.tools?.[0]?.name === "generate_document_informed_support_cards",
        ));
        assert.ok(currentRunRequests.every((entry) =>
          !JSON.stringify(entry.body).includes(activeForeignMarker),
        ), "No foreign-family document material may enter any AI request");
      }));

    await t.test("repeated scanning is idempotent for source records and goals",
      recordCase("Repeated scan does not duplicate derived records or goals", async () => {
        const beforeRuns = await db.select().from(documentExtractionRunsTable)
          .where(eq(documentExtractionRunsTable.documentId, activeDocumentId));
        const beforeGoals = await db.select().from(rewardTokensTable)
          .where(eq(rewardTokensTable.childId, childAId));
        const beforeRecordIds = beforeRuns[0]?.records.map((record: any) => record.id).sort();
        const response = await callScan(clinicianAId, childAId, { force_rebuild: true }, `ai-repeat-${suffix}`);
        const body = await response.json() as Record<string, any>;
        assert.equal(response.status, 200, JSON.stringify(body));
        const afterRuns = await db.select().from(documentExtractionRunsTable)
          .where(eq(documentExtractionRunsTable.documentId, activeDocumentId));
        const afterGoals = await db.select().from(rewardTokensTable)
          .where(eq(rewardTokensTable.childId, childAId));
        assert.equal(afterRuns.length, 1);
        assert.deepEqual(afterRuns[0].records.map((record: any) => record.id).sort(), beforeRecordIds);
        assert.equal(afterGoals.length, beforeGoals.length);
      }));

    await t.test("foreign families, unrelated clinicians, and unauthenticated callers cannot scan or read results",
      recordCase("Cross-family, unrelated-clinician, and unauthenticated access denied before AI", async () => {
        const providerCount = capturedRequests.length;
        const familyResponse = await callScan(
          clinicianAId,
          childBId,
          { force_rebuild: true },
          `ai-cross-family-${suffix}`,
        );
        const familyBody = await familyResponse.text();
        assert.equal(familyResponse.status, 403);
        assert.doesNotMatch(familyBody, new RegExp(activeForeignMarker));

        const clinicianResponse = await callScan(
          clinicianBId,
          childAId,
          { include_cached_extractions: true },
          `ai-unrelated-clinician-${suffix}`,
        );
        const clinicianBody = await clinicianResponse.text();
        assert.equal(clinicianResponse.status, 403);
        assert.doesNotMatch(clinicianBody, /Kai|multi-step|break card/i);

        const unauthenticatedResponse = await callScan(
          null,
          childAId,
          { force_rebuild: true },
          `ai-unauthenticated-${suffix}`,
        );
        assert.equal(unauthenticatedResponse.status, 401);
        assert.equal(capturedRequests.length, providerCount);
      }));

    await t.test("empty AI result fails safely and a corrected provider response can be retried",
      recordCase("Malformed/empty AI result is recoverable without losing prior findings", async () => {
        providerMode = "empty-main-response";
        const failedResponse = await callScan(
          clinicianAId,
          childAId,
          { force_rebuild: true },
          `ai-empty-response-${suffix}`,
        );
        const failedBody = await failedResponse.json() as Record<string, any>;
        assert.equal(failedResponse.status, 502);
        assert.equal(failedBody.error?.code, "ai_invalid_response");
        assert.doesNotMatch(JSON.stringify(failedBody), /provider|token|stack|sql|FOREIGN_FAMILY_MARKER/i);
        const [failedDocument] = await db.select().from(documentsTable)
          .where(eq(documentsTable.id, activeDocumentId));
        assert.equal(failedDocument.scanStatus, "error");

        providerMode = "valid";
        const retryResponse = await callScan(
          clinicianAId,
          childAId,
          { force_rebuild: true },
          `ai-retry-success-${suffix}`,
        );
        const retryBody = await retryResponse.json() as Record<string, any>;
        assert.equal(retryResponse.status, 200, JSON.stringify(retryBody));
        const [recoveredDocument] = await db.select().from(documentsTable)
          .where(eq(documentsTable.id, activeDocumentId));
        assert.equal(recoveredDocument.scanStatus, "done");
        const [recoveredRun] = await db.select().from(documentExtractionRunsTable)
          .where(eq(documentExtractionRunsTable.documentId, activeDocumentId));
        assert.equal(recoveredRun.scanStatus, "completed");
        assert.ok(recoveredRun.records.length >= 3, "Earlier valid source findings remain after the failed retry.");
      }));

    await t.test("malformed extraction structure fails safely and remains retryable",
      recordCase("Malformed extraction data is rejected safely and valid retry completes", async () => {
        providerMode = "malformed-classification";
        const failedResponse = await callScan(
          clinicianAId,
          childAId,
          { force_rebuild: true },
          `ai-malformed-response-${suffix}`,
        );
        const failedBody = await failedResponse.json() as Record<string, any>;
        assert.equal(failedResponse.status, 502);
        assert.equal(failedBody.error?.code, "classification_incomplete");
        assert.doesNotMatch(JSON.stringify(failedBody), /provider|token|stack|sql|FOREIGN_FAMILY_MARKER/i);
        const [failedDocument] = await db.select().from(documentsTable)
          .where(eq(documentsTable.id, activeDocumentId));
        assert.equal(failedDocument.scanStatus, "error");

        providerMode = "valid";
        const retryResponse = await callScan(
          clinicianAId,
          childAId,
          { force_rebuild: true },
          `ai-malformed-retry-success-${suffix}`,
        );
        const retryBody = await retryResponse.json() as Record<string, any>;
        assert.equal(retryResponse.status, 200, JSON.stringify(retryBody));
        const [recoveredDocument] = await db.select().from(documentsTable)
          .where(eq(documentsTable.id, activeDocumentId));
        assert.equal(recoveredDocument.scanStatus, "done");
        const [recoveredRun] = await db.select().from(documentExtractionRunsTable)
          .where(eq(documentExtractionRunsTable.documentId, activeDocumentId));
        assert.equal(recoveredRun.scanStatus, "completed");
      }));

    await t.test("revoked clinical access blocks both new scans and cached result retrieval",
      recordCase("Revoked assignment blocks later scanning and derived-result reads", async () => {
        await db.update(clinicalAssignmentsTable)
          .set({ status: "revoked", revokedAt: new Date() })
          .where(and(
            eq(clinicalAssignmentsTable.userId, clinicianAId),
            eq(clinicalAssignmentsTable.clientId, childAId),
          ));
        const providerCount = capturedRequests.length;
        const scanResponse = await callScan(
          clinicianAId,
          childAId,
          { force_rebuild: true },
          `ai-revoked-scan-${suffix}`,
        );
        assert.equal(scanResponse.status, 403);
        const scanBody = await scanResponse.text();
        assert.doesNotMatch(scanBody, /Kai|multi-step|break card/i);

        const resultResponse = await callScan(
          clinicianAId,
          childAId,
          { include_cached_extractions: true },
          `ai-revoked-results-${suffix}`,
        );
        assert.equal(resultResponse.status, 403);
        const resultBody = await resultResponse.text();
        assert.doesNotMatch(resultBody, /Kai|multi-step|break card/i);
        assert.equal(capturedRequests.length, providerCount);
      }));
  } finally {
    if (apiServer.listening) {
      await new Promise<void>((resolve) => apiServer.close(() => resolve()));
    }
  }

  const auditRows = await db.select().from(auditLogsTable).where(inArray(
    auditLogsTable.targetId,
    [childAId, childBId, activeDocumentId, foreignDocumentId],
  ));
  const sanitizedAuditRows = auditRows.map((row) => ({
    id: row.id,
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
  const requestStrings = capturedRequests.map(({ path: requestPath, body }) => ({
    path: requestPath,
    toolName: body.tool_choice?.name || body.tools?.[0]?.name || null,
    body,
  }));
  await fs.writeFile(
    path.join(evidenceDir, "fake-ai-requests.json"),
    `${JSON.stringify(requestStrings, null, 2)}\n`,
    { mode: 0o600 },
  );
  await fs.writeFile(
    path.join(evidenceDir, "genuine-test-audit-events.json"),
    `${JSON.stringify(sanitizedAuditRows, null, 2)}\n`,
    { mode: 0o600 },
  );
  await fs.writeFile(
    path.join(evidenceDir, "test-cases.json"),
    `${JSON.stringify({
      startedAt: new Date().toISOString(),
      appCommit: process.env.NP_APP_COMMIT || "not-provided",
      cases: caseResults,
      fakeProvider: true,
      fakeObjectStorage: true,
      connectorsEnabled: false,
      testDatabase: "np_parent_document_ai_test",
      fakeForeignMarkerExcludedFromAiRequests: capturedRequests.every(
        (entry) => !JSON.stringify(entry.body).includes(activeForeignMarker),
      ),
    }, null, 2)}\n`,
    { mode: 0o600 },
  );

  const successfulScanAudits = sanitizedAuditRows.filter((row) =>
    row.action === "document_scan_requested" &&
    row.targetId === childAId,
  );
  const deniedAccessAudits = sanitizedAuditRows.filter((row) =>
    row.action === "ai_document_access_denied" &&
    row.success === false,
  );
  const expectedSuccessfulRequests = new Set([
    `ai-success-${suffix}`,
    `ai-repeat-${suffix}`,
    `ai-empty-response-${suffix}`,
    `ai-retry-success-${suffix}`,
    `ai-malformed-response-${suffix}`,
    `ai-malformed-retry-success-${suffix}`,
  ]);
  assert.equal(successfulScanAudits.length, expectedSuccessfulRequests.size);
  for (const row of successfulScanAudits) {
    assert.equal(row.actorId, clinicianAId);
    assert.equal(row.actorRole, "clinician");
    assert.equal(row.tenantId, tenantId);
    assert.equal(row.success, true);
    assert.ok(expectedSuccessfulRequests.has(String((row.metadata as any)?.request_id)));
  }

  const expectedDenials = new Map([
    [`ai-cross-family-${suffix}`, { actorId: clinicianAId, targetId: childBId }],
    [`ai-unrelated-clinician-${suffix}`, { actorId: clinicianBId, targetId: childAId }],
    [`ai-revoked-scan-${suffix}`, { actorId: clinicianAId, targetId: childAId }],
    [`ai-revoked-results-${suffix}`, { actorId: clinicianAId, targetId: childAId }],
  ]);
  assert.equal(deniedAccessAudits.length, expectedDenials.size);
  for (const row of deniedAccessAudits) {
    const expected = expectedDenials.get(String((row.metadata as any)?.request_id));
    assert.ok(expected, "Every denied audit event must carry the matching test request id.");
    assert.equal(row.actorId, expected.actorId);
    assert.equal(row.actorRole, "clinician");
    assert.equal(row.targetId, expected.targetId);
    assert.equal(row.success, false);
  }
  assert.ok(sanitizedAuditRows.every((row) => Number.isFinite(Date.parse(row.createdAt))));
  assert.doesNotMatch(JSON.stringify(sanitizedAuditRows), /token_hash|session_cookie|raw_token/i);
  assert.ok(capturedRequests.length >= 6, "Expected requests to the fake AI provider across success, repeat, and retry");
});
