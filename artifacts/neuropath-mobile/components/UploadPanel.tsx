import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useQueryClient } from "@tanstack/react-query";
import { scanParentDocument, runPlanUploadBatch, PLAN_UPLOAD_LABELS, type PlanUploadItem } from "@workspace/api-client-react";
import { Btn, Card, Check, ErrorBox, Field, T, msg } from "@/components/ParentUi";
import { useParent } from "@/context/ParentContext";
import { uploadNative, type PickedFile } from "@/lib/parent";

const MAX = 20 * 1024 * 1024;
const TYPES = [
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg", "image/png", "text/plain",
];
type SelectedFile = PickedFile & { size?: number; title: string };

export function UploadPanel({ childId, onDone }: { childId: string; onDone?: () => void }) {
  const { token, opts } = useParent();
  const qc = useQueryClient();
  const [items, setItems] = useState<PlanUploadItem<SelectedFile>[]>([]);
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const active = useRef(true);
  const locked = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["parent-docs", childId] });
    void qc.invalidateQueries({ queryKey: ["parent-dashboard", childId] });
  };
  const pick = async () => {
    if (locked.current) return;
    setError("");
    try {
      // Native Files picker supports on-device files and configured cloud providers.
      // Web pickers may never resolve when dismissed, so only lock during uploads.
      const r = await DocumentPicker.getDocumentAsync({ type: TYPES, copyToCacheDirectory: true, multiple: true });
      if (r.canceled || !r.assets?.length || !active.current || locked.current) return;
      setItems(r.assets.map((a, index) => ({
        key: String(index),
        file: { uri: a.uri, name: a.name, mimeType: a.mimeType, size: a.size, title: a.name.replace(/\.[^.]+$/, "") },
        phase: "queued",
      })));
      setStatus("");
    } catch (e) {
      if (active.current) setError(msg(e, "The file picker could not be opened."));
    }
  };

  const send = async (batch: PlanUploadItem<SelectedFile>[]) => {
    if (!batch.length || !token || !consent || locked.current) return;
    locked.current = true;
    setBusy(true); setError(""); setStatus(`Processing ${batch.length} file${batch.length === 1 ? "" : "s"}…`);
    try {
      const result = await runPlanUploadBatch(batch, {
        isActive: () => active.current,
        validate: (file) => file.size && file.size > MAX ? "This file exceeds 20 MB. Choose a smaller file." : undefined,
        errorMessage: (e) => msg(e, "This file could not be processed."),
        update: (key, patch) => { if (active.current) setItems((old) => old.map((item) => item.key === key ? { ...item, ...patch } : item)); },
        upload: async (file) => {
          const document = await uploadNative(childId, token, file, file.title, "");
          refresh();
          return document;
        },
        scan: async (documentId) => {
          try {
            const response = await scanParentDocument(childId, documentId, opts);
            if (!response.ok) throw new Error(response.message || "The plan could not be read.");
            return response;
          } finally { refresh(); }
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
  const pending = items.filter((item) => item.phase === "queued");
  const failed = items.filter((item) => item.phase === "upload_failed" || item.phase === "scan_failed");

  return (
    <Card>
      <T weight="semi">Upload plans to make your support steps more personalized.</T>
      <T size={13}>Select one or several files from your phone’s Files app, Downloads, or a connected file provider. PDF, Word (DOC or DOCX), JPEG, PNG or plain text, up to 20 MB per file.</T>
      <Btn kind="ghost" icon="file-plus" label={items.length ? "Choose other files" : "Choose files from your phone"} onPress={pick} disabled={busy} testID="upload-pick-files" />
      {items.map((item) => (
        <View key={item.key} style={{ gap: 6 }} testID={`upload-file-${item.key}`}>
          <T size={14} weight="semi">{item.file.name}</T>
          <T size={13}>{PLAN_UPLOAD_LABELS[item.phase]}</T>
          {item.phase === "queued" ? <Field label="Title" value={item.file.title} editable={!busy} onChangeText={(title) => setItems((old) => old.map((row) => row.key === item.key ? { ...row, file: { ...row.file, title } } : row))} /> : null}
          {item.message ? <ErrorBox message={`${item.message}${item.documentId ? " Your file is saved. Retry reading here or from the document list." : ""}`} /> : null}
        </View>
      ))}
      <Check checked={consent} onToggle={() => { if (!busy) setConsent(!consent); }}>
        <T size={14}>I am authorized to upload these documents about my child. They stay private to me until I choose to share them.</T>
      </Check>
      {error ? <ErrorBox message={error} /> : null}
      {status ? <View accessibilityLiveRegion="polite"><T size={14}>{status}</T></View> : null}
      <Btn label={pending.length > 1 ? `Upload and scan ${pending.length} files` : "Upload and scan"} icon="upload" onPress={() => send(pending)} loading={busy} disabled={!pending.length || !consent || !token} testID="upload-send" />
      {failed.length ? <Btn kind="ghost" label="Retry failed files" onPress={() => send(failed)} disabled={busy || !consent} testID="upload-retry-failed" /> : null}
    </Card>
  );
}