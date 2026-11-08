import crypto from "node:crypto";
import {
  auditLogsTable,
  db,
  documentExtractionRunsTable,
} from "@workspace/db";
import { and, desc, eq, inArray, notExists } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { deleteUploadedDocumentFile } from "./uploadedDocumentFile";
import { logger } from "./logger";
import {
  deleteEncryptedDocumentScanOutput,
  deleteEncryptedParentDocument,
} from "./parentFileStorage";
import { writeAuditEvent } from "./auditEvents";

type CleanupKind = "parent_encrypted" | "uploaded_local" | "scan_output" | "unsupported";

export type DocumentCleanupSpec = {
  kind: CleanupKind;
  storagePath: string | null;
  documentId: string;
  childId: string;
  tenantId?: string | null;
  actorId?: string | null;
  actorRole: string;
  requestId?: string | null;
};

type CleanupMetadata = {
  kind: CleanupKind;
  storage_path: string | null;
  document_id: string;
  child_id: string;
  tenant_id: string | null;
  actor_id: string | null;
  actor_role: string;
  request_id: string | null;
  attempt?: number;
  retry_at?: string;
  terminal?: boolean;
};

const MAX_CLEANUP_ATTEMPTS = 8;
const CLEANUP_RETRY_BASE_MS = 60_000;
const CLEANUP_RETRY_MAX_MS = 24 * 60 * 60 * 1000;
let cleanupWorkerRunning = false;

function cleanupEncryptionKey(): Buffer {
  const configured = process.env.FILE_ENCRYPTION_KEY;
  if (!configured || !/^[0-9a-f]{64}$/i.test(configured)) {
    throw new Error("Encrypted cleanup metadata is unavailable");
  }
  return Buffer.from(configured, "hex");
}

export function encryptCleanupPath(storagePath: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", cleanupEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(storagePath, "utf8"), cipher.final()]);
  return ["NPA1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")]
    .join(".");
}

