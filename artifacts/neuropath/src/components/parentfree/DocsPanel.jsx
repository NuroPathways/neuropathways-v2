import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useScanParentDocument, useSetParentDocumentSharing, getParentDocumentContent, getGetParentDashboardQueryKey } from "@workspace/api-client-react";
import { parentRequest } from "@/lib/parentSession";
import { ErrorBox, errMsg } from "./common";
import UploadBox from "./UploadBox";

const DONE = ["scanned", "complete", "completed", "done", "ready"];
export function scanLabel(d) {
  const s = String(d.scanStatus || "").toLowerCase();
  if (DONE.includes(s)) return { text: "Read and added to guidance", kind: "" };
  if (s === "failed" || s === "error") return { text: "Could not be read", kind: "warn", retry: true };
  if (s === "scanning" || s === "processing") return { text: "Reading now", kind: "sun", retry: true };
  return { text: "Waiting to be read", kind: "sun", retry: true };
}

export default function DocsPanel({ child, documents }) {
  const qc = useQueryClient();
  const childId = child.id;
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const scan = useScanParentDocument({ request: parentRequest() });
  const share = useSetParentDocumentSharing({ request: parentRequest() });
  const refresh = () => qc.invalidateQueries({ queryKey: getGetParentDashboardQueryKey(childId) });

  const retry = (d) => {
    setError(""); setBusyId(d.id);
    scan.mutate({ childId, documentId: d.id }, {
      onSettled: () => { setBusyId(null); refresh(); },
      onError: (er) => setError(errMsg(er, "The document still could not be read.")),
    });
  };
  const toggle = (d) => {
    setError(""); setBusyId(d.id);
    share.mutate({ childId, documentId: d.id, data: { shared: !d.shared } }, {
      onSettled: () => { setBusyId(null); refresh(); },
      onError: (er) => setError(errMsg(er, "Sharing could not be changed.")),
    });
  };
  const view = async (d) => {
    setError("");
    try {
      const blob = await getParentDocumentContent(d.id, parentRequest());
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
                {st.retry && <button className="pf-btn small primary" disabled={busyId === d.id} onClick={() => retry(d)} data-testid={`button-retry-scan-${d.id}`}>{busyId === d.id ? "Reading..." : "Retry reading"}</button>}
                <button className="pf-btn small" disabled={busyId === d.id || (!child.clinicianId && !d.shared)} onClick={() => toggle(d)} data-testid={`button-share-${d.id}`}>{d.shared ? "Stop sharing" : "Share with clinician"}</button>
              </div>
            </div>
          );
        })}
        {!child.clinicianId && documents.length > 0 && <p className="pf-hint">Sharing opens once you connect a clinic.</p>}
      </div>
      <div className="pf-card"><h3 style={{ marginBottom: 12 }}>Upload a plan</h3><UploadBox childId={childId} /></div>
    </div>
  );
}
