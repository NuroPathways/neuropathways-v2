import { db, auditLogsTable } from "@workspace/db";
import { logger } from "./logger";

type AuditExecutor = {
  insert: typeof db.insert;
};

export type AuditEvent = {
  userId?: string | null;
  userRole?: string | null;
  tenantId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  success?: boolean;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  requestId?: string | number | null;
};

const PRIVATE_METADATA_KEY = /password|access.?code|secret|credential|authorization|cookie|document.?text|excerpt|prompt|response|file.?contents|clinical.?content|^body$|^notes?$/i;

function safeMetadataValue(value: unknown, depth = 0, key?: string): unknown {
  if (depth > 5) return "[omitted]";
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.slice(0, key === "storage_path" ? 4096 : 500);
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => safeMetadataValue(item, depth + 1));
  if (!value || typeof value !== "object") return undefined;
  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (PRIVATE_METADATA_KEY.test(key)) continue;
    const safe = safeMetadataValue(nested, depth + 1, key);
    if (safe !== undefined) result[key.slice(0, 80)] = safe;
  }
  return result;
}

export function safeAuditMetadata(
  metadata?: Record<string, unknown> | null,
  requestId?: string | number | null,
): Record<string, unknown> | null {
  const safe = safeMetadataValue(metadata ?? {});
  const result = safe && typeof safe === "object" && !Array.isArray(safe)
    ? safe as Record<string, unknown>
    : {};
  const correlationId = requestId === null || requestId === undefined ? "" : String(requestId);
  if (correlationId && correlationId.length <= 120) result.request_id = correlationId;
  return Object.keys(result).length ? result : null;
}

export async function writeAuditEvent(executor: AuditExecutor, event: AuditEvent): Promise<void> {
  await executor.insert(auditLogsTable).values({
    userId: event.userId ?? null,
    userRole: event.userRole ?? null,
    tenantId: event.tenantId ?? null,
    action: event.action,
    targetType: event.targetType ?? null,
    targetId: event.targetId ?? null,
    success: event.success ?? true,
    reason: event.reason ?? null,
    metadata: safeAuditMetadata(event.metadata, event.requestId),
    ipAddress: event.ipAddress ?? null,
  });
}

export async function writeAuditEventBestEffort(event: AuditEvent): Promise<void> {
  try {
    await writeAuditEvent(db, event);
  } catch (error) {
    logger.error({
      action: event.action,
      target_type: event.targetType ?? null,
      request_id: event.requestId ?? null,
      error_name: error instanceof Error ? error.name : "UnknownError",
    }, "Audit event could not be persisted");
  }
}
