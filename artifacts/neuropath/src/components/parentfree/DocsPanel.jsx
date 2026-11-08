import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useScanParentDocument, useSetParentDocumentSharing, getParentDocumentContent, getGetParentDashboardQueryKey, runParentDocumentScanBatch, fetchDocumentScan } from "@workspace/api-client-react";
import { parentRequest } from "@/lib/parentSession";
import { ErrorBox, errMsg } from "./common";
import UploadBox from "./UploadBox";
import { FileText, Trash2 } from "lucide-react";
import { Button } from "@workspace/neuropathways-foundations/components/ui/button";
import { Input } from "@workspace/neuropathways-foundations/components/ui/input";
import { Disclosure } from "@workspace/neuropathways-foundations/components/ui/disclosure";
import { StatusBadge } from "@workspace/neuropathways-foundations/components/ui/status-badge";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@workspace/neuropathways-foundations/components/ui/alert-dialog";
import "@workspace/neuropathways-foundations/scoped.css";
import "./docs-phase-eight.css";

const DONE = ["scanned", "complete", "completed", "done", "ready"];
const NEEDS_REVIEW = ["needs_review", "needs-review", "needs review"];
const DOCUMENT_TYPE_LABELS = {
  intake_assessment: "Intake Assessment",
  treatment_plan: "Treatment Plan",
  behavior_intervention_plan: "Behavior Intervention Plan",
  session_note: "Session Note",
  progress_note: "Progress Note",
  safety_crisis_plan: "Safety / Crisis Plan",
  assessment: "Assessment",
  review: "Review",
  other_clinical_document: "Other Clinical Document",
};

export function documentTypeLabel(document) {
  const label = DOCUMENT_TYPE_LABELS[document.documentType];
  if (document.documentClassificationStatus === "verified") return label || "Other Clinical Document";
  if (document.documentClassificationStatus === "needs_review") {
    return label ? `Possible: ${label}` : "Classification needs review";
  }
  return "Not classified yet";
}

export function categoryOf(document) {
  return documentTypeLabel(document);
}

export function scanLabel(d) {
  const s = String(d.processingStatus || d.scanStatus || "").toLowerCase();
  if (NEEDS_REVIEW.includes(s)) return { text: "Processed", kind: "", retry: true, actionLabel: "Read again" };
  if (DONE.includes(s) || s === "processed") return { text: "Processed", kind: "", retry: true, actionLabel: "Read again" };
  if (s === "failed" || s === "error") return { text: "Could not be read", kind: "warn", retry: true };
  if (s === "scanning" || s === "processing") return { text: "Reading now (this may take a minute)", kind: "sun", retry: true };
  return { text: "Not read yet", kind: "sun", retry: true };
}

export function processingStatus(d) {
  const s = String(d.processingStatus || d.scanStatus || "").toLowerCase();
  if (NEEDS_REVIEW.includes(s) || DONE.includes(s) || s === "processed") return { text: "Processed", tone: "neutral" };
  if (s === "failed" || s === "error") return { text: "Failed", tone: "urgent" };
  if (s === "scanning" || s === "processing") return { text: "Processing", tone: "outline" };
  return { text: "Not read yet", tone: "outline" };
}

export function clinicalReviewStatus(d) {
  const status = d.clinicalReviewStatus;
  if (status === "needs_review") return { text: "Needs review", tone: "urgent" };
  if (status === "reviewed") return { text: "Reviewed", tone: "info" };
  if (status === "not_reviewed") return { text: "Not reviewed", tone: "outline" };
  if (status === "no_review_required") return { text: "No review required", tone: "neutral" };
  const legacyStatus = String(d.scanStatus || "").toLowerCase();
  if (d.reviewed) return { text: "Reviewed", tone: "info" };
  if (NEEDS_REVIEW.includes(legacyStatus)) return { text: "Needs review", tone: "urgent" };
  return { text: "Not assessed", tone: "outline" };
}

export function extractionStatusLabel(d) {
  const status = String(d.extractionStatus || "").toLowerCase();
  if (status === "processing") return "Processing";
  if (status === "completed") return "Complete";
  if (status === "partial") return "Partial";
  if (status === "no_relevant_content") return "No relevant content found";
  if (status === "failed") return "Failed";
  if (status === "not_started") return "Not started";
  return "Not assessed";
}

