import { useEffect, useState } from "react";
import { getParentSharedSupport, reviewParentSupport } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";

const LABEL = {
  starter: "Starter support",
  parent_document: "Based on your uploaded plan · not clinician-reviewed",
  clinician_document: "Clinician-uploaded plan",
  clinician_reviewed: "Clinician reviewed",
};

// Clinician-only: show what the parent actually shared, then an explicit attested review.
export default function SupportReview({ childId }) {
  const [shared, setShared] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attest, setAttest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const load = async () => {
    setLoading(true); setLoadError("");
    try {
      setShared(await getParentSharedSupport(childId, { credentials: "include" }));
    } catch (e) {
      setShared(null);
      setLoadError(e?.data?.error || e?.message || "Could not load shared support.");
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [childId]); // eslint-disable-line react-hooks/exhaustive-deps

  const cards = shared?.supportCards || [];
  const docs = shared?.documents || [];
  const canReview = cards.length > 0 && docs.length > 0;

  const run = async (approved) => {
    setBusy(true); setError(""); setMsg("");
    try {
      const r = await reviewParentSupport(childId, { approved }, { credentials: "include" });
      setMsg(approved ? "Approval recorded." : "Approval withheld.");
      setShared((s) => (s ? { ...s, supportCards: r.supportCards || s.supportCards } : s));
      setAttest(false);
    } catch (e) {
      setError(e?.data?.error || e?.message || "Review could not be saved.");
    } finally { setBusy(false); }
  };

  const List = ({ items }) => <ul className="list-disc pl-5 space-y-0.5">{(items || []).map((t, i) => <li key={i}>{t}</li>)}</ul>;

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-3" data-testid="panel-parent-support-review">
      <h2 className="font-semibold text-foreground text-sm">Parent-shared support guidance</h2>
      {loading && <p className="text-xs text-muted-foreground">Loading shared support...</p>}
      {loadError && (
        <div className="text-xs text-destructive" data-testid="text-review-load-error">
          {loadError} <button className="underline" onClick={load} data-testid="button-retry-shared">Retry</button>
        </div>
      )}
      {shared && !canReview && <p className="text-xs text-muted-foreground" data-testid="text-nothing-shared">The parent has not shared a plan that produced support guidance, so there is nothing to review.</p>}
      {docs.length > 0 && (
        <div className="text-xs" data-testid="list-shared-documents">
          <p className="font-semibold text-muted-foreground uppercase tracking-wide mb-1">Shared documents</p>
          <ul className="list-disc pl-5">{docs.map((d) => <li key={d.id}>{d.title || d.fileName}</li>)}</ul>
        </div>
      )}
      {cards.map((c) => (
        <div key={c.id} className="border border-border rounded-xl p-3 text-xs space-y-2" data-testid={`card-shared-support-${c.id}`}>
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-sm">{c.behaviorName}</strong>
            <span className="text-muted-foreground">{LABEL[c.source] || c.source}</span>
          </div>
          {c.goal && <p><strong>Goal:</strong> {c.goal}</p>}
          {c.conflict && <p className="text-destructive">Conflict detected. {c.conflictMessage}</p>}
          <p className="font-semibold">Right now</p><List items={c.rightNow} />
          <p className="font-semibold">Avoid</p><List items={c.avoid} />
          <p className="font-semibold">Prevention</p><List items={c.prevention} />
          <p><strong>Replacement skill:</strong> {c.replacementSkill}</p>
          <p><strong>Seek help:</strong> {c.seekHelp}</p>
          {(c.sourceReferences || []).length > 0 && (
            <div>
              <p className="font-semibold">Sources</p>
              <ul className="list-disc pl-5">{c.sourceReferences.map((r, i) => <li key={i}>{r.title}{r.excerpt ? `: "${r.excerpt}"` : ""}</li>)}</ul>
            </div>
          )}
        </div>
      ))}
      <label className="flex gap-2 text-xs text-foreground">
        <input type="checkbox" checked={attest} disabled={!canReview} onChange={(e) => setAttest(e.target.checked)} data-testid="checkbox-review-attest" />
        <span>I have read the guidance and sources shown above and judge it safe for this family.</span>
      </label>
      <div className="flex gap-2">
        <Button size="sm" disabled={!canReview || !attest || busy} onClick={() => run(true)} className="rounded-xl" data-testid="button-approve-support">Approve guidance</Button>
        <Button size="sm" variant="outline" disabled={!canReview || busy} onClick={() => run(false)} className="rounded-xl" data-testid="button-reject-support">Withhold approval</Button>
      </div>
      {error && <p className="text-xs text-destructive" data-testid="text-review-error">{error}</p>}
      {msg && <p className="text-xs text-foreground" data-testid="text-review-result">{msg}</p>}
    </div>
  );
}
