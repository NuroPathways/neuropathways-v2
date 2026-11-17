import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import type { AddressInfo } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { and, desc, eq } from "drizzle-orm";
import {
  auditLogsTable,
  childrenTable,
  clinicInvitationsTable,
  clinicMembershipsTable,
  clinicsTable,
  clinicRequestsTable,
  clinicalAssignmentsTable,
  clinicianCredentialsTable,
  db,
  pool,
  parentAccountsTable,
  parentClinicInvitesTable,
  platformAdministratorGrantsTable,
  usersTable,
  userProfilesTable,
} from "../../artifacts/api-server/node_modules/@workspace/db/src/index.ts";
import { and, desc, eq, sql } from "../../artifacts/api-server/node_modules/drizzle-orm/index.js";
import { createClinicianPasswordHash } from "../../artifacts/api-server/src/lib/clinicianPassword.js";
import { hashClinicInvitationToken } from "../../artifacts/api-server/src/lib/clinicInvitationSecurity.js";
import { clinicalRecordClinicId } from "../../artifacts/api-server/src/lib/clinicAuthorization.js";

type Check = { name: string; status: "PASS" | "FAIL" | "NOT_RUN"; method: "browser" | "signed-in browser" | "isolated setup"; detail?: string };
type TestMail = { to: string; text: string; receivedAt: string; token: string };

const root = path.resolve(process.cwd(), "../..");
const evidenceDir = process.env.NP_TEST_BROWSER_EVIDENCE_DIR;
const expectedDb = process.env.NP_TEST_BROWSER_EXPECTED_DATABASE;
const dbUrl = new URL(process.env.DATABASE_URL || "http://invalid");
const webUrl = process.env.NP_TEST_WEB_URL;
const apiPort = Number(process.env.NP_TEST_API_PORT);
const webPort = Number(process.env.PORT);
const cdpPort = Number(process.env.NP_CDP_PORT);
const chromiumPath = process.env.CHROMIUM_PATH;
const storageRoot = process.env.NP_TEST_STORAGE_ROOT;
const checks: Check[] = [];
const plannedBrowserChecks = [
  "Public landing page links each role to its existing sign-in or request flow",
  "Signed-out visitors cannot retrieve local invitation links",
  "Independent caregiver signup creates a usable account without clinic membership",
  "Public clinic request creates only a pending request in the real application",
  "Platform operator signs in through the real clinician login form",
  "Platform administrator reviews and approves a pending request through the actual UI",
  "Platform UI creates a clinic and captures the first-admin invite locally",
  "Wrong-email invite registration does not grant clinic membership",
  "Platform admin can reissue the first-admin invite; current invite activates the real account",
  "Clinic administrator invites and activates two treating clinicians without role editing",
  "Treating clinician invites a fictional family through the browser",
  "Caregiver accepts the invite and chooses clinic sharing in the actual parent flow",
  "Clinic administrator assigns the client and the browser reflects the assignment",
  "Assignment changes take effect for an existing clinician session",
  "New assignee can access the client through a signed-in browser session",
  "Clinic administrator removes active clinician access and revokes its existing session",
  "A clinic-admin login intent cannot elevate an existing clinician",
  "A user with two legitimate memberships sees only those workspaces and can switch",
  "Responsive clinic-admin page renders at phone width without horizontal overflow",
];
const mailMessages: TestMail[] = [];
const serviceChildren: ChildProcess[] = [];
const browserInstances: Array<{ close: () => Promise<void> }> = [];
let sink: http.Server | undefined;
let staticWebServer: http.Server | undefined;
const staticRequestLog: Array<{ path: string; status?: number; bytes?: number }> = [];
let nextBrowserProfile = 0;
let currentBrowser: Browser | undefined;

function requireIsolatedEnvironment() {
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.REPLIT_CONNECTORS_ENABLED !== "false" ||
    expectedDb !== "np_clinic_onboarding_browser_test" ||
    dbUrl.hostname !== "127.0.0.1" ||
    dbUrl.pathname !== `/${expectedDb}` ||
    !evidenceDir ||
    !webUrl ||
    !Number.isInteger(apiPort) ||
    !Number.isInteger(webPort) ||
    !Number.isInteger(cdpPort) ||
    !chromiumPath ||
    !storageRoot ||
    !process.env.FILE_ENCRYPTION_KEY
  ) {
    throw new Error("Browser acceptance refused: exact loopback DB, disabled connectors, local storage and isolated browser settings are required.");
  }
}

function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (typeof value === "string") return scrubText(value);
  if (value instanceof Date) return value.toISOString();
  if (!value || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (/token|password|secret|credential|authorization|cookie|document.?text|prompt|response.?body/i.test(key)) continue;
    result[key] = scrub(item);
  }
  return result;
}

async function saveJson(name: string, data: unknown) {
  await fs.writeFile(path.join(evidenceDir!, name), `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
}

function scrubText(value: string) {
  return value
    .replace(/([?&](?:invite|token)=)[A-Za-z0-9._~-]+/gi, "$1[redacted]")
    .replace(/(ClinicInvitation#token=)[A-Za-z0-9._~-]+/gi, "$1[redacted]");
}

async function recordCheck(name: string, method: Check["method"], action: () => Promise<string | void>) {
  try {
    const detail = await action();
    checks.push({ name, status: "PASS", method, ...(detail ? { detail } : {}) });
  } catch (error) {
    checks.push({
      name,
      status: "FAIL",
      method,
      detail: error instanceof Error ? scrubText(error.message).slice(0, 300) : "Check failed.",
    });
    throw new Error(error instanceof Error ? scrubText(error.message) : "Browser acceptance failed.");
  }
}

function latestMail(email: string, after = 0): TestMail {
  const item = [...mailMessages].reverse().find((message) =>
    message.to.toLowerCase() === email.toLowerCase() && Date.parse(message.receivedAt) >= after,
  );
  if (!item) throw new Error("The local test mail sink did not capture the expected invitation.");
  return item;
}

async function startSink() {
  sink = http.createServer((request, response) => {
    if (request.method !== "POST" || request.url !== "/messages") {
      response.writeHead(404).end();
      return;
    }
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      try {
        const message = JSON.parse(body);
        const url = String(message.text || "").match(/https?:\/\/127\.0\.0\.1:\d+\/ClinicInvitation#token=([A-Za-z0-9_-]+)/);
        if (typeof message.to === "string" && url) {
          mailMessages.push({
            to: message.to,
            text: String(message.text),
            token: url[1],
            receivedAt: new Date().toISOString(),
          });
          response.writeHead(202, { "content-type": "application/json" }).end('{"accepted":true}');
        } else {
          response.writeHead(400).end();
        }
      } catch {
        response.writeHead(400).end();
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    sink!.once("error", reject);
    sink!.listen(0, "127.0.0.1", resolve);
  });
  const address = sink.address();
  assert(address && typeof address === "object");
  process.env.NP_CLINIC_INVITATION_TEST_SINK_URL = `http://127.0.0.1:${address.port}/messages`;
}

function startProcess(command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv; logPath: string }) {
  const child = spawn(command, args, { cwd: options.cwd, env: options.env, stdio: ["ignore", "pipe", "pipe"] });
  serviceChildren.push(child);
  const output = fs.open(options.logPath, "a", 0o600).then((handle) => {
    child.stdout?.on("data", (chunk) => { void handle.appendFile(chunk); });
    child.stderr?.on("data", (chunk) => { void handle.appendFile(chunk); });
    child.once("close", () => { void handle.close(); });
  });
  void output;
  return child;
}

async function waitForHttp(url: string, expectedStatus = 200) {
  const end = Date.now() + 60_000;
  let last = "";
  while (Date.now() < end) {
    try {
      const response = await fetch(url);
      if (response.status === expectedStatus) return;
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message.slice(0, 120) : "request failed";
    }
    await delay(250);
  }
  throw new Error(`Local service did not become ready (${last}).`);
}

async function seedPlatformOperator() {
  const userId = crypto.randomUUID();
  const email = `platform.operator.${crypto.randomBytes(4).toString("hex")}@example.test`;
  const password = `LocalOnly-${crypto.randomBytes(20).toString("base64url")}-8!`;
  await db.insert(usersTable).values({
    id: userId,
    email,
    firstName: "Fictional",
    lastName: "Operator",
    emailVerified: true,
  });
  await db.insert(userProfilesTable).values({
    id: userId,
    appRole: "clinician",
    accountType: "clinician",
    firstName: "Fictional",
    lastName: "Operator",
    displayName: "Fictional Operator",
  });
  await db.insert(clinicianCredentialsTable).values({
    userId,
    email,
    passwordHash: await createClinicianPasswordHash(password),
  });
  process.env.NP_ALLOW_PLATFORM_ADMIN_BOOTSTRAP = "approved";
  const bootstrap = spawnSync("pnpm", [
    "--filter", "@workspace/api-server", "run", "bootstrap:platform-admin", "--",
    `--user-id=${userId}`,
    "--approval-reference=isolated-fictional-browser-acceptance",
    "--confirm=BOOTSTRAP-ONE-PLATFORM-ADMIN",
  ], { cwd: root, env: process.env, encoding: "utf8" });
  delete process.env.NP_ALLOW_PLATFORM_ADMIN_BOOTSTRAP;
  if (bootstrap.status !== 0) {
    const message = `${bootstrap.stdout || ""}\n${bootstrap.stderr || ""}`
      .replace(/(?:token|password|secret|credential)[^\n]*/gi, "[redacted output]")
      .trim()
      .slice(-240);
    throw new Error(`The guarded operator bootstrap did not complete in the disposable browser database. ${message}`);
  }
  return { userId, email, password };
}

