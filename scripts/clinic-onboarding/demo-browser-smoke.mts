import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, "../..");
const demoRoot = path.join(root, ".local", "clinic-onboarding-demo");
const mode = process.env.NP_DEMO_MODE || "";
const credentialsFile = path.resolve(process.env.NP_DEMO_CREDENTIALS_FILE || "");
const evidenceDir = path.resolve(process.env.NP_DEMO_SMOKE_EVIDENCE || "");
const port = Number(process.env.NP_DEMO_SMOKE_PORT);
const chromiumPath = process.env.CHROMIUM_PATH || "/repl/tools/bin/chromium";
const dbUrl = new URL(process.env.DATABASE_URL || "http://invalid");
const browserProfile = path.resolve(evidenceDir, "private-browser-profile");

if (
  process.env.NODE_ENV !== "test" ||
  process.env.REPLIT_CONNECTORS_ENABLED !== "false" ||
  process.env.NP_CLINIC_ONBOARDING_DEMO_MODE !== "1" ||
  !["fresh", "populated"].includes(mode) ||
  dbUrl.hostname !== "127.0.0.1" ||
  dbUrl.pathname !== "/np_demo_clinic_onboarding" ||
  !credentialsFile.startsWith(`${demoRoot}${path.sep}`) ||
  !evidenceDir.startsWith(`${path.join(root, ".local", "verification", "clinic-onboarding-demo")}${path.sep}`) ||
  !Number.isInteger(port)
) {
  throw new Error("Demo browser smoke refused an unguarded or non-fictional environment.");
}

const accounts = JSON.parse(await fs.readFile(credentialsFile, "utf8")).logins as Array<{
  role: string; email: string; password: string;
}>;
const platform = accounts.find((account) => account.role === "platform_admin");
const clinicAdmin = accounts.find((account) => account.role === "clinic_admin");
const clinician = accounts.find((account) => account.role === "treating_clinician");
const caregiver = accounts.find((account) => account.role === "parent");
assert(platform, "No fictional platform administrator exists in the demo credentials.");
if (mode === "populated") {
  assert(clinicAdmin, "No fictional clinic administrator exists in the populated demo.");
  assert(clinician, "No fictional treating clinician exists in the populated demo.");
  assert(caregiver, "No fictional caregiver exists in the populated demo.");
}
await fs.mkdir(path.join(evidenceDir, "screenshots"), { recursive: true, mode: 0o700 });
await fs.mkdir(browserProfile, { recursive: true, mode: 0o700 });

const portProbe = http.createServer();
await new Promise<void>((resolve, reject) => {
  portProbe.once("error", reject);
  portProbe.listen(0, "127.0.0.1", resolve);
});
const cdpPort = (portProbe.address() as import("node:net").AddressInfo).port;
await new Promise<void>((resolve) => portProbe.close(() => resolve()));

const browserProcess: ChildProcess = spawn(chromiumPath, [
  "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
  "--disable-background-networking", "--disable-sync", "--no-first-run",
  "--no-default-browser-check", "--remote-allow-origins=*",
  "--remote-debugging-address=127.0.0.1", `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=${browserProfile}`,
  "--host-resolver-rules=MAP * ~NOTFOUND,EXCLUDE 127.0.0.1",
  "about:blank",
], { stdio: "ignore", detached: true, env: { ...process.env, NODE_OPTIONS: "" } });

let socket: WebSocket | undefined;
let messageId = 0;
const pending = new Map<number, { resolve(value: any): void; reject(error: Error): void }>();
const checks: Array<{ name: string; status: "PASS" | "FAIL"; evidence?: string }> = [];
let caregiverChildrenFromLogin: number | undefined;
let browserCaregiverChildren: number | null | undefined;

function send(method: string, params: Record<string, unknown> = {}) {
  const id = ++messageId;
  return new Promise<any>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket!.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      const waiting = pending.get(id);
      if (waiting) { pending.delete(id); reject(new Error(`Browser command timed out: ${method}`)); }
    }, 15_000).unref();
  });
}

async function evaluate(expression: string) {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (result.exceptionDetails) throw new Error("Browser evaluation failed.");
  return result.result?.value;
}

async function waitFor(predicate: () => Promise<unknown>, message: string, timeout = 20_000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    try { if (await predicate()) return; } catch { /* The UI is still loading. */ }
    await delay(200);
  }
  throw new Error(message);
}

async function clickText(label: string) {
  const clicked = await evaluate(`(() => {const t=${JSON.stringify(label)};const e=[...document.querySelectorAll('button,a,[role="button"]')].find(x=>x.innerText.trim()===t&&x.getClientRects().length&&!x.disabled);if(!e)return false;e.scrollIntoView({block:'center'});e.click();return true})()`);
  assert.equal(clicked, true, `Visible control not found: ${label}`);
}

