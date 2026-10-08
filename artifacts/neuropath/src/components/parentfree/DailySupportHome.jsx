import { useState } from "react";
import { BookOpen, ClipboardList, FileUp, MessageCircle, Plus, Target, UserRound } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetParentDashboardQueryKey,
  useLogParentDailyAction,
  useUpdateParentDailyAction,
} from "@workspace/api-client-react";
import { parentRequest } from "@/lib/parentSession";
import { ErrorBox, errMsg } from "./common";
import { sourceLabel } from "./SupportView";

const SOURCE_LABELS = {
  clinician_reviewed: "Source: Reviewed by your clinician",
  clinician_uploaded_plan: "Source: Clinician-uploaded document",
  parent_uploaded_plan: "Source: Uploaded plan · not yet reviewed by a clinician",
  starter_template: "Source: General starter support",
  recent_log_pattern: "Based on recent parent notes",
  selected_behavior: "Based on your selected behavior",
};

const STATUS_LABELS = {
  not_started: "Ready when you are",
  done: "Done today",
  logged: "Logged",
  skipped: "Skipped today",
  saved_for_later: "Saved for later",
  needs_review: "Needs review",
};

const RATINGS = [
  ["helped", "Worked well"],
  ["somewhat_helped", "Helped somewhat"],
  ["not_helped", "Didn't work"],
  ["behavior_escalated", "Behavior escalated"],
];

const OUTCOMES = [
  ["used_skill", "Done"],
  ["not_yet", "Didn't get a chance"],
  ["partially", "We struggled with this"],
];

function sourceText(action) {
  return SOURCE_LABELS[action.sourceType] || "Source: Not available";
}

function statusTone(status) {
  if (status === "needs_review" || status === "skipped") return "warn";
  if (status === "done" || status === "logged") return "sun";
  return "";
}

