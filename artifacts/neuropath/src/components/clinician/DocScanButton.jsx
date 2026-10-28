import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, RefreshCw, Sparkles, AlertCircle } from "lucide-react";
import { base44 } from '@/api/entities';

const scanStatus = (doc) => String(doc?.scan_status ?? doc?.scanStatus ?? "pending").toLowerCase();
const scanError = (doc) => doc?.scan_error ?? doc?.scanError ?? "";

// Reusable AI scan / re-scan control for a single document.
// Re-scans only this document so unrelated missing or unsupported files cannot
// block its extraction.

// apiFetch throws Error(`API error <status>: <body>`) where <body> is the server's
// JSON. Pull the human-readable reason out so the UI can show why a scan failed.
function parseErrorMessage(err) {
  const raw = err?.message || "Scan failed";
  const body = parseErrorBody(err);
  if (body?.error?.message) return body.error.message;
  if (typeof body?.error === "string") return body.error;
  if (/\b401\b/.test(raw)) return "Your session expired. Please sign in again.";
  return raw.replace(/^API error \d+:\s*/, "").trim() || "Scan failed";
}

function parseErrorBody(err) {
  const raw = err?.message || "";
  const jsonStart = raw.indexOf("{");
  if (jsonStart < 0) return null;
  try { return JSON.parse(raw.slice(jsonStart)); }
  catch { return null; }
}

function failedDocuments(err) {
  const body = parseErrorBody(err);
  return Array.isArray(body?.failed) ? body.failed : [];
}

// Maps raw scanner errors to a plain-language reason. `retryable` is false for
// problems a retry cannot fix (unsupported format), so we never offer an endless loop.
export function describeScanError(message) {
  const raw = String(message || "").trim();
  const text = raw.toLowerCase();
  if (/unsupported|not supported|mime|file type|format/.test(text)) return { reason: "Unsupported file format.", retryable: false, detail: raw };
  if (/password.protected|unlocked pdf/.test(text)) return { reason: "An unlocked PDF copy is needed.", retryable: false, detail: raw };
  if (/corrupt|damaged|malformed|invalid pdf|pdf is invalid|truncated|re-export/.test(text)) return { reason: "The file needs to be re-exported.", retryable: false, detail: raw };
  if (/file could not be found|document content not found|file link is invalid|file not found/.test(text)) return { reason: "The stored file is missing.", retryable: false, detail: raw };
  if (/could not be decrypted|decryption failed|unreadable encrypted/.test(text)) return { reason: "The stored file could not be opened.", retryable: false, detail: raw };
  if (/no (readable )?text|empty|no content|blank/.test(text)) return { reason: "No readable text found.", retryable: true, detail: raw };
  if (/timeout|timed out|unavailable|503|502|429|rate limit|network|fetch failed|econn/.test(text)) return { reason: "Processing service temporarily unavailable.", retryable: true, detail: raw };
  if (/session expired|sign in/.test(text)) return { reason: raw, retryable: true, detail: raw };
  return { reason: "Document could not be read.", retryable: true, detail: raw && raw.toLowerCase() !== "failed" ? raw : "" };
}

