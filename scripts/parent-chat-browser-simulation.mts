import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";

const databaseUrl = process.env.DATABASE_URL;
const testRoot = process.env.PARENT_CHAT_BROWSER_TEST_ROOT;
const evidenceDir = process.env.PARENT_CHAT_BROWSER_EVIDENCE_DIR;
const expectedCommit = process.env.NP_APP_COMMIT;
const appSourceManifestSha256 = process.env.NP_APP_SOURCE_MANIFEST_SHA256;
const appWorktreeDiffSha256 = process.env.NP_APP_WORKTREE_DIFF_SHA256;
if (!databaseUrl || !testRoot || !evidenceDir || !expectedCommit || !appSourceManifestSha256 || !appWorktreeDiffSha256) {
  throw new Error("Missing isolated browser-test environment.");
}
const parsedDb = new URL(databaseUrl);
if (parsedDb.hostname !== "127.0.0.1" ||
    decodeURIComponent(parsedDb.pathname.slice(1)) !== "np_parent_chat_browser_test") {
  throw new Error("Refusing to run outside the dedicated loopback browser-test database.");
}
if (process.env.REPLIT_CONNECTORS_ENABLED !== "false" ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.ANTHROPIC_API_KEY) {
  throw new Error("Connectors or live service credentials are present in the isolated test process.");
}

type CaseStatus = "PASS" | "FAIL" | "BLOCKED" | "NOT RUN";
const cases: Array<{ name: string; status: CaseStatus; detail?: string }> = [];
const browserErrors: string[] = [];
const providerRequests: Array<{ system: string; content: string; child: "mira" | "noah" | "foreign" | "unknown" }> = [];
const apiRequestSummaries: Array<{ method: string; path: string; status?: number }> = [];
let delayedMiraResponse: (() => void) | null = null;
let delayedMiraReceived = false;
let webServer: http.Server | null = null;
let providerServer: http.Server | null = null;
let viteServer: { middlewares: unknown; close: () => Promise<void> } | null = null;
let browserProcess: ChildProcess | null = null;
let cdp: CdpPage | null = null;
let database: any;
let pool: any;
let parentId = "";
let workspaceId = "";
let childMira = "";
let childNoah = "";
let childForeign = "";
let documentMira = "";
let documentNoah = "";
let browserBase = "";
let providerCallCount = 0;
let parentSessionTokenPresentBeforeRevocation = false;
let seedForEvidence: any;
const scenarioStartedAt = new Date().toISOString();
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiRequire = createRequire(path.join(workspaceRoot, "artifacts/api-server/package.json"));
const webRequire = createRequire(path.join(workspaceRoot, "artifacts/neuropath/package.json"));
const express = apiRequire("express");
const cookieParser = apiRequire("cookie-parser");

const sentinels = {
  miraDocument: "MIRA_PRIVATE_DOCUMENT_SENTINEL",
  noahDocument: "NOAH_PRIVATE_DOCUMENT_SENTINEL",
  foreignDocument: "FOREIGN_FAMILY_DOCUMENT_SENTINEL",
  forgedInstruction: "FORGED_BROWSER_SYSTEM_INSTRUCTION",
  miraReply: "MIRA_CHILD_RESPONSE",
  noahReply: "NOAH_CHILD_RESPONSE",
  lateMiraReply: "MIRA_LATE_RESPONSE",
  mobileReply: "MOBILE_WEB_RESPONSE",
};

function caseResult(name: string, status: CaseStatus, detail?: string) {
  cases.push({ name, status, ...(detail ? { detail } : {}) });
}

async function check(name: string, action: () => Promise<void>) {
  try {
    await action();
    caseResult(name, "PASS");
  } catch (error) {
    const debug = cdp
      ? await cdp.evaluate(`({
          path: location.pathname + location.search,
          selectors: Array.from(document.querySelectorAll('select[data-testid]')).map((el) => ({
            testId: el.getAttribute('data-testid'),
            value: el.value,
            optionValues: Array.from(el.options).map((o) => o.value)
          })),
          chatInput: Boolean(document.querySelector('[data-testid="input-chat"]')),
          bodyTail: document.body.innerText.slice(-280)
        })`).catch(() => null)
      : null;
    if (cdp) await cdp.screenshot(path.join(evidenceDir!, `failed-${cases.length + 1}.png`)).catch(() => {});
    const message = error instanceof Error ? error.message : "Assertion failed.";
    caseResult(name, "FAIL", `${message.slice(0, 260)}${debug ? ` | browser=${JSON.stringify(debug).slice(0, 300)}` : ""}`.slice(0, 600));
  }
}

function listen(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
}

function address(server: http.Server): string {
  const result = server.address();
  if (!result || typeof result === "string") throw new Error("Expected a loopback TCP server.");
  return `http://127.0.0.1:${result.port}`;
}

function portFromUrl(value: string): number {
  const port = Number(new URL(value).port);
  if (!Number.isInteger(port) || port < 1) throw new Error("Invalid isolated server port.");
  return port;
}