function ActionCard({ action, documents, childName, onOutcome, onStatus }) {
  const [error, setError] = useState("");
  const document = action.sourceDocumentId
    ? documents.find((item) => item.id === action.sourceDocumentId)
    : null;
  const hasActions = action.status === "not_started" || action.status === "saved_for_later";
  const feedback = action.logs?.[0];
  const busy = onStatus.isPending && onStatus.variables?.actionId === action.id;
  const saving = onOutcome.isPending && onOutcome.variables?.actionId === action.id;

  const updateStatus = (status) => {
    setError("");
    onStatus.mutate(
      { childId: action.childId, actionId: action.id, data: { status } },
      { onError: (mutationError) => setError(errMsg(mutationError)) },
    );
  };

  return (
    <article className={`pf-card pf-daily-action ${action.status === "needs_review" ? "needs-review" : ""}`} data-testid={`card-daily-action-${action.id}`}>
      <div className="pf-daily-action-top">
        <div>
          <p className="pf-eyebrow">Practice this today · {action.behaviorName} · {action.estimatedMinutes} min</p>
          <h3>{action.title}</h3>
        </div>
        <span className={`pf-tag ${statusTone(action.status)}`}>{STATUS_LABELS[action.status] || "Ready when you are"}</span>
      </div>
      <p className="pf-daily-description">{action.description}</p>
      {action.whyItMayHelp && <p className="pf-daily-why"><strong>Why this supports {childName}'s goal:</strong> {action.whyItMayHelp}</p>}
      {action.steps?.length > 0 && (
        <ol className="pf-daily-steps">
          {action.steps.map((step, index) => <li key={`${action.id}-${index}`}>{step}</li>)}
        </ol>
      )}
      <div className="pf-daily-source">
        <span className={`pf-tag ${action.sourceType === "starter_template" ? "sun" : ""}`}>{sourceText(action)}</span>
        {document && <span className="pf-hint">Plan: {document.title || document.fileName}</span>}
      </div>
      {action.status === "needs_review" && (
        <p className="pf-hint pf-daily-review-note">Ask your clinician which plan step to use before trying plan-specific guidance.</p>
      )}
      {(action.status === "done" || action.status === "logged") && feedback && (
        <p className="pf-hint pf-daily-feedback" data-testid={`text-action-feedback-${action.id}`}>
          {feedback.eventType === "completion" && feedback.rating
            ? `Your feedback: ${RATINGS.find(([value]) => value === feedback.rating)?.[1] || feedback.rating}`
            : feedback.outcome
              ? `Your note: ${OUTCOMES.find(([value]) => value === feedback.outcome)?.[1] || feedback.outcome}`
              : "Your feedback was saved."}
          {feedback.note ? ` · ${feedback.note}` : ""}
        </p>
      )}
      <ErrorBox error={error} />
      {hasActions && action.status !== "needs_review" && (
        <>
          <div className="pf-daily-outcomes" role="group" aria-label={`Activity outcome for ${childName}`}>
            {OUTCOMES.map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`pf-daily-outcome ${value === "used_skill" ? "done" : ""}`}
                data-testid={`button-outcome-${action.id}-${value}`}
                onClick={() => {
                  setError("");
                  onOutcome.mutate(
                    {
                      childId: action.childId,
                      actionId: action.id,
                      data: { eventType: "outcome", outcome: value },
                    },
                    { onError: (mutationError) => setError(errMsg(mutationError)) },
                  );
                }}
                disabled={saving || busy}
              >
                {saving ? "Saving..." : label}
              </button>
            ))}
          </div>
          {action.status === "not_started" ? (
            <div className="pf-daily-action-buttons">
              <button type="button" className="pf-btn ghost" onClick={() => updateStatus("saved_for_later")} disabled={busy || saving}>Save for Later</button>
            </div>
          ) : (
            <div className="pf-daily-action-buttons">
              <button type="button" className="pf-btn ghost" onClick={() => updateStatus("not_started")} disabled={busy || saving}>Move to Today</button>
            </div>
          )}
        </>
      )}
      {!hasActions && action.status !== "needs_review" && (
        <p className="pf-hint pf-action-closed" aria-live="polite">
          {action.status === "skipped" ? "You can revisit this support step from the library." : "Your update is saved for today."}
        </p>
      )}
    </article>
  );
}

