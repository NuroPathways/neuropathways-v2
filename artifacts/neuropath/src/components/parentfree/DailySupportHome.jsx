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
  const hasActions = action.status === "not_started" || action.status === "saved_for_later";
  const feedback = action.logs?.[0];
  const busy = onStatus.isPending && onStatus.variables?.actionId === action.id;
  const saving = onOutcome.isPending && onOutcome.variables?.actionId === action.id;
  const practicedSkill = action.steps?.find((step) => step.startsWith("Skill practiced: "));
  const practiceSteps = action.steps?.filter((step) => step !== practicedSkill) || [];

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
          <p className="pf-eyebrow">{action.behaviorName} · {action.estimatedMinutes} min</p>
          <h3>{action.title}</h3>
        </div>
        <span className={`pf-tag ${statusTone(action.status)}`}>{STATUS_LABELS[action.status] || "Ready when you are"}</span>
      </div>
      <p className="pf-daily-description"><strong>What to do:</strong> {action.description}</p>
      {practicedSkill && <p className="pf-daily-skill"><strong>Skill practiced:</strong> {practicedSkill.replace(/^Skill practiced:\s*/, "")}</p>}
      <div className="pf-daily-source">
        <span className={`pf-tag ${action.sourceType === "starter_template" ? "sun" : ""}`}>{sourceText(action)}</span>
        {document && <span className="pf-hint">Plan: {document.title || document.fileName}</span>}
      </div>
      {practiceSteps.length > 0 && (
        <>
          <button
            type="button"
            className="pf-btn primary"
            aria-expanded={showPracticeSteps}
            onClick={() => setShowPracticeSteps((shown) => !shown)}
          >
            {showPracticeSteps ? "Hide Activity Steps" : "Try Today"}
          </button>
          {showPracticeSteps && (
            <section className="pf-daily-try-steps" aria-label={`Steps to try for ${action.title}`}>
              <strong>Steps to try</strong>
              <ol className="pf-daily-steps">
                {practiceSteps.map((step, index) => <li key={`${action.id}-try-${index}`}>{step}</li>)}
              </ol>
            </section>
          )}
        </>
      )}
      {action.whyItMayHelp && (
        <details className="pf-daily-details">
          <summary>Show Details</summary>
          {action.whyItMayHelp && <p className="pf-daily-why"><strong>Why you're doing this:</strong> {action.whyItMayHelp}</p>}
        </details>
      )}
      {action.status === "needs_review" && (
        <p className="pf-hint pf-daily-review-note">Ask your clinician which plan step to use before trying plan-specific guidance.</p>
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
            <p>Choose a goal or read an uploaded plan, and activities will be built around what {childName} is working on.</p>
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

      <section className="pf-daily-section" aria-labelledby="this-week-heading">
        <div className="pf-daily-section-heading">
          <div>
            <p className="pf-eyebrow">From your recent notes</p>
            <h2 id="this-week-heading">This Week</h2>
          </div>
          <span className="pf-daily-count">{week.entries} logged</span>
        </div>
        <div className="pf-card">
          {focusedCard ? (
            <>
              <div className="pf-daily-source">
                <span className={`pf-tag ${focusedSource.kind}`}>{focusedSource.text}</span>
              </div>
              <p style={{ marginTop: 12 }}>
                This week, try one small support step for <strong>{focusedCard.behaviorName}</strong> during a calm moment.
              </p>
              {focusedCard.source === "starter" && (
                <p className="pf-hint" style={{ marginTop: 8 }}>
                  This is starter support based on the behavior you selected. Upload a plan later for more personalized support.
                </p>
              )}
            </>
          ) : (
            <p>No support area selected yet. Add a behavior to see starter support here.</p>
          )}
          <p className="pf-hint" style={{ marginTop: 10 }}>
            {week.entries
              ? `${week.entries} parent ${week.entries === 1 ? "note was" : "notes were"} logged in the last 7 days (${week.happened} marked as happened).`
              : "No parent notes logged in the last 7 days. Your notes are optional observations, not clinical findings."}
          </p>
          <button type="button" className="pf-btn small" style={{ marginTop: 12 }} onClick={onLog}>Quick Log</button>
        </div>
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
          <div className="pf-card">
            <h3>Prepare for a routine involving {focusedCard.behaviorName}</h3>
            <p className="pf-hint" style={{ marginTop: 6 }}>
              Use the prevention steps already saved for this support area. Do not create a difficult situation to practice.
            </p>
            <ol className="pf-daily-steps">
              {(focusedCard.prevention || []).slice(0, 3).map((step, index) => <li key={`${focusedCard.id}-prepare-${index}`}>{step}</li>)}
            </ol>
            {(!focusedCard.prevention || focusedCard.prevention.length === 0) && (
              <p className="pf-hint">No preparation steps are available for this support area yet. Review its saved support steps or upload a plan.</p>
            )}
            <button type="button" className="pf-btn small primary" style={{ marginTop: 12 }} onClick={() => onOpenSteps(focusedCard)}>Review support steps</button>
          </div>
        ) : (
          <div className="pf-card"><p>Select a behavior or upload a plan to see preparation support.</p></div>
        )}
      </section>

      <section className="pf-daily-section" aria-labelledby="practice-skill-heading">
        <div className="pf-daily-section-heading">
          <div>
            <p className="pf-eyebrow">A skill from the selected support area</p>
            <h2 id="practice-skill-heading">Practice This Skill</h2>
          </div>
          {focusedSource && <span className={`pf-tag ${focusedSource.kind}`}>{focusedSource.text}</span>}
        </div>
        {focusedCard ? (
          <div className="pf-card">
            <h3>{focusedCard.replacementSkill || `Review support for ${focusedCard.behaviorName}`}</h3>
            {focusedCard.reinforcementIdea && <p className="pf-hint" style={{ marginTop: 8 }}><strong>Saved reinforcement idea:</strong> {focusedCard.reinforcementIdea}</p>}
            <p className="pf-hint" style={{ marginTop: 8 }}>Try this only during a calm, ordinary moment, using supports already familiar to your child.</p>
            <button type="button" className="pf-btn small primary" style={{ marginTop: 12 }} onClick={() => onOpenSteps(focusedCard)}>Open skill steps</button>
          </div>
        ) : (
          <div className="pf-card"><p>Add a behavior to see a related starter skill here.</p></div>
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
