import React, { useEffect, useRef, useState } from "react";
import { Alert, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listParentDocuments, scanParentDocument, setParentDocumentSharing, runParentDocumentScanBatch } from "@workspace/api-client-react";
import type { ParentDocument } from "@workspace/api-client-react";
import { UploadPanel } from "@/components/UploadPanel";
import { Btn, Card, Disclosure, ErrorBox, H, Row, Screen, Skeleton, T, msg } from "@/components/ParentUi";
import { useParent } from "@/context/ParentContext";
import { openDocument } from "@/lib/parent";
import { useColors } from "@/hooks/useColors";

const DONE = ["scanned", "complete", "completed", "done", "ready"];

function DocRow({
  doc,
  childId,
  readingPlans,
  batchDocumentId,
  onScan,
}: {
  doc: ParentDocument;
  childId: string;
  readingPlans: boolean;
  batchDocumentId: string | null;
  onScan: (doc: ParentDocument) => void;
}) {
  const c = useColors();
  const { token, opts } = useParent();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const scanStatus = String(doc.scanStatus || "").toLowerCase();
  const isDone = DONE.includes(scanStatus);
  const failed = !isDone && (scanStatus === "failed" || scanStatus === "error");
  const rowReading = readingPlans && batchDocumentId === doc.id;
  const done = (k: string) => async (fn: () => Promise<unknown>) => {
    setBusy(k); setError("");
    try { await fn(); } catch (e) { setError(msg(e)); } finally {
      setBusy(null);
      qc.invalidateQueries({ queryKey: ["parent-docs", childId] });
      qc.invalidateQueries({ queryKey: ["parent-dashboard", childId] });
    }
  };
  return (
    <Card>
      <T weight="semi">{doc.title}</T>
      <T size={13} color={c.secondary}>{doc.fileName}  |  {new Date(doc.createdAt).toLocaleDateString()}</T>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <T size={12} weight="semi" color={failed || doc.scanError ? c.destructive : c.primary}>
          {rowReading ? "Processing" : doc.scanError && isDone ? "Needs Review" : failed ? "Failed" : isDone ? "Ready" : doc.scanStatus}
        </T>
        <T size={12} color={c.secondary}>Uploaded by Parent · {doc.shared ? "Shared with clinician" : "Private to your account"}</T>
      </View>
      {error ? <ErrorBox message={error} /> : null}
      <T size={12} weight="semi" color={doc.reviewed ? c.primary : c.secondary}>{doc.reviewed ? "Clinician reviewed" : "Uploaded plan · not clinician-reviewed"}</T>
      {doc.scanError ? (
        <Disclosure label="Scan note">
          <T size={13} color={c.destructive}>{doc.scanError}</T>
        </Disclosure>
      ) : null}
      <Row wrap>
        <Btn kind="ghost" icon="eye" label="Open" loading={busy === "open"} disabled={readingPlans} onPress={() => done("open")(() => openDocument(doc, token!))} />
        <Btn kind="ghost" icon="refresh-cw" label={rowReading ? "Reading…" : failed ? "Retry scan" : isDone ? "Read again" : "Read plan"} loading={rowReading} disabled={readingPlans || busy !== null} onPress={() => onScan(doc)} />
        <Btn kind="ghost" icon="share-2" label={doc.shared ? "Stop sharing" : "Share with clinician"} loading={busy === "share"} disabled={readingPlans} onPress={() => {
          const go = () => done("share")(() => setParentDocumentSharing(childId, doc.id, { shared: !doc.shared }, opts));
          if (doc.shared) go(); else Alert.alert("Share with your clinician?", "Your linked clinician will be able to read this document. You can stop sharing any time.", [{ text: "Cancel", style: "cancel" }, { text: "Share", onPress: go }]);
        }} />
      </Row>
    </Card>
  );
}

export default function Documents() {
  const { child, opts } = useParent();
  const c = useColors();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["parent-docs", child?.id], queryFn: () => listParentDocuments(child!.id, opts), enabled: !!child });
  const [readingPlans, setReadingPlans] = useState(false);
  const [batchDocumentId, setBatchDocumentId] = useState<string | null>(null);
  const [batchStatus, setBatchStatus] = useState("");
  const [batchError, setBatchError] = useState("");
  const operationLock = useRef(false);
  const active = useRef(true);
  const currentChildId = useRef(child?.id);
  currentChildId.current = child?.id;

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  const readPlans = async (documents: ParentDocument[]) => {
    if (!child || !documents.length || operationLock.current) return;
    const targetChildId = child.id;
    operationLock.current = true;
    setReadingPlans(true);
    setBatchStatus("");
    setBatchError("");
    try {
      const result = await runParentDocumentScanBatch(documents, {
        isActive: () => active.current && currentChildId.current === targetChildId,
        scan: (doc) => scanParentDocument(targetChildId, doc.id, opts),
        onProgress: (doc, index, total) => {
          if (!active.current || currentChildId.current !== targetChildId) return;
          setBatchDocumentId(doc.id);
          setBatchStatus(`Reading plan ${index + 1} of ${total} (this may take a minute): ${doc.title || doc.fileName}`);
        },
        onSettled: async (outcome) => {
          await Promise.allSettled([
            qc.invalidateQueries({ queryKey: ["parent-docs", targetChildId] }),
            qc.invalidateQueries({ queryKey: ["parent-dashboard", targetChildId] }),
          ]);
          if (!outcome.ok && active.current && currentChildId.current === targetChildId) {
            setBatchError(msg(outcome.error, "A plan could not be read."));
          }
        },
      });
      if (active.current && currentChildId.current === targetChildId) {
        setBatchStatus(result.cancelled
          ? "Reading stopped when you left this child's documents."
          : `${result.scanned} of ${documents.length} plans read.${result.failed ? ` ${result.failed} need attention below.` : ""}`);
      }
    } catch (e) {
      if (active.current && currentChildId.current === targetChildId) setBatchError(msg(e));
    } finally {
      operationLock.current = false;
      if (active.current) {
        setReadingPlans(false);
        setBatchDocumentId(null);
      }
    }
  };

  return (
    <Screen>
      <H sub="Keep your child's plans and important documents organized in one place.">Document Center</H>
      {child ? <UploadPanel key={child.id} childId={child.id} /> : null}
      {q.isLoading ? <Skeleton /> : q.isError ? <ErrorBox message={msg(q.error)} onRetry={() => q.refetch()} /> : q.data?.length ? (
        <>
          {q.data.length > 1 ? (
            <>
              <Btn
                label={readingPlans ? "Reading plans…" : `Read all ${q.data.length} plans`}
                icon="refresh-cw"
                loading={readingPlans}
                disabled={readingPlans}
                onPress={() => void readPlans(q.data || [])}
                testID="read-all-parent-plans"
              />
              <T size={13} color={c.secondary}>Plans are read one at a time. If one fails, the rest will still be attempted.</T>
            </>
          ) : null}
          {batchStatus ? <View accessibilityLiveRegion="polite"><T size={13}>{batchStatus}</T></View> : null}
          {batchError ? <ErrorBox message={batchError} /> : null}
          {q.data.map((d) => (
            <DocRow
              key={d.id}
              doc={d}
              childId={child!.id}
              readingPlans={readingPlans}
              batchDocumentId={batchDocumentId}
              onScan={(document) => void readPlans([document])}
            />
          ))}
        </>
      ) : <Card><T>Nothing uploaded yet.</T></Card>}
    </Screen>
  );
}