export default function DailySupportHome({
  childId,
  childName,
  actions = [],
  documents = [],
  cards = [],
  selectedId,
  onSelectBehavior,
  onOpenSteps,
  onOpenLibrary,
  onLog,
  onUpload,
  onAddBehavior,
  onGoals,
  onEditProfile,
  onAsk,
  progress,
}) {
  const queryClient = useQueryClient();
  const log = useLogParentDailyAction({ request: parentRequest() });
  const update = useUpdateParentDailyAction({ request: parentRequest() });
  const status = {
    ...update,
    mutate: (variables, options) => update.mutate(variables, {
      ...options,
      onSuccess: async (...args) => {
        await queryClient.invalidateQueries({ queryKey: getGetParentDashboardQueryKey(childId) });
        options?.onSuccess?.(...args);
      },
    }),
  };
  const outcome = {
    ...log,
    mutate: (variables, options) => log.mutate(variables, {
      ...options,
      onSuccess: async (...args) => {
        await queryClient.invalidateQueries({ queryKey: getGetParentDashboardQueryKey(childId) });
        options?.onSuccess?.(...args);
      },
    }),
  };
  const tasks = actions.filter((action) => action.kind === "task");

  const actionGrid = (items) => (
    <div className="pf-daily-grid">
      {items.map((action) => (
        <ActionCard
          key={action.id}
          action={action}
          documents={documents}
          childName={childName}
          onOutcome={outcome}
          onStatus={status}
        />
      ))}
    </div>
  );

  return (
    <div className="pf-daily-home" data-testid="panel-today">
      <section className="pf-daily-section" aria-labelledby="daily-tasks-heading">
        <div className="pf-daily-section-heading">
          <div>
            <p className="pf-eyebrow">Based on the support available for {childName}</p>
            <h2 id="daily-tasks-heading">Today for {childName}</h2>
          </div>
          <span className="pf-daily-count">{tasks.filter((task) => task.status === "not_started").length} ready</span>
        </div>
        <p className="pf-hint">Try only what fits the written plan. Skip anything that does not fit today.</p>
        {tasks.length ? actionGrid(tasks) : (
          <div className="pf-card">
            <p>No plan-specific daily activity is ready for {childName}. Upload a treatment or behavior plan, or ask the clinician to identify a routine, practice opportunity, and skill to notice.</p>
            <button type="button" className="pf-btn primary" onClick={onUpload}>Upload a Plan</button>
          </div>
        )}
      </section>

      <section className="pf-card pf-quick-actions">
        <div className="pf-daily-section-heading">
          <div>
            <p className="pf-eyebrow">Everything else you need</p>
            <h2>Quick Actions</h2>
          </div>
        </div>
        <div className="pf-quick-action-grid">
          <button type="button" className="pf-quick-action" onClick={onLog}><ClipboardList size={20} /><span>Log What Happened</span></button>
          <button type="button" className="pf-quick-action" onClick={onUpload}><FileUp size={20} /><span>Upload a Plan</span></button>
          <button type="button" className="pf-quick-action" onClick={onAsk}><MessageCircle size={20} /><span>Ask NeuroPathways</span></button>
          <button type="button" className="pf-quick-action" onClick={onOpenLibrary}><BookOpen size={20} /><span>Support Library</span></button>
          <button type="button" className="pf-quick-action" onClick={onGoals}><Target size={20} /><span>Manage Goals</span></button>
          <button type="button" className="pf-quick-action" onClick={onEditProfile}><UserRound size={20} /><span>Edit Child Profile</span></button>
          <button type="button" className="pf-quick-action" onClick={onAddBehavior}><Plus size={20} /><span>Add a Behavior</span></button>
        </div>
      </section>

      <section className="pf-daily-section pf-library-preview" aria-labelledby="library-preview-heading">
        <div className="pf-daily-section-heading">
          <div>
            <p className="pf-eyebrow">Saved guidance</p>
            <h2 id="library-preview-heading">Support Library</h2>
          </div>
          <button type="button" className="pf-btn small" onClick={onOpenLibrary}>View full library</button>
        </div>
        {cards.length ? (
          <div className="pf-library-preview-grid">
            {cards.slice(0, 3).map((card) => {
              const identity = card.behaviorKey === "custom"
                ? `custom:${(card.behaviorName || "").normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`
                : `starter:${card.behaviorKey}`;
              const selected = selectedId === identity;
              const source = sourceLabel(card);
              return (
                <article className={`pf-card pf-library-preview-card ${selected ? "is-selected" : ""}`} key={card.id}>
                  <div className="pf-daily-action-top">
                    <div>
                      <h3>{card.behaviorName}</h3>
                      <p className="pf-hint">{selected ? "Selected support area" : "Active support area"}</p>
                    </div>
                    <span className={`pf-tag ${source.kind}`}>{source.text.replace(/^Source:\s*/, "")}</span>
                  </div>
                  <div className="pf-library-actions">
                    <button type="button" className="pf-btn small" aria-pressed={selected} onClick={() => onSelectBehavior(identity)}>{selected ? "Selected" : "Set focus"}</button>
                    <button type="button" className="pf-btn small primary" onClick={() => onOpenSteps(card)}>Open support steps</button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="pf-card">
            <p>No active support areas yet.</p>
            <button type="button" className="pf-btn small" onClick={onAddBehavior}>Add a behavior</button>
          </div>
        )}
        {cards.length > 3 && <button type="button" className="pf-btn small" onClick={onOpenLibrary}>See all {cards.length} support areas</button>}
      </section>

      {progress && <section className="pf-daily-section pf-progress-secondary" aria-label="Recent progress">{progress}</section>}

    </div>
  );
}
