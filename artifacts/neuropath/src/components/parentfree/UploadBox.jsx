import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { useUploadParentDocument, useScanParentDocument, getGetParentDashboardQueryKey } from "@workspace/api-client-react";
import { parentRequest } from "@/lib/parentSession";
import { ErrorBox, errMsg } from "./common";

export default function UploadBox({ childId, onDone }) {
  const qc = useQueryClient();
  const input = useRef(null);
  const [auth, setAuth] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const upload = useUploadParentDocument({ request: parentRequest() });
  const scan = useScanParentDocument({ request: parentRequest() });
  const busy = upload.isPending || scan.isPending;

  const refresh = () => qc.invalidateQueries({ queryKey: getGetParentDashboardQueryKey(childId) });

  const pick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setStatus("Uploading...");
    upload.mutate(
      { childId, data: { file, title: file.name, authorizedUploader: "true" } },
      {
        onError: (er) => { setStatus(""); setError(errMsg(er, "Upload failed.")); },
        onSuccess: (doc) => {
          refresh();
          setStatus("Reading your plan...");
          scan.mutate(
            { childId, documentId: doc.id },
            {
              onSuccess: (r) => { setStatus("Your support steps were updated from your uploaded plan."); refresh(); onDone?.(); },
              onError: (er) => { setStatus(""); setError(`${errMsg(er, "The document could not be read.")} It is saved. You can retry from Plan documents.`); refresh(); },
            }
          );
        },
      }
    );
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <label style={{ display: "flex", gap: 10, fontSize: ".9rem" }}>
        <input type="checkbox" checked={auth} onChange={(e) => setAuth(e.target.checked)} data-testid="checkbox-authorized-uploader" />
        <span>I am this child's parent or legal guardian and I am authorized to upload this document.</span>
      </label>
      <input ref={input} type="file" hidden accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt,application/pdf,image/jpeg,image/png,text/plain" onChange={pick} data-testid="input-document-file" />
      <button type="button" className="pf-btn" disabled={!auth || busy} onClick={() => input.current?.click()} data-testid="button-upload-document">
        <Upload size={16} /> {busy ? "Working..." : "Choose a file"}
      </button>
      <p style={{ fontWeight: 600 }}>Upload a plan to make your support steps more personalized.</p>
      <p className="pf-hint">PDF, Word, JPEG, PNG or text. Up to 20 MB. Private to you until you choose to share it.</p>
      {status && <p data-testid="text-upload-status" style={{ fontWeight: 600 }}>{status}</p>}
      <ErrorBox error={error} />
    </div>
  );
}
