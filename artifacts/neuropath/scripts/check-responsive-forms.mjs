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
      if (message.error) callbacks.reject(new Error(`${message.method || "Chromium command"}: ${message.error.message}`));
      else callbacks.resolve(message.result);
    });
    const command = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject: (error) => reject(new Error(`${method}: ${error.message}`)) });
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

async function runProductionRouteChecks(url, viewport) {
  const profileDir = await mkdtemp(path.join(os.tmpdir(), "neuropath-routes-"));
  const browser = spawn(chromium, [
    "--headless", "--no-sandbox", "--disable-gpu", "--no-first-run",
    "--disable-dev-shm-usage", "--remote-debugging-port=0",
    `--user-data-dir=${profileDir}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let browserOutput = "";
  browser.stderr.on("data", (chunk) => { browserOutput += chunk; });
  const routes = [
    { path: "/ParentQuickStart", name: "parent setup", expected: "Add Your Child" },
    { path: "/ParentSignupUsername", name: "parent signup", expected: "Create Your Account" },
    { path: "/UsernameLogin", name: "client sign in", expected: "Client sign in" },
    { path: "/ClientHome", name: "client portal", expected: "My Children" },
  ];

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
    if (!targetResponse.ok) throw new Error(`Could not create a Chromium tab: ${await targetResponse.text()}`);
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
      if (message.error) callbacks.reject(new Error(JSON.stringify(message.error)));
      else callbacks.resolve(message.result);
    });
    const command = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject: (error) => reject(new Error(`${method}: ${error.message}`)) });
      socket.send(JSON.stringify({ id, method, params }));
    });

    await command("Page.enable");
    await command("Runtime.enable");
    await command("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await command("Page.addScriptToEvaluateOnNewDocument", {
      source: `(() => {
        const path = location.pathname;
        const parentRoute = path === "/ParentQuickStart";
        const clientRoute = path === "/ClientHome";
        if (parentRoute) {
          localStorage.removeItem("np_client_session");
          localStorage.setItem("np_parent_token", "responsive-check-parent-token");
        } else if (clientRoute) {
          localStorage.removeItem("np_parent_token");
          localStorage.setItem("np_client_session", JSON.stringify({
            id: "responsive-check-family",
            invite_token: "responsive-check-invite",
            display_name: "Taylor",
            account_type: "family",
            children: [{ id: "responsive-check-child", child_name: "Jordan", age: 10 }]
          }));
        } else {
          localStorage.removeItem("np_parent_token");
          localStorage.removeItem("np_client_session");
        }

        const nativeFetch = window.fetch.bind(window);
        window.fetch = async (input, init = {}) => {
          const url = new URL(typeof input === "string" ? input : input.url, location.href);
          const json = (body, status = 200) => new Response(JSON.stringify(body), {
            status, headers: { "Content-Type": "application/json" }
          });
          if (url.pathname === "/api/parent/session") {
            return parentRoute
              ? json({ parent: { id: "responsive-check-parent", email: "parent@example.test", firstName: "Taylor", workspaceId: "responsive-check-workspace" }, children: [] })
              : json({ error: "Not authenticated" }, 401);
          }
          if (url.pathname === "/api/parent/starter-library") return json([]);
          if (url.pathname === "/api/client-portal-data") {
            return json({
              child: { id: "responsive-check-child", child_name: "Jordan", age: 10 },
              siblings: [{ id: "responsive-check-child", child_name: "Jordan", age: 10 }],
              plans: [], profile: { goals: [] }, behaviorLogs: [], documents: [], messages: []
            });
          }
          if (url.pathname === "/api/privacy-config") {
            return json({
              privacy_policy_version: "responsive-check",
              health_consent_version: "responsive-check",
              authorized_uploader_attestation_version: "responsive-check"
            });
          }
          return nativeFetch(input, init);
        };
      })();`,
    });

    const results = [];
    for (const route of routes) {
      await command("Page.navigate", { url: `${url}${route.path}` });
      let ready = false;
      let lastPageState = {};
      for (let attempt = 0; attempt < 120; attempt += 1) {
        const result = await command("Runtime.evaluate", {
          expression: `(() => {
            const root = document.querySelector("#root");
            const text = root?.innerText || "";
            const routeRoot = ${JSON.stringify(route.path)} === "/ClientHome"
              ? document.querySelector(".client-home")
              : ${JSON.stringify(route.path)} === "/ParentSignupUsername"
                ? document.querySelector("#root .max-w-md")
                : document.querySelector(".pf-narrow, #root main");
            return { ready: Boolean(routeRoot && text.includes(${JSON.stringify(route.expected)})), url: location.href, title: document.title, text: text.slice(0, 500) };
          })()`,
          returnByValue: true,
        });
        lastPageState = result.result?.value || {};
        if (lastPageState.ready) {
          ready = true;
          break;
        }
        await delay(100);
      }
      assert.ok(ready, `Production route ${route.path} did not render "${route.expected}" at ${viewport.name}: ${JSON.stringify(lastPageState)}`);

      const measured = await command("Runtime.evaluate", {
        expression: `(() => {
          const width = document.documentElement.clientWidth;
          const height = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
          const pageWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
          const issues = [];
          const add = (element, issue) => {
            const text = (element.innerText || element.getAttribute("aria-label") || element.getAttribute("placeholder") || element.value || element.tagName).trim().replace(/\\s+/g, " ").slice(0, 100);
            issues.push({ element: element.tagName.toLowerCase() + (element.id ? "#" + element.id : "") + (typeof element.className === "string" && element.className ? "." + element.className.trim().replace(/\\s+/g, ".") : ""), text, issue });
          };
          if (width !== ${viewport.width}) issues.push({ element: "document", issue: "CSS viewport was " + width + "px, expected ${viewport.width}px" });
          if (pageWidth > width + 1) issues.push({ element: "document", issue: "horizontal overflow " + pageWidth + "px > " + width + "px" });

          const visible = (element) => {
            const style = getComputedStyle(element);
            const bounds = element.getBoundingClientRect();
            return bounds.width > 0 && bounds.height > 0 && style.visibility !== "hidden" && style.display !== "none";
          };
          const routeRoot = ${JSON.stringify(route.path)} === "/ClientHome"
            ? document.querySelector(".client-home")
            : ${JSON.stringify(route.path)} === "/ParentSignupUsername"
              ? document.querySelector("#root .max-w-md")
              : document.querySelector(".pf-narrow, #root main");
          const controls = [...routeRoot.querySelectorAll("input, textarea, select, button, a[href]")].filter(visible);
          for (const element of controls) {
            const bounds = element.getBoundingClientRect();
            if (bounds.left < -1 || bounds.right > width + 1 || bounds.top < -1 || bounds.bottom > height + 1) {
              add(element, "control outside the page bounds (" + Math.round(bounds.left) + ".." + Math.round(bounds.right) + ", " + Math.round(bounds.top) + ".." + Math.round(bounds.bottom) + ")");
            }
            if (element.scrollWidth > element.clientWidth + 2 && ["hidden", "clip"].includes(getComputedStyle(element).overflowX)) {
              add(element, "control content clipped (" + element.scrollWidth + "px > " + element.clientWidth + "px)");
            }
            for (let ancestor = element.parentElement; ancestor && ancestor !== routeRoot.parentElement; ancestor = ancestor.parentElement) {
              const style = getComputedStyle(ancestor);
              const clip = ancestor.getBoundingClientRect();
              if ((["hidden", "clip"].includes(style.overflowX) && (bounds.left < clip.left - 1 || bounds.right > clip.right + 1))
                || (["hidden", "clip"].includes(style.overflowY) && (bounds.top < clip.top - 1 || bounds.bottom > clip.bottom + 1))) {
                add(element, "control clipped by ancestor " + ancestor.tagName.toLowerCase() + (ancestor.className ? "." + String(ancestor.className).trim().replace(/\\s+/g, ".") : ""));
                break;
              }
            }
          }

          const textNodes = [...routeRoot.querySelectorAll("h1, h2, h3, p, label, button, a, small, strong, [role=alert]")].filter(visible);
          for (const element of textNodes) {
            const bounds = element.getBoundingClientRect();
            if (element.scrollWidth > element.clientWidth + 2 && ["hidden", "clip"].includes(getComputedStyle(element).overflowX)) {
              add(element, "text clipped horizontally (" + element.scrollWidth + "px > " + element.clientWidth + "px)");
            }
            if (element.scrollHeight > element.clientHeight + 2 && ["hidden", "clip"].includes(getComputedStyle(element).overflowY)) {
              add(element, "text clipped vertically (" + element.scrollHeight + "px > " + element.clientHeight + "px)");
            }
            const range = document.createRange();
            range.selectNodeContents(element);
            for (const rect of range.getClientRects()) {
              if (rect.width && (rect.left < bounds.left - 2 || rect.right > bounds.right + 2)) {
                add(element, "text escapes its container (" + Math.round(rect.left) + ".." + Math.round(rect.right) + ")");
                break;
              }
              for (let ancestor = element; ancestor && ancestor !== routeRoot.parentElement; ancestor = ancestor.parentElement) {
                const style = getComputedStyle(ancestor);
                const clip = ancestor.getBoundingClientRect();
                if ((["hidden", "clip"].includes(style.overflowX) && (rect.left < clip.left - 1 || rect.right > clip.right + 1))
                  || (["hidden", "clip"].includes(style.overflowY) && (rect.top < clip.top - 1 || rect.bottom > clip.bottom + 1))) {
                  add(element, "text clipped by ancestor " + ancestor.tagName.toLowerCase() + (ancestor.className ? "." + String(ancestor.className).trim().replace(/\\s+/g, ".") : ""));
                  break;
                }
              }
            }
          }
          return {
            viewport: width,
            pageWidth,
            documentHeight: height,
            heading: routeRoot.querySelector("h1, h2")?.innerText?.trim() || "",
            controlCount: controls.length,
            textCount: textNodes.length,
            issues
          };
        })()`,
        returnByValue: true,
      });
      const report = measured.result?.value;
      assert.ok(report, `No layout report returned for ${route.path} at ${viewport.name}`);
      assert.deepEqual(report.issues, [], `${route.name} (${route.path}) at ${viewport.name} (${viewport.width}px):\n${JSON.stringify(report.issues, null, 2)}`);
      assert.ok(report.controlCount > 0, `No production form controls or links were measured on ${route.path}`);
      results.push({ ...route, report });
    }
    socket.close();
    return results;
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

    const productionRoutes = await runProductionRouteChecks(`http://127.0.0.1:${port}`, viewport);
    for (const route of productionRoutes) {
      console.log(`PASS ${route.name} (${route.path}) at ${viewport.name} (${viewport.width}px): ${route.report.controlCount} controls and ${route.report.textCount} text containers; no clipping or horizontal overflow`);
    }
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
