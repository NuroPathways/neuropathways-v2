export type PlanUploadPhase =
  | "queued" | "uploading" | "scanning" | "complete" | "upload_failed" | "scan_failed";

export interface PlanUploadItem<T> {
  key: string;
  file: T;
  documentId?: string;
  phase: PlanUploadPhase;
  message?: string;
}

export const PLAN_UPLOAD_LABELS: Record<PlanUploadPhase, string> = {
  queued: "Waiting to upload",
  uploading: "Uploading",
  scanning: "Saved · Reading plan",
  complete: "Saved · Support steps updated",
  upload_failed: "Upload failed",
  scan_failed: "Saved · Reading failed",
};

/**
 * Scans update one child's shared guidance, so process the entire upload/scan pair
 * sequentially. A failed file must not stop other files or re-upload a saved file.
 */
export async function runPlanUploadBatch<T>(
  items: PlanUploadItem<T>[],
  handlers: {
    upload: (file: T) => Promise<{ id: string }>;
    scan: (documentId: string) => Promise<unknown>;
    update: (key: string, patch: Partial<PlanUploadItem<T>>) => void;
    errorMessage: (error: unknown) => string;
    validate?: (file: T) => string | undefined;
    isActive?: () => boolean;
  },
) {
  const result = { saved: 0, completed: 0, failed: 0, cancelled: false };
  const active = () => handlers.isActive?.() ?? true;
  for (const item of items) {
    if (!active()) { result.cancelled = true; break; }
    if (item.phase === "complete") continue;
    let documentId = item.documentId;
    try {
      if (!documentId) {
        const invalid = handlers.validate?.(item.file);
        if (invalid) throw new Error(invalid);
        handlers.update(item.key, { phase: "uploading", message: undefined });
        const document = await handlers.upload(item.file);
        documentId = document.id;
        handlers.update(item.key, { documentId });
      }
      result.saved++;
      if (!active()) { result.cancelled = true; break; }
      handlers.update(item.key, { phase: "scanning", message: undefined });
      await handlers.scan(documentId);
      result.completed++;
      handlers.update(item.key, { phase: "complete" });
    } catch (error) {
      result.failed++;
      handlers.update(item.key, {
        documentId,
        phase: documentId ? "scan_failed" : "upload_failed",
        message: handlers.errorMessage(error),
      });
    }
  }
  return result;
}