function fakeResponse(body: Record<string, any>, requestNumber: number) {
  const content = JSON.stringify(body.messages || []);
  let answer = "A safe first step is to offer one small choice and a brief pause.";
  if (content.includes("DELAY_CHILD_A_RESPONSE")) answer = sentinels.lateMiraReply;
  else if (content.includes("BROWSER_CRISIS_HELP_NOW")) {
    answer = "If someone may be hurt, call 911 or local emergency services. For suicidal thoughts or self-harm risk in the United States, call or text 988.";
  } else if (content.includes("BROWSER_MOBILE_WEB_CHAT")) answer = sentinels.mobileReply;
  else if (content.includes("BROWSER_CHILD_B_CHAT") || content.includes(sentinels.noahDocument)) {
    answer = `Based on Noah Plan: ${sentinels.noahReply}. Offer the yellow visual schedule.`;
  } else if (content.includes("BROWSER_CHILD_A_CHAT") || content.includes(sentinels.miraDocument)) {
    answer = `Based on Mira Plan: ${sentinels.miraReply}. Offer one quiet pause.`;
  }
  return {
    id: `msg-isolated-${requestNumber}`,
    type: "message",
    role: "assistant",
    model: body.model || "claude-sonnet-4-5",
    content: [{ type: "text", text: answer }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 12 },
  };
}

function makeFakeCard(childName: string, documentId: string, marker: string) {
  return {
    id: `card-${documentId}`,
    behaviorKey: "custom",
    customBehavior: "Homework transitions",
    behaviorName: "Homework transitions",
    goal: "Start one short homework task with a clear choice.",
    whatMayBeHappening: `The uploaded plan describes a need for a calmer start. ${marker}`,
    rightNow: ["Offer one homework item and a short pause."],
    avoid: ["Avoid adding several directions at once."],
    prevention: ["Show the next two steps with a simple visual."],
    replacementSkill: "Ask for a short break",
    source: "parent_document",
    sourceDocumentIds: [documentId],
    sourceReferences: [{
      documentId,
      title: `${childName} Plan`,
      excerpt: marker,
    }],
    reviewedBy: null,
    reviewedAt: null,
    dailyActivities: [],
  };
}

async function seedData() {
  database = await import(pathToFileURL(apiRequire.resolve("@workspace/db")).href);
  const { db: testDb, pool: testPool } = database;
  pool = testPool;
  const { hashParentPassword } = await import("../artifacts/api-server/src/lib/parentAuth");
  const { parentAccountsTable, childrenTable, parentChildSettingsTable, documentsTable, parentDocumentsTable } = database;
  const { eq } = apiRequire("drizzle-orm");

  const suffix = crypto.randomUUID();
  parentId = `fictional-browser-parent-${suffix}`;
  workspaceId = `fictional-browser-workspace-${suffix}`;
  childMira = crypto.randomUUID();
  childNoah = crypto.randomUUID();
  childForeign = crypto.randomUUID();
  documentMira = crypto.randomUUID();
  documentNoah = crypto.randomUUID();
  const foreignParentId = `fictional-foreign-parent-${suffix}`;
  const foreignWorkspaceId = `fictional-foreign-workspace-${suffix}`;

  await testDb.insert(parentAccountsTable).values([
    {
      id: parentId,
      email: `mira.parent.${suffix}@example.test`,
      firstName: "Fictional Caregiver",
      workspaceId,
      passwordHash: await hashParentPassword("Fictional-Password-842!"),
    },
    {
      id: foreignParentId,
      email: `other.family.${suffix}@example.test`,
      firstName: "Other Fictional Caregiver",
      workspaceId: foreignWorkspaceId,
      passwordHash: await hashParentPassword("Fictional-Password-943!"),
    },
  ]);
  await testDb.insert(childrenTable).values([
    {
      id: childMira,
      parentId,
      tenantId: workspaceId,
      childName: "Mira Fictional",
      accountType: "parent",
      status: "active",
      age: 10,
    },
    {
      id: childNoah,
      parentId,
      tenantId: workspaceId,
      childName: "Noah Fictional",
      accountType: "parent",
      status: "active",
      age: 12,
    },
    {
      id: childForeign,
      parentId: foreignParentId,
      tenantId: foreignWorkspaceId,
      childName: "Unaffiliated Fictional Child",
      accountType: "parent",
      status: "active",
      age: 9,
    },
  ]);
  const cardMira = makeFakeCard("Mira", documentMira, sentinels.miraDocument);
  const cardNoah = makeFakeCard("Noah", documentNoah, sentinels.noahDocument);
  await testDb.insert(parentChildSettingsTable).values([
    {
      childId: childMira,
      parentId,
      workspaceId,
      behaviors: [{
        behaviorKey: "custom",
        customBehavior: "Homework transitions",
        behaviorName: "Homework transitions",
        goal: "Start one short task.",
      }],
      supportCards: [cardMira],
    },
    {
      childId: childNoah,
      parentId,
      workspaceId,
      behaviors: [{
        behaviorKey: "custom",
        customBehavior: "Homework transitions",
        behaviorName: "Homework transitions",
        goal: "Start one short task.",
      }],
      supportCards: [cardNoah],
    },
    {
      childId: childForeign,
      parentId: foreignParentId,
      workspaceId: foreignWorkspaceId,
      behaviors: [{
        behaviorKey: "custom",
        customBehavior: "Homework transitions",
        behaviorName: "Homework transitions",
        goal: "Start one short task.",
      }],
      supportCards: [],
    },
  ]);
  await testDb.insert(documentsTable).values([
    {
      id: documentMira,
      tenantId: workspaceId,
      parentId,
      childId: childMira,
      title: "Mira Plan",
      fileName: "mira-plan.txt",
      fileUrl: "isolated-fake://mira-plan",
      scanStatus: "done",
      uploadedBy: `parent:${parentId}`,
      accessRoles: "parent",
    },
    {
      id: documentNoah,
      tenantId: workspaceId,
      parentId,
      childId: childNoah,
      title: "Noah Plan",
      fileName: "noah-plan.txt",
      fileUrl: "isolated-fake://noah-plan",
      scanStatus: "done",
      uploadedBy: `parent:${parentId}`,
      accessRoles: "parent",
    },
    {
      id: crypto.randomUUID(),
      tenantId: foreignWorkspaceId,
      parentId: foreignParentId,
      childId: childForeign,
      title: "Foreign Plan",
      fileName: "foreign-plan.txt",
      fileUrl: "isolated-fake://foreign-plan",
      scanStatus: "done",
      uploadedBy: `parent:${foreignParentId}`,
      accessRoles: "parent",
    },
  ]);
  await testDb.insert(parentDocumentsTable).values([
    {
      documentId: documentMira,
      parentId,
      childId: childMira,
      workspaceId,
      storagePath: `np-parent-chat-browser/fixture/parent-documents/${documentMira}.enc`,
      mimeType: "text/plain",
      sha256: crypto.createHash("sha256").update("synthetic-mira-plan").digest("hex"),
      extractedSupport: { cards: [cardMira], complete: true },
    },
    {
      documentId: documentNoah,
      parentId,
      childId: childNoah,
      workspaceId,
      storagePath: `np-parent-chat-browser/fixture/parent-documents/${documentNoah}.enc`,
      mimeType: "text/plain",
      sha256: crypto.createHash("sha256").update("synthetic-noah-plan").digest("hex"),
      extractedSupport: { cards: [cardNoah], complete: true },
    },
  ]);
  return {
    db: testDb,
    parentAccountsTable,
    parentSessionsTable: database.parentSessionsTable,
    auditLogsTable: database.auditLogsTable,
    eq,
    hashParentSessionToken: (await import("../artifacts/api-server/src/lib/parentAuth")).hashParentSessionToken,
  };
}

