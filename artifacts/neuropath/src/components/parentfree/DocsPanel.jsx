import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useScanParentDocument, useSetParentDocumentSharing, getParentDocumentContent, getGetParentDashboardQueryKey, runParentDocumentScanBatch } from "@workspace/api-client-react";
import { parentRequest } from "@/lib/parentSession";
import { ErrorBox, errMsg } from "./common";
import UploadBox from "./UploadBox";

const DONE = ["scanned", "complete", "completed", "done", "ready"];
export function scanLabel(d) {
  const s = String(d.scanStatus || "").toLowerCase();
  if (DONE.includes(s)) return d.scanError
    ? { text: "Read with safety note", kind: "warn", retry: true, actionLabel: "Read again" }
    : { text: "Read and added to guidance", kind: "", retry: true, actionLabel: "Read again" };
  if (s === "failed" || s === "error") return { text: "Could not be read", kind: "warn", retry: true };
  if (s === "scanning" || s === "processing") return { text: "Reading now (this may take a minute)", kind: "sun", retry: true };
  return { text: "Waiting to be read", kind: "sun", retry: true };
}

export default function DocsPanel({ child, documents }) {
  const qc = useQueryClient();
  const childId = child.id;
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [operationBusy, setOperationBusy] = useState(false);
  const [batchStatus, setBatchStatus] = useState("");
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

  const readPlans = async (targetDocuments) => {
    if (!targetDocuments.length || operationLock.current) return;
    operationLock.current = true;
    const targetChildId = childId;
    setError("");
    setOperationBusy(true);
    setBatchStatus("");
    try {
      const result = await runParentDocumentScanBatch(targetDocuments, {
        isActive: () => active.current && currentChildId.current === targetChildId,
        scan: (document) => scan.mutateAsync({ childId: targetChildId, documentId: document.id }),
        onProgress: (document, index, total) => {
          if (!active.current) return;
          setBusyId(document.id);
          setBatchStatus(`Reading plan ${index + 1} of ${total} (this may take a minute): ${document.title || document.fileName}`);
        },
        onSettled: async (outcome) => {
          await refresh().catch(() => undefined);
          if (!outcome.ok) {
            if (active.current) setError(errMsg(outcome.error, "A plan could not be read."));
          }
        },
      });
      if (active.current) {
        setBatchStatus(result.cancelled
          ? "Reading stopped when you left this screen."
          : `${result.scanned} of ${targetDocuments.length} plans read.${result.failed ? ` ${result.failed} need attention below.` : ""}`);
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
    void readPlans([document]);
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
    try {
      const blob = await getParentDocumentContent(d.id, { ...parentRequest(), responseType: "blob" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (er) { setError(errMsg(er, "Could not open the document.")); }
  };

  return (
    <div className="pf-grid2">
      <div className="pf-card" style={{ display: "grid", gap: 12 }}>
        <h2>Upload Plan</h2>
        <ErrorBox error={error} />
        {documents.length > 1 && (
          <div style={{ display: "grid", gap: 8 }}>
            <button className="pf-btn primary" type="button" disabled={operationBusy} onClick={() => void readPlans(documents)} data-testid="button-read-all-plans">
              {operationBusy ? "Reading plans…" : `Read all ${documents.length} plans`}
            </button>
            <p className="pf-hint">Plans are read one at a time. If one fails, the rest will still be attempted.</p>
          </div>
        )}
        {batchStatus && <p role="status" className="pf-hint" data-testid="text-read-batch-status">{batchStatus}</p>}
        {documents.length === 0 && <p style={{ color: "var(--pf-ink-soft)" }} data-testid="text-no-documents">No documents yet. Your steps already work without one. Add a behavior plan any time and it will shape the guidance.</p>}
        {documents.map((d) => {
          const st = scanLabel(d);
          return (
            <div key={d.id} style={{ borderTop: "1px solid var(--pf-line)", paddingTop: 12, display: "grid", gap: 8 }} data-testid={`row-document-${d.id}`}>
              <strong style={{ wordBreak: "break-word" }}>{d.title || d.fileName}</strong>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <span className={`pf-tag ${st.kind}`} data-testid={`status-scan-${d.id}`}>{st.text}</span>
                <span className="pf-tag">{d.shared ? "Shared with clinician" : "Private"}</span>
                {d.reviewed && <span className="pf-tag">Clinician reviewed</span>}
              </div>
              {d.scanError && <p className="pf-hint" style={{ color: "#7a2d12" }}>{d.scanError}</p>}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button className="pf-btn small" onClick={() => view(d)} data-testid={`button-view-${d.id}`}>View</button>
                {st.retry && <button className="pf-btn small primary" disabled={operationBusy} onClick={() => retry(d)} data-testid={`button-retry-scan-${d.id}`}>{busyId === d.id ? "Reading..." : (st.actionLabel || "Retry reading")}</button>}
                <button className="pf-btn small" disabled={operationBusy || (!child.clinicianId && !d.shared)} onClick={() => toggle(d)} data-testid={`button-share-${d.id}`}>{d.shared ? "Stop sharing" : "Share with clinician"}</button>
              </div>
            </div>
          );
        })}
        {!child.clinicianId && documents.length > 0 && <p className="pf-hint">Sharing opens once you connect a clinic.</p>}
      </div>
      <div className="pf-card"><h3 style={{ marginBottom: 12 }}>Upload plans</h3><UploadBox key={childId} childId={childId} /></div>
    </div>
  );
}