class Browser {
  private ws!: WebSocket;
  private messageId = 0;
  private pending = new Map<number, { resolve: (value: any) => void; reject: (reason: Error) => void }>();
  private messageListener?: (event: MessageEvent) => void;
  diagnostics: string[] = [];
  private process?: ChildProcess;
  private browserPort = 0;
  readonly profile: string;

  constructor() {
    const profileNumber = ++nextBrowserProfile;
    this.browserPort = profileNumber === 1 ? cdpPort : 0;
    this.profile = path.join(process.env.NP_TEST_EVIDENCE_DIR!, "private-browser-profile-" + profileNumber);
  }

  async launch() {
    await fs.mkdir(this.profile, { recursive: true, mode: 0o700 });
    if (!this.browserPort) {
      const portProbe = http.createServer();
      await new Promise<void>((resolve, reject) => {
        portProbe.once("error", reject);
        portProbe.listen(0, "127.0.0.1", resolve);
      });
      this.browserPort = (portProbe.address() as AddressInfo).port;
      await new Promise<void>((resolve) => portProbe.close(() => resolve()));
    }
    this.process = spawn(chromiumPath!, [
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-background-networking",
      "--disable-sync",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-allow-origins=*",
      "--remote-debugging-address=127.0.0.1",
      `--remote-debugging-port=${this.browserPort}`,
      `--user-data-dir=${this.profile}`,
      "--host-resolver-rules=MAP * ~NOTFOUND,EXCLUDE 127.0.0.1",
      "about:blank",
    ], { env: { ...process.env, NODE_OPTIONS: "" }, stdio: ["ignore", "ignore", "pipe"], detached: true });
    await this.waitForCdp();
  }

  private async waitForCdp() {
    const until = Date.now() + 20_000;
    let target: any;
    while (Date.now() < until) {
      try {
        const response = await fetch(`http://127.0.0.1:${this.browserPort}/json/list`);
        const targets = await response.json() as any[];
        target = targets.find((item) => item.type === "page");
        if (target?.webSocketDebuggerUrl) break;
      } catch { /* Chromium is still starting. */ }
      await delay(150);
    }
    if (!target?.webSocketDebuggerUrl) throw new Error("The isolated Chromium page target did not start.");
    this.ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Chromium DevTools connection timed out.")), 10_000);
      this.ws.addEventListener("open", () => { clearTimeout(timeout); resolve(); }, { once: true });
      this.ws.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("Chromium DevTools connection failed.")); }, { once: true });
    });
    this.messageListener = (event) => {
      const message = JSON.parse(String(event.data));
      if (["Runtime.exceptionThrown", "Runtime.consoleAPICalled", "Log.entryAdded", "Network.loadingFailed", "Network.requestWillBeSent", "Network.responseReceived"].includes(message.method)) {
        const params = message.params || {};
        const detail = JSON.stringify({
          url: params.request?.url || params.response?.url || "",
          status: params.response?.status,
          errorText: params.errorText,
          message: params.exceptionDetails?.text || params.entry?.text,
          exception: params.exceptionDetails?.exception?.description,
          stack: params.exceptionDetails?.stackTrace?.callFrames?.slice(0, 4).map((frame: any) => ({
            functionName: frame.functionName,
            url: frame.url,
            lineNumber: frame.lineNumber,
          })),
        }).replace(/(?:invite|token|password|secret|credential|cookie)[^,}]*/gi, "[redacted]");
        this.diagnostics.push(`${message.method}: ${detail.slice(0, 600)}`);
      }
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || "Browser command failed."));
      else pending.resolve(message.result);
    };
    this.ws.addEventListener("message", this.messageListener);
    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("DOM.enable");
    await this.send("Network.enable");
    await this.send("Log.enable");
  }

  private send(method: string, params: Record<string, unknown> = {}) {
    const id = ++this.messageId;
    return new Promise<any>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        const item = this.pending.get(id);
        if (item) {
          this.pending.delete(id);
          reject(new Error(`Browser command timed out: ${method}`));
        }
      }, 20_000).unref();
    });
  }

  async evaluate(expression: string) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });
    if (result.exceptionDetails) throw new Error("Browser script raised an exception.");
    return result.result?.value;
  }

  async navigate(url: string) {
    const navigation = await this.send("Page.navigate", { url });
    if (navigation?.errorText) throw new Error(`Browser navigation failed: ${navigation.errorText}`);
    const expected = new URL(url);
    await this.waitFor(
      () => this.evaluate(`location.origin === ${JSON.stringify(expected.origin)} && location.pathname === ${JSON.stringify(expected.pathname)}`),
      15_000,
      `Browser did not navigate to the isolated app.`,
    );
    await this.waitFor(() => this.evaluate("document.readyState === 'complete' || document.readyState === 'interactive'"));
    await delay(200);
  }

  async waitFor(predicate: () => Promise<unknown>, timeoutMs = 15_000, message = "Expected browser content did not appear.") {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      try { if (await predicate()) return; } catch { /* route or React tree is still settling */ }
      await delay(200);
    }
    throw new Error(message);
  }

  async text() {
    return String(await this.evaluate("document.body?.innerText || ''"));
  }

  async fill(selector: string, value: string) {
    const escaped = JSON.stringify(selector);
    const found = await this.evaluate(`(() => { const e=document.querySelector(${escaped}); if(!e) return {ok:false, fields:[...document.querySelectorAll('input')].map(x=>({type:x.type,placeholder:x.placeholder,id:x.id})), page:document.body?.innerText?.slice(0,240)}; const already = 'value' in e && e.value === ${JSON.stringify(value)}; e.focus(); return {ok:true,already}; })()`);
    if (!found?.ok) throw new Error(`Visible form field not found: ${selector}; page ${String(await this.evaluate("location.pathname"))}; observed ${JSON.stringify(found).replace(/\s+/g, " ").slice(0, 500)}`);
    if (found.already) return;
    await this.send("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", modifiers: 2, windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65 });
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", modifiers: 2, windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65 });
    await this.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 });
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 });
    await this.send("Input.insertText", { text: value });
  }

  async setSelect(selector: string, value: string) {
    const script = `(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e) return false; const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; setter.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); return e.value === ${JSON.stringify(value)}; })()`;
    if (!await this.evaluate(script)) throw new Error(`Select field not found or not set: ${selector}`);
  }

  async click(selector: string) {
    const script = `(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e || !e.getClientRects().length || e.disabled || e.getAttribute('aria-disabled')==='true') return false; e.scrollIntoView({block:'center',inline:'nearest'}); e.click(); return true; })()`;
    if (!await this.evaluate(script)) throw new Error(`Visible control not found: ${selector}`);
  }

  async clickText(text: string) {
    const script = `(() => { const target=${JSON.stringify(text)}; const items=[...document.querySelectorAll('button,a,[role="button"],[role="option"]')]; const e=items.find(x=>x.innerText.trim()===target && x.getClientRects().length && !x.disabled && x.getAttribute('aria-disabled')!=='true'); if(!e) return {ok:false, labels:items.map(x=>x.innerText.trim()).filter(Boolean).slice(0,12), page:document.body?.innerText?.slice(0,500)}; e.scrollIntoView({block:'center',inline:'nearest'}); e.click(); return {ok:true}; })()`;
    const result = await this.evaluate(script);
    if (!result?.ok) throw new Error(`Visible control was not found: ${text}. Visible UI: ${String(result?.page || "").replace(/\s+/g, " ").slice(0, 300)}`);
  }

  async clickFirst(selector: string) {
    const script = `(() => { const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(x=>x.getClientRects().length && !x.disabled && x.getAttribute('aria-disabled')!=='true'); if(!e) return false; e.scrollIntoView({block:'center',inline:'nearest'}); e.click(); return true; })()`;
    if (!await this.evaluate(script)) throw new Error(`Visible control was not found: ${selector}`);
  }

  async waitText(text: string, timeoutMs = 15_000) {
    await this.waitFor(async () => (await this.text()).includes(text), timeoutMs, `Expected visible text was not found: ${text}; page: ${String(await this.evaluate("location.href + ' | ' + document.title + ' | ' + (document.body?.innerText || '')")).replace(/\s+/g, " ").slice(0, 300)}; html: ${String(await this.evaluate("document.documentElement?.outerHTML || ''")).replace(/\s+/g, " ").slice(0, 400)}; browser: ${this.diagnostics.slice(-20).join(" | ")}`);
  }

  async waitPath(pathPart: string, timeoutMs = 15_000) {
    await this.waitFor(() => this.evaluate(`location.pathname.includes(${JSON.stringify(pathPart)})`), timeoutMs, `Browser did not reach the expected route: ${pathPart}`);
  }

  async screenshot(name: string) {
    const result = await this.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await fs.writeFile(path.join(evidenceDir!, "screenshots", `${name}.png`), Buffer.from(result.data, "base64"), { mode: 0o600 });
  }

  async viewport(width: number, height: number, mobile: boolean) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile,
    });
  }

  async close() {
    try { this.ws?.close(); } catch { /* already closed */ }
    if (this.process && !this.process.killed) {
      try { process.kill(-this.process.pid!, "SIGTERM"); }
      catch { this.process.kill("SIGTERM"); }
      await Promise.race([
        new Promise<void>((resolve) => this.process?.once("exit", () => resolve())),
        delay(5_000),
      ]);
      if (this.process.exitCode === null) {
        try { process.kill(-this.process.pid!, "SIGKILL"); }
        catch { this.process.kill("SIGKILL"); }
        await Promise.race([
          new Promise<void>((resolve) => this.process?.once("exit", () => resolve())),
          delay(2_000),
        ]);
      }
    }
    let removed = false;
    for (let attempt = 0; attempt < 10 && !removed; attempt += 1) {
      try { await fs.rm(this.profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); removed = true; }
      catch (error: any) {
        if (attempt === 9 || !["ENOTEMPTY", "EBUSY", "EPERM"].includes(error?.code)) throw error;
        await delay(200);
      }
    }
    if (currentBrowser === this) currentBrowser = undefined;
  }
}

