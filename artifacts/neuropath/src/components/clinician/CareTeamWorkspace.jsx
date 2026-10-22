import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetClinicianGoalsActivities, getGetClinicianGoalsActivitiesQueryKey,
  useGetCareTeamActivityLibrary, getGetCareTeamActivityLibraryQueryKey,
  createCareTeamGoal, updateCareTeamGoal, createCareTeamAssignment, updateCareTeamAssignment,
  reviewCareTeamActivityRecommendation,
} from "@workspace/api-client-react";
import { Plus, MoreHorizontal, Trash2, ArrowUp, ArrowDown, Target, FileText } from "lucide-react";
import { Button } from "@workspace/neuropathways-foundations/components/ui/button";
import { Input } from "@workspace/neuropathways-foundations/components/ui/input";
import { Textarea } from "@workspace/neuropathways-foundations/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@workspace/neuropathways-foundations/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@workspace/neuropathways-foundations/components/ui/dropdown-menu";
import { ActivityGuide } from "@/components/parentfree/PracticePage";
import { CareTeamGoalCard } from "@/components/parentfree/ClinicalGoals";
import { CARE_SKILLS, CARE_MEASUREMENTS, CARE_STATUS_LABELS, CARE_OUTCOME_LABELS, formatDay } from "@/lib/careTeam";
import { readableGoalTitle } from "@/lib/goalTitle";
import { CompactCard } from "@workspace/neuropathways-foundations/components/ui/compact-card";
import { Disclosure } from "@workspace/neuropathways-foundations/components/ui/disclosure";
import { Surface } from "@workspace/neuropathways-foundations/components/ui/surface";
import { StatusBadge as FoundationStatusBadge } from "@workspace/neuropathways-foundations/components/ui/status-badge";

