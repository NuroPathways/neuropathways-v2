import React, { useState } from "react";
import * as DocumentPicker from "expo-document-picker";
import { useQueryClient } from "@tanstack/react-query";
import { scanParentDocument } from "@workspace/api-client-react";
import { Btn, Card, Check, ErrorBox, Field, T, msg } from "@/components/ParentUi";
import { useParent } from "@/context/ParentContext";
import { uploadNative, type PickedFile } from "@/lib/parent";

const MAX = 20 * 1024 * 1024;
const TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "text/plain",
];

export function UploadPanel({ childId, onDone }: { childId: string; onDone?: () => void }) {
  const { token, opts } = useParent();
  const qc = useQueryClient();
  const [file, setFile] = useState<(PickedFile & { size?: number }) | null>(null);
  const [title, setTitle] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    setError("");
    const r = await DocumentPicker.getDocumentAsync({ type: TYPES, copyToCacheDirectory: true, multiple: false });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    if (a.size && a.size > MAX) return setError("That file is larger than 20 MB. Choose a smaller file.");
    setFile({ uri: a.uri, name: a.name, mimeType: a.mimeType, size: a.size });
    if (!title) setTitle(a.name.replace(/\.[^.]+$/, ""));
  };

  const send = async () => {
    if (!file || !token) return;
    setBusy(true); setError(""); setStatus("Uploading");
    let uploaded = false;
    try {
      const doc = await uploadNative(childId, token, file, title, "");
      uploaded = true;
      qc.invalidateQueries({ queryKey: ["parent-docs", childId] });
      setStatus("Reading your document for support steps");
      const r = await scanParentDocument(childId, doc.id, opts);
      setStatus(r.ok ? "Your support steps were updated from your uploaded plan." : "Document scanned.");
      setFile(null); setTitle(""); setConsent(false);
      qc.setQueryData(["parent-dashboard", childId], (old: unknown) => (old && typeof old === "object" ? { ...(old as object), supportCards: r.supportCards } : old));
      qc.invalidateQueries({ queryKey: ["parent-dashboard", childId] });
      onDone?.();
    } catch (e) {
      setStatus("");
      setError(uploaded ? `Uploaded, but the scan failed: ${msg(e)} You can retry it from the document list.` : msg(e));
      qc.invalidateQueries({ queryKey: ["parent-docs", childId] });
      if (uploaded) { setFile(null); onDone?.(); }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <T weight="semi">Upload a plan to make your support steps more personalized.</T>
      <T size={13}>PDF, Word (DOC or DOCX), JPEG, PNG or plain text, up to 20 MB.</T>
      <Btn kind="ghost" icon="file-plus" label={file ? "Choose a different file" : "Choose a file"} onPress={pick} />
      {file ? <T size={14} weight="semi">{file.name}</T> : null}
      {file ? <Field label="Title" value={title} onChangeText={setTitle} /> : null}
      <Check checked={consent} onToggle={() => setConsent(!consent)}>
        <T size={14}>I am authorized to upload this document about my child. It stays private to me until I choose to share it.</T>
      </Check>
      {error ? <ErrorBox message={error} /> : null}
      {status ? <T size={14}>{status}</T> : null}
      <Btn label="Upload and scan" icon="upload" onPress={send} loading={busy} disabled={!file || !consent} testID="upload-send" />
    </Card>
  );
}