class CdpPage {
  private nextId = 0;
  private socket: WebSocket;
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();

  constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      const data = JSON.parse(String(event.data));
      if (typeof data.id !== "number") return;
      const waiter = this.pending.get(data.id);
      if (!waiter) return;
      this.pending.delete(data.id);
      if (data.error) waiter.reject(new Error(String(data.error.message || "CDP command failed")));
      else waiter.resolve(data.result);
    });
  }

  static async connect(debugPort: number): Promise<CdpPage> {
    const targetResponse = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: "PUT" });
    if (!targetResponse.ok) throw new Error(`Could not create isolated Chromium target: ${targetResponse.status}`);
    const target = await targetResponse.json() as { webSocketDebuggerUrl: string };
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error("Could not connect to isolated Chromium.")), { once: true });
    });
    const page = new CdpPage(socket);
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    return page;
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate<T = any>(expression: string): Promise<T> {
    const response = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (response.exceptionDetails) {
      throw new Error(String(response.exceptionDetails.text || "Browser script failed."));
    }
    return response.result?.value as T;
  }

  async navigate(url: string) {
    await this.send("Page.navigate", { url });
  }

  async screenshot(filePath: string) {
    const result = await this.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    await fs.writeFile(filePath, Buffer.from(result.data, "base64"), { mode: 0o600 });
  }

  close() {
    try { this.socket.close(); } catch {}
  }
}

async function waitFor<T>(read: () => Promise<T>, predicate: (value: T) => boolean, message: string, timeoutMs = 12_000) {
  const end = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < end) {
    try {
      const value = await read();
      if (predicate(value)) return value;
      last = value;
    } catch (error) {
      last = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message + (last instanceof Error ? ` (${last.message})` : ""));
}