export default function DocScanButton({ doc, clinicianId, inviteToken, hasSavedExtractions = false, onScanned }) {
  const initialScanStatus = scanStatus(doc);
  const initial = initialScanStatus === "done" || initialScanStatus === "scanned" || initialScanStatus === "complete" || initialScanStatus === "completed" || initialScanStatus === "ready"
    ? "done"
    : initialScanStatus === "error" || initialScanStatus === "failed"
      ? "error"
      : initialScanStatus === "scanning" || initialScanStatus === "processing"
        ? "scanning"
        : "pending";
  const [status, setStatus] = useState(initial);
  const [errorMsg, setErrorMsg] = useState(initial === "error" ? (scanError(doc) || "Failed") : "");
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    if (status === "scanning") return;
    const nextStatus = scanStatus(doc);
    const next = nextStatus === "done" || nextStatus === "scanned" || nextStatus === "complete" || nextStatus === "completed" || nextStatus === "ready"
      ? "done"
      : nextStatus === "error" || nextStatus === "failed"
        ? "error"
        : nextStatus === "scanning" || nextStatus === "processing"
          ? "scanning"
          : "pending";
    setStatus(next);
    setErrorMsg(next === "error" ? (scanError(doc) || "Failed") : "");
  }, [doc.id, doc.scan_status, doc.scanStatus, doc.scan_error, doc.scanError]);

  const runScan = async () => {
    if ((!clinicianId && !inviteToken) || status === "scanning") return;
    setStatus("scanning");
    setErrorMsg("");
    try {
      // Explicitly scanning, retrying, or re-scanning must always read the current
      // file bytes, even when this document ID was present in an older profile.
      const res = await base44.functions.invoke('buildClientProfile', {
        child_id: doc.child_id || doc.childId,
        force_rebuild: true,
        invite_token: inviteToken,
        source_document_id: doc.id,
      });
      const data = res?.data || {};
      // Reflect this document's own outcome rather than a child-wide batch.
      const failedEntry = Array.isArray(data.failed) ? data.failed.find(f => f.id === doc.id) : null;
      if (failedEntry) {
        setErrorMsg(failedEntry.reason || "This document could not be read.");
        setStatus("error");
      } else {
        setStatus("done");
      }
      onScanned?.(doc.id, data);
    } catch (e) {
      const body = parseErrorBody(e);
      const failed = failedDocuments(e);
      const ownFailure = failed.find(f => f.id === doc.id);
      const reason = ownFailure?.reason || parseErrorMessage(e);
      setErrorMsg(reason);
      setStatus(failed.length && !ownFailure ? "blocked" : "error");
      setShowError(true);
      // Refresh the list so the actual failed document gets its own persisted
      // reason; never label the selected healthy file as corrupt by association.
      onScanned?.(doc.id, {
        error: true,
        message: reason,
        failed,
        documentExtractions: body?.documentExtractions ?? body?.document_extractions ?? [],
        retainedExtractionFallback: body?.retainedExtractionFallback ?? body?.retained_extraction_fallback ?? false,
      });
    }
  };

  if (status === "scanning") {
    return (
      <span className="flex items-center gap-1 text-xs text-primary font-medium" role="status" data-testid={`status-doc-scan-${doc.id}`}>
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing
      </span>
    );
  }

  const failure = status === "blocked"
    ? { reason: "Another document is blocking the combined scan.", retryable: true, detail: errorMsg }
    : status === "error" ? describeScanError(errorMsg) : null;
  const label = status === "done" ? "Re-scan" : status === "error" ? "Retry Scan" : "Scan";
  const Icon = status === "pending" ? Sparkles : RefreshCw;
  const showButton = !failure || failure.retryable;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2 flex-wrap justify-end">
        {status === "done" && (
          <span className="flex items-center gap-1 text-xs text-green-700 font-medium" data-testid={`status-doc-scan-${doc.id}`}>
            <CheckCircle2 className="w-3.5 h-3.5" /> Ready
          </span>
        )}
        {status === "pending" && (
          <span className="text-xs text-muted-foreground font-medium" data-testid={`status-doc-scan-${doc.id}`}>Needs Review</span>
        )}
        {status === "error" && (
          <span className="flex items-center gap-1 text-xs text-destructive font-medium" data-testid={`status-doc-scan-${doc.id}`}>
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> Failed
          </span>
        )}
        {status === "blocked" && <span className="text-xs text-foreground font-medium" data-testid={`status-doc-scan-${doc.id}`}>Scan blocked</span>}
        {(status === "error" || status === "blocked") && (
          <button type="button" onClick={() => setShowError(v => !v)} aria-expanded={showError}
            className="text-xs font-medium px-2 py-1 rounded-lg border border-border text-foreground hover:border-primary transition-colors"
            data-testid={`button-view-scan-error-${doc.id}`}>
            {showError ? "Hide Error" : "View Error"}
          </button>
        )}
        {showButton && (
          <button
            type="button"
            onClick={runScan}
            title={status === "done" ? "Re-scan document with AI" : status === "error" ? "Retry scan" : "Scan document with AI"}
            className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg border border-border hover:border-primary hover:text-primary text-foreground transition-colors"
            data-testid={`button-scan-doc-${doc.id}`}
          >
            <Icon className="w-3 h-3" />
            {label}
          </button>
        )}
      </div>
      {(status === "error" || status === "blocked") && showError && (
        <div role="alert" className="max-w-[18rem] text-right text-xs text-foreground" data-testid={`text-scan-error-${doc.id}`}>
          <p className="font-semibold">{failure.reason}</p>
          {failure.detail && failure.detail !== failure.reason && <p className="text-muted-foreground break-words">{failure.detail}</p>}
          {!failure.retryable && hasSavedExtractions
            ? <p className="text-muted-foreground">Saved extracted information is shown below. Upload a fresh copy only if you need another scan.</p>
            : !failure.retryable
              ? <p className="text-muted-foreground">No saved extraction is available yet. Upload a fresh copy if you want to scan this document.</p>
              : null}
        </div>
      )}
    </div>
  );
}
