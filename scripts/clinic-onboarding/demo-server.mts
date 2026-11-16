import { createServer, request as httpRequest } from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import app from "../../artifacts/api-server/src/app.js";
import { auditLogsTable, db } from "../../artifacts/api-server/node_modules/@workspace/db/src/index.ts";

const publicDir = path.resolve(process.env.NP_DEMO_PUBLIC_DIR || "");
const evidenceDir = path.resolve(process.env.NP_DEMO_EVIDENCE_DIR || "");
const port = Number(process.env.PORT);
const apiPort = Number(process.env.NP_DEMO_API_PORT);
const expectedDb = "np_demo_clinic_onboarding";

if (
  process.env.NODE_ENV !== "test" ||
  process.env.NP_CLINIC_ONBOARDING_DEMO_MODE !== "1" ||
  process.env.REPLIT_CONNECTORS_ENABLED !== "false" ||
  new URL(process.env.DATABASE_URL || "http://invalid").hostname !== "127.0.0.1" ||
  new URL(process.env.DATABASE_URL || "http://invalid").pathname !== `/${expectedDb}` ||
  !Number.isInteger(port) ||
  !Number.isInteger(apiPort) ||
  !publicDir.includes(`${path.sep}.local${path.sep}clinic-onboarding-demo${path.sep}`) ||
  !evidenceDir.includes(`${path.sep}.local${path.sep}verification${path.sep}clinic-onboarding-demo${path.sep}`)
) {
  throw new Error("Isolated clinic demo server refused an unsafe environment.");
}

const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const apiServer = createServer(app);
const webServer = createServer(async (incoming, outgoing) => {
  const requestPath = incoming.url || "/";
  if (requestPath === "/api" || requestPath.startsWith("/api/")) {
    const upstream = httpRequest({
      hostname: "127.0.0.1",
      port: apiPort,
      method: incoming.method,
      path: requestPath,
      headers: { ...incoming.headers, host: `127.0.0.1:${apiPort}` },
    }, (upstreamResponse) => {
      outgoing.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
      upstreamResponse.pipe(outgoing);
    });
    upstream.on("error", () => {
      if (!outgoing.headersSent) outgoing.writeHead(502, { "content-type": "application/json" });
      outgoing.end('{"error":"The isolated demo API is unavailable."}');
    });
    incoming.pipe(upstream);
    return;
  }

  let pathname = "/";
  try {
    pathname = decodeURIComponent(new URL(requestPath, "http://127.0.0.1").pathname);
  } catch {
    outgoing.writeHead(400).end();
    return;
  }
  const requested = pathname === "/"
    ? path.join(publicDir, "index.html")
    : path.resolve(publicDir, `.${pathname}`);
  if (!requested.startsWith(`${publicDir}${path.sep}`) && requested !== path.join(publicDir, "index.html")) {
    outgoing.writeHead(400).end();
    return;
  }
  let target = requested;
  try {
    if (!(await fs.stat(target)).isFile()) target = path.join(publicDir, "index.html");
  } catch {
    target = path.join(publicDir, "index.html");
  }
  try {
    const content = await fs.readFile(target);
    outgoing.writeHead(200, {
      "content-type": mimeTypes[path.extname(target).toLowerCase()] || "application/octet-stream",
      "content-length": content.byteLength,
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    });
    outgoing.end(content);
  } catch {
    outgoing.writeHead(404).end();
  }
});

const closeServer = (server: ReturnType<typeof createServer>) =>
  new Promise<void>((resolve) => server.close(() => resolve()));

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  try {
    await fs.mkdir(evidenceDir, { recursive: true, mode: 0o700 });
    await fs.chmod(evidenceDir, 0o700);
    const events = await db.select({
      id: auditLogsTable.id,
      userId: auditLogsTable.userId,
      userRole: auditLogsTable.userRole,
      tenantId: auditLogsTable.tenantId,
      action: auditLogsTable.action,
      targetType: auditLogsTable.targetType,
      targetId: auditLogsTable.targetId,
      success: auditLogsTable.success,
      createdDate: auditLogsTable.createdDate,
    }).from(auditLogsTable);
    await fs.writeFile(
      path.join(evidenceDir, "demo-audit-events.json"),
      JSON.stringify({ dataIsFictional: true, events }, null, 2),
      { mode: 0o600 },
    );
  } catch {
    // Cleanup continues even if an evidence snapshot cannot be written.
  }
  await Promise.all([closeServer(webServer), closeServer(apiServer)]);
}

process.on("SIGTERM", () => { void stop().finally(() => process.exit(0)); });
process.on("SIGINT", () => { void stop().finally(() => process.exit(0)); });

await new Promise<void>((resolve, reject) => {
  apiServer.once("error", reject);
  apiServer.listen(apiPort, "127.0.0.1", resolve);
});
await new Promise<void>((resolve, reject) => {
  webServer.once("error", reject);
  // Replit's preview proxy must reach this fictional UI listener. Omitting the
  // hostname lets Node bind its unspecified wildcard address without a DNS
  // lookup. The API upstream and disposable database remain loopback-only;
  // outbound requests are still blocked by the preloaded network guard.
  webServer.listen(port, resolve);
});
console.log(`Fictional clinic demo ready on preview port ${port}.`);