function formatDate(v) {
  const dt = new Date(v);
  return Number.isNaN(dt.getTime()) ? "" : dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

async function scanVisibleClinicianDocument(childId, documentId) {
  const request = parentRequest({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ child_id: childId, source_document_id: documentId }),
  });
  const response = await fetchDocumentScan("/api/build-client-profile", request);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = body?.error;
    const message = typeof error === "string" ? error : error?.message;
    throw new Error(message || "The clinician document could not be read.");
  }
  return body;
}

export default function DocsPanel({ child, documents }) {
  const qc = useQueryClient();
  const childId = child.id;
  const [error, setError] = useState("");
  const [cleanupNotice, setCleanupNotice] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [operationBusy, setOperationBusy] = useState(false);
  const [batchStatus, setBatchStatus] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deletedDocumentIds, setDeletedDocumentIds] = useState(() => new Set());
  const visibleDocuments = documents.filter((document) => !deletedDocumentIds.has(document.id));
  const categories = ["all", ...Array.from(new Set(visibleDocuments.map(categoryOf)))];
  const shown = visibleDocuments.filter((d) => (category === "all" || categoryOf(d) === category)
    && `${d.title || ""} ${d.fileName || ""}`.toLowerCase().includes(search.trim().toLowerCase()));
  const operationLock = useRef(false);
  const active = useRef(true);
  const currentChildId = useRef(childId);
  currentChildId.current = childId;
  const scan = useScanParentDocument({ request: parentRequest() });
  const share = useSetParentDocumentSharing({ request: parentRequest() });
  const refresh = () => qc.invalidateQueries({ queryKey: getGetParentDashboardQueryKey(childId) });

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  useEffect(() => {
    setDeletedDocumentIds(new Set());
  }, [childId]);

  const readDocuments = async (targetDocuments) => {
    if (!targetDocuments.length || operationLock.current) return;
    operationLock.current = true;
    const targetChildId = childId;
    setError("");
    setOperationBusy(true);
    setBatchStatus("");
    try {
      const result = await runParentDocumentScanBatch(targetDocuments, {
        isActive: () => active.current && currentChildId.current === targetChildId,
        scan: (document) => document.uploadedBy === "clinician"
          ? scanVisibleClinicianDocument(targetChildId, document.id)
          : scan.mutateAsync({ childId: targetChildId, documentId: document.id }),
        onProgress: (document, index, total) => {
          if (!active.current) return;
          setBusyId(document.id);
          setBatchStatus(`Reading document ${index + 1} of ${total} (this may take a minute): ${document.title || document.fileName}`);
        },
        onSettled: async (outcome) => {
          await refresh().catch(() => undefined);
          if (!outcome.ok) {
            if (active.current) setError(errMsg(outcome.error, "A document could not be read."));
          }
        },
      });
      if (active.current) {
        setBatchStatus(result.cancelled
          ? "Reading stopped when you left this screen."
          : `${result.scanned} of ${targetDocuments.length} documents processed.${result.failed ? ` ${result.failed} need attention below.` : ""}`);
      }
    } finally {
      operationLock.current = false;
      if (active.current) {
        setOperationBusy(false);
        setBusyId(null);
      }
      void refresh();
    }
  };

  const retry = (document) => {
    void readDocuments([document]);
  };

  const deleteDocument = async () => {
    if (!deleteTarget || deleteBusy) return;
    const target = deleteTarget;
    setDeleteBusy(true);
    setError("");
    setCleanupNotice("");
    try {
      const response = await fetch(
        `/api/parent/children/${encodeURIComponent(childId)}/documents/${encodeURIComponent(target.id)}`,
        parentRequest({ method: "DELETE" }),
      );
      const body = await response.json().catch(() => ({}));
      if (body?.cleanupStatus && body.cleanupStatus !== "complete") {
        setDeletedDocumentIds((current) => new Set([...current, target.id]));
        setDeleteTarget(null);
        setCleanupNotice(body.error || "Document access was removed. Stored-file cleanup is still being completed.");
        await refresh();
        return;
      }
      if (!response.ok) throw new Error(body?.error || "The document could not be deleted.");
      setDeletedDocumentIds((current) => new Set([...current, target.id]));
      setDeleteTarget(null);
      await refresh();
    } catch (deleteError) {
      setError(errMsg(deleteError, "The document could not be deleted. It is still in your account."));
    } finally {
      setDeleteBusy(false);
    }
  };

  const toggle = (d) => {
    if (operationLock.current) return;
    operationLock.current = true;
    setError(""); setBusyId(d.id); setOperationBusy(true);
    share.mutate({ childId, documentId: d.id, data: { shared: !d.shared } }, {
      onSettled: () => {
        operationLock.current = false;
        if (active.current) { setBusyId(null); setOperationBusy(false); }
        refresh();
      },
      onError: (er) => { if (active.current) setError(errMsg(er, "Sharing could not be changed.")); },
    });
  };
  const view = async (d) => {
    setError("");
    // Open during the click gesture. Browsers block tabs opened only after an
    // authenticated fetch has awaited, which made otherwise valid PDFs appear
    // not to open in the regular app.
    const popup = window.open("about:blank", "_blank");
    if (!popup) {
      setError("Please allow pop-ups to view this document.");
      return;
    }
    try {
      popup.opener = null;
      popup.document.title = "Opening document…";
    } catch {
      // The tab can still be navigated if its document is not yet available.
    }
    try {
      const blob = await getParentDocumentContent(d.id, { ...parentRequest(), responseType: "blob" });
      const url = URL.createObjectURL(blob);
      popup.location.replace(url);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (er) {
      popup.close();
      setError(errMsg(er, "Could not open the document."));
    }
  };
  const download = async (d) => {
    setError("");
    try {
      const blob = await getParentDocumentContent(d.id, { ...parentRequest(), responseType: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = d.fileName || d.title || "document";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (er) { setError(errMsg(er, "Could not download the document.")); }
  };

  return (
    <div className="np-foundations np-docs-v8">
      <section className="pf-card np-docs-section" aria-labelledby="np-docs-title">
        <h2 id="np-docs-title">Document Center</h2>
        <p className="np-docs-hint">Keep your child's plans and important documents organized in one place. Documents are private until you choose to share them.</p>
        <ErrorBox error={error} />
        {cleanupNotice && <p role="status" className="np-docs-hint">{cleanupNotice}</p>}
        {documents.length > 1 && (
          <div className="np-docs-section">
            <Button className="np-docs-btn primary" type="button" disabled={operationBusy} onClick={() => void readDocuments(documents)} data-testid="button-read-all-plans">
              {operationBusy ? "Reading documents…" : `Read all ${documents.length} documents`}
            </Button>
            <p className="np-docs-hint">Documents are read one at a time. If one fails, the rest will still be attempted.</p>
          </div>
        )}
        {batchStatus && <p role="status" className="np-docs-hint" data-testid="text-read-batch-status">{batchStatus}</p>}
        {documents.length === 0 && (
          <div className="np-docs-empty" data-testid="text-no-documents">
            <FileText aria-hidden="true" className="np-docs-icon" />
            <p>No documents yet. Your steps already work without one. Add a behavior plan any time and it will shape the guidance.</p>
          </div>
        )}
        {documents.length > 0 && <div className="np-docs-section">
          <label htmlFor="doc-search" className="np-docs-label">Search documents</label>
          <Input id="doc-search" className="np-docs-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by title" data-testid="input-doc-search" />
          <div className="np-docs-cats" role="group" aria-label="Document categories">
            {categories.map((c) => <Button key={c} type="button" className="np-docs-btn np-docs-cat" aria-pressed={category === c} onClick={() => setCategory(c)} data-testid={`button-doc-category-${c}`}>{c === "all" ? "All" : c}</Button>)}
          </div>
        </div>}
        {documents.length > 0 && shown.length === 0 && <p className="np-docs-hint" data-testid="text-no-doc-matches">No documents match this search.</p>}
        {shown.length > 0 && <ul className="np-docs-list">
          {shown.map((d) => {
            const st = scanLabel(d);
            const ps = processingStatus(d);
            const review = clinicalReviewStatus(d);
            const name = d.title || d.fileName;
            const date = formatDate(d.createdAt);
            return (
              <li key={d.id} className="np-docs-row" data-testid={`row-document-${d.id}`}>
                <div className="np-docs-row-head">
                  <FileText aria-hidden="true" className="np-docs-icon" />
                  <div className="np-docs-main">
                    <span className="np-docs-name">{name}</span>
                    <span className="np-docs-meta">
                      {categoryOf(d)} · {d.uploadedBy === "clinician" ? "From clinician" : "Uploaded by parent"} · {d.shared ? "Shared with clinician" : "Private"}
                    </span>
                  </div>
                  <div className="np-docs-statuses">
                    <StatusBadge tone={ps.tone} className="np-docs-badge" data-tone={ps.tone} data-testid={`status-scan-${d.id}`} title={st.text}>{ps.text}</StatusBadge>
                    <StatusBadge tone={review.tone} className="np-docs-badge" data-tone={review.tone} data-testid={`status-review-${d.id}`}>Clinical review: {review.text}</StatusBadge>
                  </div>
                </div>
                {d.scanError && (ps.text !== "Failed"
                  ? <p className="np-docs-note" data-testid={`text-scan-error-${d.id}`}><strong>Note:</strong> {d.scanError}</p>
                  : <p className="np-docs-error" data-testid={`text-scan-error-summary-${d.id}`}>This document could not be read. View details for the full note.</p>)}
                <div className="np-docs-actions">
                  <Button type="button" className="np-docs-btn" onClick={() => view(d)} aria-label={`View ${name}`} data-testid={`button-view-${d.id}`}>View</Button>
                  <Button type="button" className="np-docs-btn" onClick={() => void download(d)} aria-label={`Download ${name}`} data-testid={`button-download-${d.id}`}>Download</Button>
                  {st.retry && d.canScan !== false && <Button type="button" className="np-docs-btn primary" disabled={operationBusy} onClick={() => retry(d)} data-testid={`button-retry-scan-${d.id}`}>{busyId === d.id ? "Reading..." : (st.actionLabel || "Retry reading")}</Button>}
                  {d.canShare !== false && <Button type="button" className="np-docs-btn" disabled={operationBusy || (!child.clinicianId && !d.shared)} onClick={() => toggle(d)} data-testid={`button-share-${d.id}`}>{d.shared ? "Stop sharing" : "Share with clinician"}</Button>}
                  {d.uploadedBy === "parent" && <Button type="button" variant="outline" className="np-docs-btn text-destructive" disabled={operationBusy} onClick={() => { setError(""); setDeleteTarget(d); }} aria-label={`Delete ${name}`} data-testid={`button-delete-document-${d.id}`}><Trash2 aria-hidden="true" size={14} /> Delete</Button>}
                </div>
                <Disclosure className="np-docs-disclosure" title="View details" data-testid={`disclosure-document-details-${d.id}`}>
                  <dl className="np-docs-details" data-testid={`details-document-${d.id}`}>
                    <dt>Document processing</dt><dd data-testid={`text-scan-detail-${d.id}`}>{ps.text}</dd>
                    <dt>Text extraction</dt><dd data-testid={`text-extraction-detail-${d.id}`}>{extractionStatusLabel(d)}</dd>
                    <dt>Clinical review</dt><dd data-testid={`text-review-detail-${d.id}`}>{review.text}</dd>
                    {d.scanError && ps.text === "Failed" && <><dt>Processing note</dt><dd data-testid={`text-scan-error-${d.id}`}>{d.scanError}</dd></>}
                    <dt>File name</dt><dd>{d.fileName}</dd>
                    <dt>Document type</dt><dd>{documentTypeLabel(d)}</dd>
                    <dt>Classification</dt><dd>{d.documentClassificationStatus === "verified"
                      ? "Verified from document contents"
                      : d.documentClassificationStatus === "needs_review"
                        ? "Needs review; the type could not be verified from searchable text"
                        : "Not classified yet"}</dd>
                    <dt>Uploaded by</dt><dd>{d.uploadedBy === "clinician" ? "Clinician" : "Parent"}</dd>
                    {date && <><dt>Added</dt><dd>{date}</dd></>}
                    <dt>Child</dt><dd>{child.name}</dd>
                    <dt>Privacy</dt><dd>{d.shared ? "Shared with clinician" : "Private to your account"}</dd>
                    <dt>Clinical use</dt><dd>Processing does not approve or publish recommendations. Existing clinician approval and assignment controls still apply.</dd>
                  </dl>
                </Disclosure>
              </li>
            );
          })}
        </ul>}
        {!child.clinicianId && documents.length > 0 && <p className="np-docs-hint">Sharing opens once you connect a clinic.</p>}
      </section>
      <section className="pf-card np-docs-section np-docs-upload" aria-labelledby="np-docs-upload-title">
        <h3 id="np-docs-upload-title">Upload Document</h3>
        <UploadBox key={childId} childId={childId} />
      </section>
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !deleteBusy) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this document?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {deleteTarget?.title || "this document"} and its uploaded file from your account. Goals or support information already created from it will remain.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Keep document</AlertDialogCancel>
            <Button variant="destructive" disabled={deleteBusy} onClick={() => void deleteDocument()} data-testid="button-confirm-delete-document">
              {deleteBusy ? "Deleting…" : "Delete document"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