export function decryptCleanupPath(value: string): string {
  const [format, encodedIv, encodedTag, encodedCiphertext, ...extra] = value.split(".");
  if (format !== "NPA1" || !encodedIv || !encodedTag || !encodedCiphertext || extra.length) {
    throw new Error("Invalid cleanup path envelope");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", cleanupEncryptionKey(), Buffer.from(encodedIv, "base64url"));
  decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export async function documentScanOutputPaths(documentId: string): Promise<string[]> {
  const runs = await db.select({ scanOutputPath: documentExtractionRunsTable.scanOutputPath })
    .from(documentExtractionRunsTable)
    .where(eq(documentExtractionRunsTable.documentId, documentId));
  return [...new Set(runs.map((run) => run.scanOutputPath).filter((value): value is string => Boolean(value)))];
}

export async function queueDocumentCleanup(
  transaction: any,
  specs: DocumentCleanupSpec[],
): Promise<string[]> {
  const jobIds: string[] = [];
  for (const spec of specs) {
    const jobId = crypto.randomUUID();
    jobIds.push(jobId);
    const metadata: CleanupMetadata = {
      kind: spec.kind,
      storage_path: spec.storagePath ? encryptCleanupPath(spec.storagePath) : null,
      document_id: spec.documentId,
      child_id: spec.childId,
      tenant_id: spec.tenantId ?? null,
      actor_id: spec.actorId ?? null,
      actor_role: spec.actorRole,
      request_id: spec.requestId === null || spec.requestId === undefined ? null : String(spec.requestId),
      attempt: 0,
    };
    await writeAuditEvent(transaction, {
      userId: spec.actorId,
      userRole: spec.actorRole,
      tenantId: spec.tenantId,
      action: "document_file_cleanup_queued",
      targetType: "document_cleanup_job",
      targetId: jobId,
      success: true,
      metadata,
      requestId: spec.requestId,
    });
  }
  return jobIds;
}

function cleanupMetadata(value: unknown): CleanupMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const metadata = value as Partial<CleanupMetadata>;
  if (
    !["parent_encrypted", "uploaded_local", "scan_output", "unsupported"].includes(String(metadata.kind)) ||
    typeof metadata.document_id !== "string" ||
    typeof metadata.child_id !== "string"
  ) return null;
  return metadata as CleanupMetadata;
}

async function performCleanup(metadata: CleanupMetadata): Promise<void> {
  const file = metadata.storage_path ? decryptCleanupPath(metadata.storage_path) : null;
  if (metadata.kind === "parent_encrypted") {
    if (!file) throw Object.assign(new Error("No private source path"), { code: "missing_storage_path", terminal: true });
    await deleteEncryptedParentDocument(file);
    return;
  }
  if (metadata.kind === "uploaded_local") {
    if (!file || !(await deleteUploadedDocumentFile(file))) {
      throw Object.assign(new Error("Unsupported local source reference"), { code: "unsupported_storage_reference", terminal: true });
    }
    return;
  }
  if (metadata.kind === "scan_output") {
    if (!file) throw Object.assign(new Error("No scan-output path"), { code: "missing_storage_path", terminal: true });
    await deleteEncryptedDocumentScanOutput(file);
    await db.update(documentExtractionRunsTable)
      .set({ scanOutputPath: null, updatedAt: new Date() })
      .where(and(
        eq(documentExtractionRunsTable.documentId, metadata.document_id),
        eq(documentExtractionRunsTable.scanOutputPath, file),
      ));
    return;
  }
  throw Object.assign(new Error("Unsupported storage reference"), { code: "unsupported_storage_reference", terminal: true });
}

export async function processPendingDocumentCleanupJobs(limit = 100, onlyJobIds?: string[]): Promise<number> {
  if (onlyJobIds && onlyJobIds.length === 0) return 0;
  if (cleanupWorkerRunning) return 0;
  cleanupWorkerRunning = true;
  try {
    const completedJob = alias(auditLogsTable, "completed_cleanup");
    const queued = await db.select({
      id: auditLogsTable.id,
      targetId: auditLogsTable.targetId,
      metadata: auditLogsTable.metadata,
      userId: auditLogsTable.userId,
      userRole: auditLogsTable.userRole,
      tenantId: auditLogsTable.tenantId,
    }).from(auditLogsTable)
      .where(and(
        eq(auditLogsTable.action, "document_file_cleanup_queued"),
        ...(onlyJobIds?.length ? [inArray(auditLogsTable.targetId, onlyJobIds)] : []),
        notExists(db.select({ id: completedJob.id }).from(completedJob).where(and(
          eq(completedJob.action, "document_file_cleanup_completed"),
          eq(completedJob.targetId, auditLogsTable.targetId),
        ))),
      ))
      .orderBy(desc(auditLogsTable.createdDate))
      .limit(Math.max(1, Math.min(limit, 500)));

    let attempted = 0;
    for (const job of queued) {
      if (!job.targetId) continue;
      const metadata = cleanupMetadata(job.metadata);
      if (!metadata) continue;
      const [lastFailure] = await db.select({ metadata: auditLogsTable.metadata })
        .from(auditLogsTable)
        .where(and(
          eq(auditLogsTable.action, "document_file_cleanup_failed"),
          eq(auditLogsTable.targetId, job.targetId),
        ))
        .orderBy(desc(auditLogsTable.createdDate))
        .limit(1);
      const failure = lastFailure?.metadata && typeof lastFailure.metadata === "object"
        ? lastFailure.metadata as Record<string, unknown>
        : {};
      if (failure.terminal === true) continue;
      if (typeof failure.retry_at === "string" && Date.parse(failure.retry_at) > Date.now()) continue;
      const attempt = Math.max(0, Number(failure.attempt) || 0) + 1;
      attempted++;
      try {
        await performCleanup(metadata);
        await writeAuditEvent(db, {
          userId: job.userId,
          userRole: job.userRole,
          tenantId: job.tenantId,
          action: "document_file_cleanup_completed",
          targetType: "document_cleanup_job",
          targetId: job.targetId,
          success: true,
          metadata: {
            document_id: metadata.document_id,
            child_id: metadata.child_id,
            cleanup_kind: metadata.kind,
            attempt,
          },
          requestId: metadata.request_id,
        });
      } catch (error) {
        const terminal = (error as { terminal?: boolean })?.terminal === true || attempt >= MAX_CLEANUP_ATTEMPTS;
        const code = (error as { code?: string })?.code || "storage_cleanup_failed";
        const delay = Math.min(CLEANUP_RETRY_MAX_MS, CLEANUP_RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1));
        const retryAt = terminal ? null : new Date(Date.now() + delay).toISOString();
        await writeAuditEvent(db, {
          userId: job.userId,
          userRole: job.userRole,
          tenantId: job.tenantId,
          action: "document_file_cleanup_failed",
          targetType: "document_cleanup_job",
          targetId: job.targetId,
          success: false,
          reason: terminal ? "File cleanup is incomplete and requires administrator review." : "File cleanup failed and will be retried.",
          metadata: {
            document_id: metadata.document_id,
            child_id: metadata.child_id,
            cleanup_kind: metadata.kind,
            attempt,
            error_code: String(code).slice(0, 100),
            retry_at: retryAt,
            terminal,
          },
          requestId: metadata.request_id,
        });
        logger.warn({
          cleanup_job_id: job.targetId,
          document_id: metadata.document_id,
          cleanup_kind: metadata.kind,
          attempt,
          error_code: String(code).slice(0, 100),
          terminal,
        }, "Document file cleanup did not complete");
      }
    }
    return attempted;
  } finally {
    cleanupWorkerRunning = false;
  }
}