async function setInput(selector: string, value: string) {
  return cdp!.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return false;
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set;
    setter?.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return element.value === ${JSON.stringify(value)};
  })()`);
}

async function selectChild(selector: string, childId: string) {
  const success = await cdp!.evaluate(`(() => {
    const element = Array.from(document.querySelectorAll(${JSON.stringify(selector)}))
      .find((candidate) => candidate.getClientRects().length > 0);
    if (!element) return false;
    if (!Array.from(element.options).some((option) => option.value === ${JSON.stringify(childId)})) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    setter?.call(element, ${JSON.stringify(childId)});
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
  assert.equal(success, true, `Expected the visible child selector ${selector}.`);
}

async function openChat(tabSelector = '[data-testid="nav-ask-desktop"]') {
  await cdp!.evaluate(`document.querySelector(${JSON.stringify(tabSelector)})?.click()`);
  await waitFor(() => cdp!.evaluate(`Boolean(document.querySelector('[data-testid="input-chat"]'))`), Boolean, "Chat view did not open.");
}

async function sendChat(message: string, expected: string, timeoutMs = 15_000) {
  assert.equal(await setInput('[data-testid="input-chat"]', message), true, "Chat input was not available.");
  await cdp!.evaluate(`document.querySelector('[data-testid="button-send-chat"]')?.click()`);
  try {
    return await waitFor(
      () => cdp!.evaluate(`document.body.innerText`),
      (text) => typeof text === "string" && text.includes(expected),
      `Chat did not show the expected synthetic response: ${expected}`,
      timeoutMs,
    );
  } catch (error) {
    const name = message.includes("MOBILE") ? "mobile-chat-failure.png" : "chat-failure.png";
    await cdp!.screenshot(path.join(evidenceDir!, name)).catch(() => {});
    const visibleText = await cdp!.evaluate<string>(`document.body.innerText`).catch(() => "");
    throw new Error(`${error instanceof Error ? error.message : "Chat failed."}; visible=${visibleText.slice(-700)}`);
  }
}

async function takeAuditEvidence(seed: Awaited<ReturnType<typeof seedData>>) {
  const rows = await seed.db.select().from(seed.auditLogsTable);
  const scopedRows = rows.filter((row: any) =>
    [childMira, childNoah, childForeign].includes(row.targetId),
  ).map((row: any) => ({
    id: row.id,
    createdAt: row.createdDate instanceof Date ? row.createdDate.toISOString() : String(row.createdDate),
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
  await fs.writeFile(
    path.join(evidenceDir!, "genuine-browser-audit-events.json"),
    `${JSON.stringify(scopedRows, null, 2)}\n`,
    { mode: 0o600 },
  );
  const json = JSON.stringify(scopedRows);
  assert.doesNotMatch(json, new RegExp(sentinels.miraDocument));
  assert.doesNotMatch(json, new RegExp(sentinels.noahDocument));
  assert.doesNotMatch(json, /prompt|response_text|raw_token|session_cookie|password|authorization/i);
  return scopedRows;
}

async function run() {
  await fs.mkdir(evidenceDir!, { recursive: true, mode: 0o700 });
  database = await import(pathToFileURL(apiRequire.resolve("@workspace/db")).href);
  pool = database.pool;
  const dbState = await poolQuery("select current_database() as name, host(inet_server_addr()) as host");
  assert.equal(dbState.name, "np_parent_chat_browser_test");
  assert.ok(["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(dbState.host));
  assert.equal(process.env.REPLIT_CONNECTORS_ENABLED, "false");

  const storageImportPath = apiRequire.resolve("@google-cloud/storage")
    .replace("/build/cjs/src/index.js", "/build/esm/src/index.js");
  const { Storage } = await import(pathToFileURL(storageImportPath).href);
  (Storage.prototype as any).bucket = function isolatedFakeBucket() {
    return {
      file() {
        return {
          async download() { throw new Error("Synthetic isolated file is intentionally unavailable."); },
          async save() { return undefined; },
          async delete() { return [{ deleted: true }]; },
          async exists() { return [false]; },
        };
      },
    };
  };

  const fakeProvider = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", async () => {
      let body: Record<string, any> = {};
      try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch {}
      const serialized = JSON.stringify(body.messages || []);
      const classification = serialized.includes(sentinels.miraDocument)
        ? "mira" as const
        : serialized.includes(sentinels.noahDocument)
          ? "noah" as const
          : serialized.includes(sentinels.foreignDocument)
            ? "foreign" as const
            : "unknown" as const;
      providerRequests.push({
        system: typeof body.system === "string" ? body.system : "",
        content: serialized,
        child: classification,
      });
      providerCallCount += 1;
      const requestNumber = providerCallCount;
      const reply = fakeResponse(body, requestNumber);
      if (serialized.includes("DELAY_CHILD_A_RESPONSE")) {
        delayedMiraReceived = true;
        await new Promise<void>((resolve) => { delayedMiraResponse = resolve; });
      }
      if (response.destroyed || response.writableEnded) return;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(reply));
    });
  });
  providerServer = fakeProvider;
  await listen(providerServer);
  const providerUrl = address(providerServer);
  process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY = "isolated-fake-provider-credential";
  process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL = providerUrl;

  seedForEvidence = await seedData();
  const db = seedForEvidence.db;
  const seed = seedForEvidence;
  const { default: parentRouter } = await import("../artifacts/api-server/src/routes/parent");
  const { default: parentDocumentsRouter } = await import("../artifacts/api-server/src/routes/parent-documents");
  const { default: careTeamRouter } = await import("../artifacts/api-server/src/routes/care-team");
  const { createServer: createViteServer } = await import(pathToFileURL(webRequire.resolve("vite")).href);
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());
  app.use((req: any, _res, next) => {
    req.id = `parent-browser-${crypto.randomUUID()}`;
    req.log = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
    req.isAuthenticated = () => false;
    _res.on("finish", () => {
      const requestPath = String(req.originalUrl || "");
      if (requestPath.startsWith("/api/")) apiRequestSummaries.push({
        method: req.method,
        path: requestPath.split("?")[0].replace(/[0-9a-f-]{36}/gi, "[id]"),
        status: _res.statusCode,
      });
    });
    next();
  });
  app.use("/api", parentRouter);
  app.use("/api", parentDocumentsRouter);
  app.use("/api", careTeamRouter);
  viteServer = await createViteServer({
    configFile: path.join(workspaceRoot, "artifacts/neuropath/vite.config.ts"),
    server: { middlewareMode: true, hmr: false, watch: { usePolling: false } },
    appType: "spa",
  });
  app.use(viteServer.middlewares as any);
  webServer = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    webServer!.once("listening", () => resolve());
    webServer!.once("error", reject);
  });
  browserBase = address(webServer);

  const debugPort = portFromUrl(await (async () => {
    const holder = http.createServer();
    await listen(holder);
    const value = address(holder);
    await new Promise<void>((resolve) => holder.close(() => resolve()));
    return value;
  })());
  const chromium = process.env.CHROMIUM_BINARY || "/repl/tools/bin/chromium";
  browserProcess = spawn(chromium, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-background-networking",
    "--disable-sync",
    "--disable-component-update",
    "--disable-default-apps",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-features=OptimizationHints,MediaRouter",
    "--proxy-server=direct://",
    "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1",
    "--remote-allow-origins=*",
    `--remote-debugging-address=127.0.0.1`,
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${path.join(testRoot!, "chromium-profile")}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"], env: { ...process.env }, detached: true });
  browserProcess.stderr?.on("data", (chunk) => {
    const line = String(chunk);
    browserErrors.push(line.slice(0, 180).replace(/[\r\n]+/g, " "));
  });
  browserProcess.on("error", (error) => browserErrors.push(`spawn-error: ${error.message}`));
  browserProcess.on("exit", (code, signal) => browserErrors.push(`exit: code=${code} signal=${signal}`));
  cdp = await waitFor(
    () => CdpPage.connect(debugPort),
    (value) => Boolean(value),
    "Isolated headless Chromium did not start.",
    15_000,
  );
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false,
  });

  await check("Parent login uses the actual web login form and opens a two-child session", async () => {
    await cdp!.navigate(`${browserBase}/ParentLogin`);
    await waitFor(() => cdp!.evaluate(`Boolean(document.querySelector('[data-testid="input-email"]'))`), Boolean, "Parent login form did not load.");
    const row = await db.select().from(seed.parentAccountsTable).where(apiRequire("drizzle-orm").eq(seed.parentAccountsTable.id, parentId));
    assert.equal(row.length, 1);
    assert.equal(await setInput('[data-testid="input-email"]', row[0].email), true);
    assert.equal(await setInput('[data-testid="input-password"]', "Fictional-Password-842!"), true);
    await cdp!.evaluate(`document.querySelector('[data-testid="button-submit"]')?.click()`);
    try {
      await waitFor(() => cdp!.evaluate(`Boolean(document.querySelector('[data-testid="select-navigation-child-desktop"]'))`), Boolean, "Signed-in parent dashboard did not load.");
    } catch {
      await cdp!.screenshot(path.join(evidenceDir!, "login-failure-debug.png"));
      const debug = await cdp!.evaluate(`({ path: location.pathname, text: document.body.innerText.slice(0, 700), tokenSaved: Boolean(localStorage.getItem("np_parent_token")) })`);
      throw new Error(`Signed-in parent dashboard did not load: ${JSON.stringify(debug)}`);
    }
    const state = await cdp!.evaluate(`({
      path: location.pathname,
      selected: document.querySelector('[data-testid="select-navigation-child-desktop"]')?.value,
      options: Array.from(document.querySelector('[data-testid="select-navigation-child-desktop"]')?.options || []).map(o => o.textContent)
    })`);
    assert.equal(state.path, "/ParentHome");
    assert.equal(state.options.filter((name: string) => /Mira Fictional|Noah Fictional/.test(name)).length, 2);
    assert.ok(state.options.some((name: string) => name.includes("Mira Fictional")));
    assert.ok(state.options.some((name: string) => name.includes("Noah Fictional")));
    // Close the intentional parent login support pop-up through its existing dismissal.
    await cdp!.evaluate(`(() => {
      const button = Array.from(document.querySelectorAll('button')).find((item) => item.innerText.includes("I'm Okay"));
      button?.click();
      return true;
    })()`);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const token = await cdp!.evaluate<string | null>(`localStorage.getItem("np_parent_token")`);
    assert.equal(typeof token, "string");
    parentSessionTokenPresentBeforeRevocation = typeof token === "string" && token.length > 0;
    // Keep only the in-memory token so the disposable database session can be revoked later.
    currentParentToken = token!;
  });

  await check("Desktop AI chat uses the parent-specific server route and only Mira's source", async () => {
    await selectChild('[data-testid="select-navigation-child-desktop"]', childMira);
    await waitFor(() => cdp!.evaluate(`document.querySelector('[data-testid="select-navigation-child-desktop"]')?.value`), (value) => value === childMira, "Mira was not selected.");
    await cdp!.evaluate(`document.querySelector('[data-testid="nav-ask-desktop"]')?.click()`);
    await waitFor(() => cdp!.evaluate(`Boolean(document.querySelector('[data-testid="input-chat"]'))`), Boolean, "Desktop AI chat did not open.");
    const before = providerCallCount;
    const text = await sendChat("BROWSER_CHILD_A_CHAT What is one safe first homework step?", sentinels.miraReply);
    assert.match(text, /This answer is based on starter support or your uploaded information/i);
    assert.equal(providerCallCount, before + 1);
    const request = providerRequests.at(-1)!;
    assert.equal(request.child, "mira");
    assert.match(request.system, /untrusted data/i);
    assert.match(request.system, /911/);
    assert.match(request.system, /988/);
    assert.match(request.content, new RegExp(sentinels.miraDocument));
    assert.doesNotMatch(request.content, new RegExp(sentinels.noahDocument));
    assert.doesNotMatch(request.content, new RegExp(sentinels.forgedInstruction));
    assert.ok(text.includes("Mira Fictional"));
    await cdp!.screenshot(path.join(evidenceDir!, "desktop-chat-mira.png"));
  });

  await check("Switching children clears prior chat and scopes the next document context", async () => {
    assert.equal(await setInput('[data-testid="input-chat"]', "DELAY_CHILD_A_RESPONSE"), true);
    await cdp!.evaluate(`document.querySelector('[data-testid="button-send-chat"]')?.click()`);
    await waitFor(() => Promise.resolve(delayedMiraReceived), Boolean, "The fake provider did not receive the in-flight child-A request.");
    assert.equal(delayedMiraReceived, true, "The fake provider did not receive the in-flight child-A request.");
    await selectChild('[data-testid="select-navigation-child-desktop"]', childNoah);
    await waitFor(
      () => cdp!.evaluate(`document.body.innerText`),
      (text) => String(text).includes("Ask about Noah Fictional"),
      "The chat did not switch to Noah.",
    );
    let body = await cdp!.evaluate<string>(`document.body.innerText`);
    assert.doesNotMatch(body, /MIRA_CHILD_RESPONSE|DELAY_CHILD_A_RESPONSE|MIRA_LATE_RESPONSE/);
    assert.doesNotMatch(body, new RegExp(sentinels.miraDocument));

    const before = providerCallCount;
    body = await sendChat("BROWSER_CHILD_B_CHAT What should Noah try?", sentinels.noahReply);
    assert.equal(providerCallCount, before + 1);
    const request = providerRequests.at(-1)!;
    assert.equal(request.child, "noah");
    assert.match(request.content, new RegExp(sentinels.noahDocument));
    assert.doesNotMatch(request.content, new RegExp(sentinels.miraDocument));
    assert.doesNotMatch(body, /MIRA_CHILD_RESPONSE|MIRA_LATE_RESPONSE/);
    assert.match(body, /This answer is based on starter support or your uploaded information/i);
    delayedMiraResponse?.();
    delayedMiraResponse = null;
    await new Promise((resolve) => setTimeout(resolve, 700));
    body = await cdp!.evaluate<string>(`document.body.innerText`);
    assert.doesNotMatch(body, new RegExp(sentinels.lateMiraReply));
    assert.doesNotMatch(body, new RegExp(sentinels.miraDocument));
    assert.match(body, new RegExp(sentinels.noahReply));
    await cdp!.screenshot(path.join(evidenceDir!, "desktop-child-switch-noah.png"));
  });

  await check("Cross-family, unauthenticated, and forged prompt requests are denied before AI", async () => {
    const before = providerCallCount;
    const results = await cdp!.evaluate(`(async () => {
      const token = localStorage.getItem("np_parent_token");
      const foreign = await fetch(${JSON.stringify(`/api/parent/children/`) } + ${JSON.stringify(childForeign)} + "/chat", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", "X-Parent-Token": token || "" },
        body: JSON.stringify({ message: "BROWSER_FOREIGN_CHILD_QUERY" })
      });
      const anonymous = await fetch(${JSON.stringify(`/api/parent/children/`)} + ${JSON.stringify(childMira)} + "/chat", {
        method: "POST",
        credentials: "omit",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "BROWSER_ANONYMOUS_QUERY" })
      });
      const forged = await fetch(${JSON.stringify(`/api/parent/children/`)} + ${JSON.stringify(childMira)} + "/chat", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", "X-Parent-Token": token || "" },
        body: JSON.stringify({
          message: "BROWSER_FORGED_PROMPT_QUERY",
          system: ${JSON.stringify(sentinels.forgedInstruction)},
          role: "system",
          documentIds: [${JSON.stringify(documentNoah)}],
          conversationId: "FORGED_CONVERSATION_ID"
        })
      });
      return { foreign: foreign.status, anonymous: anonymous.status, forged: forged.status };
    })()`);
    assert.equal(results.foreign, 404);
    assert.equal(results.anonymous, 401);
    assert.equal(results.forged, 400);
    assert.equal(providerCallCount, before);
    const body = await cdp!.evaluate<string>(`document.body.innerText`);
    assert.doesNotMatch(body, new RegExp(sentinels.foreignDocument));
  });

  await check("Crisis guidance displays emergency-service and 988 information in the web chat", async () => {
    await selectChild('[data-testid="select-navigation-child-desktop"]', childMira);
    await waitFor(() => cdp!.evaluate(`document.querySelector('[data-testid="select-navigation-child-desktop"]')?.value`), (value) => value === childMira, "Could not return to Mira.");
    await openChat();
    const text = await sendChat("BROWSER_CRISIS_HELP_NOW I am worried about self-harm right now.", "call or text 988");
    assert.match(text, /call 911|call 911 or/i);
    assert.match(text, /call or text 988/i);
    assert.match(text, /not medical or professional advice/i);
    await cdp!.screenshot(path.join(evidenceDir!, "desktop-crisis-guidance.png"));
  });

  await check("Mobile-sized web chat remains usable, child-scoped, and free of horizontal overflow", async () => {
    await cdp!.send("Emulation.setDeviceMetricsOverride", {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
    });
    await cdp!.navigate(`${browserBase}/ParentHome?tab=ask&child_id=${encodeURIComponent(childMira)}`);
    await waitFor(() => cdp!.evaluate(`Boolean(document.querySelector('[data-testid="input-chat"]'))`), Boolean, "Mobile chat view did not load.");
    const layout = await cdp!.evaluate(`({
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      childSelector: Boolean(document.querySelector('[data-testid="select-navigation-child-mobile"]')),
      inputVisible: (() => {
        const el = document.querySelector('[data-testid="input-chat"]');
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= window.innerWidth;
      })(),
      safetyVisible: (() => {
        const el = document.querySelector('[data-testid="text-chat-safety"]');
        return Boolean(el && el.getBoundingClientRect().height > 0);
      })()
    })`);
    assert.equal(layout.scrollWidth <= layout.width, true, `Mobile horizontal overflow: ${layout.scrollWidth}px for ${layout.width}px viewport.`);
    assert.equal(layout.childSelector, true);
    assert.equal(layout.inputVisible, true);
    assert.equal(layout.safetyVisible, true);
    const mobileText = await sendChat("BROWSER_MOBILE_WEB_CHAT", sentinels.mobileReply);
    assert.match(mobileText, /911/);
    await cdp!.screenshot(path.join(evidenceDir!, "mobile-chat-390x844.png"));
  });

  await check("Revoked existing parent session blocks later parent-specific chat without an AI call", async () => {
    const before = providerCallCount;
    const tokenHash = seed.hashParentSessionToken(currentParentToken);
    await db.delete(seed.parentSessionsTable).where(seed.eq(seed.parentSessionsTable.tokenHash, tokenHash));
    const status = await cdp!.evaluate(`(async () => {
      const response = await fetch(${JSON.stringify(`/api/parent/children/${childMira}/chat`)}, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", "X-Parent-Token": localStorage.getItem("np_parent_token") || "" },
        body: JSON.stringify({ message: "BROWSER_REVOKED_SESSION_QUERY" })
      });
      return response.status;
    })()`);
    assert.equal(status, 401);
    assert.equal(providerCallCount, before);
    await cdp!.navigate(`${browserBase}/ParentHome?tab=ask&child_id=${encodeURIComponent(childMira)}`);
    await waitFor(() => cdp!.evaluate(`location.pathname`), (value) => value === "/ParentLogin", "Revoked browser session did not return to sign-in.");
  });

  await check("Actual parent-specific chat route writes scoped, sanitized audit evidence", async () => {
    assert.ok(providerRequests.length >= 5);
    assert.ok(providerRequests.every((request) => /untrusted data/i.test(request.system)));
    assert.ok(providerRequests.every((request) => /911/.test(request.system) && /988/.test(request.system)));
    assert.ok(providerRequests.some((request) => request.child === "mira"));
    assert.ok(providerRequests.some((request) => request.child === "noah"));
    assert.ok(providerRequests.every((request) => !request.content.includes(sentinels.forgedInstruction)));
    const rows = await takeAuditEvidence(seed);
    const chatRows = rows.filter((row: any) => row.action === "ai_parent_support_chat");
    assert.ok(chatRows.length >= 4);
    for (const row of chatRows) {
      assert.equal(row.actorId, parentId);
      assert.equal(row.actorRole, "parent");
      assert.equal(row.tenantId, workspaceId);
      assert.equal(row.targetType, "child");
      assert.ok([childMira, childNoah].includes(row.targetId));
      const metadata = row.metadata as Record<string, unknown>;
      assert.equal(metadata.feature, "chat");
      assert.equal(metadata.provider, "anthropic");
      assert.equal(metadata.model, "claude-sonnet-4-5");
      assert.ok(["success", "safety_fallback", "service_fallback"].includes(String(metadata.outcome)));
      assert.ok(Array.isArray(metadata.source_document_ids));
      assert.ok(Number.isFinite(Date.parse(row.createdAt)));
    }
    const denialRows = rows.filter((row: any) =>
      row.action === "ai_parent_support_access_denied" ||
      row.action === "ai_parent_support_input_rejected",
    );
    assert.ok(denialRows.some((row: any) => row.targetId === childForeign && row.success === false));
    assert.ok(denialRows.some((row: any) => row.targetId === childMira && row.success === false));
  });

  await fs.writeFile(path.join(evidenceDir!, "fake-ai-request-summaries.json"), `${JSON.stringify(
    providerRequests.map((request, index) => ({
      index: index + 1,
      childContext: request.child,
      serverInstructionsPresent: /untrusted data/i.test(request.system),
      safetyNumbersPresent: /911/.test(request.system) && /988/.test(request.system),
      miraDocumentContextPresent: request.content.includes(sentinels.miraDocument),
      noahDocumentContextPresent: request.content.includes(sentinels.noahDocument),
      forgedInstructionPresent: request.content.includes(sentinels.forgedInstruction),
    })),
    null,
    2,
  )}\n`, { mode: 0o600 });
  const browserStderrCategories = [...new Set(browserErrors.map((line) => {
    if (/DevTools listening/.test(line)) return "devtools-ready";
    if (/dbus/.test(line)) return "headless-dbus-unavailable";
    if (/spawn-error/.test(line)) return "browser-spawn-error";
    if (/exit:/.test(line)) return "browser-exit";
    return "other-stderr";
  }))];
  await fs.writeFile(path.join(evidenceDir!, "browser-runtime-diagnostics.json"), `${JSON.stringify({
    browserStderrMessageCount: browserErrors.length,
    browserStderrCategories,
    rawBrowserStderrStored: false,
  }, null, 2)}\n`, { mode: 0o600 });
  await fs.writeFile(path.join(evidenceDir!, "browser-api-request-summary.json"), `${JSON.stringify(apiRequestSummaries, null, 2)}\n`, { mode: 0o600 });
}