const STATUS_TONE = {
  draft: "bg-muted text-foreground",
  needs_review: "bg-muted text-foreground",
  needs_details: "bg-muted text-foreground",
  approved: "bg-primary/15 text-primary",
  published: "bg-primary/15 text-primary",
  paused: "bg-amber-100 text-amber-900",
  archived: "bg-muted text-muted-foreground",
  rejected: "bg-destructive/10 text-destructive",
  superseded: "bg-muted text-muted-foreground",
};
const SOURCE_LABEL = (source) => source === "care_team" ? "Care team goal" : source === "document" ? "From documents" : source === "manual" ? "Clinician goal" : null;
// Original clinician progress presentation (steps + bar) for goals that track a numeric target.
export function GoalProgress({ goal }) {
  if (goal.progress == null || !(goal.target > 0)) return null;
  const pct = Math.min(100, Math.round((goal.progress / goal.target) * 100));
  const achieved = goal.progress >= goal.target;
  return (
    <div className="mt-2" data-testid={`progress-goal-${goal.id}`}>
      <div className="flex justify-between text-xs text-muted-foreground mb-1"><span>{goal.progress}/{goal.target} steps</span><span>{pct}%</span></div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden"><div className={`h-full rounded-full ${achieved ? "bg-green-600" : "bg-primary"}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export function StatusBadge({ status }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[status] || STATUS_TONE.draft}`} data-testid={`badge-status-${status}`}>{CARE_STATUS_LABELS[status] || status}</span>;
}

// Prefer the server's own message (409 can mean validation, not only concurrency).
export const friendlyError = (e) => {
  const raw = String(e?.message || e || "");
  const data = e?.data || e?.response?.data;
  let serverMsg = typeof data?.error === "string" ? data.error : data?.error?.message || data?.message || "";
  const jsonStart = raw.indexOf("{");
  if (!serverMsg && jsonStart !== -1) { try { const body = JSON.parse(raw.slice(jsonStart)); serverMsg = typeof body?.error === "string" ? body.error : body?.error?.message || body?.message || ""; } catch { /* plain text */ } }
  if (serverMsg) return serverMsg;
  if (/\b409\b/.test(raw)) return "This could not be saved because it changed or conflicts with its current state. Close and reopen to see the latest version.";
  if (/\b403\b/.test(raw)) return "You are not authorized to manage this client.";
  return raw.replace(/^(API error|HTTP) \d+:?\s*/i, "").trim() || "Something went wrong. Please try again.";
};

const Field = ({ label, children, hint }) => (
  <label className="block space-y-1">
    <span className="text-xs font-semibold text-foreground">{label}</span>
    {children}
    {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
  </label>
);
const selectCls = "w-full h-9 rounded-xl border border-input bg-background px-3 text-sm text-foreground";

const emptyGoal = { title: "", description: "", skill: "Communication", measurement: "observation", target: "", milestones: [""], notes: "" };
// Legacy reward_token rows may lack skill/measurement; keep them unset rather than inventing values.
const goalToForm = (g) => ({
  title: g.title || "", description: g.description || "", skill: g.skill || "", measurement: g.measurement || "",
  target: g.target ?? "", milestones: g.milestones?.length ? [...g.milestones] : [""], notes: g.notes || "",
});
export const goalPayload = (form, status, version) => ({
  title: form.title.trim(), description: form.description.trim(),
  ...(form.skill ? { skill: form.skill } : {}), ...(form.measurement ? { measurement: form.measurement } : {}),
  target: form.target === "" || form.target == null ? null : Number(form.target),
  milestones: form.milestones.map((m) => m.trim()).filter(Boolean), notes: form.notes.trim(), ...(status ? { status } : {}),
  ...(version != null ? { expectedVersion: version } : {}),
});
const needsTarget = (m) => ["frequency", "duration", "percentage", "completed_steps"].includes(m);
const recommendationStatusLabel = (recommendation) => {
  if (recommendation.sourceClassification === "clinician_reviewed_document") return "Clinician-reviewed document activity";
  if (recommendation.sourceClassification === "document_candidate") {
    if (recommendation.status === "needs_details") return "Document candidate · needs details";
    if (recommendation.status === "approved_not_assigned") return "Clinician-approved document activity";
    return "Document candidate · needs clinician review";
  }
  if (recommendation.status === "needs_clinician_review") return "Research-informed starter · needs clinician review";
  return "Research-informed starter · not an assignment";
};

function RecommendationCard({ recommendation, onStartReview, onApprove, onRequestDetails, onReject }) {
  const references = Array.isArray(recommendation.researchReferences) ? recommendation.researchReferences : [];
  return (
    <CompactCard
      title={recommendation.title}
      headingLevel="h4"
      badges={<FoundationStatusBadge tone={recommendation.sourceClassification === "clinician_reviewed_document" ? "support" : "neutral"}>
        {recommendationStatusLabel(recommendation)}
      </FoundationStatusBadge>}
      meta={<>{recommendation.skill}{recommendation.estimatedMinutes ? ` · about ${recommendation.estimatedMinutes} minutes` : ""}</>}
      description={recommendation.description || recommendation.matchReasons?.join(" ")}
      data-testid={`activity-recommendation-${recommendation.id}`}
    >
      <p className="text-support-sm text-muted-foreground">
        <span className="font-semibold text-foreground">Related goal:</span>{" "}
        {recommendation.relatedGoal || "Not linked. Select an authorized goal during review if appropriate."}
      </p>
      <p className="text-support-sm text-muted-foreground">
        <span className="font-semibold text-foreground">Risk classification:</span>{" "}
        {recommendation.riskClassification || "Not assessed"}
      </p>
      {recommendation.routineContext && <p className="text-body-sm"><span className="font-semibold">Appropriate context:</span> {recommendation.routineContext}</p>}
      {recommendation.missingInformation?.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/40 p-2 text-support-sm">
          <p className="font-semibold text-foreground">Missing information</p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-foreground">
            {recommendation.missingInformation.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      )}
      {recommendation.matchReasons?.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-body-sm text-foreground">
          {recommendation.matchReasons.map((reason, index) => <li key={`${index}-${reason}`}>{reason}</li>)}
        </ul>
      )}
      {recommendation.materials?.length > 0 && (
        <p className="text-support-sm text-muted-foreground"><span className="font-semibold text-foreground">Materials:</span> {recommendation.materials.join(", ")}</p>
      )}
      {recommendation.startAction && <p className="text-body-sm"><span className="font-semibold">Start:</span> {recommendation.startAction}</p>}
      {recommendation.steps?.length > 0 && (
        <ol className="list-decimal space-y-1 pl-5 text-body-sm text-foreground">
          {recommendation.steps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}
        </ol>
      )}
      {recommendation.ending && <p className="text-body-sm"><span className="font-semibold">Ending:</span> {recommendation.ending}</p>}
      {recommendation.pauseConditions?.length > 0 && (
        <p className="text-body-sm"><span className="font-semibold">Pause or stop:</span> {recommendation.pauseConditions.join(" ")}</p>
      )}
      {recommendation.evidence?.length > 0 && (
        <Disclosure
          title="Source records"
          hint="Check the cited source and its review status before using this suggestion."
          className="mt-2"
        >
          <ul className="space-y-2">
            {recommendation.evidence.map((source) => (
              <li key={`${source.recordId}-${source.documentId}`} className="rounded-lg bg-muted/50 p-2">
                <p className="text-support-sm font-semibold text-foreground">
                  {source.documentTitle}
                  {source.sourceSection ? ` · ${source.sourceSection}` : ""}
                  {source.sourcePage ? ` · page ${source.sourcePage}` : ""}
                  {` · ${source.reviewStatus === "approved" ? "approved record" : "not yet reviewed"}`}
                </p>
                <p className="mt-1 text-body-sm text-foreground">{source.sourceExcerpt}</p>
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
      {references.length > 0 && (
        <Disclosure
          title="Research context"
          hint="These sources inform a general starter template; they do not prove this specific activity is effective for this child."
          className="mt-2"
        >
          <ul className="list-disc space-y-1 pl-5">
            {references.map((reference, index) => (
              <li key={`${reference.key || reference.title || "reference"}-${index}`}>
                {reference.url
                  ? <a className="text-primary underline underline-offset-2" href={reference.url} target="_blank" rel="noreferrer">{reference.title || "Research source"}{reference.publishedYear ? ` (${reference.publishedYear})` : ""}</a>
                  : `${reference.title || "Research source"}${reference.publishedYear ? ` (${reference.publishedYear})` : ""}`}
                {reference.limitation ? <span className="text-muted-foreground"> — {reference.limitation}</span> : null}
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        <Button type="button" variant="outline" size="sm" onClick={() => onStartReview(recommendation)} data-testid={`button-review-suggestion-${recommendation.id}`}>
          Review &amp; Edit
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={recommendation.status === "needs_details" || recommendation.missingInformation?.length > 0}
          onClick={() => onApprove(recommendation)}
          data-testid={`button-approve-suggestion-${recommendation.id}`}
        >
          Approve
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => onRequestDetails(recommendation)} data-testid={`button-request-details-${recommendation.id}`}>
          Request More Detail
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => onReject(recommendation)} data-testid={`button-reject-suggestion-${recommendation.id}`}>
          Reject
        </Button>
      </div>
    </CompactCard>
  );
}

function ActivityReviewCard({ activity, onEdit, onApprove, onPublish, onRequestDetails, onReject }) {
  const evidence = Array.isArray(activity.sourceEvidence) ? activity.sourceEvidence : [];
  const isApproved = activity.status === "approved";
  const canApprove = activity.status !== "needs_details";
  return (
    <CompactCard
      title={activity.title}
      headingLevel="h4"
      badges={<FoundationStatusBadge tone={isApproved ? "support" : activity.status === "rejected" ? "urgent" : "neutral"}>
        {CARE_STATUS_LABELS[activity.status] || activity.status}
      </FoundationStatusBadge>}
      meta={<>{activity.skill}{activity.estimatedMinutes ? ` · about ${activity.estimatedMinutes} minutes` : ""}</>}
      description={activity.description || "This activity is not visible to the family until it is published."}
      data-testid={`activity-review-${activity.id}`}
    >
      <p className="text-support-sm text-muted-foreground">
        <span className="font-semibold text-foreground">Related goal:</span>{" "}
        {activity.goalTitle || activity.relatedGoal || "Not linked"}
      </p>
      <p className="text-support-sm text-muted-foreground">
        <span className="font-semibold text-foreground">Risk classification:</span>{" "}
        {activity.riskClassification || "Not assessed"}
      </p>
      {activity.reviewNote && (
        <Surface variant="separated" tone={activity.status === "needs_details" ? "caution" : "neutral"} className="space-y-1" data-testid={`activity-review-note-${activity.id}`}>
          <p className="text-support-sm font-semibold">Clinician follow-up note</p>
          <p className="text-body-sm">{activity.reviewNote}</p>
          {activity.status === "needs_details" && <p className="text-support-sm">This note is for clinician follow-up; no message was sent to the family.</p>}
        </Surface>
      )}
      {(activity.reviewContext || activity.reviewStartAction || activity.reviewEnding || activity.reviewPauseConditions?.length > 0) && (
        <Surface variant="separated" tone="neutral" className="space-y-1" data-testid={`activity-review-proposed-content-${activity.id}`}>
          <p className="text-support-sm font-semibold">Document-proposed details</p>
          {activity.reviewContext && <p className="text-body-sm"><span className="font-semibold">Context:</span> {activity.reviewContext}</p>}
          {activity.reviewStartAction && <p className="text-body-sm"><span className="font-semibold">How to begin:</span> {activity.reviewStartAction}</p>}
          {activity.reviewEnding && <p className="text-body-sm"><span className="font-semibold">How to finish:</span> {activity.reviewEnding}</p>}
          {activity.reviewPauseConditions?.length > 0 && <p className="text-body-sm"><span className="font-semibold">Pause or stop:</span> {activity.reviewPauseConditions.join(" ")}</p>}
        </Surface>
      )}
      {activity.missingInformation?.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/40 p-2 text-support-sm">
          <p className="font-semibold text-foreground">Missing information</p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-foreground">
            {activity.missingInformation.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      )}
      {activity.startAction && <p className="text-body-sm"><span className="font-semibold">Start:</span> {activity.startAction}</p>}
      {activity.steps?.length > 0 && (
        <ol className="list-decimal space-y-1 pl-5 text-body-sm text-foreground">
          {activity.steps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}
        </ol>
      )}
      {activity.ifDifficult && <p className="text-body-sm"><span className="font-semibold">Pause or stop:</span> {activity.ifDifficult}</p>}
      {evidence.length > 0 && (
        <Disclosure title="Original supporting text" hint="Verify the exact cited source before approving or publishing." className="mt-2">
          <ul className="space-y-2">
            {evidence.map((source) => (
              <li key={`${source.recordId}-${source.documentId}`} className="rounded-lg bg-muted/50 p-2">
                <p className="text-support-sm font-semibold text-foreground">
                  {source.documentTitle}
                  {source.sourceSection ? ` · ${source.sourceSection}` : ""}
                  {source.sourcePage ? ` · page ${source.sourcePage}` : ""}
                  {source.reviewStatus ? ` · ${source.reviewStatus === "approved" ? "approved record" : "source record: " + source.reviewStatus}` : ""}
                </p>
                <p className="mt-1 text-body-sm text-foreground">{source.sourceExcerpt}</p>
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        <Button type="button" variant="outline" size="sm" onClick={() => onEdit(activity)} data-testid={`button-edit-review-${activity.id}`}>Edit</Button>
        {isApproved
          ? <Button type="button" size="sm" onClick={() => onPublish(activity)} data-testid={`button-publish-review-${activity.id}`}>Publish to Parent</Button>
          : <Button type="button" size="sm" disabled={!canApprove} onClick={() => onApprove(activity)} data-testid={`button-approve-review-${activity.id}`}>Approve</Button>}
        <Button type="button" variant="ghost" size="sm" onClick={() => onRequestDetails(activity)} data-testid={`button-request-review-details-${activity.id}`}>Request More Detail</Button>
        {activity.status !== "rejected" && <Button type="button" variant="ghost" size="sm" onClick={() => onReject(activity)} data-testid={`button-reject-review-${activity.id}`}>Reject</Button>}
      </div>
    </CompactCard>
  );
}

const emptyActivity = { mode: "library", libraryId: "", goalId: "", schedule: "", title: "", description: "", skill: "Communication", estimatedMinutes: "", materials: "", steps: [""], whyItMayHelp: "", ifDifficult: "", notes: "", reviewNote: "", planConfirmed: false };
const activityToForm = (a) => ({
  mode: a.libraryId ? "library" : "custom", libraryId: a.libraryId || "", goalId: a.goalId || "", schedule: a.schedule || "",
  title: a.title || "", description: a.description || "", skill: a.skill || "Other", estimatedMinutes: a.estimatedMinutes ?? "",
  materials: a.materials || "", steps: a.steps?.length ? [...a.steps] : [""], whyItMayHelp: a.whyItMayHelp || "", ifDifficult: a.ifDifficult || "", notes: a.notes || "",
  reviewNote: a.reviewNote || "", planConfirmed: a.planConfirmed === true,
});
// Library assignments reference the definition: steps/instructions are never copied into the save.
const activityPayload = (form, status, version) => ({
  goalId: form.goalId || null, schedule: form.schedule.trim(), status, planConfirmed: form.planConfirmed === true, reviewNote: form.reviewNote.trim(),
  ...(version != null ? { expectedVersion: version } : {}),
  ...(form.mode === "library" ? { libraryId: form.libraryId, planConfirmed: form.planConfirmed } : {
    libraryId: null, title: form.title.trim(), description: form.description.trim(), skill: form.skill,
    estimatedMinutes: form.estimatedMinutes === "" ? null : Number(form.estimatedMinutes),
    materials: form.materials.trim(), steps: form.steps.map((s) => s.trim()).filter(Boolean),
    whyItMayHelp: form.whyItMayHelp.trim(), ifDifficult: form.ifDifficult.trim(), notes: form.notes.trim(),
  }),
});

function LinesEditor({ label, items, onChange, placeholder, testid }) {
  const set = (i, v) => onChange(items.map((x, j) => j === i ? v : x));
  const move = (i, d) => { const next = [...items]; [next[i], next[i + d]] = [next[i + d], next[i]]; onChange(next); };
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-semibold text-foreground">{label}</span>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="w-6 text-xs text-muted-foreground text-right">{i + 1}.</span>
          <Input value={item} onChange={(e) => set(i, e.target.value)} placeholder={placeholder} className="rounded-xl h-9" data-testid={`${testid}-${i}`} aria-label={`${label} ${i + 1}`} />
          <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="p-1 text-muted-foreground disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
          <button type="button" aria-label="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)} className="p-1 text-muted-foreground disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
          <button type="button" aria-label="Remove" disabled={items.length === 1} onClick={() => onChange(items.filter((_, j) => j !== i))} className="p-1 text-muted-foreground hover:text-destructive disabled:opacity-30"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      ))}
      <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onChange([...items, ""])} data-testid={`${testid}-add`}><Plus className="w-3 h-3 mr-1" /> Add</Button>
    </div>
  );
}

function FormActions({ busy, canSave, canPublish = canSave, onDraft, onPreview, onPublish, onApprove, published, recommendationReview = false }) {
  return (
    <div className="flex flex-wrap gap-2 pt-2">
      {!published && <Button type="button" variant="outline" className="rounded-xl" disabled={busy || !canSave} onClick={onDraft} data-testid="button-save-draft">Save Draft</Button>}
      <Button type="button" variant="outline" className="rounded-xl" disabled={!canSave} onClick={onPreview} data-testid="button-preview-parent">Preview as Parent</Button>
      <Button type="button" className="rounded-xl" disabled={busy || !canPublish} onClick={recommendationReview ? onApprove : onPublish} data-testid={recommendationReview ? "button-approve-activity" : "button-publish-parent"}>
        {busy ? "Saving..." : recommendationReview ? (published ? "Approve & Publish New Version" : "Approve for Publication") : published ? "Save Published Changes" : "Publish to Parent"}
      </Button>
    </div>
  );
}

export function GoalForm({ initial, busy, error, onSubmit, onPreview }) {
  const [form, setForm] = useState(initial ? goalToForm(initial) : emptyGoal);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const targetMissing = needsTarget(form.measurement) && (form.target === "" || form.target == null);
  const canSave = form.title.trim() && form.description.trim() && !targetMissing;
  return (
    <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
      <Field label="Goal Title (required)"><Input value={form.title} onChange={set("title")} maxLength={180} placeholder="Ask for a Break" className="rounded-xl" data-testid="input-care-goal-title" /></Field>
      <Field label="Goal Description (required)"><Textarea value={form.description} onChange={set("description")} rows={3} className="rounded-xl" placeholder="Describe the goal in the words you would use with the family." data-testid="input-care-goal-description" /></Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Related Skill"><select className={selectCls} value={form.skill} onChange={set("skill")} data-testid="select-care-goal-skill"><option value="">Not set</option>{CARE_SKILLS.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Measurement Method"><select className={selectCls} value={form.measurement} onChange={set("measurement")} data-testid="select-care-goal-measurement"><option value="">Not set</option>{CARE_MEASUREMENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
      </div>
      <Field label={needsTarget(form.measurement) ? "Target (required for this method)" : "Target (optional)"}>
        <Input type="number" min={0} value={form.target} onChange={set("target")} className="rounded-xl" data-testid="input-care-goal-target" />
      </Field>
      <LinesEditor label="Milestones" items={form.milestones} onChange={(milestones) => setForm((f) => ({ ...f, milestones }))} placeholder="Optional milestone" testid="input-care-goal-milestone" />
      <Field label="Additional Notes"><Textarea value={form.notes} onChange={set("notes")} rows={2} className="rounded-xl" placeholder="Optional" /></Field>
      {initial && initial.progress != null && <p className="text-[11px] text-muted-foreground">Recorded clinical progress ({initial.progress}{initial.target ? ` of ${initial.target}` : ""}) is kept as is when you save.</p>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <FormActions busy={busy} canSave={canSave} published={initial?.status === "published"}
        onDraft={() => onSubmit(goalPayload(form, initial ? initial.status : "draft", initial?.version))}
        onPreview={() => onPreview({ ...form, id: initial?.id || "preview", milestones: form.milestones.filter((m) => m.trim()), target: form.target === "" ? null : Number(form.target), status: "published" })}
        onPublish={() => onSubmit(goalPayload(form, "published", initial?.version))} />
    </form>
  );
}

export function AssignActivityForm({ initial, library = [], libraryLoading, goals = [], busy, error, onSubmit, onPreview }) {
  const recommendationReview = Boolean(initial?.recommendationId);
  const [form, setForm] = useState(initial
    ? { ...activityToForm(initial), planConfirmed: recommendationReview ? false : initial.planConfirmed === true }
    : emptyActivity);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const chosen = library.find((item) => item.id === form.libraryId);
  const customComplete = Boolean(form.title.trim() && form.description.trim() && form.skill.trim() && form.steps.some((s) => s.trim()));
  const canSave = form.mode === "library" ? Boolean(form.libraryId) : recommendationReview ? Boolean(form.title.trim()) : customComplete;
  const completeForApproval = form.mode === "library" ? Boolean(form.libraryId) : customComplete;
  const canPublish = canSave && (recommendationReview
    ? completeForApproval && form.planConfirmed
    : !chosen?.requiresClinicianConfirmation || form.planConfirmed);
  const selectable = goals.filter((g) => g.status !== "archived");
  const previewActivity = () => form.mode === "library" && chosen
    ? { ...chosen, goalId: form.goalId || null }
    : { id: "preview", title: form.title, description: form.description, skill: form.skill, estimatedMinutes: form.estimatedMinutes === "" ? null : Number(form.estimatedMinutes), materials: form.materials, steps: form.steps.filter((s) => s.trim()), whyItMayHelp: form.whyItMayHelp, ifDifficult: form.ifDifficult };
  return (
    <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
      {recommendationReview && (
        <Surface variant="separated" tone="caution" className="space-y-2" data-testid="activity-review-source">
          <p className="text-body-sm font-semibold">Review source and child-specific context</p>
          <p className="text-support-sm">Risk classification: {initial.riskClassification || "Not assessed"}.</p>
          {initial.relatedGoal && <p className="text-support-sm">Documented related goal: {initial.relatedGoal}. Select the authorized goal below if it matches.</p>}
          {initial.reviewContext && <p className="text-body-sm"><span className="font-semibold">Document context:</span> {initial.reviewContext}</p>}
          {initial.reviewStartAction && <p className="text-body-sm"><span className="font-semibold">Document start:</span> {initial.reviewStartAction}</p>}
          {initial.reviewEnding && <p className="text-body-sm"><span className="font-semibold">Document ending:</span> {initial.reviewEnding}</p>}
          {initial.reviewPauseConditions?.length > 0 && <p className="text-body-sm"><span className="font-semibold">Document pause / stop:</span> {initial.reviewPauseConditions.join(" ")}</p>}
          {initial.missingInformation?.length > 0 && (
            <div className="text-support-sm">
              <p className="font-semibold">Still missing</p>
              <ul className="list-disc pl-4">{initial.missingInformation.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          )}
          {!!initial.sourceEvidence?.length && (
            <ul className="space-y-2">
              {initial.sourceEvidence.map((source) => (
                <li key={`${source.recordId}-${source.documentId}`} className="rounded-lg bg-background/70 p-2">
                  <p className="text-support-sm font-semibold">{source.documentTitle}{source.sourceSection ? ` · ${source.sourceSection}` : ""}{source.sourcePage ? ` · page ${source.sourcePage}` : ""}</p>
                  <p className="mt-1 text-body-sm">{source.sourceExcerpt}</p>
                </li>
              ))}
            </ul>
          )}
        </Surface>
      )}
      {!initial && <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Activity source">
        {[["library", "Assign an existing activity"], ["custom", "Create a custom activity"]].map(([mode, label]) => (
          <button type="button" key={mode} role="radio" aria-checked={form.mode === mode} onClick={() => setForm((f) => ({ ...f, mode }))}
            className={`rounded-xl border px-3 py-2 text-sm font-medium text-left transition-colors ${form.mode === mode ? "border-primary bg-primary/10 text-foreground" : "border-border text-foreground hover:border-primary/50"}`}
            data-testid={`button-mode-${mode}`}>{label}</button>
        ))}
      </div>}
      {form.mode === "library" ? (
        libraryLoading ? <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />)}</div>
          : library.length === 0 ? <p className="text-sm text-muted-foreground">The activity library is empty. Create a custom activity instead.</p>
            : <>
              <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-foreground space-y-1.5">
                <p className="font-semibold">Original general starter activities</p>
                <p className="text-muted-foreground">Research informs the design principles; it does not prove that a specific template works for every child. These are not RUBI, Triple P, Project ImPACT, or TEACCH materials.</p>
                <p className="text-muted-foreground">Select only when the context and required information below match. Do not guess missing details, require participation, or use an activity as a compliance test. For context-sensitive items, review the child's current plan; publish plan-required items only when an authorized child-specific plan explicitly supports them.</p>
                <p className="text-muted-foreground">Use “Preview as Parent” to see the exact family-facing instructions before publishing.</p>
              </div>
              <div className="max-h-72 overflow-y-auto space-y-2 pr-1" role="radiogroup" aria-label="Activity library">
              {library.map((item) => (
                <div key={item.id} className="space-y-1.5">
                  <button type="button" role="radio" aria-checked={form.libraryId === item.id} onClick={() => setForm((f) => ({ ...f, libraryId: item.id, planConfirmed: f.libraryId === item.id && f.planConfirmed }))}
                    className={`w-full text-left rounded-xl border p-3 transition-colors ${form.libraryId === item.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}
                    data-testid={`library-activity-${item.id}`}>
                    <p className="text-sm font-semibold text-foreground">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{[item.skillDomain?.replaceAll("_", " "), item.skill, item.estimatedMinutes ? `${item.estimatedMinutes} min` : null, item.riskTier && item.riskTier !== "low" ? item.riskTier.replaceAll("_", " ") : null].filter(Boolean).join(" · ")}</p>
                    {item.description && <p className="text-xs text-foreground/80 mt-1 line-clamp-2">{item.description}</p>}
                  </button>
                  <details className="rounded-xl border border-border px-3 py-2">
                    <summary className="cursor-pointer text-xs font-medium text-foreground">Contexts, safety, steps, and research</summary>
                    <div className="mt-3 space-y-2.5 text-xs">
                      <div><p className="font-semibold text-foreground">Appropriate context</p><ul className="mt-1 list-disc pl-4 text-muted-foreground">{(item.appropriateContexts || []).map((text, i) => <li key={i}>{text}</li>)}</ul></div>
                      <div><p className="font-semibold text-foreground">Confirm first</p><ul className="mt-1 list-disc pl-4 text-muted-foreground">{(item.requiredInformation || []).map((text, i) => <li key={i}>{text}</li>)}</ul></div>
                      {item.materials && <p><span className="font-semibold text-foreground">Materials: </span><span className="text-muted-foreground">{item.materials}</span></p>}
                      <div><p className="font-semibold text-foreground">Parent-facing steps</p><ol className="mt-1 list-decimal pl-4 text-muted-foreground">{(item.steps || []).map((text, i) => <li key={i}>{text}</li>)}</ol></div>
                      {!!item.caregiverPhrases?.length && <div><p className="font-semibold text-foreground">Optional words</p><ul className="mt-1 list-disc pl-4 text-muted-foreground">{item.caregiverPhrases.map((text, i) => <li key={i}>{text}</li>)}</ul></div>}
                      {!!item.stopConditions?.length && <div><p className="font-semibold text-foreground">Pause or stop</p><ul className="mt-1 list-disc pl-4 text-muted-foreground">{item.stopConditions.map((text, i) => <li key={i}>{text}</li>)}</ul></div>}
                      {!!item.exclusionCriteria?.length && <div><p className="font-semibold text-foreground">Do not use when</p><ul className="mt-1 list-disc pl-4 text-muted-foreground">{item.exclusionCriteria.map((text, i) => <li key={i}>{text}</li>)}</ul></div>}
                      {!!item.personalizationFields?.length && <p><span className="font-semibold text-foreground">Personalize for: </span><span className="text-muted-foreground">{item.personalizationFields.join(", ")}</span></p>}
                      {!!item.evidenceReferences?.length && <div><p className="font-semibold text-foreground">Research design references</p><ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">{item.evidenceReferences.map((reference) => <li key={reference.key}><a href={reference.url} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">{reference.title} ({reference.publishedYear})</a> — {reference.evidenceType}. {reference.designImplication} Limitation: {reference.limitation}</li>)}</ul><p className="mt-1 text-muted-foreground">References inform general design only; they do not establish this template’s effectiveness.</p></div>}
                    </div>
                  </details>
                </div>
              ))}
              </div>
            </>
      ) : <>
        <Field label="Activity Title (required)"><Input value={form.title} onChange={set("title")} maxLength={180} placeholder="AAC Break Request Practice" className="rounded-xl" data-testid="input-activity-title" /></Field>
        <Field label="Short Description"><Textarea value={form.description} onChange={set("description")} rows={2} className="rounded-xl" data-testid="input-activity-description" /></Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Related Skill"><select className={selectCls} value={form.skill} onChange={set("skill")} data-testid="select-activity-skill">{CARE_SKILLS.map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Estimated Duration (minutes)"><Input type="number" min={1} max={240} value={form.estimatedMinutes} onChange={set("estimatedMinutes")} className="rounded-xl" data-testid="input-activity-minutes" /></Field>
        </div>
        <Field label="What You'll Need"><Input value={form.materials} onChange={set("materials")} className="rounded-xl" data-testid="input-activity-materials" /></Field>
        <LinesEditor label="Parent Instructions (one step per line)" items={form.steps} onChange={(steps) => setForm((f) => ({ ...f, steps }))} placeholder="Describe one step" testid="input-activity-step" />
        <details className="rounded-xl border border-border p-3">
          <summary className="text-xs font-semibold text-foreground cursor-pointer">More options</summary>
          <div className="space-y-3 mt-3">
            <Field label="Why this helps" hint="Shown to parents as an optional, expandable note. Leave blank if there is nothing specific to add."><Textarea value={form.whyItMayHelp} onChange={set("whyItMayHelp")} rows={2} className="rounded-xl" /></Field>
            <Field label="What to Do if It Becomes Difficult" hint="Must match your existing plan. Do not add crisis procedures here."><Textarea value={form.ifDifficult} onChange={set("ifDifficult")} rows={2} className="rounded-xl" /></Field>
            <Field label="Additional Notes"><Textarea value={form.notes} onChange={set("notes")} rows={2} className="rounded-xl" /></Field>
          </div>
        </details>
      </>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Related Goal"><select className={selectCls} value={form.goalId} onChange={set("goalId")} data-testid="select-activity-goal">
          <option value="">No related goal</option>
          {selectable.map((g) => <option key={g.id} value={g.id}>{readableGoalTitle({ goal_title: g.title, goal_description: g.description })}{g.status !== "published" ? ` (${CARE_STATUS_LABELS[g.status]})` : ""}</option>)}
        </select></Field>
        <Field label="Suggested Schedule (optional)"><Input value={form.schedule} onChange={set("schedule")} maxLength={300} placeholder="A few times this week" className="rounded-xl" data-testid="input-activity-schedule" /></Field>
      </div>
      {recommendationReview && (
        <Field label="Clinician review note (internal)">
          <Textarea value={form.reviewNote} onChange={set("reviewNote")} rows={2} maxLength={2000} className="rounded-xl" data-testid="input-activity-review-note" />
        </Field>
      )}
      {chosen?.requiresClinicianConfirmation && (
        <label className="flex items-start gap-2 rounded-xl border border-border p-3 text-xs text-foreground">
          <input type="checkbox" className="mt-0.5 accent-primary" checked={form.planConfirmed} onChange={(e) => setForm((f) => ({ ...f, planConfirmed: e.target.checked }))} data-testid="checkbox-activity-plan-confirmation" />
          <span>{chosen.riskTier === "requires_authorized_plan"
            ? "I confirm an authorized, current child-specific safety plan explicitly supports this activity."
            : "I reviewed the child-specific context and current support or safety plan, and confirm this activity is appropriate."} This confirmation is required before publishing.</span>
        </label>
      )}
      {recommendationReview && (
        <label className="flex items-start gap-2 rounded-xl border border-border p-3 text-xs text-foreground">
          <input type="checkbox" className="mt-0.5 accent-primary" checked={form.planConfirmed} onChange={(e) => setForm((f) => ({ ...f, planConfirmed: e.target.checked }))} data-testid="checkbox-activity-review-confirmation" />
          <span>I completed or verified the missing details in the description and instructions, reviewed the cited source and current child-specific context, and confirmed this version is appropriate, familiar, and safe to offer. Approval will not publish it; I will publish it separately.</span>
        </label>
      )}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <FormActions busy={busy} canSave={canSave} canPublish={canPublish} published={initial?.status === "published"} recommendationReview={recommendationReview}
        onDraft={() => onSubmit(activityPayload(form, recommendationReview ? "needs_review" : initial?.status && initial.status !== "draft" ? initial.status : "draft", initial?.version))}
        onPreview={() => onPreview({ ...previewActivity(), goalTitle: goals.find((g) => g.id === form.goalId)?.title || null })}
        onApprove={() => onSubmit(activityPayload(form, initial?.status === "published" ? "published" : "approved", initial?.version))}
        onPublish={() => onSubmit(activityPayload(form, "published", initial?.version))} />
    </form>
  );
}

export default function CareTeamWorkspace({ childId, childName = "your client" }) {
  const qc = useQueryClient();
  const key = getGetClinicianGoalsActivitiesQueryKey(childId);
  const q = useGetClinicianGoalsActivities(childId, { query: { queryKey: key, enabled: !!childId, staleTime: 20_000, refetchInterval: 60_000 } });
  const [panel, setPanel] = useState(null); // {type:"goal"|"activity", record?}
  const [preview, setPreview] = useState(null); // {type, data}
  const [reviewDialog, setReviewDialog] = useState(null); // { kind, target, source }
  const [reviewNote, setReviewNote] = useState("");
  const [fitSafetyConfirmed, setFitSafetyConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rowError, setRowError] = useState("");
  const libraryQ = useGetCareTeamActivityLibrary({ query: { queryKey: getGetCareTeamActivityLibraryQueryKey(), enabled: panel?.type === "activity", staleTime: 300_000 } });
  const ws = q.data || { goals: [], assignments: [], recentPractice: [], observations: [], activityReviews: [], activityRecommendations: [] };
  const goals = useMemo(() => ws.goals || [], [ws.goals]);
  const activityReviews = useMemo(() => ws.activityReviews || [], [ws.activityReviews]);
  const visibleAssignments = useMemo(() => (ws.assignments || []).filter((activity) =>
    !activity.recommendationId || ["published", "paused", "archived", "superseded"].includes(activity.status),
  ), [ws.assignments]);
  const goalTitle = (id) => { const g = goals.find((x) => x.id === id); return g ? readableGoalTitle({ goal_title: g.title, goal_description: g.description }) : null; };

  const save = async (fn) => {
    setBusy(true); setError("");
    try { await fn(); await qc.invalidateQueries({ queryKey: key }); setPanel(null); }
    catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  };
  const submitGoal = (body) => save(() => panel?.record ? updateCareTeamGoal(childId, panel.record.id, body) : createCareTeamGoal(childId, body));
  const submitActivity = (body) => save(() => panel?.record ? updateCareTeamAssignment(childId, panel.record.id, body) : createCareTeamAssignment(childId, body));
  const startRecommendationReview = async (recommendation) => {
    setBusy(true); setRowError("");
    try {
      const activity = await reviewCareTeamActivityRecommendation(childId, recommendation.id, { action: "start_review" });
      await qc.invalidateQueries({ queryKey: key });
      setError("");
      setPanel({ type: "activity", record: activity });
    } catch (e) {
      setRowError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  const openReviewDialog = (kind, target, source) => {
    setReviewNote(kind === "request_details" ? "" : target.reviewNote || "");
    setFitSafetyConfirmed(false);
    setRowError("");
    setReviewDialog({ kind, target, source });
  };
  const submitReviewAction = async () => {
    if (!reviewDialog) return;
    const { kind, target, source } = reviewDialog;
    if (kind === "request_details" && reviewNote.trim().length < 3) {
      setRowError("Describe the missing detail so your team knows what to follow up on.");
      return;
    }
    setBusy(true); setRowError("");
    try {
      if (source === "suggestion") {
        await reviewCareTeamActivityRecommendation(childId, target.id, {
          action: kind,
          ...(kind === "approve" ? { fitSafetyConfirmed } : {}),
          ...(reviewNote.trim() ? { reviewNote: reviewNote.trim() } : {}),
        });
      } else {
        const status = kind === "approve" ? (target.status === "published" ? "published" : "approved")
          : kind === "reject" ? "rejected" : "needs_details";
        const form = {
          ...activityToForm(target),
          planConfirmed: kind === "approve" ? fitSafetyConfirmed : target.planConfirmed === true,
          reviewNote: reviewNote.trim(),
        };
        await updateCareTeamAssignment(childId, target.id, activityPayload(form, status, target.version));
      }
      await qc.invalidateQueries({ queryKey: key });
      setReviewDialog(null);
      setReviewNote("");
      setFitSafetyConfirmed(false);
    } catch (e) {
      setRowError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  const setGoalStatus = async (g, status) => {
    setRowError("");
    if (!String(g.title || "").trim() || !String(g.description || "").trim()) {
      setError("Add a title and description before changing this goal's status.");
      setPanel({ type: "goal", record: g });
      return;
    }
    try { await updateCareTeamGoal(childId, g.id, goalPayload(goalToForm(g), status, g.version)); await qc.invalidateQueries({ queryKey: key }); }
    catch (e) { setRowError(friendlyError(e)); }
  };
  const setActivityStatus = async (a, status) => {
    setRowError("");
    try {
      const form = activityToForm(a);
      if (a.recommendationId) form.planConfirmed = a.planConfirmed === true;
      await updateCareTeamAssignment(childId, a.id, activityPayload(form, status, a.version));
      await qc.invalidateQueries({ queryKey: key });
    }
    catch (e) { setRowError(friendlyError(e)); }
  };
  const activityStatusItems = (status, apply) => [
    ["published", "Publish"],
    ["paused", "Pause"],
    ["archived", "Archive"],
    ["superseded", "Mark superseded (hide from family)"],
    ["draft", "Move to Draft"],
  ].filter(([next]) => next !== status && !(next === "draft" && status === "archived"))
    .map(([next, label]) => <DropdownMenuItem key={next} onClick={() => apply(next)} data-testid={`menu-activity-${next}`}>{label}</DropdownMenuItem>);
  const statusItems = (status, apply) => [["published", "Publish"], ["paused", "Pause"], ["archived", "Archive"], ["draft", "Move to Draft"]]
    .filter(([s]) => s !== status && !(s === "draft" && status === "archived"))
    .map(([s, label]) => <DropdownMenuItem key={s} onClick={() => apply(s)} data-testid={`menu-${s}`}>{label}</DropdownMenuItem>);
  const open = (type, record) => { setError(""); setPanel({ type, record }); };

  return (
    <section className="space-y-5" aria-labelledby="care-workspace-heading" data-testid="section-care-workspace">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <h2 id="care-workspace-heading" className="font-semibold text-foreground text-sm flex items-center gap-2"><Target className="w-4 h-4 text-primary" /> Goals & Activities</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="rounded-xl h-8 text-xs gap-1.5" onClick={() => open("goal")} data-testid="button-add-care-goal"><Plus className="w-3 h-3" /> Add Goal</Button>
          <Button size="sm" className="rounded-xl h-8 text-xs gap-1.5" onClick={() => open("activity")} data-testid="button-assign-activity"><Plus className="w-3 h-3" /> Assign Activity</Button>
        </div>
      </div>
      {rowError && <p role="alert" className="text-xs text-destructive px-1">{rowError}</p>}

      {q.isLoading ? <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-14 bg-muted rounded-xl animate-pulse" />)}</div>
        : q.isError ? <div className="rounded-xl border border-border p-4 text-sm text-foreground" role="alert">
          Goals & activities could not load. <Button size="sm" variant="outline" className="ml-2 h-7 rounded-lg text-xs" onClick={() => q.refetch()}>Try again</Button></div>
          : <>
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">Goals ({goals.length})</h4>
              {goals.length === 0 ? <div className="text-center py-6 border-2 border-dashed border-border rounded-2xl"><p className="text-xs text-muted-foreground">No goals yet. Add one here, or upload documents and goals are extracted automatically.</p></div>
                : goals.map((g) => (
                  <div key={g.id} className="flex items-start gap-2 bg-card border border-border rounded-xl p-3" data-testid={`row-care-goal-${g.id}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{readableGoalTitle({ goal_title: g.title, goal_description: g.description })}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">{g.source === "document" && <FileText className="w-3 h-3" aria-label="From documents" />}{[SOURCE_LABEL(g.source), g.skill, (g.linkedActivityIds || []).length ? `${g.linkedActivityIds.length} linked ${g.linkedActivityIds.length === 1 ? "activity" : "activities"}` : null].filter(Boolean).join(" · ")}</p>
                      {g.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{g.description}</p>}
                      <GoalProgress goal={g} />
                    </div>
                    {g.status ? <StatusBadge status={g.status} /> : null}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><button type="button" aria-label={`Actions for ${g.title}`} className="p-1 rounded-lg text-muted-foreground hover:text-foreground" data-testid={`menu-care-goal-${g.id}`}><MoreHorizontal className="w-4 h-4" /></button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {g.canEdit && <DropdownMenuItem onClick={() => open("goal", g)}>Edit</DropdownMenuItem>}
                        <DropdownMenuItem onClick={() => setPreview({ type: "goal", data: g })}>Preview</DropdownMenuItem>
                        {g.canEdit && statusItems(g.status, (s) => setGoalStatus(g, s))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">Assigned Activities</h4>
              {visibleAssignments.length === 0 ? <p className="text-xs text-muted-foreground px-1">No activities assigned yet.</p> : (
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="hidden sm:grid grid-cols-[1fr_1fr_auto_auto] gap-3 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border">
                    <span>Activity</span><span>Related Goal</span><span>Status</span><span className="w-6" />
                  </div>
                  {visibleAssignments.map((a) => (
                    <div key={a.id} className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_1fr_auto_auto] gap-3 items-center px-3 py-2.5 border-b border-border last:border-0" data-testid={`row-assignment-${a.id}`}>
                      <div className="min-w-0"><p className="text-sm font-medium text-foreground truncate">{a.title}</p><p className="text-xs text-muted-foreground sm:hidden">{a.goalTitle || goalTitle(a.goalId) || "No related goal"}</p></div>
                      <p className="hidden sm:block text-sm text-foreground truncate">{a.goalTitle || goalTitle(a.goalId) || "No related goal"}</p>
                      <StatusBadge status={a.status} />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><button type="button" aria-label={`Actions for ${a.title}`} className="p-1 rounded-lg text-muted-foreground hover:text-foreground" data-testid={`menu-assignment-${a.id}`}><MoreHorizontal className="w-4 h-4" /></button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setPreview({ type: "activity", data: a })}>View</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => open("activity", a)}>Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setPreview({ type: "activity", data: a })}>Preview</DropdownMenuItem>
                           {activityStatusItems(a.status, (s) => setActivityStatus(a, s))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <section className="space-y-2" aria-labelledby="child-activity-suggestions-heading" data-testid="section-child-activity-suggestions">
              <h4 id="child-activity-suggestions-heading" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">Child-specific activity suggestions</h4>
              <p className="px-1 text-support-sm text-muted-foreground">Published assignments are listed above and take priority. These evidence-linked suggestions are not assigned or sent to the family; confirm current fit, familiarity, and safety before considering them.</p>
              {ws.activityRecommendationMessage && (
                <p
                  className={`rounded-lg border px-3 py-2 text-body-sm ${ws.activityRecommendationStatus === "scan_incomplete" ? "border-destructive/30 bg-destructive/10 text-foreground" : "border-border bg-muted/50 text-foreground"}`}
                  role={ws.activityRecommendationStatus === "scan_incomplete" ? "status" : undefined}
                  data-testid="activity-recommendation-message"
                >
                  {ws.activityRecommendationMessage}
                </p>
              )}
              {ws.activitySafetyEvidence?.length > 0 && (
                <Surface variant="separated" tone="urgent" className="space-y-2" role="note" data-testid="activity-safety-evidence">
                  <p className="text-body-sm font-semibold">Safety information is documented. Review it before considering any suggestion.</p>
                  {ws.activitySafetyEvidence.map((source) => (
                    <p key={`${source.recordId}-${source.documentId}`} className="text-body-sm">
                      <span className="font-semibold">{source.documentTitle}{source.sourcePage ? ` · page ${source.sourcePage}` : ""}:</span>{" "}
                      {source.sourceExcerpt}
                    </p>
                  ))}
                </Surface>
              )}
              {ws.activityRecommendations?.length > 0 ? (
                <div className="space-y-3">
                  {ws.activityRecommendations.map((recommendation) => (
                    <RecommendationCard
                      key={recommendation.id}
                      recommendation={recommendation}
                      onStartReview={startRecommendationReview}
                      onApprove={(item) => openReviewDialog("approve", item, "suggestion")}
                      onRequestDetails={(item) => openReviewDialog("request_details", item, "suggestion")}
                      onReject={(item) => openReviewDialog("reject", item, "suggestion")}
                    />
                  ))}
                </div>
              ) : !ws.activityRecommendationMessage ? (
                <p className="px-1 text-body-sm text-muted-foreground">No child-specific suggestions are available yet.</p>
              ) : null}
            </section>

            <section className="space-y-2" aria-labelledby="activity-review-heading" data-testid="section-activity-review">
              <h4 id="activity-review-heading" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">Activity review &amp; publication</h4>
              <p className="px-1 text-support-sm text-muted-foreground">Only approved and published activities reach the family. Detail requests and review notes remain in this clinician workspace.</p>
              {activityReviews.length === 0
                ? <p className="px-1 text-body-sm text-muted-foreground">No suggestions are waiting for clinician review.</p>
                : <div className="space-y-3">
                  {activityReviews.map((activity) => (
                    <ActivityReviewCard
                      key={activity.id}
                      activity={activity}
                      onEdit={(item) => open("activity", item)}
                      onApprove={(item) => openReviewDialog("approve", item, "assignment")}
                      onPublish={(item) => setActivityStatus(item, "published")}
                      onRequestDetails={(item) => openReviewDialog("request_details", item, "assignment")}
                      onReject={(item) => openReviewDialog("reject", item, "assignment")}
                    />
                  ))}
                </div>}
            </section>

            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">Recent Practice</h4>
              {ws.recentPractice.length === 0 ? <p className="text-xs text-muted-foreground px-1">No practice updates from the family yet.</p>
                : ws.recentPractice.map((p) => (
                  <article key={p.id} className="bg-card border border-border rounded-xl p-3" data-testid={`row-practice-${p.id}`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">{p.title}</p>
                      <time className="text-xs text-muted-foreground">{formatDay(p.createdAt)}</time>
                    </div>
                    <p className="text-xs text-foreground mt-1"><span className="font-semibold">Status:</span> {CARE_OUTCOME_LABELS[p.outcome] || p.outcome}</p>
                    {p.note && <p className="text-xs text-foreground mt-0.5"><span className="font-semibold">Parent note:</span> {p.note}</p>}
                    {(p.goalTitle || goalTitle(p.goalId)) && <p className="text-xs text-muted-foreground mt-0.5">Related goal: {p.goalTitle || goalTitle(p.goalId)}</p>}
                    <p className="text-[11px] text-muted-foreground mt-0.5">Instructions version {p.version}</p>
                  </article>
                ))}
              <p className="text-[11px] text-muted-foreground px-1">Practice updates are descriptive caregiver reports and do not change goal progress. Updates from independent parent accounts appear only while the family is sharing observations with your clinic.</p>
            </div>

            {ws.observations?.length > 0 && <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">Shared Parent Observations</h4>
              {ws.observations.map((o) => (
                <article key={o.id} className="bg-card border border-border rounded-xl p-3" data-testid={`row-observation-${o.id}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">{o.behavior || "Observation"}</p>
                    <time className="text-xs text-muted-foreground">{formatDay(o.createdAt)}</time>
                  </div>
                  {o.intensity && <p className="text-xs text-muted-foreground">Intensity: {o.intensity}</p>}
                  {o.notes && <p className="text-xs text-foreground mt-0.5">{o.notes}</p>}
                </article>
              ))}
            </div>}
          </>}

      <Dialog open={Boolean(panel)} onOpenChange={(v) => { if (!v) setPanel(null); }}>
        <DialogContent className="max-w-xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{panel?.type === "goal" ? (panel.record ? "Edit Goal" : "Add Goal") : (panel?.record ? "Edit Activity" : "Assign Activity")}</DialogTitle>
            <DialogDescription>For {childName}. Drafts stay hidden from the family until published.</DialogDescription>
          </DialogHeader>
          {panel?.type === "goal" && <GoalForm key={panel.record?.id || "new"} initial={panel.record} busy={busy} error={error} onSubmit={submitGoal} onPreview={(data) => setPreview({ type: "goal", data })} />}
          {panel?.type === "activity" && <AssignActivityForm key={panel.record?.id || "new"} initial={panel.record} library={libraryQ.data || []} libraryLoading={libraryQ.isLoading}
            goals={goals} busy={busy} error={error} onSubmit={submitActivity} onPreview={(data) => setPreview({ type: "activity", data })} />}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(preview)} onOpenChange={(v) => { if (!v) setPreview(null); }}>
        <DialogContent className="max-w-xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview as Parent</DialogTitle>
            <DialogDescription>This is what the family will see. Nothing is saved from this preview.</DialogDescription>
          </DialogHeader>
          <div className="pf">
            {preview?.type === "goal" && <CareTeamGoalCard goal={preview.data} childId={childId} assignments={visibleAssignments.filter((a) => a.status === "published" && a.goalId === preview.data.id)} practice={[]} />}
            {preview?.type === "activity" && <div className="np-practice"><ActivityGuide preview assigned requireOutcome activity={preview.data} childName={childName}
              relatedGoal={preview.data.goalTitle || goalTitle(preview.data.goalId)} onExit={() => setPreview(null)} onSkip={() => setPreview(null)} /></div>}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(reviewDialog)} onOpenChange={(v) => { if (!v && !busy) { setReviewDialog(null); setRowError(""); } }}>
        <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {reviewDialog?.kind === "approve" ? "Confirm clinician review"
                : reviewDialog?.kind === "request_details" ? "Request More Detail"
                  : "Reject this suggestion"}
            </DialogTitle>
            <DialogDescription>
              {reviewDialog?.kind === "approve"
                ? "Approval is recorded for the clinician team. It does not publish the activity to the family."
                : reviewDialog?.kind === "request_details"
                  ? "This records an internal clinician follow-up note only. It does not message the family."
                  : "The suggestion will be recorded as rejected and kept out of the family experience."}
            </DialogDescription>
          </DialogHeader>
          {reviewDialog?.target && (
            <div className="space-y-3">
              <p className="text-body-sm font-semibold">{reviewDialog.target.title}</p>
              {reviewDialog.target.riskClassification && <p className="text-support-sm text-muted-foreground">Risk classification: {reviewDialog.target.riskClassification}</p>}
              {reviewDialog.kind === "approve" && (
                <label className="flex items-start gap-2 rounded-xl border border-border p-3 text-body-sm text-foreground">
                  <input type="checkbox" className="mt-0.5 accent-primary" checked={fitSafetyConfirmed} onChange={(event) => setFitSafetyConfirmed(event.target.checked)} data-testid="checkbox-confirm-suggestion-fit-safety" />
                  <span>I reviewed the source and the child's current context, and confirmed this activity is appropriate, familiar, and safe.</span>
                </label>
              )}
              {(reviewDialog.kind === "request_details" || reviewDialog.kind === "reject") && (
                <Field label={reviewDialog.kind === "request_details" ? "What detail is needed? (required)" : "Internal note (optional)"}>
                  <Textarea
                    value={reviewNote}
                    onChange={(event) => setReviewNote(event.target.value)}
                    rows={4}
                    maxLength={2000}
                    className="rounded-xl"
                    placeholder={reviewDialog.kind === "request_details" ? "Describe the missing information for clinician follow-up." : "Optional reason for the clinical record."}
                    data-testid="input-review-action-note"
                  />
                </Field>
              )}
              {rowError && <p role="alert" className="text-support-sm text-destructive">{rowError}</p>}
              <div className="flex justify-end gap-2 border-t border-border pt-3">
                <Button type="button" variant="outline" disabled={busy} onClick={() => setReviewDialog(null)}>Cancel</Button>
                <Button
                  type="button"
                  disabled={busy || (reviewDialog.kind === "approve" && !fitSafetyConfirmed) || (reviewDialog.kind === "request_details" && reviewNote.trim().length < 3)}
                  onClick={submitReviewAction}
                  data-testid="button-submit-review-action"
                >
                  {busy ? "Saving..." : reviewDialog.kind === "approve" ? "Approve (not publish)"
                    : reviewDialog.kind === "request_details" ? "Record follow-up note" : "Reject suggestion"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