async function newBrowser() {
  const browser = new Browser();
  browserInstances.push(browser);
  currentBrowser = browser;
  await browser.launch();
  return browser;
}

async function loginClinician(browser: Browser, email: string, password: string, workspaceIntent?: string) {
  await browser.navigate(`${webUrl}/ClinicianLogin${workspaceIntent ? `?workspace=${encodeURIComponent(workspaceIntent)}` : ""}`);
  await browser.waitText(workspaceIntent === "clinic-admin" ? "Clinic administrator sign in" : "Clinician sign in", 60_000);
  await browser.clickText("Sign In with Email");
  await browser.waitFor(
    () => browser.evaluate("Boolean(document.querySelector('input[type=\"email\"]')?.getClientRects().length)"),
    10_000,
    "The email sign-in form did not appear after selecting Sign In with Email.",
  );
  await browser.fill('input[type="email"]', email);
  await browser.fill('input[type="password"]', password);
  await browser.clickText("Sign In");
  await browser.waitFor(async () =>
    (await browser.text()).includes("Clinic management") ||
    (await browser.text()).includes("Clinic team") ||
    await browser.evaluate("['/ClinicianDashboard','/WorkspaceSelect'].includes(location.pathname)"));
}

async function registerAndAcceptClinicInvite(browser: Browser, token: string, invitee: { email: string; password: string; firstName: string; lastName: string }) {
  await browser.navigate(`${webUrl}/ClinicInvitation#token=${encodeURIComponent(token)}`);
  await browser.waitText("Accept clinic invitation");
  await browser.click('[data-testid="button-mode-register"]');
  await browser.fill('[data-testid="input-invite-first-name"]', invitee.firstName);
  await browser.fill('[data-testid="input-invite-last-name"]', invitee.lastName);
  await browser.fill('[data-testid="input-invite-register-email"]', invitee.email);
  await browser.fill('[data-testid="input-invite-register-password"]', invitee.password);
  await browser.click('[data-testid="checkbox-adult-confirmation"]');
  await browser.click('[data-testid="button-create-invited-account"]');
  await browser.waitText("Sign in with the invited email");
  await browser.clickText("Sign in");
  await browser.click('[data-testid="button-invitation-sign-in"]');
  await browser.waitFor(async () => await browser.evaluate("location.pathname === '/ClinicianUsers' || location.pathname === '/PlatformAdminClinics' || location.pathname === '/ClinicianDashboard'"), 20_000);
}

async function startWebServices() {
  const sinkAddress = sink?.address();
  assert(sinkAddress && typeof sinkAddress === "object");
  process.env.NP_CLINIC_INVITATION_TEST_SINK_URL = `http://127.0.0.1:${sinkAddress.port}/messages`;
  const env = { ...process.env };
  const api = startProcess("pnpm", ["exec", "tsx", "../../scripts/clinic-onboarding/api-service.mts"], {
    cwd: path.join(root, "artifacts/api-server"),
    env,
    logPath: path.join(evidenceDir!, "logs", "api-service.log"),
  });
  await waitForHttp(`http://127.0.0.1:${apiPort}/api/healthz`);
  const staticRoot = path.resolve(root, "artifacts/neuropath/dist/public");
  staticWebServer = http.createServer(async (request, response) => {
    const requestEntry = { path: request.url || "/" } as { path: string; status?: number; bytes?: number };
    staticRequestLog.push(requestEntry);
    if (request.url?.startsWith("/api/")) {
      const upstream = http.request({
        hostname: "127.0.0.1",
        port: apiPort,
        method: request.method,
        path: request.url,
        headers: { ...request.headers, host: `127.0.0.1:${apiPort}` },
      }, (upstreamResponse) => {
        requestEntry.status = upstreamResponse.statusCode;
        response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
        upstreamResponse.pipe(response);
      });
      upstream.on("error", () => {
        if (!response.headersSent) response.writeHead(502, { "content-type": "application/json" });
        response.end('{"error":"Local test API unavailable"}');
      });
      request.pipe(upstream);
      return;
    }
    let pathname = "/";
    try { pathname = decodeURIComponent(new URL(request.url || "/", `http://127.0.0.1:${webPort}`).pathname); }
    catch { response.writeHead(400).end(); return; }
    const requested = pathname === "/"
      ? path.join(staticRoot, "index.html")
      : path.resolve(staticRoot, `.${pathname}`);
    if (!requested.startsWith(`${staticRoot}${path.sep}`) && requested !== path.join(staticRoot, "index.html")) {
      response.writeHead(400).end();
      return;
    }
    let target = requested;
    try {
      if (!(await fs.stat(target)).isFile()) target = path.join(staticRoot, "index.html");
    } catch {
      target = path.join(staticRoot, "index.html");
    }
    try {
      const content = await fs.readFile(target);
      const extension = path.extname(target).toLowerCase();
      const contentType = ({
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".woff": "font/woff",
        ".woff2": "font/woff2",
      } as Record<string, string>)[extension] || "application/octet-stream";
      requestEntry.status = 200;
      requestEntry.bytes = content.byteLength;
      response.writeHead(200, { "content-type": contentType, "content-length": content.byteLength });
      response.end(content);
    } catch {
      requestEntry.status = 404;
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    staticWebServer!.once("error", reject);
    staticWebServer!.listen(webPort, "127.0.0.1", resolve);
  });
  await waitForHttp(webUrl!);
  const entryResponse = await fetch(`${webUrl}/`);
  const entrySource = await entryResponse.text();
  const javascriptAsset = entrySource.match(/src="([^"]+\.js)"/)?.[1];
  if (!javascriptAsset) throw new Error("The built app page did not reference its JavaScript bundle.");
  const bundleResponse = await fetch(new URL(javascriptAsset, webUrl));
  const bundle = await bundleResponse.arrayBuffer();
  await fs.writeFile(path.join(evidenceDir!, "vite-entry-check.json"), JSON.stringify({
    status: entryResponse.status,
    htmlBytes: Buffer.byteLength(entrySource),
    referencesBuiltAssets: entrySource.includes("/assets/"),
    javascriptStatus: bundleResponse.status,
    javascriptBytes: bundle.byteLength,
  }, null, 2), { mode: 0o600 });
  if (!entryResponse.ok || !bundleResponse.ok || !entrySource.includes("/assets/") || bundle.byteLength < 100_000) {
    throw new Error("The built app entry page did not load in the isolated web preview.");
  }
  return { api };
}

async function captureAudit() {
  const rows = await db.select({
    id: auditLogsTable.id,
    tenantId: auditLogsTable.tenantId,
    userId: auditLogsTable.userId,
    userRole: auditLogsTable.userRole,
    action: auditLogsTable.action,
    targetType: auditLogsTable.targetType,
    targetId: auditLogsTable.targetId,
    success: auditLogsTable.success,
    metadata: auditLogsTable.metadata,
    createdDate: auditLogsTable.createdDate,
  }).from(auditLogsTable).orderBy(desc(auditLogsTable.createdDate));
  const sanitizedRows = scrub(rows) as Array<{ createdDate?: unknown }>;
  assert(sanitizedRows.length > 0, "The signed-in browser run should produce genuine audit evidence.");
  assert(
    sanitizedRows.every((row) => typeof row.createdDate === "string" && Number.isFinite(Date.parse(row.createdDate))),
    "Genuine audit evidence must retain parseable event timestamps.",
  );
  const inboxEvents = rows.filter((row) =>
    ["demo_clinic_invitation_links_viewed", "demo_clinic_invitation_links_denied"].includes(row.action),
  );
  assert(inboxEvents.some((row) => row.action === "demo_clinic_invitation_links_viewed" && row.success), "Authorized local inbox reads must create genuine audit events.");
  assert(inboxEvents.some((row) => row.action === "demo_clinic_invitation_links_denied" && !row.success), "Denied local inbox reads must create genuine audit events.");
  const rawInboxAudit = JSON.stringify(inboxEvents);
  for (const message of mailMessages) {
    assert(!rawInboxAudit.includes(message.token), "Invitation tokens must never appear in inbox audit records.");
  }
  await saveJson("genuine-audit-events.json", sanitizedRows);
}

