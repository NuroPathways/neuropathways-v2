import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePreviewParentClinicInvite, useConnectParentClinic } from "@workspace/api-client-react";
import { useAuth } from "@/lib/AuthContext";
import { parentRequest, recallInvite, forgetInvite } from "@/lib/parentSession";
import { ErrorBox, Field, errMsg } from "./common";

export default function ClinicPanel({ child, documents }) {
  const qc = useQueryClient();
  const { refreshParent } = useAuth();
  const [token, setToken] = useState(() => recallInvite() || "");
  const [preview, setPreview] = useState(null);
  const [sharing, setSharing] = useState("none");
  const [docIds, setDocIds] = useState([]);
  const [mergeId, setMergeId] = useState("");
  const [confirmMerge, setConfirmMerge] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const prev = usePreviewParentClinicInvite({ request: parentRequest() });
  const conn = useConnectParentClinic({ request: parentRequest() });

  const lookup = (e) => {
    e.preventDefault();
    setError(""); setPreview(null); setDone("");
    // Accept a pasted full link as well as the bare token.
    let t = token.trim();
    try { const u = new URL(t, window.location.origin); if (u.searchParams.get("invite")) t = u.searchParams.get("invite"); } catch { /* bare token */ }
    setToken(t);
    prev.mutate({ childId: child.id, data: { inviteToken: t } }, { onSuccess: setPreview, onError: (er) => setError(errMsg(er, "This invite is not valid for your account.")) });
  };

  const needsMerge = preview?.requiresMergeReview;
  const mergeOk = !needsMerge || (mergeId === "none") || (mergeId && confirmMerge);
  const sharingOk = sharing !== "selected" || docIds.length > 0;
  const canConnect = !!preview && consent && mergeOk && sharingOk;

  const connect = () => {
    setError("");
    const data = { inviteToken: token, sharing };
    if (sharing === "selected") data.documentIds = docIds;
    if (needsMerge && mergeId && mergeId !== "none") { data.mergeChildId = mergeId; data.confirmMerge = confirmMerge; }
    conn.mutate({ childId: child.id, data }, {
      onSuccess: async (r) => { setDone(r.message || "Connected."); forgetInvite(); setPreview(null); setToken(""); await refreshParent(); qc.invalidateQueries(); },
      onError: (er) => setError(errMsg(er, "Could not connect to the clinic.")),
    });
  };

  return (
    <div className="pf-grid2">
      <div className="pf-card" style={{ display: "grid", gap: 14 }}>
        <h2>Connect to your clinic</h2>
        {child.clinicianId && <p className="pf-tag" style={{ justifySelf: "start" }} data-testid="text-clinic-connected">Connected to a clinician</p>}
        <p style={{ color: "var(--pf-ink-soft)" }}>Your clinic can send an invite link. Linking never shares anything by itself. You decide what they see.</p>
        <form onSubmit={lookup} style={{ display: "grid", gap: 10 }}>
          <Field label="Invite link or code"><input className="pf-input" value={token} onChange={(e) => setToken(e.target.value)} data-testid="input-invite-token" /></Field>
          <button className="pf-btn" disabled={!token.trim() || prev.isPending} data-testid="button-check-invite">{prev.isPending ? "Checking..." : "Check invite"}</button>
        </form>
        <ErrorBox error={error} />
        {done && <p className="pf-tag" data-testid="text-connect-done" style={{ justifySelf: "start" }}>{done}</p>}
      </div>

      {preview && (
        <div className="pf-card sage" style={{ display: "grid", gap: 14 }} data-testid="panel-connect">
          <h3>{preview.clinicianName} invited the {preview.familyName} family</h3>

          {needsMerge && (
            <div className="pf-card warn" style={{ display: "grid", gap: 8 }} data-testid="panel-merge-review">
              <strong>We found an existing child profile in your clinic. Do you want to connect {child.name}'s profile to your clinician instead of creating a duplicate?</strong>
              <p className="pf-hint">Pick the matching child to combine records, or choose that none match. Nothing is deleted.</p>
              {preview.children.map((c) => (
                <label key={c.id} style={{ display: "flex", gap: 8 }}><input type="radio" name="merge" checked={mergeId === c.id} onChange={() => setMergeId(c.id)} data-testid={`radio-merge-${c.id}`} />{c.name}</label>
              ))}
              <label style={{ display: "flex", gap: 8 }}><input type="radio" name="merge" checked={mergeId === "none"} onChange={() => { setMergeId("none"); setConfirmMerge(false); }} data-testid="radio-merge-none" />None of these is {child.name}</label>
              {mergeId && mergeId !== "none" && (
                <label style={{ display: "flex", gap: 8 }}><input type="checkbox" checked={confirmMerge} onChange={(e) => setConfirmMerge(e.target.checked)} data-testid="checkbox-confirm-merge" />I confirm these are the same child and want their clinic records combined.</label>
              )}
            </div>
          )}

          <Field label="Do you want to share this child's uploaded documents with your clinician?">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {[["all", "Share all documents"], ["selected", "Choose documents to share"], ["none", "Do not share right now"]].map(([k, l]) => (
                <button key={k} type="button" className="pf-chip" aria-pressed={sharing === k} onClick={() => setSharing(k)} data-testid={`button-sharing-${k}`}>{l}</button>
              ))}
            </div>
          </Field>
          {sharing === "selected" && (
            documents.length === 0 ? <p className="pf-hint">You have no documents to select.</p> :
              documents.map((d) => (
                <label key={d.id} style={{ display: "flex", gap: 8 }}>
                  <input type="checkbox" checked={docIds.includes(d.id)} onChange={(e) => setDocIds((x) => e.target.checked ? [...x, d.id] : x.filter((i) => i !== d.id))} data-testid={`checkbox-doc-${d.id}`} />{d.title || d.fileName}
                </label>
              ))
          )}
          <label style={{ display: "flex", gap: 8, fontSize: ".9rem" }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} data-testid="checkbox-clinic-consent" />
            <span>I consent to linking {child.name}'s account to {preview.clinicianName}'s clinic and to sharing only what I chose above. I can stop sharing a document later.</span>
          </label>
          <button className="pf-btn primary" disabled={!canConnect || conn.isPending} onClick={connect} data-testid="button-connect-clinic">{conn.isPending ? "Connecting..." : "Connect to clinic"}</button>
        </div>
      )}
    </div>
  );
}
