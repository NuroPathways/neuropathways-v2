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
      document_extractions: providerMode === "malformed-classification"
        ? "not-an-array"
        : profileInput(activeDocumentId).document_extractions,
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
  behaviorLogsTable,
  childrenTable,
    clientSessionsTable,
  clientProfilesTable,
  clinicMembershipsTable,
  clinicsTable,
  clinicalAssignmentsTable,
  db,
  documentExtractionRunsTable,
  documentsTable,
  familiesTable,
  parentChildSettingsTable,
  parentFamilyToolsTable,
  parentDocumentsTable,
  pool,
  rewardTokensTable,
  usersTable,
  userProfilesTable,
} = database;
const { default: entitiesRouter } = await import("./entities");
const { eq, inArray, and } = await import("drizzle-orm");
const { familyOwnerId } = await import("../lib/familyParentAuth");
const {
  getParentDocumentActivitySuggestions,
  getParentDocumentSupportData,
  getParentSupportCards,
} = await import("../lib/parentDocuments");
const { makeStarterCard } = await import("../lib/parentStarterLibrary");

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
  const clinicBId = `synthetic-clinic-b-${suffix}`;
  const tenantId = `synthetic-tenant-${suffix}`;
  const tenantBId = `synthetic-tenant-b-${suffix}`;
  const clinicianAId = `synthetic-clinician-a-${suffix}`;
  const clinicianBId = `synthetic-clinician-b-${suffix}`;
  const clinicianUnassignedId = `synthetic-clinician-unassigned-${suffix}`;
  const caregiverUserId = `synthetic-caregiver-${suffix}`;
  const familyAId = `synthetic-family-a-${suffix}`;
  const familyBId = `synthetic-family-b-${suffix}`;
  const childAId = crypto.randomUUID();
  const childBId = crypto.randomUUID();
  activeDocumentId = crypto.randomUUID();
  const foreignDocumentId = crypto.randomUUID();
  const caregiverSessionToken = `synthetic-parent-session-${suffix}`;
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
    { id: clinicianUnassignedId, email: `${suffix}.clinician-unassigned@example.test`, firstName: "Synthetic", lastName: "Unassigned Clinician" },
    { id: caregiverUserId, email: `${suffix}.caregiver@example.test`, firstName: "Synthetic", lastName: "Caregiver" },
  ]);
  await db.insert(userProfilesTable).values([
    { id: clinicianAId, appRole: "clinician", tenantId, accountType: "clinician" },
    { id: clinicianBId, appRole: "clinician", tenantId: tenantBId, accountType: "clinician" },
    { id: clinicianUnassignedId, appRole: "clinician", tenantId, accountType: "clinician" },
    { id: caregiverUserId, appRole: "parent", tenantId, accountType: "parent_family", linkedFamilyId: familyAId },
  ]);
  await db.insert(clinicsTable).values([
    { id: clinicId, displayName: "Synthetic Test Clinic A", legacyTenantId: tenantId, status: "active" },
    { id: clinicBId, displayName: "Synthetic Test Clinic B", legacyTenantId: tenantBId, status: "active" },
  ]);
  await db.insert(clinicMembershipsTable).values([
    { clinicId, userId: clinicianAId, role: "treating_clinician", status: "active" },
    { clinicId, userId: clinicianUnassignedId, role: "treating_clinician", status: "active" },
    { clinicId: clinicBId, userId: clinicianBId, role: "treating_clinician", status: "active" },
  ]);
  await db.insert(familiesTable).values([
    { id: familyAId, tenantId, clinicianId: clinicianAId, familyName: "Synthetic Family A", accountType: "family" },
    { id: familyBId, tenantId: tenantBId, clinicianId: clinicianBId, familyName: "Synthetic Family B", accountType: "family" },
  ]);
  await db.insert(childrenTable).values([
    {
      id: childAId,
      tenantId,
      clinicianId: clinicianAId,
      parentId: caregiverUserId,
      parentEmail: `${suffix}.caregiver@example.test`,
      familyId: familyAId,
      childName: "Kai Synthetic",
      accountType: "parent_clinician",
      status: "active",
    },
    {
      id: childBId,
      tenantId: tenantBId,
      clinicianId: clinicianBId,
      familyId: familyBId,
      childName: "Riley Synthetic",
      accountType: "parent_clinician",
      status: "active",
    },
  ]);
  await db.insert(clientSessionsTable).values({
    childId: childAId,
    inviteToken: caregiverSessionToken,
    username: `${suffix}.parent`,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
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
      accessRoles: "clinician",
      scanStatus: "pending",
    },
    {
      id: foreignDocumentId,
      tenantId: tenantBId,
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
  await db.insert(clinicalAssignmentsTable).values({
    clinicId: clinicBId,
    clientId: childBId,
    userId: clinicianBId,
    role: "treating_clinician",
    status: "active",
  });

  const app = express();
  app.use(express.json());
  app.use((request: any, _response, next) => {
    const actorId = request.header("x-synthetic-clinician");
    if (actorId) {
      request.user = { id: actorId, email: `${actorId}@example.test`, appRole: "clinician" };
      request.isAuthenticated = () => true;
    } else if (request.header("x-synthetic-parent")) {
      const parentId = request.header("x-synthetic-parent");
      request.user = { id: parentId, email: `${suffix}.caregiver@example.test`, appRole: "parent" };
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
        const response = await callScan(
          clinicianAId,
          childAId,
          { force_rebuild: true, source_document_id: activeDocumentId },
          `ai-success-${suffix}`,
        );
        const body = await response.json() as Record<string, any>;
        assert.equal(response.status, 200, JSON.stringify(body));
        assert.deepEqual(body.scanned, [activeDocumentId]);
        assert.deepEqual(body.failed, []);

        const [savedChild] = await db.select().from(childrenTable)
          .where(eq(childrenTable.id, childAId));
        assert.equal(savedChild.familyId, familyAId);

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
        const linkedGoalsResponse = await fetch(`${apiBase}/reward-tokens?child_id=${encodeURIComponent(childAId)}`, {
          headers: { "x-synthetic-clinician": clinicianAId },
        });
        const linkedGoals = await linkedGoalsResponse.json() as Array<Record<string, any>>;
        const sourceGoal = linkedGoals.find((goal) =>
          (goal.sourceDocumentId ?? goal.source_document_id) === activeDocumentId &&
          (goal.goalTitle ?? goal.goal_title) === "Request a break with the break card",
        );
        assert.equal(linkedGoalsResponse.status, 200);
        assert.ok(sourceGoal, "The assigned clinician must see the goal derived from the scanned source.");
        assert.equal(sourceGoal.sourceStatus ?? sourceGoal.source_status, "available");
        assert.equal(sourceGoal.sourceDocumentId ?? sourceGoal.source_document_id, activeDocumentId);

        const currentRunRequests = capturedRequests.slice(start);
        assert.ok(currentRunRequests.some((entry) =>
          entry.body.tools?.[0]?.name === "save_document_classification",
        ), "A scoped clinician scan must use document classification rather than aggregate profile generation.");
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

    await t.test("caregiver portal does not expose a profile derived from clinician-only documents",
      recordCase("Caregiver profile projection excludes clinician-only source material", async () => {
        const scanResponse = await callScan(
          clinicianAId,
          childAId,
          { force_rebuild: true },
          `ai-profile-projection-${suffix}`,
        );
        assert.equal(scanResponse.status, 200);
        const [savedProfile] = await db.select().from(clientProfilesTable)
          .where(eq(clientProfilesTable.childId, childAId));
        assert.ok(savedProfile);
        assert.ok((savedProfile.sourceDocIds as string[]).includes(activeDocumentId));

        const portalResponse = await fetch(`${apiBase}/client-portal-data`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            child_id: childAId,
            invite_token: caregiverSessionToken,
          }),
        });
        const portalBody = await portalResponse.json() as Record<string, any>;
        assert.equal(portalResponse.status, 200);
        assert.equal((portalBody.documents ?? []).some((document: any) => document.id === activeDocumentId), false);
        assert.equal(portalBody.profile, null, "The portal must hide summaries whose source is not visible to the caregiver.");
        assert.doesNotMatch(JSON.stringify(portalBody), /multi-step worksheet|break card described in the document/i);
        const [profileBeforeParentRead] = await db.select().from(clientProfilesTable)
          .where(eq(clientProfilesTable.childId, childAId));
        assert.ok(profileBeforeParentRead);
        const parentReadRequestId = `parent-hidden-profile-read-${suffix}`;
        const parentProfileResponse = await fetch(`${apiBase}/client-profiles/${profileBeforeParentRead.id}`, {
          headers: {
            "x-synthetic-parent": caregiverUserId,
            "x-test-request-id": parentReadRequestId,
          },
        });
        const parentProfileText = await parentProfileResponse.text();
        assert.equal(parentProfileResponse.status, 403);
        assert.doesNotMatch(parentProfileText, /multi-step worksheet|break card described in the document/i);
        const parentProfileReadAudits = (await db.select().from(auditLogsTable)).filter((row) =>
          (row.metadata as Record<string, unknown> | null)?.request_id === parentReadRequestId
        );
        assert.equal(parentProfileReadAudits.length, 1);
        assert.equal(parentProfileReadAudits[0].userId, caregiverUserId);
        assert.equal(parentProfileReadAudits[0].userRole, "parent");
        assert.equal(parentProfileReadAudits[0].tenantId, tenantId);
        assert.equal(parentProfileReadAudits[0].action, "cross_tenant_access_attempt");
        assert.equal(parentProfileReadAudits[0].targetType, "client-profiles");
        assert.equal(parentProfileReadAudits[0].targetId, profileBeforeParentRead.id);
        assert.equal(parentProfileReadAudits[0].success, false);
        assert.equal((parentProfileReadAudits[0].metadata as Record<string, unknown>)?.operation, "read");
        assert.ok(Number.isFinite(parentProfileReadAudits[0].createdDate.getTime()));
        assert.doesNotMatch(JSON.stringify(parentProfileReadAudits[0]), /multi-step worksheet|break card described in the document|password|token/i);
      }));

    await t.test("source-less legacy profiles stay private until authorized approval",
      recordCase("Filter caregiver profile lists, direct reads, and safety context until clinician approval", async () => {
        const [profileBefore] = await db.select().from(clientProfilesTable)
          .where(eq(clientProfilesTable.childId, childAId));
        assert.ok(profileBefore);
        const legacyMarker = `LEGACY_UNLINKED_PROFILE_${suffix}`;
        const safetyMarker = `LEGACY_SAFETY_PROFILE_${suffix}`;
        const independentParentNote = `INDEPENDENT_CAREGIVER_NOTE_${suffix}`;
        const visibleDocumentId = crypto.randomUUID();
        await db.insert(behaviorLogsTable).values({
          childId: childAId,
          parentId: caregiverUserId,
          tenantId,
          eventCategory: "behavior",
          behaviorType: "homework",
          notes: independentParentNote,
        });
        await db.insert(documentsTable).values({
          id: visibleDocumentId,
          tenantId,
          childId: childAId,
          clinicianId: clinicianAId,
          title: "Synthetic parent-visible source",
          fileName: `${visibleDocumentId}.txt`,
          fileUrl: `/uploads/${visibleDocumentId}.txt`,
          uploadedBy: `parent:${caregiverUserId}`,
          accessRoles: "parent",
          scanStatus: "done",
        });
        const portalData = async () => {
          const response = await fetch(`${apiBase}/client-portal-data`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              child_id: childAId,
              invite_token: caregiverSessionToken,
            }),
          });
          return { response, body: await response.json() as Record<string, any> };
        };
        const setApproval = async (actorId: string, approved: boolean) => fetch(`${apiBase}/manage-client-record`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-synthetic-clinician": actorId,
          },
          body: JSON.stringify({
            action: "setClientProfileCaregiverSharing",
            entity_id: profileBefore.id,
            data: { approved },
          }),
        });
        try {
          await db.update(clientProfilesTable).set({
            sourceDocIds: null,
            strengths: legacyMarker,
            safetyProcedures: [safetyMarker],
            caregiverShareApprovedBy: null,
            caregiverShareApprovedAt: null,
          }).where(eq(clientProfilesTable.childId, childAId));
          const { response: hiddenPortalResponse, body: hiddenPortalBody } = await portalData();
          assert.equal(hiddenPortalResponse.status, 200);
          assert.equal(hiddenPortalBody.profile, null);
          assert.match(JSON.stringify(hiddenPortalBody.child), /Kai Synthetic/,
            "The authorized child record remains visible.");
          assert.ok(hiddenPortalBody.behavior_logs?.some((row: any) => row.notes === independentParentNote),
            "Independent caregiver-entered notes remain visible.");
          assert.equal((hiddenPortalBody.documents ?? []).some((document: any) => document.id === activeDocumentId), false);

          const listResponse = await fetch(`${apiBase}/client-profiles?childId=${encodeURIComponent(childAId)}`, {
            headers: { "x-synthetic-parent": caregiverUserId },
          });
          assert.equal(listResponse.status, 200);
          const listBody = await listResponse.json() as any[];
          assert.equal(listBody.some((row) => row.id === profileBefore.id), false);

          const directResponse = await fetch(`${apiBase}/client-profiles/${profileBefore.id}`, {
            headers: { "x-synthetic-parent": caregiverUserId },
          });
          const directBody = await directResponse.text();
          assert.equal(directResponse.status, 403);
          assert.doesNotMatch(directBody, new RegExp(legacyMarker));
          assert.doesNotMatch(directBody, new RegExp(safetyMarker));

          const clinicianRead = await fetch(`${apiBase}/client-profiles/${profileBefore.id}`, {
            headers: { "x-synthetic-clinician": clinicianAId },
          });
          const clinicianBody = await clinicianRead.text();
          assert.equal(clinicianRead.status, 200);
          assert.match(clinicianBody, new RegExp(legacyMarker));
          assert.match(clinicianBody, new RegExp(safetyMarker));

          const parentApprovalAttempt = await fetch(`${apiBase}/manage-client-record`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-synthetic-parent": caregiverUserId,
            },
            body: JSON.stringify({
              action: "setClientProfileCaregiverSharing",
              entity_id: profileBefore.id,
              data: { approved: true },
            }),
          });
          assert.equal(parentApprovalAttempt.status, 403);
          const unassignedApprovalAttempt = await setApproval(clinicianUnassignedId, true);
          assert.equal(unassignedApprovalAttempt.status, 403);
          const stillUnapproved = (await db.select().from(clientProfilesTable)
            .where(eq(clientProfilesTable.id, profileBefore.id)))[0];
          assert.equal(stillUnapproved.caregiverShareApprovedBy, null);
          assert.equal(stillUnapproved.caregiverShareApprovedAt, null);

          // A restored link to the clinician-only source is not itself permission to share.
          await db.update(clientProfilesTable).set({
            sourceDocIds: [activeDocumentId],
          }).where(eq(clientProfilesTable.id, profileBefore.id));
          const { body: hiddenClinicianSource } = await portalData();
          assert.equal(hiddenClinicianSource.profile, null);

          // A reliable link to an independently visible parent upload is sufficient.
          await db.update(clientProfilesTable).set({
            sourceDocIds: [visibleDocumentId],
          }).where(eq(clientProfilesTable.id, profileBefore.id));
          const { body: linkedPortalBody } = await portalData();
          assert.equal(linkedPortalBody.profile?.strengths, legacyMarker);
          assert.equal(linkedPortalBody.profile?.sourceDocIds, undefined);
          assert.equal(linkedPortalBody.profile?.caregiverShareApprovedBy, undefined);

          // Removing the reliable link returns the profile to the explicit approval gate.
          await db.update(clientProfilesTable).set({ sourceDocIds: null })
            .where(eq(clientProfilesTable.id, profileBefore.id));
          const approvalResponse = await setApproval(clinicianAId, true);
          assert.equal(approvalResponse.status, 200);
          const approvalBody = await approvalResponse.json() as any;
          assert.equal(approvalBody.record.caregiver_share_approved_by, clinicianAId);
          const { body: approvedPortalBody } = await portalData();
          assert.equal(approvedPortalBody.profile?.strengths, legacyMarker);
          assert.equal(approvedPortalBody.profile?.source_doc_ids, undefined);
          assert.equal(approvedPortalBody.profile?.caregiver_share_approved_by, undefined);
          assert.equal(approvedPortalBody.profile?.caregiver_share_approved_at, undefined);
          const approvedDirectList = await fetch(`${apiBase}/client-profiles?childId=${encodeURIComponent(childAId)}`, {
            headers: { "x-synthetic-parent": caregiverUserId },
          });
          const approvedListBody = await approvedDirectList.json() as any[];
          assert.equal(approvedListBody.some((row) => row.id === profileBefore.id && row.strengths === legacyMarker), true);
          assert.equal(approvedListBody.some((row) =>
            "source_doc_ids" in row || "caregiver_share_approved_by" in row || "caregiver_share_approved_at" in row), false);

          const parentSupport = await getParentDocumentSupportData(familyOwnerId(familyAId), childAId);
          const approvedSafetyInstruction = parentSupport.safetyPlan.instructions.find((entry: any) =>
            entry.contentKind === "clinician_approved_profile" && entry.profileNote === safetyMarker);
          assert.ok(approvedSafetyInstruction, "Approved source-less safety information appears without invented source linkage.");
          assert.equal(approvedSafetyInstruction.documentId, null);
          assert.deepEqual(approvedSafetyInstruction.sourceDocumentIds, []);
          assert.equal(approvedSafetyInstruction.clinicianApproved, true);

          const revokeResponse = await setApproval(clinicianAId, false);
          assert.equal(revokeResponse.status, 200);
          const { body: revokedPortalBody } = await portalData();
          assert.equal(revokedPortalBody.profile, null);
          const revokedSafetyPlan = await getParentDocumentSupportData(familyOwnerId(familyAId), childAId);
          assert.equal(revokedSafetyPlan.safetyPlan.instructions.some((entry: any) =>
            entry.profileNote === safetyMarker), false);

          const approvalAudit = await db.select().from(auditLogsTable).where(and(
            eq(auditLogsTable.targetId, profileBefore.id),
            inArray(auditLogsTable.action, [
              "client_profile_caregiver_sharing_approved",
              "client_profile_caregiver_sharing_revoked",
              "client_profile_caregiver_sharing_denied",
            ]),
          ));
          assert.equal(approvalAudit.some((row) =>
            row.action === "client_profile_caregiver_sharing_approved" &&
            row.userId === clinicianAId && row.userRole === "clinician" && row.success === true), true);
          assert.equal(approvalAudit.some((row) =>
            row.action === "client_profile_caregiver_sharing_denied" &&
            row.userId === clinicianUnassignedId && row.success === false), true);
          assert.equal(approvalAudit.some((row) =>
            row.action === "client_profile_caregiver_sharing_revoked" &&
            row.userId === clinicianAId && row.success === true), true);
          assert.doesNotMatch(JSON.stringify(approvalAudit), /LEGACY_UNLINKED_PROFILE|LEGACY_SAFETY_PROFILE|password|token/i);

          await fs.writeFile(path.join(evidenceDir, "legacy-profile-source-less-visibility.json"), JSON.stringify({
            status: "PASS",
            sourceDocumentAssociation: "missing until a reliable link is restored",
            defaultCaregiverResponse: { portalProfileReturned: false, listContainsProfile: false, directReadStatus: directResponse.status },
            clinicianDirectRead: { status: clinicianRead.status, profileFieldsPreserved: true },
            independentCaregiverInformationRemainsVisible: true,
            parentCannotApprove: parentApprovalAttempt.status === 403,
            unassignedClinicianCannotApprove: unassignedApprovalAttempt.status === 403,
            clinicianOnlySourceWithoutApprovalRemainsHidden: hiddenClinicianSource.profile === null,
            reliableParentVisibleSourceLinkPassesVisibilityCheck: linkedPortalBody.profile?.strengths === legacyMarker,
            explicitApproval: { status: approvalResponse.status, caregiverProjectionOmitsSourceAndApprovalIds: true },
            approvedParentSafetyPlan: { contentKind: approvedSafetyInstruction.contentKind, documentId: approvedSafetyInstruction.documentId, sourceDocumentIds: approvedSafetyInstruction.sourceDocumentIds },
            revocationHidesProfileAgain: revokedPortalBody.profile === null,
            auditEvents: approvalAudit.map((row) => ({ action: row.action, actor: row.userId, role: row.userRole, success: row.success, createdAt: row.createdDate })),
            liveAIUsed: false,
          }, null, 2), { mode: 0o600 });
        } finally {
          await db.update(clientProfilesTable).set({
            sourceDocIds: profileBefore.sourceDocIds,
            strengths: profileBefore.strengths,
            safetyProcedures: profileBefore.safetyProcedures,
            caregiverShareApprovedBy: profileBefore.caregiverShareApprovedBy,
            caregiverShareApprovedAt: profileBefore.caregiverShareApprovedAt,
          }).where(eq(clientProfilesTable.childId, childAId));
          await db.delete(behaviorLogsTable).where(and(
            eq(behaviorLogsTable.childId, childAId),
            eq(behaviorLogsTable.notes, independentParentNote),
          ));
          await db.delete(documentsTable).where(eq(documentsTable.id, visibleDocumentId));
        }
      }));

    await t.test("legacy family shared-support cards require every explicit source to be parent-visible",
      recordCase("Legacy family support cards omit clinician-only and mixed-family source content", async () => {
        const ownerId = familyOwnerId(familyAId);
        const visibleDocumentId = crypto.randomUUID();
        const visibleMarker = `AUTHORIZED_FAMILY_SOURCE_CARD_${suffix}`;
        const privateMarker = `CLINICIAN_ONLY_FAMILY_CARD_${suffix}`;
        const mixedMarker = `MIXED_FAMILY_CARD_${suffix}`;
        const visibleCard = {
          ...makeStarterCard("custom", "Fictional authorized family source card", null),
          id: `source-card-visible-${suffix}`,
          source: "parent_document",
          sourceDocumentIds: [visibleDocumentId],
          sourceReferences: [{ documentId: visibleDocumentId, title: "Family upload", excerpt: visibleMarker }],
          whatMayBeHappening: visibleMarker,
        };
        const privateCard = {
          ...makeStarterCard("custom", "Fictional private source card", null),
          id: `source-card-private-${suffix}`,
          source: "clinician_document",
          sourceDocumentIds: [activeDocumentId],
          sourceReferences: [{ documentId: activeDocumentId, title: "Private source", excerpt: privateMarker }],
          whatMayBeHappening: privateMarker,
        };
        const mixedCard = {
          ...makeStarterCard("custom", "Fictional mixed-source card", null),
          id: `source-card-mixed-${suffix}`,
          source: "document",
          sourceDocumentIds: [activeDocumentId, foreignDocumentId],
          sourceReferences: [
            { documentId: activeDocumentId, title: "Private source", excerpt: mixedMarker },
            { documentId: foreignDocumentId, title: "Other-family source", excerpt: activeForeignMarker },
          ],
          whatMayBeHappening: mixedMarker,
        };
        await db.insert(documentsTable).values({
          id: visibleDocumentId,
          parentId: ownerId,
          tenantId,
          childId: childAId,
          title: "Fictional authorized family upload",
          fileName: "family-support.txt",
          fileUrl: `isolated-fake://documents/${visibleDocumentId}`,
          uploadedBy: "parent",
          accessRoles: "parent",
          scanStatus: "done",
        });
        await db.insert(parentDocumentsTable).values({
          documentId: visibleDocumentId,
          parentId: ownerId,
          childId: childAId,
          workspaceId: tenantId,
          storagePath: `isolated-fake-storage/${visibleDocumentId}.enc`,
          mimeType: "text/plain",
          sha256: `synthetic-visible-version-${suffix}`,
        });
        await db.insert(parentFamilyToolsTable).values({
          parentId: ownerId,
          childId: childAId,
          state: {
            legacyParentSettings: {
              behaviors: [],
              supportCards: [visibleCard, privateCard, mixedCard],
            },
          },
        });

        const cards = await getParentSupportCards(ownerId, childAId);
        const serialized = JSON.stringify(cards);
        assert.ok(cards.some((card) => card.id === visibleCard.id));
        assert.match(serialized, new RegExp(visibleMarker));
        assert.doesNotMatch(serialized, new RegExp(privateMarker));
        assert.doesNotMatch(serialized, new RegExp(mixedMarker));
        assert.doesNotMatch(serialized, new RegExp(activeForeignMarker));
        assert.equal(cards.some((card) => card.id === privateCard.id || card.id === mixedCard.id), false);
        await fs.writeFile(path.join(evidenceDir, "legacy-family-support-visibility.json"), JSON.stringify({
          scenario: "GE-ACC-097 / GE-FPA-108 shared-support-list subcheck",
          route: "getParentSupportCards for family-scoped caregiver",
          result: "PASS",
          authorizedFamilySourceCardReturned: true,
          privateSourceCardReturned: false,
          mixedFamilySourceCardReturned: false,
          unrelatedStarterCardsPreserved: cards.some((card) => card.source === "starter"),
          sourceContentsPersisted: true,
          provider: "not called",
        }, null, 2), { mode: 0o600 });
      }));

    await t.test("deleted source documents cannot keep parent-visible support or extraction-derived activities",
      recordCase("Deleted-source support is hidden while independent extraction records remain stored", async () => {
        const deletedSourceId = crypto.randomUUID();
        const deletedSourceMarker = `DELETED_SOURCE_SUPPORT_${suffix}`;
        const version = `synthetic-source-version-${suffix}`;
        const linkedCard = {
          ...makeStarterCard("custom", "Fictional deleted-source behavior", null),
          id: `deleted-source-card-${suffix}`,
          source: "parent_document",
          sourceDocumentIds: [deletedSourceId],
          sourceReferences: [{
            documentId: deletedSourceId,
            title: "Fictional parent upload",
            excerpt: deletedSourceMarker,
          }],
          whatMayBeHappening: deletedSourceMarker,
        };
        await db.insert(documentsTable).values({
          id: deletedSourceId,
          parentId: caregiverUserId,
          tenantId,
          childId: childAId,
          title: "Fictional parent upload",
          fileName: "fictional-support.txt",
          fileUrl: `isolated-fake://documents/${deletedSourceId}`,
          uploadedBy: `parent:${caregiverUserId}`,
          accessRoles: "parent",
          scanStatus: "done",
        });
        await db.insert(parentDocumentsTable).values({
          documentId: deletedSourceId,
          parentId: caregiverUserId,
          childId: childAId,
          workspaceId: tenantId,
          storagePath: `isolated-fake-storage/${deletedSourceId}.enc`,
          mimeType: "text/plain",
          sha256: version,
        });
        await db.insert(parentChildSettingsTable).values({
          childId: childAId,
          parentId: caregiverUserId,
          workspaceId: tenantId,
          behaviors: [],
          supportCards: [linkedCard],
        });
        await db.insert(documentExtractionRunsTable).values({
          childId: childAId,
          documentId: deletedSourceId,
          documentVersion: version,
          documentType: "support_plan",
          scanStatus: "completed",
          records: [{
            id: crypto.randomUUID(),
            childId: childAId,
            documentId: deletedSourceId,
            documentVersion: version,
            category: "potential_home_activity",
            sourceSection: "Fictional section",
            sourceExcerpt: deletedSourceMarker,
            sourceExcerptVerified: true,
            interpretation: { title: "Fictional source-linked practice" },
            extractionStatus: "extracted",
            reviewStatus: "unreviewed",
          }] as any,
        });

        const beforeSupport = await getParentSupportCards(caregiverUserId, childAId);
        const beforeDocumentSupport = await getParentDocumentSupportData(caregiverUserId, childAId);
        assert.ok(beforeSupport.some((card) => card.id === linkedCard.id));
        assert.doesNotMatch(JSON.stringify(beforeDocumentSupport), new RegExp(deletedSourceMarker));

        // Simulate the document-row removal only inside this disposable test database.
        // Retain its metadata, extraction, and derived goal/support data for access checks.
        await db.delete(documentsTable).where(eq(documentsTable.id, deletedSourceId));
        const [retainedRun] = await db.select().from(documentExtractionRunsTable)
          .where(eq(documentExtractionRunsTable.documentId, deletedSourceId));
        const afterSupport = await getParentSupportCards(caregiverUserId, childAId);
        const afterDocumentSupport = await getParentDocumentSupportData(caregiverUserId, childAId);
        const afterActivities = await getParentDocumentActivitySuggestions(caregiverUserId, childAId);
        assert.ok(retainedRun, "The test must retain the extraction record to verify access filtering.");
        assert.equal(afterSupport.some((card) => card.id === linkedCard.id), false);
        assert.doesNotMatch(JSON.stringify(afterSupport), new RegExp(deletedSourceMarker));
        assert.equal(afterDocumentSupport.cards.length, 0);
        assert.doesNotMatch(JSON.stringify(afterDocumentSupport), new RegExp(deletedSourceMarker));
        assert.doesNotMatch(JSON.stringify(afterActivities), new RegExp(deletedSourceMarker));
        await fs.writeFile(path.join(evidenceDir, "deleted-source-support-visibility.json"), JSON.stringify({
          scenario: "deleted-source support visibility",
          status: "PASS",
          sourceDocumentRow: "removed from isolated test database",
          sourceMetadata: "retained",
          extractionRecord: "retained but not returned through caregiver support/activity paths",
          sourceLinkedSupportCard: { visibleBeforeDelete: true, visibleAfterDelete: false },
          documentSupportCards: { before: beforeDocumentSupport.cards.length, after: afterDocumentSupport.cards.length },
          activitySuggestionsAfterDelete: afterActivities.length,
          independentGoalRetentionPolicyChanged: false,
        }, null, 2), { mode: 0o600 });
      }));

    await t.test("GE-ACC-070 denies a family session reading another family's portal data",
      recordCase("GE-ACC-070 cross-family portal data denial writes a genuine scoped audit event", async () => {
        const requestId = `family-portal-cross-family-${suffix}`;
        const response = await fetch(`${apiBase}/client-portal-data`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-test-request-id": requestId,
          },
          body: JSON.stringify({
            child_id: childBId,
            invite_token: caregiverSessionToken,
          }),
        });
        const bodyText = await response.text();
        assert.equal(response.status, 403);
        assert.doesNotMatch(bodyText, /Riley Synthetic|FOREIGN_FAMILY_MARKER|private document|document title/i);
        const rows = (await db.select().from(auditLogsTable)).filter((row) =>
          (row.metadata as Record<string, unknown> | null)?.request_id === requestId
        );
        assert.equal(rows.length, 1);
        const row = rows[0];
        assert.equal(row.userId, childAId);
        assert.equal(row.userRole, "client");
        assert.equal(row.tenantId, tenantId);
        assert.equal(row.action, "cross_tenant_access_attempt");
        assert.equal(row.targetType, "child");
        assert.equal(row.targetId, childBId);
        assert.equal(row.success, false);
        assert.ok(Number.isFinite(row.createdDate.getTime()));
        assert.doesNotMatch(JSON.stringify(row), /FOREIGN_FAMILY_MARKER|private document|password|token|invite/i);
      }));

    await t.test("assigned clinician detail reads write scoped success audit events",
      recordCase("GE-SEC-023 clinician child and family detail reads are audited exactly once", async () => {
        const reads = [
          {
            route: `/children/${encodeURIComponent(childAId)}`,
            requestId: `audit-child-by-id-${suffix}`,
            targetType: "child",
            targetId: childAId,
          },
          {
            route: `/families/${encodeURIComponent(familyAId)}`,
            requestId: `audit-family-by-id-${suffix}`,
            targetType: "family",
            targetId: familyAId,
          },
          {
            route: `/client-detail?child_id=${encodeURIComponent(childAId)}`,
            requestId: `audit-client-detail-${suffix}`,
            targetType: "child",
            targetId: childAId,
          },
          {
            route: `/family-detail?family_id=${encodeURIComponent(familyAId)}`,
            requestId: `audit-family-detail-${suffix}`,
            targetType: "family",
            targetId: familyAId,
          },
        ] as const;

        for (const read of reads) {
          const response = await fetch(`${apiBase}${read.route}`, {
            headers: {
              "x-synthetic-clinician": clinicianAId,
              "x-test-request-id": read.requestId,
            },
          });
          assert.equal(response.status, 200);
          const responseText = await response.text();
          assert.doesNotMatch(responseText, new RegExp(activeForeignMarker));
          const rows = (await db.select().from(auditLogsTable)).filter((row) =>
            (row.metadata as Record<string, unknown> | null)?.request_id === read.requestId
          );
          assert.equal(rows.length, 1);
          const row = rows[0];
          assert.equal(row.userId, clinicianAId);
          assert.equal(row.userRole, "clinician");
          assert.equal(row.tenantId, tenantId);
          assert.equal(row.action, "client_viewed");
          assert.equal(row.targetType, read.targetType);
          assert.equal(row.targetId, read.targetId);
          assert.equal(row.success, true);
          assert.ok(Number.isFinite(row.createdDate.getTime()));
          if (read.route.startsWith("/children/") || read.route.startsWith("/families/")) {
            assert.equal((row.metadata as Record<string, unknown>)?.operation, "read");
          }
          const serialized = JSON.stringify(row);
          assert.doesNotMatch(serialized, /token|password|sourceExcerpt|document_text/i);
          assert.doesNotMatch(serialized, new RegExp(activeSourceExcerpt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
        }
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
          { include_cached_extractions: true, source_document_id: activeDocumentId },
          `ai-cross-clinic-clinician-${suffix}`,
        );
        const clinicianBody = await clinicianResponse.text();
        assert.equal(clinicianResponse.status, 403);
        assert.doesNotMatch(clinicianBody, /Kai|multi-step|break card/i);

        const unassignedResponse = await callScan(
          clinicianUnassignedId,
          childAId,
          { include_cached_extractions: true, source_document_id: activeDocumentId },
          `ai-unassigned-clinician-${suffix}`,
        );
        const unassignedBody = await unassignedResponse.text();
        assert.equal(unassignedResponse.status, 403);
        assert.doesNotMatch(unassignedBody, /Kai|multi-step|break card/i);

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

    await t.test("clinician document deletion preserves goal provenance and blocks deleted-source extraction retrieval",
      recordCase("Clinician source goal remains usable but unavailable; deleted-source extraction text is not returned", async () => {
        const [runBefore] = await db.select().from(documentExtractionRunsTable)
          .where(eq(documentExtractionRunsTable.documentId, activeDocumentId));
        assert.ok(runBefore);
        const sourceRecordIds = runBefore.records.map((record: any) => record.id).sort();
        const [goalBefore] = await db.select().from(rewardTokensTable).where(and(
          eq(rewardTokensTable.childId, childAId),
          eq(rewardTokensTable.sourceDocumentId, activeDocumentId),
        ));
        assert.ok(goalBefore);
        assert.equal(goalBefore.source, "document");
        const fakeObjectKeysBeforeDelete = [...fakeObjects.keys()];
        assert.ok(fakeObjectKeysBeforeDelete.length > 0);

        const deleteRequestId = `ai-source-delete-${suffix}`;
        const deleteResponse = await fetch(`${apiBase}/manage-client-record`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-synthetic-clinician": clinicianAId,
            "x-test-request-id": deleteRequestId,
          },
          body: JSON.stringify({ action: "deleteDocument", entity_id: activeDocumentId }),
        });
        const deleteBody = await deleteResponse.json() as Record<string, any>;
        assert.equal(deleteResponse.status, 200, JSON.stringify(deleteBody));
        assert.equal(deleteBody.cleanupStatus, "complete");
        assert.equal((await db.select().from(documentsTable)
          .where(eq(documentsTable.id, activeDocumentId))).length, 0);
        assert.equal(
          await fs.stat(path.join(isolatedUploadDirectory, documentFilename)).then(() => true, () => false),
          false,
          "Authorized deletion removes the source file from isolated local storage.",
        );
        assert.ok(
          fakeObjectKeysBeforeDelete.every((key) => !fakeObjects.has(key)),
          "Deleted-source encrypted scan output is removed from fake storage.",
        );

        const [runAfter] = await db.select().from(documentExtractionRunsTable)
          .where(eq(documentExtractionRunsTable.documentId, activeDocumentId));
        assert.ok(runAfter, "Historical extraction records remain retained.");
        assert.deepEqual(runAfter.records.map((record: any) => record.id).sort(), sourceRecordIds);
        const [goalAfter] = await db.select().from(rewardTokensTable)
          .where(eq(rewardTokensTable.id, goalBefore.id));
        assert.ok(goalAfter, "The independently stored derived goal remains usable.");
        assert.equal(goalAfter.sourceDocumentId, activeDocumentId);

        const goalsResponse = await fetch(`${apiBase}/reward-tokens?child_id=${encodeURIComponent(childAId)}`, {
          headers: { "x-synthetic-clinician": clinicianAId },
        });
        const goalsBody = await goalsResponse.json() as Array<Record<string, any>>;
        const retainedGoal = goalsBody.find((goal) => goal.id === goalBefore.id);
        assert.equal(goalsResponse.status, 200);
        assert.ok(retainedGoal);
        assert.equal(retainedGoal.sourceStatus ?? retainedGoal.source_status, "unavailable");
        assert.equal(retainedGoal.sourceDocumentId ?? retainedGoal.source_document_id ?? null, null);
        assert.equal(retainedGoal.source, "document", "Upload origin does not imply clinician review or approval.");

        const profileRead = await fetch(`${apiBase}/client-profiles/${(await db.select().from(clientProfilesTable)
          .where(eq(clientProfilesTable.childId, childAId)))[0].id}`, {
          headers: { "x-synthetic-clinician": clinicianAId },
        });
        const profileBody = await profileRead.text();
        assert.equal(profileRead.status, 403);
        assert.doesNotMatch(profileBody, /Kai|homework|break card/i);

        const providerCallsBeforeCachedRead = capturedRequests.length;
        const cachedResponse = await callScan(
          clinicianAId,
          childAId,
          { include_cached_extractions: true, source_document_id: activeDocumentId },
          `ai-deleted-source-cache-${suffix}`,
        );
        const cachedBody = await cachedResponse.text();
        assert.equal(cachedResponse.status, 404);
        assert.doesNotMatch(cachedBody, /Kai|homework|break card/i);
        assert.equal(capturedRequests.length, providerCallsBeforeCachedRead, "Deleted-source retrieval does not call the fake AI.");

        const caregiverPortalAfterDelete = await fetch(`${apiBase}/client-portal-data`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            child_id: childAId,
            invite_token: caregiverSessionToken,
          }),
        });
        const caregiverPortalAfterDeleteBody = await caregiverPortalAfterDelete.json() as Record<string, any>;
        assert.equal(caregiverPortalAfterDelete.status, 200);
        assert.equal(caregiverPortalAfterDeleteBody.profile, null);
        assert.equal(
          (caregiverPortalAfterDeleteBody.documents ?? []).some((document: any) => document.id === activeDocumentId),
          false,
        );
        assert.doesNotMatch(JSON.stringify(caregiverPortalAfterDeleteBody), /multi-step worksheet|break card described in the document/i);
        const [retainedProfile] = await db.select().from(clientProfilesTable)
          .where(eq(clientProfilesTable.childId, childAId));
        assert.ok(retainedProfile, "The clinician profile record remains retained.");
        const parentReadAfterDeleteRequestId = `parent-hidden-profile-after-delete-${suffix}`;
        const parentProfileAfterDelete = await fetch(`${apiBase}/client-profiles/${retainedProfile.id}`, {
          headers: {
            "x-synthetic-parent": caregiverUserId,
            "x-test-request-id": parentReadAfterDeleteRequestId,
          },
        });
        const parentProfileAfterDeleteText = await parentProfileAfterDelete.text();
        assert.equal(parentProfileAfterDelete.status, 403);
        assert.doesNotMatch(parentProfileAfterDeleteText, /Kai|homework|break card/i);
        const parentProfileAfterDeleteAudits = (await db.select().from(auditLogsTable)).filter((row) =>
          (row.metadata as Record<string, unknown> | null)?.request_id === parentReadAfterDeleteRequestId
        );
        assert.equal(parentProfileAfterDeleteAudits.length, 1);
        assert.equal(parentProfileAfterDeleteAudits[0].userId, caregiverUserId);
        assert.equal(parentProfileAfterDeleteAudits[0].userRole, "parent");
        assert.equal(parentProfileAfterDeleteAudits[0].tenantId, tenantId);
        assert.equal(parentProfileAfterDeleteAudits[0].action, "cross_tenant_access_attempt");
        assert.equal(parentProfileAfterDeleteAudits[0].targetType, "client-profiles");
        assert.equal(parentProfileAfterDeleteAudits[0].targetId, retainedProfile.id);
        assert.equal(parentProfileAfterDeleteAudits[0].success, false);
        assert.equal((parentProfileAfterDeleteAudits[0].metadata as Record<string, unknown>)?.operation, "read");
        assert.ok(Number.isFinite(parentProfileAfterDeleteAudits[0].createdDate.getTime()));
        assert.doesNotMatch(JSON.stringify(parentProfileAfterDeleteAudits[0]), /Kai|homework|break card|password|token/i);

        for (const [actor, requestId] of [
          [clinicianBId, `ai-other-clinic-after-delete-${suffix}`],
          [clinicianUnassignedId, `ai-unassigned-after-delete-${suffix}`],
        ] as const) {
          const deniedResponse = await callScan(
            actor,
            childAId,
            { include_cached_extractions: true, source_document_id: activeDocumentId },
            requestId,
          );
          const deniedBody = await deniedResponse.text();
          assert.equal(deniedResponse.status, 403);
          assert.doesNotMatch(deniedBody, /Kai|homework|break card/i);
        }

        const deletionAudit = (await db.select().from(auditLogsTable)).find((row) =>
          row.action === "document_deleted" &&
          row.targetId === activeDocumentId &&
          (row.metadata as Record<string, unknown> | null)?.request_id === deleteRequestId
        );
        assert.ok(deletionAudit);
        assert.equal(deletionAudit.userId, clinicianAId);
        assert.equal(deletionAudit.userRole, "clinician");
        assert.equal(deletionAudit.tenantId, clinicId, "Audit attribution uses the canonical clinic tenant.");
        assert.equal(deletionAudit.success, true);
        assert.ok(Number.isFinite(deletionAudit.createdDate.getTime()));
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

  const retainedProfiles = await db.select({ id: clientProfilesTable.id }).from(clientProfilesTable)
    .where(eq(clientProfilesTable.childId, childAId));
  const auditRows = await db.select().from(auditLogsTable).where(inArray(
    auditLogsTable.targetId,
    [childAId, childBId, familyAId, activeDocumentId, foreignDocumentId, ...retainedProfiles.map((profile) => profile.id)],
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
    model: body.model || null,
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
    ["child", "document"].includes(row.targetType ?? "") &&
    [childAId, activeDocumentId].includes(row.targetId ?? "") &&
    (row.metadata as Record<string, unknown> | null)?.child_id === childAId,
  );
  const deniedAccessAudits = sanitizedAuditRows.filter((row) =>
    row.action === "ai_document_access_denied" &&
    row.success === false,
  );
  const providerCallAudits = sanitizedAuditRows.filter((row) =>
    row.action === "ai_document_provider_call",
  );
  const expectedSuccessfulRequests = new Set([
    `ai-success-${suffix}`,
    `ai-profile-projection-${suffix}`,
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
  assert.equal(
    providerCallAudits.length,
    capturedRequests.length,
    "Every document-AI provider request must have one genuine provider-call audit row.",
  );
  for (const row of providerCallAudits) {
    const metadata = row.metadata as Record<string, unknown>;
    assert.equal(row.actorId, clinicianAId);
    assert.equal(row.actorRole, "clinician");
    assert.equal(row.tenantId, tenantId);
    assert.equal(row.targetType, "child");
    assert.equal(row.targetId, childAId);
    assert.equal(metadata.feature, "document_scan");
    assert.equal(metadata.provider, "anthropic");
    assert.equal(metadata.model, "claude-sonnet-4-5");
    assert.ok(["success", "failed"].includes(String(metadata.outcome)));
    assert.ok(Array.isArray(metadata.source_document_ids));
    assert.ok((metadata.source_document_ids as string[]).includes(activeDocumentId));
    assert.ok(typeof metadata.operation === "string");
    assert.ok(Number.isFinite(Date.parse(row.createdAt)));
  }

  const expectedDenials = new Map([
    [`ai-cross-family-${suffix}`, { actorId: clinicianAId, targetId: childBId }],
    [`ai-cross-clinic-clinician-${suffix}`, { actorId: clinicianBId, targetId: childAId }],
    [`ai-unassigned-clinician-${suffix}`, { actorId: clinicianUnassignedId, targetId: childAId }],
    [`ai-other-clinic-after-delete-${suffix}`, { actorId: clinicianBId, targetId: childAId }],
    [`ai-unassigned-after-delete-${suffix}`, { actorId: clinicianUnassignedId, targetId: childAId }],
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
  const serializedAudit = JSON.stringify(sanitizedAuditRows);
  assert.doesNotMatch(serializedAudit, /token_hash|session_cookie|raw_token/i);
  assert.doesNotMatch(serializedAudit, new RegExp(activeSourceExcerpt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(serializedAudit, /prompt|response_text|document_text|diagnosis/i);
  assert.ok(capturedRequests.length >= 6, "Expected requests to the fake AI provider across success, repeat, and retry");
});
