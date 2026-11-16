import fs from "node:fs/promises";
import path from "node:path";
import { auditLogsTable, db, pool } from "../../artifacts/api-server/node_modules/@workspace/db/src/index.ts";

const databaseUrl = new URL(process.env.DATABASE_URL || "http://invalid");
const privateDir = path.resolve(process.env.NP_DEMO_PRIVATE_DIR || "");
const evidenceDir = path.resolve(process.env.NP_DEMO_EVIDENCE_DIR || "");
const workspace = process.cwd();

if (
  process.env.NODE_ENV !== "test" ||
  process.env.NP_CLINIC_ONBOARDING_DEMO_MODE !== "1" ||
  process.env.REPLIT_CONNECTORS_ENABLED !== "false" ||
  databaseUrl.hostname !== "127.0.0.1" ||
  databaseUrl.pathname !== "/np_demo_clinic_onboarding" ||
  !privateDir.startsWith(path.join(workspace, ".local/clinic-onboarding-demo/run-")) ||
  !evidenceDir.startsWith(path.join(workspace, ".local/verification/clinic-onboarding-demo/"))
) {
  throw new Error("Isolated demo audit export refused an unsafe environment.");
}

try {
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

  await fs.mkdir(evidenceDir, { recursive: true, mode: 0o700 });
  await fs.chmod(evidenceDir, 0o700);
  await fs.writeFile(
    path.join(evidenceDir, "demo-audit-events.json"),
    JSON.stringify({ dataIsFictional: true, events }, null, 2),
    { mode: 0o600 },
  );
  await fs.writeFile(
    path.join(evidenceDir, "audit-export-status.txt"),
    `Exported ${events.length} genuine application audit event(s) from the isolated fictional demo database.\n`,
    { mode: 0o600 },
  );
  console.log(`Exported ${events.length} fictional demo audit event(s).`);
} catch {
  await fs.writeFile(
    path.join(evidenceDir, "audit-export-status.txt"),
    "Audit export failed; no event data was written by this attempt.\n",
    { mode: 0o600 },
  ).catch(() => undefined);
  console.error("Could not export isolated demo audit events.");
  process.exitCode = 1;
} finally {
  await pool.end();
}
