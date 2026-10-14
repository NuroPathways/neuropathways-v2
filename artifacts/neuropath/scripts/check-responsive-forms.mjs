import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { once } from "node:events";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const chromium = process.env.CHROMIUM_BIN || "/repl/tools/bin/chromium";
const viewports = [
  { name: "narrow phone", width: 320, height: 900 },
  { name: "standard phone", width: 390, height: 900 },
  { name: "desktop", width: 1440, height: 1000 },
];

async function getPort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(url, child) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Vite exited early with status ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await delay(150);
  }
  throw new Error(`Timed out waiting for responsive form fixture at ${url}`);
}

async function runBrowserCheck(url, viewport, textScale = 1) {
  const profileDir = await mkdtemp(path.join(os.tmpdir(), "neuropath-responsive-"));
  const browser = spawn(chromium, [
    "--headless", "--no-sandbox", "--disable-gpu", "--no-first-run",
    "--disable-dev-shm-usage", "--remote-debugging-port=0",
    `--user-data-dir=${profileDir}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let browserOutput = "";
  browser.stderr.on("data", (chunk) => { browserOutput += chunk; });

  try {
    let debugUrl;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      debugUrl = browserOutput.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1];
      if (debugUrl) break;
      if (browser.exitCode !== null) throw new Error(`Chromium exited early: ${browserOutput}`);
      await delay(100);
    }
    assert.ok(debugUrl, `Chromium did not expose its debugging connection: ${browserOutput}`);
    const debugOrigin = new URL(debugUrl).origin.replace("ws:", "http:");
    const targetResponse = await fetch(`${debugOrigin}/json/new?${encodeURIComponent("about:blank")}`, { method: "PUT" });
    if (!targetResponse.ok) {
      throw new Error(`Could not create a Chromium tab: ${await targetResponse.text()}`);
    }
    const target = await targetResponse.json();
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    let nextId = 0;
    const pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data.toString());
      if (!message.id) return;
      const callbacks = pending.get(message.id);
      if (!callbacks) return;
      pending.delete(message.id);
      if (message.error) callbacks.reject(new Error(message.error.message));
      else callbacks.resolve(message.result);
    });
    const command = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });

    await command("Page.enable");
    await command("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: true,
    });
    const fixtureUrl = new URL(url);
    fixtureUrl.searchParams.set("textScale", String(textScale));
    await command("Page.navigate", { url: fixtureUrl.toString() });

    let encodedReport;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const result = await command("Runtime.evaluate", { expression: "document.title", returnByValue: true });
      const title = result.result?.value ?? "";
      encodedReport = title.match(/^CHECK_RESULTS:(.+)$/)?.[1];
      if (encodedReport) break;
      await delay(100);
    }
    socket.close();
    assert.ok(encodedReport, `Browser did not return layout results at ${viewport.name}`);
    return JSON.parse(decodeURIComponent(encodedReport));
  } finally {
    browser.kill("SIGTERM");
    if (browser.exitCode === null) {
      await Promise.race([once(browser, "close"), delay(2000)]);
      if (browser.exitCode === null) browser.kill("SIGKILL");
    }
    await rm(profileDir, { recursive: true, force: true });
  }
}

const port = await getPort();
const server = spawn(path.join(packageDir, "node_modules/.bin/vite"), [
  "--config", "vite.config.ts", "--host", "127.0.0.1", "--port", String(port), "--strictPort",
], {
  cwd: packageDir,
  env: { ...process.env, PORT: String(port), BASE_PATH: "/", REPL_ID: "" },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk; });
server.stderr.on("data", (chunk) => { serverOutput += chunk; });

try {
  const fixtureUrl = `http://127.0.0.1:${port}/src/__tests__/fixtures/responsive-form-layout.html`;
  await waitForServer(fixtureUrl, server);

  for (const viewport of viewports) {
    const report = await runBrowserCheck(fixtureUrl, viewport);
    assert.equal(report.viewport, viewport.width, `Unexpected viewport width at ${viewport.name}`);
    assert.deepEqual(report.roles, ["parent", "child", "clinician"], `A representative role form is missing at ${viewport.name}`);
    assert.ok(report.checkedTextContainers >= 19, `Expected stress text cases were not checked at ${viewport.name}`);
    assert.deepEqual(report.reactControls, ["button", "input", "select", "textarea"], `Shared form controls were not all exercised at ${viewport.name}`);
    assert.deepEqual(report.issues, [], `${viewport.name} layout problems:\n${JSON.stringify(report.issues, null, 2)}`);
    console.log(`PASS ${viewport.name} (${viewport.width}px): ${report.roles.join(", ")} forms; ${report.checkedTextContainers} text containers; no clipping or horizontal overflow`);
  }

  const scaledViewport = viewports[0];
  const scaledReport = await runBrowserCheck(fixtureUrl, scaledViewport, 2);
  assert.equal(scaledReport.viewport, scaledViewport.width, "Text scaling must preserve the narrow phone viewport");
  assert.equal(scaledReport.textScale, 2, "The 200% text-size setting must be active");
  assert.ok(scaledReport.rootFontSize >= 32, `Root text size did not reach 200%: ${scaledReport.rootFontSize}px`);
  assert.ok(scaledReport.parentLabelFontSize >= 27, `Parent labels did not enlarge: ${scaledReport.parentLabelFontSize}px`);
  assert.ok(scaledReport.clinicianLabelFontSize >= 23, `Clinician labels did not enlarge: ${scaledReport.clinicianLabelFontSize}px`);
  assert.deepEqual(scaledReport.roles, ["parent", "child", "clinician"], "A representative parent or clinician form is missing at 200% text size");
  assert.ok(scaledReport.checkedTextContainers >= 19, "Expected label, error, and button text was not checked at 200%");
  assert.deepEqual(scaledReport.reactControls, ["button", "input", "select", "textarea"], "Shared clinician form controls were not all exercised at 200%");
  assert.deepEqual(scaledReport.issues, [], `200% text-size layout problems:\n${JSON.stringify(scaledReport.issues, null, 2)}`);
  console.log(`PASS ${scaledViewport.name} (${scaledViewport.width}px) at 200% text: parent and clinician labels, errors, controls, and buttons remain readable and reachable`);
} finally {
  server.kill("SIGTERM");
}

if (server.exitCode === null) {
  await Promise.race([once(server, "close"), delay(3000)]);
  if (server.exitCode === null) server.kill("SIGKILL");
}
