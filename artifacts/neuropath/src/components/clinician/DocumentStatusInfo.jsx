import { Info } from "lucide-react";
import { Button } from "@workspace/neuropathways-foundations/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@workspace/neuropathways-foundations/components/ui/dialog";
import { serviceResponseMessage } from "@workspace/api-client-react";

export function documentFailureMessage(raw) {
  const message = String(raw || "");
  const service = serviceResponseMessage(message);
  if (service) return service;
  try {
    const body = JSON.parse(message.slice(message.indexOf("{")));
    return typeof body.error === "string" ? body.error : body.error?.message || message;
  } catch {
    return message;
  }
}

export default function DocumentStatusInfo({ doc, status, reason, progress }) {
  const label = { scanning: "Processing", done: "Ready", error: "Failed", blocked: "Blocked", pending: "Not yet scanned" }[status] || status;
  const failure = documentFailureMessage(reason);
  const started = progress?.started_at && new Date(progress.started_at);
  const scanned = doc.scanned_at || doc.scannedAt;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`Document info for ${doc.title || doc.file_name || "document"}`}
          data-testid={`button-document-info-${doc.id}`}>
          <Info className="h-4 w-4" /> Document info
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Document processing details</DialogTitle></DialogHeader>
        <dl className="space-y-3 text-sm text-foreground" data-testid={`document-info-${doc.id}`}>
          <div><dt className="font-semibold">Document</dt><dd className="break-words">{doc.title || doc.file_name || "Document"}</dd></div>
          <div><dt className="font-semibold">Status</dt><dd>{label}</dd></div>
          {progress?.stage && <div><dt className="font-semibold">Processing stage</dt><dd>{progress.stage}</dd></div>}
          {started && !Number.isNaN(started.getTime()) && <div><dt className="font-semibold">Started</dt><dd>{started.toLocaleString()}</dd></div>}
          {scanned && <div><dt className="font-semibold">Last scan</dt><dd>{new Date(scanned).toLocaleString()}</dd></div>}
          {failure && <div><dt className="font-semibold">Why it failed</dt><dd className="break-words">{failure}</dd></div>}
          {progress?.result?.warnings?.length > 0 && <div><dt className="font-semibold">Reader notes</dt><dd><ul>{progress.result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></dd></div>}
        </dl>
        <p className="text-sm text-muted-foreground">
          {status === "scanning"
            ? "The reader is working on this document. Progress checks do not start another scan. If processing stalls, it will stop and show a retryable error."
            : status === "error" ? "Your original document and previous findings are kept. Use Retry Scan when available."
              : status === "done" ? "Document reading is complete. This does not change clinical review or approval."
                : "Choose Scan to read this document."}
        </p>
      </DialogContent>
    </Dialog>
  );
}