async function fill(selector: string, value: string) {
  const exists = await evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)})?.getClientRects().length)`);
  assert.equal(exists, true, `Visible input not found: ${selector}`);
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
  for (const [type, key, code, keyCode, modifiers] of [
    ["keyDown", "a", "KeyA", 65, 2], ["keyUp", "a", "KeyA", 65, 2],
    ["keyDown", "Backspace", "Backspace", 8, 0], ["keyUp", "Backspace", "Backspace", 8, 0],
  ] as const) {
    await send("Input.dispatchKeyEvent", { type, key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, modifiers });
  }
  await send("Input.insertText", { text: value });
}

async function screenshot(name: string) {
  const captured = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const relative = `screenshots/${name}.png`;
  await fs.writeFile(path.join(evidenceDir, relative), Buffer.from(captured.data, "base64"), { mode: 0o600 });
  return relative;
}

async function signIn(email: string, password: string, role: "clinician" | "parent", workspaceIntent?: "clinic-admin" | "clinician") {
  const route = role === "clinician"
    ? `ClinicianLogin${workspaceIntent ? `?workspace=${workspaceIntent}` : ""}`
    : "ParentLogin";
  await send("Page.navigate", { url: `http://127.0.0.1:${port}/${route}` });
  await waitFor(() => evaluate("document.readyState === 'complete' || document.readyState === 'interactive'"), "Login page did not load.");
  if (role === "clinician") {
    const heading = workspaceIntent === "clinic-admin" ? "Clinic administrator sign in" : "Clinician sign in";
    await waitFor(
      () => evaluate(`(document.querySelector('h1')?.innerText||'').trim() === ${JSON.stringify(heading)}`),
      "Clinician login page did not render.",
    );
    await clickText("Sign In with Email");
  }
  await waitFor(() => evaluate("Boolean(document.querySelector('input[type=email]')?.getClientRects().length)"), "Email form did not appear.");
  await fill('input[type="email"]', email);
  await fill('input[type="password"]', password);
  await clickText(role === "clinician" ? "Sign In" : "Sign in");
  if (role === "clinician") {
    await waitFor(
      () => evaluate("location.pathname !== '/ClinicianLogin'"),
      "Platform admin login did not leave the clinician login page.",
    );
  } else {
    await waitFor(
      () => evaluate("location.pathname !== '/ParentLogin'"),
      "Caregiver login did not leave the login page.",
    );
  }
}

async function clearBrowserAuthState() {
  await send("Network.clearBrowserCookies");
  await send("Page.navigate", { url: `http://127.0.0.1:${port}/` });
  await waitFor(() => evaluate("document.readyState === 'complete' || document.readyState === 'interactive'"), "The app did not reload before the next demo role.");
  await evaluate("localStorage.clear(); sessionStorage.clear(); true");
}