async function main() {
  requireIsolatedEnvironment();
  await startSink();
  const databaseInfo = await db.execute(sql`select current_database() as name, host(inet_server_addr()) as host`);
  const firstDbRow = (databaseInfo as any).rows?.[0];
  assert.equal(firstDbRow?.name, expectedDb);
  assert.equal(firstDbRow?.host, "127.0.0.1");

  const operator = await seedPlatformOperator();
  await startWebServices();

  await recordCheck("Signed-out visitors cannot retrieve local invitation links", "browser", async () => {
    const browser = await newBrowser();
    await browser.navigate(webUrl!);
    const result = await browser.evaluate(`fetch('/api/demo/clinic-invitation-links',{credentials:'include',cache:'no-store'}).then(async r=>({status:r.status,cache:r.headers.get('cache-control'),body:await r.text()}))`);
    assert.equal(result.status, 401);
    assert(String(result.cache).includes("no-store"));
    assert(!String(result.body).includes("token"));
    await browser.close();
    return "The actual browser session received an authentication denial with no invitation content.";
  });

  let clinicId = "";
  let adminInviteId = "";
  let firstAdminToken = "";
  let currentAdminToken = "";
  let firstAdminEmail = `clinic.admin.${crypto.randomBytes(4).toString("hex")}@example.test`;
  const firstAdminPassword = `LocalOnly-${crypto.randomBytes(20).toString("base64url")}-8!`;
  const clinicName = `Fictional North Clinic ${crypto.randomBytes(3).toString("hex")}`;
  const clinicianOne = { email: `clinician.one.${crypto.randomBytes(4).toString("hex")}@example.test`, password: `LocalOnly-${crypto.randomBytes(20).toString("base64url")}-8!`, firstName: "Fictional", lastName: "Clinician One" };
  const clinicianTwo = { email: `clinician.two.${crypto.randomBytes(4).toString("hex")}@example.test`, password: `LocalOnly-${crypto.randomBytes(20).toString("base64url")}-8!`, firstName: "Fictional", lastName: "Clinician Two" };
  let clinicianOneUserId = "";
  const clinicRequestName = `Fictional Request Clinic ${crypto.randomBytes(3).toString("hex")}`;
  const clinicRequestEmail = `request.contact.${crypto.randomBytes(4).toString("hex")}@example.test`;
  const caregiverSignupEmail = `independent.parent.${crypto.randomBytes(4).toString("hex")}@example.test`;
  let clinicRequestId = "";

  await recordCheck("Public landing page links each role to its existing sign-in or request flow", "browser", async () => {
    const browser = await newBrowser();
    await browser.navigate(webUrl!);
    await browser.waitFor(() => browser.evaluate("Boolean(document.querySelector('[data-testid=\"section-workspace-entry\"]'))"));
    await browser.waitText("Caregivers and parents");
    const hrefs = await browser.evaluate(`Object.fromEntries([...document.querySelectorAll('[data-testid^="link-"]')].map(a=>[a.getAttribute('data-testid'),a.getAttribute('href')]))`);
    assert.equal(hrefs["link-caregiver-sign-in"], "/ParentLogin");
    assert.equal(hrefs["link-caregiver-create"], "/ParentSignup");
    assert.equal(hrefs["link-clinician-entry"], "/ClinicianLogin?workspace=clinician");
    assert.equal(hrefs["link-clinic-admin-entry"], "/ClinicianLogin?workspace=clinic-admin");
    assert.equal(hrefs["link-register-clinic"], "/ClinicRequest");
    assert.equal(hrefs["link-family-access-code"], "/UsernameLogin");
    assert(!Object.keys(hrefs).some((key) => /platform/i.test(key)));
    await browser.viewport(1440, 1000, false);
    await browser.screenshot("00-public-landing-desktop");
    await browser.viewport(390, 844, true);
    const mobile = await browser.evaluate("({width:innerWidth,scrollWidth:document.documentElement.scrollWidth})");
    assert(mobile.scrollWidth <= mobile.width);
    await browser.screenshot("00-public-landing-mobile");
    await browser.close();
    return "Public cards preserve existing login/signup routes; platform-admin access is not shown and the mobile landing page does not overflow.";
  });

  await recordCheck("Independent caregiver signup creates a usable account without clinic membership", "signed-in browser", async () => {
    const browser = await newBrowser();
    await browser.navigate(`${webUrl}/ParentSignup`);
    await browser.waitText("No clinician and no documents needed.");
    await browser.fill('[data-testid="input-first-name"]', "Fictional Caregiver");
    await browser.fill('[data-testid="input-email"]', caregiverSignupEmail);
    await browser.fill('[data-testid="input-password"]', `LocalOnly-${crypto.randomBytes(20).toString("base64url")}-8!`);
    const password = await browser.evaluate("document.querySelector('[data-testid=\"input-password\"]').value");
    await browser.fill('[data-testid="input-confirm-password"]', password);
    await browser.click('[data-testid="checkbox-privacy"]');
    await browser.click('[data-testid="checkbox-health"]');
    await browser.setSelect('[data-testid="select-account-holder-age"]', "18_plus");
    await browser.click('[data-testid="checkbox-adult-or-guardian-confirmed"]');
    await browser.click('[data-testid="checkbox-parent-guardian-authority"]');
    await browser.click('[data-testid="button-submit"]');
    await browser.waitPath("/ParentQuickStart");
    const [account] = await db.select({
      id: parentAccountsTable.id,
      workspaceId: parentAccountsTable.workspaceId,
    }).from(parentAccountsTable).where(eq(parentAccountsTable.email, caregiverSignupEmail));
    assert(account, "Independent caregiver signup should create its parent account through the real application.");
    assert(account.workspaceId, "The independent account should receive its own family workspace.");
    assert.equal((await db.select().from(clinicMembershipsTable).where(eq(clinicMembershipsTable.userId, account.id))).length, 0);
    await browser.screenshot("00-independent-caregiver-quickstart");
    await browser.close();
    return "The browser signup created an independent caregiver account and family workspace with no clinic membership.";
  });

  await recordCheck("Public clinic request creates only a pending request in the real application", "browser", async () => {
    const browser = await newBrowser();
    await browser.navigate(`${webUrl}/ClinicRequest`);
    await browser.waitText("Register your clinic");
    await browser.fill('[data-testid="input-request-clinic-name"]', clinicRequestName);
    await browser.fill('[data-testid="input-request-contact-name"]', "Jordan Browser");
    await browser.fill('[data-testid="input-request-work-email"]', clinicRequestEmail);
    await browser.fill('[data-testid="input-request-website"]', "https://fictional.example.test");
    await browser.click('[data-testid="button-submit-clinic-request"]');
    await browser.waitText("A platform administrator must review it");
    const [request] = await db.select().from(clinicRequestsTable).where(eq(clinicRequestsTable.workEmail, clinicRequestEmail));
    assert(request);
    clinicRequestId = request.id;
    assert.equal(request.status, "pending");
    assert.equal(request.clinicId, null);
    assert.equal((await db.select().from(clinicsTable).where(eq(clinicsTable.displayName, clinicRequestName))).length, 0);
    assert.equal((await db.select().from(clinicInvitationsTable).where(eq(clinicInvitationsTable.invitedEmail, clinicRequestEmail))).length, 0);
    await browser.screenshot("00-clinic-request-submitted");
    await browser.close();
    return "The real form writes only a pending request; no clinic, account, membership, or invitation is created.";
  });

  await recordCheck("Platform operator signs in through the real clinician login form", "signed-in browser", async () => {
    const browser = await newBrowser();
    await loginClinician(browser, operator.email, operator.password);
    await browser.waitText("Clinic management");
    const page = await browser.text();
    assert(page.includes("Platform administration"));
    assert(!page.includes("Clinical team"));
    assert(!page.includes("Documents"));
    assert(page.includes("No clinics yet"));
    await browser.viewport(1440, 1000, false);
    await browser.screenshot("02-platform-admin-desktop");
    await browser.viewport(390, 844, true);
    const metrics = await browser.evaluate("({width:innerWidth,scrollWidth:document.documentElement.scrollWidth})");
    assert(metrics.scrollWidth <= metrics.width, "Platform clinic management should not overflow at phone width.");
    await browser.screenshot("02-platform-admin-mobile");
    await browser.close();
    return "The operator logged in through the visible email/password form; no session bypass was used.";
  });

  await recordCheck("Platform administrator reviews and approves a pending request through the actual UI", "signed-in browser", async () => {
    const browser = await newBrowser();
    await loginClinician(browser, operator.email, operator.password);
    await browser.navigate(`${webUrl}/PlatformAdminClinics`);
    await browser.waitText(clinicRequestName);
    const input = `[data-testid="input-request-first-admin-${clinicRequestId}"]`;
    await browser.fill(input, clinicRequestEmail);
    await browser.screenshot("01-platform-pending-clinic-request");
    await browser.click(`[data-testid="button-approve-clinic-request-${clinicRequestId}"]`);
    await browser.waitText("Invitation created; test email captured locally, not sent externally.");
    const [request] = await db.select().from(clinicRequestsTable).where(eq(clinicRequestsTable.id, clinicRequestId));
    assert.equal(request.status, "approved");
    assert(request.clinicId);
    const [approvedClinic] = await db.select().from(clinicsTable).where(eq(clinicsTable.id, request.clinicId));
    assert.equal(approvedClinic.status, "pending");
    const [invitation] = await db.select().from(clinicInvitationsTable).where(and(
      eq(clinicInvitationsTable.clinicId, request.clinicId),
      eq(clinicInvitationsTable.invitedEmail, clinicRequestEmail),
    ));
    assert.equal(invitation.role, "clinic_admin");
    assert.equal(invitation.status, "pending");
    assert.equal((await db.select().from(usersTable).where(eq(usersTable.email, clinicRequestEmail))).length, 0);
    await browser.screenshot("01-platform-request-approved");
    await browser.close();
    return "An explicit platform-admin action invokes the existing clinic/first-admin invitation flow without activating the clinic or creating an account.";
  });

  await recordCheck("Platform UI creates a clinic and captures the first-admin invite locally", "signed-in browser", async () => {
    const browser = await newBrowser();
    await loginClinician(browser, operator.email, operator.password);
    await browser.fill('[data-testid="input-clinic-name"]', clinicName);
    await browser.fill('[data-testid="input-first-admin-email"]', firstAdminEmail);
    await browser.click('[data-testid="button-create-clinic"]');
    await browser.waitText("Invitation created; test email captured locally, not sent externally.");
    await browser.waitText(clinicName);
    await browser.screenshot("03-platform-clinic-created");
    const [clinic] = await db.select({ id: clinicsTable.id }).from(clinicsTable).where(eq(clinicsTable.displayName, clinicName));
    assert(clinic?.id);
    clinicId = clinic.id;
    const [invitation] = await db.select({ id: clinicInvitationsTable.id }).from(clinicInvitationsTable).where(and(
      eq(clinicInvitationsTable.clinicId, clinicId),
      eq(clinicInvitationsTable.invitedEmail, firstAdminEmail),
    ));
    assert(invitation?.id);
    adminInviteId = invitation.id;
    firstAdminToken = latestMail(firstAdminEmail).token;
    await browser.click('[data-testid="button-load-demo-invitation-links"]');
    const localLinkSelector = `[data-testid="link-demo-invitation-${adminInviteId}"]`;
    await browser.waitFor(() => browser.evaluate(`Boolean(document.querySelector(${JSON.stringify(localLinkSelector)}))`));
    const localInvitationHref = await browser.evaluate(`document.querySelector(${JSON.stringify(localLinkSelector)})?.getAttribute('href') || ''`);
    const localInvitationToken = new URLSearchParams(
      new URL(localInvitationHref, webUrl).hash.replace(/^#/, ""),
    ).get("token") || "";
    const [storedInvitation] = await db.select({ tokenHash: clinicInvitationsTable.tokenHash })
      .from(clinicInvitationsTable).where(eq(clinicInvitationsTable.id, adminInviteId));
    assert(storedInvitation);
    assert.equal(hashClinicInvitationToken(localInvitationToken) === storedInvitation.tokenHash, true, "The UI link must identify the stored invitation.");
    assert.equal(hashClinicInvitationToken(firstAdminToken) === storedInvitation.tokenHash, true, "The loopback mail sink must capture the stored invitation token.");
    assert(!(await browser.text()).includes(firstAdminToken), "The invitation token must not be printed as page text.");
    const localInviteBrowser = await newBrowser();
    await localInviteBrowser.navigate(new URL(localInvitationHref, webUrl).toString());
    await localInviteBrowser.waitText("Accept clinic invitation");
    await localInviteBrowser.close();
    await browser.viewport(390, 844, true);
    const inboxMobileMetrics = await browser.evaluate("({width:innerWidth,scrollWidth:document.documentElement.scrollWidth})");
    assert(inboxMobileMetrics.scrollWidth <= inboxMobileMetrics.width, "Platform invitation links must not overflow on a phone-sized screen.");
    await browser.close();
    return "The page reports that the email was captured locally and not sent externally.";
  });

  await recordCheck("Wrong-email invite registration does not grant clinic membership", "signed-in browser", async () => {
    const wrongBrowser = await newBrowser();
    const wrong = {
      email: `wrong.identity.${crypto.randomBytes(4).toString("hex")}@example.test`,
      password: `LocalOnly-${crypto.randomBytes(20).toString("base64url")}-8!`,
    };
    await wrongBrowser.navigate(`${webUrl}/ClinicInvitation#token=${encodeURIComponent(firstAdminToken)}`);
    await wrongBrowser.waitText("Accept clinic invitation");
    await wrongBrowser.click('[data-testid="button-mode-register"]');
    await wrongBrowser.fill('[data-testid="input-invite-first-name"]', "Fictional");
    await wrongBrowser.fill('[data-testid="input-invite-last-name"]', "Wrong Identity");
    await wrongBrowser.fill('[data-testid="input-invite-register-email"]', wrong.email);
    await wrongBrowser.fill('[data-testid="input-invite-register-password"]', wrong.password);
    await wrongBrowser.click('[data-testid="checkbox-adult-confirmation"]');
    await wrongBrowser.click('[data-testid="button-create-invited-account"]');
    await wrongBrowser.waitText("Sign in with the invited email");
    await wrongBrowser.clickText("Sign in");
    await wrongBrowser.click('[data-testid="button-invitation-sign-in"]');
    await wrongBrowser.waitText("awaiting clinic administrator approval");
    const [wrongUser] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, wrong.email));
    assert(wrongUser?.id);
    const memberships = await db.select({ id: clinicMembershipsTable.id }).from(clinicMembershipsTable).where(eq(clinicMembershipsTable.userId, wrongUser.id));
    assert.equal(memberships.length, 0);
    await wrongBrowser.close();
    return "A mismatched identity stays pending and has no clinic membership.";
  });

  await recordCheck("Platform admin can reissue the first-admin invite; current invite activates the real account", "signed-in browser", async () => {
    const operatorBrowser = await newBrowser();
    await loginClinician(operatorBrowser, operator.email, operator.password);
    const oldToken = firstAdminToken;
    const reissueSelector = `[data-testid="button-reissue-${adminInviteId}"]`;
    await operatorBrowser.waitFor(
      () => operatorBrowser.evaluate(`Boolean(document.querySelector(${JSON.stringify(reissueSelector)})?.getClientRects().length)`),
      15_000,
      "The pending first-administrator invitation did not appear in the platform clinic list.",
    );
    await operatorBrowser.click(reissueSelector);
    await operatorBrowser.waitText("Invitation created; test email captured locally, not sent externally.");
    currentAdminToken = latestMail(firstAdminEmail, Date.now() - 30_000).token;
    assert.notEqual(currentAdminToken, oldToken);
    const currentPendingInvitations = await db.select({
      id: clinicInvitationsTable.id,
      status: clinicInvitationsTable.status,
    }).from(clinicInvitationsTable).where(and(
      eq(clinicInvitationsTable.clinicId, clinicId),
      eq(clinicInvitationsTable.invitedEmail, firstAdminEmail),
      eq(clinicInvitationsTable.role, "clinic_admin"),
    ));
    const currentInvitation = currentPendingInvitations.find((item) => item.status === "pending");
    assert(currentInvitation);
    await operatorBrowser.click('[data-testid="button-load-demo-invitation-links"]');
    const currentLinkSelector = `[data-testid="link-demo-invitation-${currentInvitation.id}"]`;
    await operatorBrowser.waitFor(() => operatorBrowser.evaluate(`Boolean(document.querySelector(${JSON.stringify(currentLinkSelector)}))`));
    const supersededLinkVisible = await operatorBrowser.evaluate(`Boolean(document.querySelector('[data-testid="link-demo-invitation-${adminInviteId}"]'))`);
    assert.equal(supersededLinkVisible, false, "Reissued invitations must remove the superseded link from the local inbox.");
    await operatorBrowser.close();
    const inviteeBrowser = await newBrowser();
    await registerAndAcceptClinicInvite(inviteeBrowser, currentAdminToken, {
      email: firstAdminEmail,
      password: firstAdminPassword,
      firstName: "Fictional",
      lastName: "Clinic Admin",
    });
    await inviteeBrowser.waitPath("/ClinicianUsers");
    await inviteeBrowser.screenshot("03-clinic-admin-team");
    await inviteeBrowser.waitText("Invite a treating clinician");
    const adminNavigation = await inviteeBrowser.text();
    assert(adminNavigation.includes("Clinic administration"));
    assert(!adminNavigation.includes("Clinical team"));
    assert(!adminNavigation.includes("Intervention Plans"));
    const active = await db.select({ id: clinicMembershipsTable.id }).from(clinicMembershipsTable).where(and(
      eq(clinicMembershipsTable.userId, (await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, firstAdminEmail)))[0].id),
      eq(clinicMembershipsTable.clinicId, clinicId),
      eq(clinicMembershipsTable.status, "active"),
    ));
    assert.equal(active.length, 1);
    await inviteeBrowser.close();
    return "Invitation activation ends in the clinic team page; the account receives only clinic-admin membership.";
  });

  await recordCheck("Clinic administrator invites and activates two treating clinicians without role editing", "signed-in browser", async () => {
    const adminBrowser = await newBrowser();
    await loginClinician(adminBrowser, firstAdminEmail, firstAdminPassword);
    const adminNavigation = await adminBrowser.text();
    assert(adminNavigation.includes("Clinic administration"));
    assert(!adminNavigation.includes("Clinical team"));
    assert(!adminNavigation.includes("AI Review"));
    await adminBrowser.navigate(`${webUrl}/ClinicianUsers`);
    await adminBrowser.waitText("Invite a treating clinician");
    await adminBrowser.fill('input[placeholder="clinician@clinic.org"]', clinicianOne.email);
    await adminBrowser.click('[data-testid="button-invite-clinician"]');
    await adminBrowser.waitText("Invitation created; test email captured locally, not sent externally.");
    let tokenOne = latestMail(clinicianOne.email).token;
    await adminBrowser.click('[data-testid="button-load-demo-invitation-links"]');
    await adminBrowser.waitFor(() => adminBrowser.evaluate("Boolean(document.querySelector('[data-testid^=\"link-demo-invitation-\"]'))"));
    const clinicAdminLinks = await adminBrowser.evaluate(`([...document.querySelectorAll('[data-testid^="row-demo-invitation-link-"] strong')]).map((item)=>item.textContent)`);
    assert.deepEqual(clinicAdminLinks, [clinicianOne.email]);
    assert(!clinicAdminLinks.includes(firstAdminEmail), "Clinic administrators must not see platform first-admin links.");
    const oneBrowser = await newBrowser();
    await registerAndAcceptClinicInvite(oneBrowser, tokenOne, clinicianOne);
    await oneBrowser.waitPath("/ClinicianDashboard");
    await oneBrowser.close();
    await adminBrowser.fill('input[placeholder="clinician@clinic.org"]', clinicianTwo.email);
    await adminBrowser.click('[data-testid="button-invite-clinician"]');
    await adminBrowser.waitText("Invitation created; test email captured locally, not sent externally.");
    await adminBrowser.click('[data-testid="button-load-demo-invitation-links"]');
    await adminBrowser.waitFor(() => adminBrowser.evaluate(`([...document.querySelectorAll('[data-testid^="row-demo-invitation-link-"] strong')]).some((item)=>item.textContent===${JSON.stringify(clinicianTwo.email)})`), 10_000);
    const secondClinicAdminLinks = await adminBrowser.evaluate(`([...document.querySelectorAll('[data-testid^="row-demo-invitation-link-"] strong')]).map((item)=>item.textContent)`);
    assert.deepEqual(secondClinicAdminLinks, [clinicianTwo.email], "Only active pending invitations should remain in the local inbox.");
    const tokenTwo = latestMail(clinicianTwo.email).token;
    const twoBrowser = await newBrowser();
    await registerAndAcceptClinicInvite(twoBrowser, tokenTwo, clinicianTwo);
    await twoBrowser.waitPath("/ClinicianDashboard");
    await twoBrowser.close();
    await adminBrowser.navigate(`${webUrl}/ClinicianUsers`);
    await adminBrowser.waitText("Clinic staff");
    assert(!(await adminBrowser.text()).includes("Edit role"));
    await adminBrowser.screenshot("04-clinic-staff-list");
    const users = await db.select({ id: usersTable.id, email: usersTable.email }).from(usersTable).where(eq(usersTable.email, clinicianOne.email));
    assert.equal(users.length, 1);
    clinicianOneUserId = users[0].id;
    const activeMembership = await db.select({ id: clinicMembershipsTable.id, role: clinicMembershipsTable.role }).from(clinicMembershipsTable).where(and(
      eq(clinicMembershipsTable.userId, users[0].id),
      eq(clinicMembershipsTable.clinicId, clinicId),
      eq(clinicMembershipsTable.status, "active"),
    ));
    assert.equal(activeMembership[0]?.role, "treating_clinician");
    await adminBrowser.close();
    const platformBrowser = await newBrowser();
    await loginClinician(platformBrowser, operator.email, operator.password);
    await platformBrowser.navigate(`${webUrl}/PlatformAdminClinics`);
    await platformBrowser.click('[data-testid="button-load-demo-invitation-links"]');
    await platformBrowser.waitText("Refresh local links");
    const platformInboxEmails = await platformBrowser.evaluate(`([...document.querySelectorAll('[data-testid^="row-demo-invitation-link-"] strong')]).map((item)=>item.textContent)`);
    assert(!platformInboxEmails.includes(clinicianOne.email));
    assert(!platformInboxEmails.includes(clinicianTwo.email), "Platform inbox access must stay limited to first-administrator invitations.");
    await platformBrowser.close();
    return "Both accounts registered and accepted through the invitation screen; the server assigned treating_clinician, with no role editor.";
  });

  let childId = "";
  let invitedClinicChildId = "";
  let familyLink = "";
  let parentInvite = "";
  let parentInviteHash = "";
  const childName = `Demo Avery ${crypto.randomBytes(3).toString("hex")}`;
  const parentEmail = `caregiver.${crypto.randomBytes(4).toString("hex")}@example.test`;
  const parentPassword = `LocalOnly-${crypto.randomBytes(20).toString("base64url")}-8!`;
  await recordCheck("Treating clinician invites a fictional family through the browser", "signed-in browser", async () => {
    const clinicianBrowser = await newBrowser();
    await loginClinician(clinicianBrowser, clinicianOne.email, clinicianOne.password);
    await clinicianBrowser.waitPath("/ClinicianDashboard");
    await clinicianBrowser.viewport(390, 844, true);
    const dashboardMetrics = await clinicianBrowser.evaluate("({width:innerWidth,scrollWidth:document.documentElement.scrollWidth})");
    assert(dashboardMetrics.scrollWidth <= dashboardMetrics.width, "Clinician dashboard should not overflow horizontally at phone width.");
    await clinicianBrowser.screenshot("06-clinician-dashboard-mobile");
    await clinicianBrowser.viewport(1280, 900, false);
    await clinicianBrowser.screenshot("06-clinician-dashboard-desktop");
    await clinicianBrowser.clickText("Invite Family");
    await clinicianBrowser.waitText("Add New Family");
    await clinicianBrowser.fill('input[placeholder="e.g. The Johnson Family"]', `Fictional ${childName} Family`);
    await clinicianBrowser.fill('input[placeholder="Full name"]', "Fictional Caregiver");
    await clinicianBrowser.fill('input[placeholder="parent@email.com"]', parentEmail);
    await clinicianBrowser.clickText("Next");
    await clinicianBrowser.fill('input[placeholder="First name or nickname"]', childName);
    await clinicianBrowser.clickText("Save & Send Invite");
    await clinicianBrowser.waitText("Family Added!");
    const bodyText = await clinicianBrowser.text();
    const match = bodyText.match(/http:\/\/127\.0\.0\.1:\d+\/ParentQuickStart\?invite=[A-Za-z0-9_-]+/);
    assert(match, "Caregiver invitation link should be displayed in the family confirmation.");
    familyLink = match[0];
    parentInvite = new URL(familyLink).searchParams.get("invite") || "";
    assert(parentInvite.length >= 16);
    const [child] = await db.select({ id: childrenTable.id, familyId: childrenTable.familyId })
      .from(childrenTable).where(eq(childrenTable.childName, childName));
    assert(child?.id);
    const [storedInvite] = await db.select({ tokenHash: parentClinicInvitesTable.tokenHash })
      .from(parentClinicInvitesTable).where(and(
        eq(parentClinicInvitesTable.familyId, child.familyId),
        eq(parentClinicInvitesTable.invitedEmail, parentEmail),
      ));
    assert(storedInvite, "The clinic invite record should be present in the isolated database.");
    assert.equal(storedInvite.tokenHash, crypto.createHash("sha256").update(parentInvite, "utf8").digest("hex"));
    parentInviteHash = storedInvite.tokenHash;
    invitedClinicChildId = child.id;
    // The link contains a single-use token. Keep it in memory; do not screenshot or persist it.
    await clinicianBrowser.clickText("Done");
    await clinicianBrowser.close();
    return "The actual clinician flow created a fictional family and returned a one-use invite link; its token remained in memory only.";
  });

  await recordCheck("Caregiver accepts the invite and chooses clinic sharing in the actual parent flow", "signed-in browser", async () => {
    const parentBrowser = await newBrowser();
    await parentBrowser.navigate(familyLink);
    await parentBrowser.waitPath("/ParentSignup");
    await parentBrowser.fill('[data-testid="input-first-name"]', "Fictional Caregiver");
    await parentBrowser.fill('[data-testid="input-email"]', parentEmail);
    await parentBrowser.fill('[data-testid="input-password"]', parentPassword);
    await parentBrowser.fill('[data-testid="input-confirm-password"]', parentPassword);
    await parentBrowser.setSelect('[data-testid="select-account-holder-age"]', "18_plus");
    await parentBrowser.click('[data-testid="checkbox-privacy"]');
    await parentBrowser.click('[data-testid="checkbox-health"]');
    await parentBrowser.click('[data-testid="checkbox-adult-or-guardian-confirmed"]');
    await parentBrowser.click('[data-testid="checkbox-parent-guardian-authority"]');
    await parentBrowser.click('[data-testid="button-submit"]');
    await parentBrowser.waitText("Add Your Child");
    await parentBrowser.fill('[data-testid="input-child-name"]', childName);
    await parentBrowser.click('[data-testid="button-next-profile"]');
    await parentBrowser.waitText("Choose One or More Behaviors");
    await parentBrowser.clickFirst('[data-testid^="button-behavior-"]');
    await parentBrowser.click('[data-testid="button-next-behavior"]');
    await parentBrowser.waitText("Set a Goal for Each Behavior");
    await parentBrowser.fill('[data-testid^="input-goal-"]', "Try the family's chosen routine together.");
    await parentBrowser.click('[data-testid="button-next-goal"]');
    await parentBrowser.waitText("Want to add more support areas?");
    await parentBrowser.click('[data-testid="button-skip-extras"]');
    await parentBrowser.waitText("Your support cards are ready.");
    await parentBrowser.click('[data-testid="button-skip-upload"]');
    await parentBrowser.waitPath("/ParentHome");
    await parentBrowser.waitText(childName);
    const caregiverNavigation = await parentBrowser.text();
    assert(caregiverNavigation.includes("Home"));
    assert(caregiverNavigation.includes("Practice"));
    assert(caregiverNavigation.includes("Goals"));
    assert(!caregiverNavigation.includes("Clinic administration"));
    assert(!caregiverNavigation.includes("Platform administration"));
    await parentBrowser.navigate(`${webUrl}/ParentHome?tab=clinic`);
    await parentBrowser.waitFor(() => parentBrowser.evaluate(`!!document.querySelector('[data-testid="input-invite-token"]')`));
    await parentBrowser.fill('[data-testid="input-invite-token"]', parentInvite);
    const typedInvite = await parentBrowser.evaluate(`document.querySelector('[data-testid="input-invite-token"]')?.value || ''`);
    assert.equal(
      crypto.createHash("sha256").update(typedInvite, "utf8").digest("hex") === parentInviteHash,
      true,
      "The visible invite field should retain the one-time token provided to the caregiver.",
    );
    await parentBrowser.click('[data-testid="button-check-invite"]');
    await parentBrowser.waitFor(() => parentBrowser.evaluate(`!!document.querySelector('[data-testid="panel-connect"]') || !!document.querySelector('[role="alert"]')`));
    const invitePreview = await parentBrowser.evaluate(`(() => ({ready:!!document.querySelector('[data-testid="panel-connect"]'), alert:document.querySelector('[role="alert"]')?.innerText || ''}))()`);
    assert(invitePreview.ready, `The parent invite preview was not shown: ${invitePreview.alert || "no visible error was rendered"}`);
    await parentBrowser.waitText("invited the");
    await parentBrowser.waitFor(() => parentBrowser.evaluate(`!!document.querySelector('[data-testid="radio-merge-${invitedClinicChildId}"]')`));
    await parentBrowser.click(`[data-testid="radio-merge-${invitedClinicChildId}"]`);
    await parentBrowser.click('[data-testid="checkbox-confirm-merge"]');
    await parentBrowser.click('[data-testid="checkbox-clinic-consent"]');
    await parentBrowser.click('[data-testid="button-connect-clinic"]');
    await parentBrowser.waitText("Connected to a clinician");
    const sameNameChildren = await db.select({
      id: childrenTable.id,
      status: childrenTable.status,
      parentId: childrenTable.parentId,
      clinicianId: childrenTable.clinicianId,
    }).from(childrenTable).where(eq(childrenTable.childName, childName));
    const activeParentChild = sameNameChildren.filter((row) => row.status !== "merged" && row.parentId);
    assert.equal(activeParentChild.length, 1, "Exactly one active parent-owned child should remain after the explicitly confirmed merge.");
    assert.equal(activeParentChild[0].clinicianId, clinicianOneUserId);
    assert.equal(sameNameChildren.find((row) => row.id === invitedClinicChildId)?.status, "merged");
    childId = activeParentChild[0].id;
    const caregiverInbox = await parentBrowser.evaluate(`fetch('/api/demo/clinic-invitation-links',{credentials:'include',cache:'no-store'}).then(async r=>({status:r.status,body:await r.text()}))`);
    assert([401, 403].includes(caregiverInbox.status), "A caregiver session must be denied by the clinician-admin-only inbox.");
    assert(!String(caregiverInbox.body).includes(clinicianOne.email));
    await parentBrowser.screenshot("07-caregiver-connected");
    await parentBrowser.viewport(390, 844, true);
    await parentBrowser.screenshot("08-caregiver-mobile");
    const metrics = await parentBrowser.evaluate("({width:innerWidth, scrollWidth:document.documentElement.scrollWidth, height:innerHeight})");
    assert(metrics.scrollWidth <= metrics.width, "Caregiver Home should not overflow horizontally at phone width.");
    await parentBrowser.close();
    return "The caregiver used the visible account, child setup, clinic-invite preview, merge confirmation and sharing-consent controls; no email was sent.";
  });

  await recordCheck("Clinic administrator assigns the client and the browser reflects the assignment", "signed-in browser", async () => {
    const adminBrowser = await newBrowser();
    await loginClinician(adminBrowser, firstAdminEmail, firstAdminPassword);
    await adminBrowser.navigate(`${webUrl}/ClinicianUsers`);
    await adminBrowser.waitText("Client assignments");
    await adminBrowser.waitFor(() => adminBrowser.evaluate(`!!document.querySelector('[data-testid="row-clinic-client-${childId}"]') || !!document.querySelector('[data-testid="empty-clinic-clients"]') || !!document.querySelector('[data-testid="status-clients-error"]')`), 15_000);
    const assignmentUiState = await adminBrowser.evaluate(`(() => ({
      hasRow:!!document.querySelector('[data-testid="row-clinic-client-${childId}"]'),
      empty:!!document.querySelector('[data-testid="empty-clinic-clients"]'),
      error:!!document.querySelector('[data-testid="status-clients-error"]')
    }))()`);
    if (!assignmentUiState.hasRow) {
      const mappingMatchesClinic = await clinicalRecordClinicId(childId) === clinicId;
      const apiResult = await adminBrowser.evaluate(`fetch('/api/clinic-management/${clinicId}/clients',{credentials:'include',cache:'no-store'}).then(async r=>{const body=await r.json().catch(()=>({}));return {status:r.status,count:Array.isArray(body.clients)?body.clients.length:null,targetIncluded:Array.isArray(body.clients)&&body.clients.some(c=>c.childId===${JSON.stringify(childId)})}})`);
      await adminBrowser.screenshot("05-clinic-assignment-missing");
      throw new Error(`Connected child missing from clinic assignment UI: emptyPanel=${assignmentUiState.empty}, errorPanel=${assignmentUiState.error}, recordClinicMatches=${mappingMatchesClinic}, apiStatus=${apiResult.status}, apiClientCount=${apiResult.count}, apiIncludesChild=${apiResult.targetIncluded}`);
    }
    const trigger = `[data-testid="select-client-clinician-${childId}"]`;
    await adminBrowser.click(trigger);
    await adminBrowser.clickText(clinicianTwo.firstName + " " + clinicianTwo.lastName);
    await adminBrowser.waitText("Client assignment updated.");
    await adminBrowser.screenshot("05-clinic-client-assignment");
    const [clinician] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, clinicianTwo.email));
    const assignments = await db.select({ status: clinicalAssignmentsTable.status }).from(clinicalAssignmentsTable).where(and(
      eq(clinicalAssignmentsTable.clientId, childId),
      eq(clinicalAssignmentsTable.userId, clinician.id),
    ));
    assert(assignments.some((row) => row.status === "active"));
    await adminBrowser.close();
    return "The clinic-admin UI changed the assignment to a clinician in the same clinic.";
  });

  await recordCheck("Assignment changes take effect for an existing clinician session", "signed-in browser", async () => {
    const browser = await newBrowser();
    await loginClinician(browser, clinicianOne.email, clinicianOne.password);
    const result = await browser.evaluate(`fetch('/api/client-detail?child_id=${encodeURIComponent(childId)}', {credentials:'include'}).then(async r=>({status:r.status, body:await r.text()}))`);
    assert.equal(result.status, 403);
    assert(!String(result.body).includes(childName));
    await browser.close();
    return "The formerly assigned clinician’s direct browser request is denied without the child’s name.";
  });

  const clinicianTwoBrowser = await newBrowser();
  await recordCheck("New assignee can access the client through a signed-in browser session", "signed-in browser", async () => {
    await loginClinician(clinicianTwoBrowser, clinicianTwo.email, clinicianTwo.password);
    const result = await clinicianTwoBrowser.evaluate(`fetch('/api/client-detail?child_id=${encodeURIComponent(childId)}', {credentials:'include'}).then(async r=>({status:r.status, body:await r.text()}))`);
    assert.equal(result.status, 200);
    assert(String(result.body).includes(childName));
    return "The currently assigned clinician receives the child record.";
  });

  await recordCheck("A clinic-admin login intent cannot elevate an existing clinician", "signed-in browser", async () => {
    const browser = await newBrowser();
    await loginClinician(browser, clinicianTwo.email, clinicianTwo.password, "clinic-admin");
    const currentPath = await browser.evaluate("location.pathname");
    assert.equal(currentPath, "/ClinicianDashboard");
    const me = await browser.evaluate("fetch('/api/users/me',{credentials:'include'}).then(r=>r.json())");
    assert.deepEqual(me.authorized_workspaces.map((workspace: any) => workspace.id), ["clinical-workspace"]);
    assert.equal((await browser.text()).includes("Clinic administration"), false);
    const inbox = await browser.evaluate(`fetch('/api/demo/clinic-invitation-links',{credentials:'include',cache:'no-store'}).then(async r=>({status:r.status,body:await r.text()}))`);
    assert.equal(inbox.status, 403);
    assert(!String(inbox.body).includes(firstAdminEmail));
    await browser.screenshot("06-clinician-workspace-desktop");
    await browser.close();
    return "The server-authorized clinician membership overrides the clinic-admin navigation intent.";
  });

  await recordCheck("Clinic administrator removes active clinician access and revokes its existing session", "signed-in browser", async () => {
    const adminBrowser = await newBrowser();
    await loginClinician(adminBrowser, firstAdminEmail, firstAdminPassword);
    await adminBrowser.navigate(`${webUrl}/ClinicianUsers`);
    const clinicianTwoUser = (await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, clinicianTwo.email)))[0];
    await adminBrowser.waitFor(() => adminBrowser.evaluate(`!!document.querySelector('[data-testid="button-remove-clinician-${clinicianTwoUser.id}"]')`));
    await adminBrowser.click(`[data-testid="button-remove-clinician-${clinicianTwoUser.id}"]`);
    await adminBrowser.waitText("Remove clinician access?");
    await adminBrowser.click('[data-testid="button-confirm-remove-clinician"]');
    await adminBrowser.waitText("Staff access revoked. Existing sessions were signed out; clinical records were retained.");
    const revoked = await clinicianTwoBrowser.evaluate(`fetch('/api/clinician-data', {credentials:'include'}).then(async r=>({status:r.status, body:await r.text()}))`);
    assert.equal(revoked.status, 401);
    await adminBrowser.screenshot("06-clinician-access-revoked");
    const [stillThere] = await db.select({ id: clinicsTable.id }).from(clinicsTable).where(eq(clinicsTable.id, clinicId));
    assert(stillThere);
    await adminBrowser.close();
    await clinicianTwoBrowser.close();
    return "The UI revoked the clinician’s existing session; clinic and client records remain present.";
  });

  await recordCheck("Responsive clinic-admin page renders at phone width without horizontal overflow", "signed-in browser", async () => {
    const browser = await newBrowser();
    await loginClinician(browser, firstAdminEmail, firstAdminPassword);
    await browser.navigate(`${webUrl}/ClinicianUsers`);
    await browser.waitText("Clinic management");
    await browser.viewport(390, 844, true);
    const metrics = await browser.evaluate("({width:innerWidth, scrollWidth:document.documentElement.scrollWidth})");
    assert(metrics.scrollWidth <= metrics.width, "Clinic team page should not overflow horizontally at phone width.");
    await browser.screenshot("09-clinic-admin-mobile");
    await browser.close();
    return "At a 390-pixel viewport the clinic team page has no horizontal overflow.";
  });

  await recordCheck("A user with two legitimate memberships sees only those workspaces and can switch", "signed-in browser", async () => {
    await db.insert(clinicMembershipsTable).values({
      clinicId,
      userId: operator.userId,
      role: "clinic_admin",
      status: "active",
      createdBy: operator.userId,
    });
    const browser = await newBrowser();
    await loginClinician(browser, operator.email, operator.password);
    await browser.waitPath("/WorkspaceSelect");
    await browser.waitText("These options come from your active account and clinic permissions.");
    const links = await browser.evaluate("([...document.querySelectorAll('[data-testid=\"list-authorized-workspaces\"] [data-testid^=\"link-workspace-\"]')]).map(a=>a.getAttribute('href'))");
    assert.equal(links.length, 2);
    assert(links.some((href: string) => href?.includes("platform-administration")));
    assert(links.some((href: string) => href?.includes("clinic-administration")));
    assert(!links.some((href: string) => href?.includes("clinical-workspace")));
    await browser.screenshot("10-workspace-selector-desktop");
    await browser.viewport(390, 844, true);
    const metrics = await browser.evaluate("({width:innerWidth,scrollWidth:document.documentElement.scrollWidth})");
    assert(metrics.scrollWidth <= metrics.width);
    await browser.screenshot("10-workspace-selector-mobile");
    await browser.click('[data-testid="link-workspace-clinic-administration"]');
    await browser.waitPath("/ClinicianUsers");
    await browser.waitText("Invite a treating clinician");
    await browser.navigate(`${webUrl}/WorkspaceSelect`);
    await browser.click('[data-testid="link-workspace-platform-administration"]');
    await browser.waitPath("/PlatformAdminClinics");
    await browser.waitText("Clinic management");
    await browser.close();
    return "The chooser displayed exactly the server-granted platform and clinic-admin workspaces, excluded clinical access, and both workspace links opened their intended existing pages.";
  });

  await captureAudit();
  const summary = {
    title: "Clinic onboarding first-slice isolated browser acceptance",
    startedAt: new Date(Date.now() - 1).toISOString(),
    finishedAt: new Date().toISOString(),
    testedCommit: spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim(),
    database: { name: expectedDb, host: "127.0.0.1", fictionalOnly: true },
    externalEmail: "disabled; test sink accepted messages only on loopback",
    liveAI: "not configured or called",
    checks,
    passed: checks.filter((check) => check.status === "PASS").length,
    failed: checks.filter((check) => check.status === "FAIL").length,
    notRun: checks.filter((check) => check.status === "NOT_RUN").length,
    screenshots: (await fs.readdir(path.join(evidenceDir!, "screenshots"))).map((name) => `screenshots/${name}`),
    testMailCount: mailMessages.length,
    auditEvidence: "genuine-audit-events.json",
  };
  await saveJson("browser-acceptance-results.json", scrub(summary));
  console.log(`Browser acceptance: ${summary.passed} passed, ${summary.failed} failed.`);
  if (summary.failed) process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  const current = checks.at(-1);
  if (!current || current.status !== "FAIL") {
    checks.push({
      name: "Remaining browser acceptance steps",
      status: "FAIL",
      method: "signed-in browser",
      detail: error instanceof Error ? error.message.slice(0, 300) : "Browser acceptance stopped.",
    });
  }
  for (const name of plannedBrowserChecks) {
    if (!checks.some((check) => check.name === name)) {
      checks.push({
        name,
        status: "NOT_RUN",
        method: "signed-in browser",
        detail: "Not run because an earlier required browser step failed.",
      });
    }
  }
  const result = {
    testedCommit: spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim(),
    checks,
    passed: checks.filter((check) => check.status === "PASS").length,
    failed: checks.filter((check) => check.status === "FAIL").length,
    notRun: checks.filter((check) => check.status === "NOT_RUN").length,
    stoppedAt: new Date().toISOString(),
  };
  try { await saveJson("browser-acceptance-results.json", result); } catch { /* safety or DB guard may stop before evidence creation */ }
  console.error(`Browser acceptance stopped after ${result.passed} passed and ${result.failed} failed check(s).`);
  if (error instanceof Error) console.error(scrubText(error.message));
  process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(evidenceDir!, "local-browser-http.json"), JSON.stringify(staticRequestLog, null, 2), { mode: 0o600 });
  for (const browser of [...browserInstances].reverse()) {
    await browser.close().catch(() => undefined);
  }
  currentBrowser = undefined;
  if (staticWebServer?.listening) {
    staticWebServer.closeAllConnections?.();
    await new Promise<void>((resolve) => staticWebServer!.close(() => resolve()));
  }
  for (const child of [...serviceChildren].reverse()) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  }
  await Promise.all(serviceChildren.map((child) => new Promise<void>((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    child.once("exit", () => resolve());
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      resolve();
    }, 5_000).unref();
  })));
  if (sink?.listening) {
    sink.closeAllConnections?.();
    await new Promise<void>((resolve) => sink!.close(() => resolve()));
  }
  await pool.end().catch(() => undefined);
}

process.exit(process.exitCode ?? 0);