export async function documentCleanupStatus(
  jobIds: string[],
): Promise<"complete" | "pending" | "failed"> {
  if (jobIds.length === 0) return "complete";
  const events = await db.select({
    action: auditLogsTable.action,
    targetId: auditLogsTable.targetId,
    metadata: auditLogsTable.metadata,
    createdDate: auditLogsTable.createdDate,
  }).from(auditLogsTable)
    .where(and(
      inArray(auditLogsTable.targetId, jobIds),
      inArray(auditLogsTable.action, ["document_file_cleanup_completed", "document_file_cleanup_failed"]),
    ))
    .orderBy(desc(auditLogsTable.createdDate));
  const latest = new Map<string, typeof events[number]>();
  for (const event of events) {
    if (event.targetId && !latest.has(event.targetId)) latest.set(event.targetId, event);
  }
  if (jobIds.some((id) => {
    const event = latest.get(id);
    if (event?.action !== "document_file_cleanup_failed" || !event.metadata || typeof event.metadata !== "object") return false;
    return (event.metadata as Record<string, unknown>).terminal === true;
  })) return "failed";
  if (jobIds.some((id) => latest.get(id)?.action !== "document_file_cleanup_completed")) return "pending";
  return "complete";
}

export function documentCleanupSpecs(input: {
  documentId: string;
  childId: string;
  tenantId?: string | null;
  actorId?: string | null;
  actorRole: string;
  requestId?: string | null;
  parentStoragePath?: string | null;
  uploadedFileUrl?: string | null;
  scanOutputPaths?: string[];
}): DocumentCleanupSpec[] {
  const common = {
    documentId: input.documentId,
    childId: input.childId,
    tenantId: input.tenantId,
    actorId: input.actorId,
    actorRole: input.actorRole,
    requestId: input.requestId,
  };
  const source: DocumentCleanupSpec = input.parentStoragePath
    ? { ...common, kind: "parent_encrypted", storagePath: input.parentStoragePath }
    : input.uploadedFileUrl
      ? { ...common, kind: "uploaded_local", storagePath: input.uploadedFileUrl }
      : { ...common, kind: "unsupported", storagePath: null };
  return [
    source,
    ...(input.scanOutputPaths ?? []).map((storagePath) => ({
      ...common,
      kind: "scan_output" as const,
      storagePath,
    })),
  ];
}