let currentParentToken = "";
async function poolQuery(query: string) {
  const client = await pool.connect();
  try {
    const result = await client.query(query);
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function cleanup() {
  try { delayedMiraResponse?.(); } catch {}
  try { cdp?.close(); } catch {}
  if (browserProcess && !browserProcess.killed) {
    try { process.kill(-browserProcess.pid!, "SIGTERM"); } catch { browserProcess.kill("SIGTERM"); }
    await new Promise((resolve) => setTimeout(resolve, 250));
    try { process.kill(-browserProcess.pid!, "SIGKILL"); } catch {}
  }
  if (webServer?.listening) await new Promise<void>((resolve) => webServer!.close(() => resolve()));
  if (providerServer?.listening) await new Promise<void>((resolve) => providerServer!.close(() => resolve()));
  if (viteServer) await viteServer.close().catch(() => {});
  if (pool) await pool.end().catch(() => {});
}

try {
  await run();
} catch (error) {
  const reason = error instanceof Error ? error.message : "Harness failed.";
  caseResult(
    "Harness setup or teardown",
    "FAIL",
    `${reason}${browserErrors.length ? ` | Chromium: ${browserErrors.slice(-5).join(" ").slice(0, 240)}` : ""}`.slice(0, 300),
  );
} finally {
  try {
    if (seedForEvidence && !cases.some((item) => item.name === "Actual parent-specific chat route writes scoped, sanitized audit evidence")) {
      const fallback = await takeAuditEvidence(seedForEvidence).catch(() => null);
      void fallback;
    }
  } catch {}
  await cleanup();
  const counts = Object.fromEntries(["PASS", "FAIL", "BLOCKED", "NOT RUN"].map((status) => [
    status.toLowerCase().replace(" ", "_"),
    cases.filter((item) => item.status === status).length,
  ]));
  await fs.writeFile(path.join(evidenceDir!, "browser-results.json"), `${JSON.stringify({
    startedAt: scenarioStartedAt,
    finishedAt: new Date().toISOString(),
    testedCommit: expectedCommit,
    appSourceManifestSha256,
    appWorktreeDiffSha256,
    testDatabase: "np_parent_chat_browser_test",
    browser: "Chromium headless via DevTools Protocol",
    testServices: { ai: "fake Anthropic-compatible loopback server", storage: "fake Google Storage prototype" },
    outboundNetwork: "Node loopback guard enabled; Chromium DNS restricted to loopback endpoints.",
    liveAiOrStorageUsed: false,
    connectorsEnabled: false,
    nativeMobileTested: false,
    parentSessionTokenPresentBeforeRevocation,
    counts,
    cases,
    providerCallCount,
    parentSpecificRoute: "/api/parent/children/:childId/chat",
  }, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ counts, cases }, null, 2));
  if (cases.some((item) => item.status === "FAIL")) process.exitCode = 1;
}
