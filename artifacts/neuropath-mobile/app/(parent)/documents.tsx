import React, { useState } from "react";
import { Alert } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listParentDocuments, scanParentDocument, setParentDocumentSharing } from "@workspace/api-client-react";
import type { ParentDocument } from "@workspace/api-client-react";
import { UploadPanel } from "@/components/UploadPanel";
import { Btn, Card, ErrorBox, H, Row, Screen, Skeleton, T, msg } from "@/components/ParentUi";
import { useParent } from "@/context/ParentContext";
import { openDocument } from "@/lib/parent";
import { useColors } from "@/hooks/useColors";

function DocRow({ doc, childId }: { doc: ParentDocument; childId: string }) {
  const c = useColors();
  const { token, opts } = useParent();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const done = (k: string) => async (fn: () => Promise<unknown>) => {
    setBusy(k); setError(""); setOk("");
    try { await fn(); } catch (e) { setError(msg(e)); } finally {
      setBusy(null);
      qc.invalidateQueries({ queryKey: ["parent-docs", childId] });
      qc.invalidateQueries({ queryKey: ["parent-dashboard", childId] });
    }
  };
  const failed = doc.scanStatus === "failed" || !!doc.scanError;
  return (
    <Card>
      <T weight="semi">{doc.title}</T>
      <T size={13} color={c.secondary}>{doc.fileName}  |  {new Date(doc.createdAt).toLocaleDateString()}</T>
      <T size={13} weight="semi" color={failed ? c.destructive : c.primary}>Scan: {doc.scanStatus}{doc.shared ? "  |  Shared with clinician" : "  |  Private"}</T>
      {doc.scanError ? <T size={13} color={c.destructive}>{doc.scanError}</T> : null}
      {error ? <ErrorBox message={error} /> : null}
      {ok ? <T size={13} weight="semi" color={c.primary}>{ok}</T> : null}
      <T size={12} color={c.mutedForeground}>{doc.reviewed ? "Reviewed by your clinician." : "Not yet reviewed by a clinician."}</T>
      <Row wrap>
        <Btn kind="ghost" icon="eye" label="Open" loading={busy === "open"} onPress={() => done("open")(() => openDocument(doc, token!))} />
        <Btn kind="ghost" icon="refresh-cw" label={failed ? "Retry scan" : "Scan again"} loading={busy === "scan"} onPress={() => done("scan")(async () => { await scanParentDocument(childId, doc.id, opts); setOk("Your support steps were updated from your uploaded plan."); })} />
        <Btn kind="ghost" icon="share-2" label={doc.shared ? "Stop sharing" : "Share with clinician"} loading={busy === "share"} onPress={() => {
          const go = () => done("share")(() => setParentDocumentSharing(childId, doc.id, { shared: !doc.shared }, opts));
          if (doc.shared) go(); else Alert.alert("Share with your clinician?", "Your linked clinician will be able to read this document. You can stop sharing any time.", [{ text: "Cancel", style: "cancel" }, { text: "Share", onPress: go }]);
        }} />
      </Row>
    </Card>
  );
}

export default function Documents() {
  const { child, opts } = useParent();
  const q = useQuery({ queryKey: ["parent-docs", child?.id], queryFn: () => listParentDocuments(child!.id, opts), enabled: !!child });
  return (
    <Screen>
      <H sub="Plans and reports you upload personalize your Support Now card.">Documents</H>
      {child ? <UploadPanel key={child.id} childId={child.id} /> : null}
      {q.isLoading ? <Skeleton /> : q.isError ? <ErrorBox message={msg(q.error)} onRetry={() => q.refetch()} /> : q.data?.length ? q.data.map((d) => <DocRow key={d.id} doc={d} childId={child!.id} />) : <Card><T>Nothing uploaded yet.</T></Card>}
    </Screen>
  );
}
