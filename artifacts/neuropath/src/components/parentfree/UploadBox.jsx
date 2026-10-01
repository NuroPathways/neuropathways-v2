import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { useUploadParentDocument, useScanParentDocument, getGetParentDashboardQueryKey, runPlanUploadBatch, PLAN_UPLOAD_LABELS } from "@workspace/api-client-react";
import { parentRequest } from "@/lib/parentSession";
import { ErrorBox, errMsg } from "./common";

export default function UploadBox({ childId, onDone }) {
  const qc = useQueryClient();
  const input = useRef(null);
  const active = useRef(true);
  const locked = useRef(false);
  const [auth, setAuth] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const upload = useUploadParentDocument({ request: parentRequest() });
  const scan = useScanParentDocument({ request: parentRequest() });
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  const refresh = () => qc.invalidateQueries({ queryKey: getGetParentDashboardQueryKey(childId) });

  const send = async (batch) => {
    if (!auth || locked.current) return;
    locked.current = true;
    setBusy(true); setError(""); setStatus(`Processing ${batch.length} file${batch.length === 1 ? "" : "s"}…`);
    try {
      const result = await runPlanUploadBatch(batch, {
        isActive: () => active.current,
        validate: (file) => file.size > 20 * 1024 * 1024 ? "This file exceeds 20 MB. Choose a smaller file." : undefined,
        errorMessage: (er) => errMsg(er, "This file could not be processed."),
        update: (key, patch) => { if (active.current) setItems((old) => old.map((item) => item.key === key ? { ...item, ...patch } : item)); },
        upload: async (file) => {
          const doc = await upload.mutateAsync({ childId, data: { file, title: file.name, authorizedUploader: "true" } });
          refresh();
          return doc;
        },
        scan: async (documentId) => {
          try { return await scan.mutateAsync({ childId, documentId }); }
          finally { refresh(); }
        },
      });
      if (!active.current) return;
      setStatus(`${result.saved} file${result.saved === 1 ? "" : "s"} saved. ${result.completed} read successfully.${result.failed ? ` ${result.failed} need attention below.` : ""}`);
      if (!result.failed && !result.cancelled) onDone?.();
    } finally {
      locked.current = false;
      if (active.current) setBusy(false);
    }
  };

  const pick = (e) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length || locked.current || !auth) return;
    const batch = files.map((file, index) => ({ key: String(index), file, phase: "queued" }));
    setItems(batch);
    void send(batch);
  };
  const failed = items.filter((item) => item.phase === "upload_failed" || item.phase === "scan_failed");

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <label style={{ display: "flex", gap: 10, fontSize: ".9rem" }}>
        <input type="checkbox" checked={auth} disabled={busy} onChange={(e) => setAuth(e.target.checked)} data-testid="checkbox-authorized-uploader" />
        <span>I am this child's parent or legal guardian and I am authorized to upload these documents.</span>
      </label>
      <input ref={input} type="file" multiple hidden disabled={!auth || busy} accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,text/plain" onChange={pick} data-testid="input-document-file" />
      <button type="button" className="pf-btn" disabled={!auth || busy} onClick={() => input.current?.click()} data-testid="button-upload-document">
        <Upload size={16} /> {busy ? "Working..." : "Choose files from your device"}
      </button>
      <p style={{ fontWeight: 600 }}>Upload a plan to make your support steps more personalized.</p>
      <p className="pf-hint">Select one or several files from your phone’s Files app or your computer. PDF, Word, JPEG, PNG or text, up to 20 MB per file. Private until you choose to share them.</p>
      {status && <p role="status" data-testid="text-upload-status" style={{ fontWeight: 600 }}>{status}</p>}
      <div aria-live="polite">
        {items.map((item) => (
          <div key={item.key} style={{ padding: "10px 0", borderTop: "1px solid var(--pf-line)", overflowWrap: "anywhere" }} data-testid={`upload-file-${item.key}`}>
            <strong>{item.file.name}</strong>
            <p className="pf-hint">{PLAN_UPLOAD_LABELS[item.phase]}</p>
            {item.message && <p role="alert" className="pf-hint">{item.message}{item.documentId ? " The file is saved; retry reading below or from Plan documents." : ""}</p>}
          </div>
        ))}
      </div>
      {!!failed.length && <button type="button" className="pf-btn small" disabled={!auth || busy} onClick={() => send(failed)} data-testid="button-retry-uploads">Retry failed files</button>}
      <ErrorBox error={error} />
    </div>
  );
}
