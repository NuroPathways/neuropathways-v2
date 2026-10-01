import React, { useState } from "react";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { connectParentClinic, listParentDocuments, previewParentClinicInvite } from "@workspace/api-client-react";
import type { ParentClinicInvitePreview } from "@workspace/api-client-react";
import { Btn, Card, Check, Chip, ErrorBox, Field, H, Row, Screen, T, msg } from "@/components/ParentUi";
import { useParent } from "@/context/ParentContext";

type Sharing = "all" | "selected" | "none";

export default function Connect() {
  const { child, opts, refresh } = useParent();
  const qc = useQueryClient();
  const [invite, setInvite] = useState("");
  const [preview, setPreview] = useState<ParentClinicInvitePreview | null>(null);
  const [sharing, setSharing] = useState<Sharing>("none");
  const [docIds, setDocIds] = useState<string[]>([]);
  const [mergeId, setMergeId] = useState<string | null>(null);
  const [confirmMerge, setConfirmMerge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const docs = useQuery({ queryKey: ["parent-docs", child?.id], queryFn: () => listParentDocuments(child!.id, opts), enabled: !!child && !!preview });
  if (!child) return null;

  const check = async () => {
    setBusy(true); setError("");
    try { setPreview(await previewParentClinicInvite(child.id, { inviteToken: invite.trim() }, opts)); }
    catch (e) { setError(msg(e)); } finally { setBusy(false); }
  };
  const connect = async () => {
    if (!preview) return;
    if (sharing === "selected" && !docIds.length) return setError("Select at least one document, or choose another sharing option.");
    if (preview.requiresMergeReview && (!mergeId || !confirmMerge)) return setError("Review the matching child and confirm the merge to continue.");
    setBusy(true); setError("");
    try {
      const r = await connectParentClinic(child.id, {
        inviteToken: invite.trim(), sharing,
        ...(sharing === "selected" ? { documentIds: docIds } : {}),
        ...(preview.requiresMergeReview ? { mergeChildId: mergeId!, confirmMerge: true } : {}),
      }, opts);
      await refresh();
      qc.invalidateQueries();
      setDone(r.message);
    } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  };
  const toggle = (id: string) => setDocIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  if (done) return <Screen><H>Connected</H><Card><T>{done}</T></Card><Btn label="Done" onPress={() => router.back()} /></Screen>;

  return (
    <Screen>
      <H sub="Paste the invite code your clinician sent. Linking alone never shares your private documents.">Connect to a clinic</H>
      <Field label="Invite code" value={invite} onChangeText={(t) => { setInvite(t); setPreview(null); }} autoCapitalize="none" autoCorrect={false} testID="invite-token" />
      {!preview ? <Btn label="Check invite" onPress={check} loading={busy} disabled={!invite.trim()} /> : (
        <>
          <Card><T weight="semi">{preview.clinicianName}</T><T size={14}>Family: {preview.familyName}</T></Card>
          {preview.requiresMergeReview ? (
            <Card tone="warn">
              <T weight="semi">A child in this clinic may be the same as {child.name}</T>
              <T size={14}>Pick the matching child. Your documents, logs and account stay as they are; nothing is deleted.</T>
              <Row wrap>{preview.children.map((k) => <Chip key={k.id} label={k.name} selected={mergeId === k.id} onPress={() => setMergeId(k.id)} />)}</Row>
              <Check checked={confirmMerge} onToggle={() => setConfirmMerge(!confirmMerge)}><T size={14}>I confirm these are the same child and want to link them.</T></Check>
            </Card>
          ) : null}
          <T weight="semi">What would you like to share?</T>
          <Row wrap>
            <Chip label="Everything" selected={sharing === "all"} onPress={() => setSharing("all")} />
            <Chip label="Choose documents" selected={sharing === "selected"} onPress={() => setSharing("selected")} />
            <Chip label="Nothing yet" selected={sharing === "none"} onPress={() => setSharing("none")} />
          </Row>
          {sharing === "selected" ? (docs.data?.length ? docs.data.map((d) => (
            <Check key={d.id} checked={docIds.includes(d.id)} onToggle={() => toggle(d.id)}><T>{d.title}</T></Check>
          )) : <T size={14}>You have no documents to share yet.</T>) : null}
          {error ? <ErrorBox message={error} /> : null}
          <Btn label="Connect" onPress={connect} loading={busy} testID="connect-submit" />
        </>
      )}
      {!preview && error ? <ErrorBox message={error} /> : null}
    </Screen>
  );
}