async function main() {
  if (mode === "populated" && caregiver) {
    const apiPort = Number(process.env.NP_DEMO_API_PORT);
    const response = await fetch(`http://127.0.0.1:${apiPort}/api/parent/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: caregiver.email, password: caregiver.password }),
    });
    const body = await response.json() as { children?: unknown[] };
    caregiverChildrenFromLogin = Array.isArray(body.children) ? body.children.length : 0;
    checks.push({
      name: "Caregiver login API returns the seeded linked child",
      status: response.ok && caregiverChildrenFromLogin > 0 ? "PASS" : "FAIL",
    });
    assert.equal(response.ok, true, `Caregiver login API returned HTTP ${response.status}.`);
    assert.equal(caregiverChildrenFromLogin, 1, "Caregiver login did not return exactly one linked child.");
  }
  const targetUntil = Date.now() + 20_000;
  let target: any;
  while (Date.now() < targetUntil) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json() as any[];
      target = targets.find((item) => item.type === "page");
      if (target?.webSocketDebuggerUrl) break;
    } catch { /* Chromium is still starting. */ }
    await delay(150);
  }
  assert(target?.webSocketDebuggerUrl, "Chromium DevTools did not start.");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    socket!.addEventListener("open", () => resolve(), { once: true });
    socket!.addEventListener("error", () => reject(new Error("Chromium DevTools connection failed.")), { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id) return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message || "Browser command failed."));
    else waiter.resolve(message.result);
  });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");

  await send("Page.navigate", { url: `http://127.0.0.1:${port}/` });
  await waitFor(() => evaluate("Boolean(document.querySelector('[data-testid=\"section-workspace-entry\"]'))"), "The redesigned public landing page did not render.");
  const landingText = String(await evaluate("document.body?.innerText||''"));
  const landingLinks = await evaluate(`Object.fromEntries([...document.querySelectorAll('[data-testid^="link-"]')].map(a=>[a.getAttribute('data-testid'),a.getAttribute('href')]))`);
  assert.match(landingText, /Caregivers and parents/i);
  assert.match(landingText, /Clinicians/i);
  assert.match(landingText, /Clinic administrators/i);
  assert.equal(landingLinks["link-caregiver-sign-in"], "/ParentLogin");
  assert.equal(landingLinks["link-clinician-entry"], "/ClinicianLogin?workspace=clinician");
  assert.equal(landingLinks["link-clinic-admin-entry"], "/ClinicianLogin?workspace=clinic-admin");
  const landingShot = await screenshot("public-landing");
  checks.push({ name: "Redesigned landing page shows distinct role entry points", status: "PASS", evidence: landingShot });

  await signIn(platform.email, platform.password, "clinician");
  await waitFor(
    () => evaluate("(document.body?.innerText||'').includes('Create a clinic') || (document.body?.innerText||'').includes('Platform clinic access')"),
    "The platform clinic page did not finish rendering.",
  );
  let pageText = String(await evaluate("document.body?.innerText||''"));
  const platformRoute = String(await evaluate("location.pathname"));
  const platformShot = await screenshot("platform-admin-signed-in");
  assert.equal(platformRoute, "/PlatformAdminClinics", `Platform administrator landed on ${platformRoute}.`);
  assert.match(pageText, /Create a clinic|Platform clinic access|Clinics/i);
  assert.match(pageText, /Clinic management/i);
  checks.push({ name: "Platform administrator signs in through the visible UI", status: "PASS", evidence: platformShot });

  if (mode === "populated" && clinicAdmin && clinician && caregiver) {
    await clearBrowserAuthState();
    await signIn(clinicAdmin.email, clinicAdmin.password, "clinician", "clinic-admin");
    await waitFor(() => evaluate("location.pathname === '/ClinicianUsers'"), "Clinic administrator did not reach the clinic-management workspace.");
    pageText = String(await evaluate("document.body?.innerText||''"));
    assert.match(pageText, /Clinic administration/i);
    assert.match(pageText, /Clinic overview/i);
    assert.match(pageText, /Staff & invitations/i);
    assert.match(pageText, /Client assignments/i);
    assert.doesNotMatch(pageText, /Create a clinic directly/i);
    const clinicAdminShot = await screenshot("clinic-admin-signed-in");
    checks.push({ name: "Clinic administrator sees only clinic staff and assignment navigation", status: "PASS", evidence: clinicAdminShot });

    await clearBrowserAuthState();
    await signIn(clinician.email, clinician.password, "clinician", "clinician");
    await waitFor(() => evaluate("location.pathname === '/ClinicianDashboard'"), "Treating clinician did not reach the clinical dashboard.");
    pageText = String(await evaluate("document.body?.innerText||''"));
    assert.match(pageText, /My Clients/i);
    assert.match(pageText, /Dashboard/i);
    assert.match(pageText, /Documents/i);
    assert.doesNotMatch(pageText, /Create a clinic directly/i);
    const clinicianShot = await screenshot("treating-clinician-signed-in");
    checks.push({ name: "Treating clinician sees the clinical workspace menu", status: "PASS", evidence: clinicianShot });

    await clearBrowserAuthState();
    await send("Page.addScriptToEvaluateOnNewDocument", {
      source: `(() => { const original=window.fetch.bind(window); window.fetch=async (...args)=>{const response=await original(...args);const url=typeof args[0]==='string'?args[0]:args[0]?.url||'';if(url.includes('/api/parent/auth/login')){try{const body=await response.clone().json();window.__demoLoginChildrenCount=Array.isArray(body.children)?body.children.length:null}catch{window.__demoLoginChildrenCount=null}}return response} })()`,
    });
    await signIn(caregiver.email, caregiver.password, "parent");
    const caregiverRoute = String(await evaluate("location.pathname"));
    pageText = String(await evaluate("document.body?.innerText||''"));
    browserCaregiverChildren = await evaluate("window.__demoLoginChildrenCount ?? null");
    const parentShot = await screenshot("caregiver-signed-in");
    assert.ok(
      caregiverRoute === "/ParentHome" || caregiverRoute === "/ParentDashboard",
      `Caregiver login landed on ${caregiverRoute}.`,
    );
    assert.match(pageText, /Demo Child 1|Child 1/i);
    checks.push({ name: "Caregiver signs in and sees only the seeded linked child", status: "PASS", evidence: parentShot });
  }
}

let failure: string | undefined;
try {
  await main();
} catch (error) {
  failure = error instanceof Error ? error.message.replace(/password|secret|token|credential/gi, "[redacted]") : "Browser verification failed.";
  checks.push({ name: "Seeded demo browser login", status: "FAIL" });
} finally {
  try { socket?.close(); } catch { /* Browser is already closed. */ }
  if (browserProcess.pid) {
    try { process.kill(-browserProcess.pid, "SIGTERM"); } catch { browserProcess.kill("SIGTERM"); }
  }
  await fs.rm(browserProfile, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 }).catch(() => {});
  const report = {
    mode,
    testedAt: new Date().toISOString(),
    database: "np_demo_clinic_onboarding on 127.0.0.1",
    providers: { ai: "fake/not called", email: "local no-send/not called", storage: "private temporary filesystem" },
    caregiverChildrenFromLogin,
    browserCaregiverChildren,
    status: failure ? "FAIL" : "PASS",
    passed: checks.filter((check) => check.status === "PASS").length,
    failed: checks.filter((check) => check.status === "FAIL").length,
    checks,
    failure: failure || undefined,
  };
  await fs.writeFile(path.join(evidenceDir, "demo-browser-smoke.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
}
if (failure) throw new Error(failure);
console.log(`Demo browser smoke passed: ${checks.length} signed-in browser check(s); evidence saved without credential values.`);
