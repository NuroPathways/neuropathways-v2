import { useState } from "react";
import { Loader2, CheckCircle2, RefreshCw, Sparkles, AlertCircle } from "lucide-react";
import { base44 } from '@/api/entities';

// Reusable AI scan / re-scan control for a single document.
// Rebuilds the child's full ClientProfile from their documents — the same reliable
// source of truth used by Help Now.

// apiFetch throws Error(`API error <status>: <body>`) where <body> is the server's
// JSON. Pull the human-readable reason out so the UI can show why a scan failed.
function parseErrorMessage(err) {
  const raw = err?.message || "Scan failed";
  const jsonStart = raw.indexOf("{");
  if (jsonStart !== -1) {
    try {
      const body = JSON.parse(raw.slice(jsonStart));
      if (body?.error?.message) return body.error.message;
      if (typeof body?.error === "string") return body.error;
    } catch {
      /* not JSON — fall through */
    }
  }
  if (/\b401\b/.test(raw)) return "Your session expired. Please sign in again.";
  return raw.replace(/^API error \d+:\s*/, "").trim() || "Scan failed";
}

export default function DocScanButton({ doc, clinicianId, onScanned }) {
  const initial = doc.scan_status === "done" ? "done" : doc.scan_status === "scanning" ? "scanning" : "pending";
  const [status, setStatus] = useState(initial);
  const [errorMsg, setErrorMsg] = useState(doc.scan_status === "error" ? (doc.scan_error || "Failed") : "");

  const runScan = async () => {
    if (!clinicianId || status === "scanning") return;
    const isReScan = status === "done";
    setStatus("scanning");
    setErrorMsg("");
    try {
      // force_rebuild forces a re-read on explicit re-scan. The server also
      // auto-bypasses its cache whenever a document isn't yet in the profile,
      // so a first scan of a freshly uploaded doc still reads the file.
      const res = await base44.functions.invoke('buildClientProfile', {
        child_id: doc.child_id,
        force_rebuild: isReScan,
      });
      const data = res?.data || {};
      // The endpoint scans all of the child's docs together — reflect this
      // specific document's real outcome rather than the overall call succeeding.
      const failedEntry = Array.isArray(data.failed) ? data.failed.find(f => f.id === doc.id) : null;
      if (failedEntry) {
        setErrorMsg(failedEntry.reason || "This document could not be read.");
        setStatus("error");
      } else {
        setStatus("done");
        onScanned?.(doc.id);
      }
    } catch (e) {
      setErrorMsg(parseErrorMessage(e));
      setStatus("error");
    }
  };

  if (status === "scanning") {
    return (
      <span className="flex items-center gap-1 text-xs text-primary font-medium">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Scanning...
      </span>
    );
  }

  const label = status === "done" ? "Re-scan" : status === "error" ? "Retry" : "Scan";
  const Icon = status === "pending" ? Sparkles : RefreshCw;

  return (
    <div className="flex items-center gap-2">
      {status === "done" && (
        <span className="hidden sm:flex items-center gap-1 text-xs text-green-600 font-medium">
          <CheckCircle2 className="w-3.5 h-3.5" /> Synced
        </span>
      )}
      {status === "error" && (
        <span
          className="flex items-center gap-1 text-xs text-destructive font-medium max-w-[14rem]"
          title={errorMsg}
        >
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">{errorMsg || "Failed"}</span>
        </span>
      )}
      <button
        onClick={runScan}
        title={status === "done" ? "Re-scan document with AI" : status === "error" ? "Retry scan" : "Scan document with AI"}
        className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg border border-border hover:border-primary hover:text-primary text-muted-foreground transition-colors"
      >
        <Icon className="w-3 h-3" />
        {label}
      </button>
    </div>
  );
}
