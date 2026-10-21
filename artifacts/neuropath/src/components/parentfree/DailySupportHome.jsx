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
import { cardIdentity, summarize } from "./progress";
import { CompactCard } from "@workspace/neuropathways-foundations/components/ui/compact-card";
import HomeWeekSummary from "./HomeWeekSummary";

const SOURCE_LABELS = {
  clinician_reviewed: "Clinician reviewed",
  clinician_uploaded_plan: "Clinician-uploaded plan",
  parent_uploaded_plan: "Based on your uploaded plan · not clinician-reviewed",
  starter_template: "Starter support",
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

function stepField(steps, prefix) {
  const value = steps.find((step) => step.startsWith(prefix));
  return value ? value.slice(prefix.length).trim() : "";
}

const RATINGS = [
  ["helped", "Worked well"],
  ["somewhat_helped", "Helped somewhat"],
  ["not_helped", "Didn't work"],
  ["behavior_escalated", "Behavior escalated"],
];

const OUTCOMES = [
  ["used_skill", "Done"],
  ["not_yet", "Didn't get a chance"],
  ["partially", "We struggled"],
];

function sourceText(action) {
  return SOURCE_LABELS[action.sourceType] || "Source not available";
}

function statusTone(status) {
  if (status === "needs_review" || status === "skipped") return "warn";
  if (status === "done" || status === "logged") return "sun";
  return "";
}

function ActionCard({ action, documents, childName, onOutcome, onStatus }) {
  const [error, setError] = useState("");
  const [showPracticeSteps, setShowPracticeSteps] = useState(false);
  const document = action.sourceDocumentId
    ? documents.find((item) => item.id === action.sourceDocumentId)
    : null;
  const steps = Array.isArray(action.steps) ? action.steps : [];
  const startAction = stepField(steps, "Start: ");
  const practicedSkill = stepField(steps, "Skill practiced: ");
  const finish = stepField(steps, "Finish: ");
  const pauseConditions = stepField(steps, "Pause or stop if: ");
  const materials = stepField(steps, "Materials: ");
  const relatedGoal = stepField(steps, "Related goal: ");
  const observationPrompts = steps
    .filter((step) => step.startsWith("Optional observation: "))
    .map((step) => step.replace(/^Optional observation:\s*/, ""));
  const activitySteps = steps
    .filter((step) => /^Activity step \d+:\s*/.test(step))
    .map((step) => step.replace(/^Activity step \d+:\s*/, ""));
  const hasCompleteActivityStructure = Boolean(startAction && activitySteps.length >= 2 && activitySteps.length <= 5 && finish && pauseConditions);
  const activityNeedsDetails = action.status !== "needs_review" && !hasCompleteActivityStructure;
  const needsReview = action.status === "needs_review" || activityNeedsDetails;
  const hasActions = !needsReview && (action.status === "not_started" || action.status === "saved_for_later");
  const feedback = action.logs?.[0];
  const busy = onStatus.isPending && onStatus.variables?.actionId === action.id;
  const saving = onOutcome.isPending && onOutcome.variables?.actionId === action.id;
  const legacySteps = steps.filter((step) =>
    !/^(Start: |Activity step \d+: |Skill practiced: |Related goal: |Finish: |Pause or stop if: |Materials: |Optional observation: )/.test(step),
  );
  const practiceSteps = activitySteps.length ? activitySteps : legacySteps;

  const updateStatus = (status) => {
    setError("");
    onStatus.mutate(
      { childId: action.childId, actionId: action.id, data: { status } },
      { onError: (mutationError) => setError(errMsg(mutationError)) },
    );
  };

  return (
    <CompactCard
      className={`pf-daily-action np-home-activity ${needsReview ? "needs-review" : ""}`}
      data-testid={`card-daily-action-${action.id}`}
      title={action.title}
      current={showPracticeSteps}
      meta={<>{action.behaviorName} · {action.estimatedMinutes} min</>}
      description={action.description}
      badges={<>
        <span className={`pf-tag ${action.sourceType === "starter_template" ? "sun" : ""}`}>{sourceText(action)}</span>
        <span className={`pf-tag ${statusTone(needsReview ? "needs_review" : action.status)}`}>{activityNeedsDetails ? "Needs Details" : STATUS_LABELS[action.status] || "Ready when you are"}</span>
      </>}
    >
      {document && <p className="pf-hint np-home-plan-source">Plan: {document.title || document.fileName}</p>}
      {needsReview && (
        <p className="pf-hint pf-daily-review-note">
          {activityNeedsDetails
            ? "This saved item is missing a clear start, two or more concrete steps, an ending, or pause conditions. It is not available to try."
            : "Ask your clinician which plan step to use before trying plan-specific guidance."}
        </p>
      )}
      <div className="np-home-activity-controls">
          <button
            type="button"
            className={`pf-btn ${hasActions ? "primary" : ""}`}
            aria-expanded={showPracticeSteps}
            aria-controls={`home-activity-details-${action.id}`}
            data-testid={`button-home-activity-${action.id}`}
            onClick={() => setShowPracticeSteps((shown) => !shown)}
          >
            {showPracticeSteps ? "Close Activity" : needsReview ? "Review Activity" : hasActions ? "Try Today" : "View Activity"}
          </button>
      </div>
      {showPracticeSteps && (
        <div id={`home-activity-details-${action.id}`} className="np-home-activity-details">
          {startAction && <p><strong>Start action:</strong> {startAction}</p>}
          {materials && <p><strong>Materials:</strong> {materials}</p>}
          {practicedSkill && <p className="pf-daily-skill"><strong>Target skill:</strong> {practicedSkill}</p>}
          {relatedGoal && <p><strong>Related goal:</strong> {relatedGoal}</p>}
          {practiceSteps.length > 0 && (
            <section className="pf-daily-try-steps" aria-label={`Steps to try for ${action.title}`}>
              <strong>{activitySteps.length ? "Activity steps" : "Instructions"}</strong>
              <ol className="pf-daily-steps">
                {practiceSteps.map((step, index) => <li key={`${action.id}-try-${index}`}>{step}</li>)}
              </ol>
            </section>
          )}
          {finish && <p><strong>Finish:</strong> {finish}</p>}
          {pauseConditions && <p className="pf-daily-review-note"><strong>Pause or stop if:</strong> {pauseConditions}</p>}
          {observationPrompts.length > 0 && <p><strong>Optional observations:</strong> {observationPrompts.join(" ")}</p>}
          {activityNeedsDetails && <p className="pf-hint">This older saved item does not meet the complete-activity standard.</p>}
      {action.whyItMayHelp && (
        <details className="pf-daily-details">
          <summary>Show Details</summary>
          {action.whyItMayHelp && <p className="pf-daily-why"><strong>Why you're doing this:</strong> {action.whyItMayHelp}</p>}
        </details>
      )}
        </div>
      )}
      {(action.status === "done" || action.status === "logged") && feedback && (
        <p className="pf-hint pf-daily-feedback" data-testid={`text-action-feedback-${action.id}`}>
          {feedback.eventType === "completion" && feedback.rating
            ? `Logged: ${RATINGS.find(([value]) => value === feedback.rating)?.[1] || feedback.rating}`
            : feedback.outcome
              ? `Logged: ${OUTCOMES.find(([value]) => value === feedback.outcome)?.[1] || feedback.outcome}`
              : "Your feedback was saved."}
          {feedback.note ? ` · ${feedback.note}` : ""}
        </p>
      )}
      <ErrorBox error={error} />
      {showPracticeSteps && hasActions && !needsReview && (
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
      {!hasActions && !needsReview && (
        <p className="pf-hint pf-action-closed" aria-live="polite">
          {action.status === "skipped" ? "You can revisit this support step from the library." : "Your update is saved for today."}
        </p>
      )}
    </CompactCard>
  );
}

export default function DailySupportHome({
  childId,
  childName,
  actions = [],
  logs = [],
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
}) {
  const queryClient = useQueryClient();
  const [showAllTasks, setShowAllTasks] = useState(false);
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
  const week = summarize(logs);
  const focusedCard = cards.find((item) => cardIdentity(item) === selectedId) || cards[0];
  const focusedSource = focusedCard ? sourceLabel(focusedCard) : null;

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
            <p className="pf-eyebrow">Things to Try Today</p>
            <h2 id="daily-tasks-heading">Activities for {childName}</h2>
          </div>
          <span className="pf-daily-count">{tasks.filter((task) => task.status === "not_started").length} ready</span>
        </div>
        <p className="pf-hint">Simple activities connected to selected behaviors and their support sources.</p>
        <p className="pf-hint">Only try activities that feel safe and realistic today. Stop if an activity becomes stressful or unsafe.</p>
        {tasks.length ? actionGrid(showAllTasks ? tasks : tasks.slice(0, 3)) : (
          <div className="pf-card" data-testid="empty-daily-plan">
            <h3>Build today's practice list</h3>
            <p>Choose a behavior to see complete starter activities. Goals stay in Goals; plan-based activities appear here only when the source includes enough detail and any required clinician review is complete.</p>
            <div className="pf-daily-action-buttons">
              <button type="button" className="pf-btn primary" onClick={onGoals}>Choose a Goal</button>
              <button type="button" className="pf-btn" onClick={onUpload}>Read a Plan</button>
            </div>
          </div>
        )}
        {tasks.length > 3 && (
          <button type="button" className="pf-btn" onClick={() => setShowAllTasks((shown) => !shown)}>
            {showAllTasks ? "Show Fewer Activities" : "See More Activities"}
          </button>
        )}
      </section>

      <section className="pf-daily-section" aria-labelledby="prepare-heading">
        <div className="pf-daily-section-heading">
          <div>
            <p className="pf-eyebrow">Use familiar, low-pressure supports</p>
            <h2 id="prepare-heading">Prepare</h2>
          </div>
          {focusedSource && <span className={`pf-tag ${focusedSource.kind}`}>{focusedSource.text}</span>}
        </div>
        {focusedCard ? (
          <div className="np-home-prepare">
            <h3>Prepare for a routine involving {focusedCard.behaviorName}</h3>
            <p className="pf-hint" style={{ marginTop: 6 }}>
              Use the prevention steps already saved for this support area. Do not create a difficult situation to practice.
            </p>
            <details className="np-home-preparation-details">
            <summary>Saved preparation steps</summary>
            <ol className="pf-daily-steps">
              {(focusedCard.prevention || []).slice(0, 3).map((step, index) => <li key={`${focusedCard.id}-prepare-${index}`}>{step}</li>)}
            </ol>
            {(!focusedCard.prevention || focusedCard.prevention.length === 0) && (
              <p className="pf-hint">No preparation steps are available for this support area yet. Review its saved support steps or upload a plan.</p>
            )}
            </details>
            <button type="button" className="pf-btn small primary" style={{ marginTop: 12 }} onClick={() => onOpenSteps(focusedCard)}>Review support steps</button>
          </div>
        ) : (
          <div className="pf-card"><p>Select a behavior or upload a plan to see preparation support.</p></div>
        )}
      </section>

      <HomeWeekSummary focusedCard={focusedCard} focusedSource={focusedSource} week={week} onLog={onLog} />

      <section className="pf-card pf-quick-actions">
        <div className="pf-daily-section-heading">
          <div>
            <p className="pf-eyebrow">Everything else you need</p>
            <h2>Quick Actions</h2>
          </div>
        </div>
        <div className="pf-quick-action-grid">
          <button type="button" className="pf-quick-action" onClick={onLog}><ClipboardList size={20} /><span>Quick Log</span></button>
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
    </div>
  );
}
