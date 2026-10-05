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
  scanning: "Saved · Reading plan (this may take a minute)",
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

export type ParentDocumentScanOutcome<T> =
  | { document: T; ok: true }
  | { document: T; ok: false; error: unknown };

/**
 * Read saved plans in sequence because every scan updates the same child's guidance.
 * A failed read is recorded but does not prevent later plans from being attempted.
 */
export async function runParentDocumentScanBatch<T extends { id: string }>(
  documents: T[],
  handlers: {
    scan: (document: T) => Promise<unknown>;
    isActive?: () => boolean;
    onProgress?: (document: T, index: number, total: number) => void;
    onSettled?: (
      outcome: ParentDocumentScanOutcome<T>,
      index: number,
      total: number,
    ) => void | Promise<void>;
  },
) {
  const outcomes: ParentDocumentScanOutcome<T>[] = [];
  const active = () => handlers.isActive?.() ?? true;

  for (let index = 0; index < documents.length; index++) {
    if (!active()) break;
    const document = documents[index];
    handlers.onProgress?.(document, index, documents.length);
    let outcome: ParentDocumentScanOutcome<T>;
    try {
      await handlers.scan(document);
      outcome = { document, ok: true };
    } catch (error) {
      outcome = { document, ok: false, error };
    }
    outcomes.push(outcome);
    await handlers.onSettled?.(outcome, index, documents.length);
  }

  return {
    outcomes,
    scanned: outcomes.filter((outcome) => outcome.ok).length,
    failed: outcomes.filter((outcome) => !outcome.ok).length,
    cancelled: outcomes.length < documents.length && !active(),
  };
}