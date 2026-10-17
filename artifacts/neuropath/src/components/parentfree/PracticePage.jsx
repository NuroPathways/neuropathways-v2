import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetParentDashboardQueryKey, logParentDailyAction, updateParentPracticeProgress } from "@workspace/api-client-react";
import { parentRequest } from "@/lib/parentSession";
import { ErrorBox, errMsg } from "./common";
import FamilyTools from "./FamilyTools";

const SOURCE_LABELS = {
  clinician_reviewed: "Clinician reviewed",
  clinician_uploaded_plan: "Clinician-uploaded plan",
  parent_uploaded_plan: "Based on your uploaded plan · not clinician-reviewed",
  starter_template: "Starter support",
  recent_log_pattern: "Based on recent parent notes",
  selected_behavior: "Based on your selected behavior",
};
const OUTCOMES = [
  ["used_skill", "We tried it"],
  ["partially", "We needed more support"],
  ["not_yet", "We didn't get a chance"],
];
const VIEWS = ["Activities", "Learn Why", "My Routines", "Saved for Later"];
const VIEW_DETAILS = {
  Activities: "Browse things to try together.",
  "My Routines": "Create and use visual routines.",
  "Learn Why": "Read short explanations and examples.",
  "Saved for Later": "Continue an activity you paused.",
};
const CLOSED = new Set(["done", "logged", "skipped"]);
export const isClosedAction = (action) => CLOSED.has(String(action?.status || ""));
const PHASE_LABELS = ["Understand", "See an Example", "Try Together", "Reflect"];

export default function PracticePage({ childId, childName = "your child", actions = [], child, documents = [], onOpenSteps, onAddBehavior, card, initialActionId, initialView, onGoals, onHistory, onExitRoute }) {
  const queryClient = useQueryClient();
  const [view, setView] = useState(initialView && VIEWS.includes(initialView) ? initialView : "Activities");
  const [toolsTab, setToolsTab] = useState(initialView === "My Routines" ? "Preferences" : "Routines");
  const [activeId, setActiveId] = useState(initialActionId || null);
  const [started, setStarted] = useState(false);
  const [phase, setPhase] = useState(0);
  const [tryStep, setTryStep] = useState(0);
  const [outcome, setOutcome] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const activeAction = actions.find((action) => action.id === activeId);
  const closed = isClosedAction(activeAction);
  useEffect(() => {
    if (!activeAction) return;
    const position = activeAction.currentStep ?? 0;
    const count = activeAction.steps?.length ?? 0;
    setStarted(position > 0);
    if (position < 2) { setPhase(position); setTryStep(0); }
    else if (position >= count + 2) { setPhase(3); setTryStep(Math.max(0, count - 1)); }
    else { setPhase(2); setTryStep(position - 2); }
  }, [activeId, activeAction?.currentStep]);
  const goalFor = (action) => child?.behaviors?.find((behavior) => behavior.behaviorKey === action.behaviorKey)?.goal || null;
  const visibleActions = actions.filter((action) => view === "Saved for Later"
    ? !isClosedAction(action) && (action.bookmarked || action.status === "saved_for_later")
    : view === "Activities" || view === "Learn Why");
  const start = (action) => {
    setActiveId(action.id);
    setStarted(false);
    const position = action.currentStep ?? 0;
    const count = action.steps?.length ?? 0;
    if (position < 2) { setPhase(position); setTryStep(0); }
    else if (position >= count + 2) { setPhase(3); setTryStep(Math.max(0, count - 1)); }
    else { setPhase(2); setTryStep(position - 2); }
    setOutcome("");
    setNote("");
    setError("");
  };
  const leave = () => { setActiveId(null); setStarted(false); setError(""); onExitRoute?.(); };
  const currentPosition = (nextPhase = phase, nextTryStep = tryStep) => nextPhase === 0 ? 0
    : nextPhase === 1 ? 1
      : nextPhase === 2 ? nextTryStep + 2
        : (activeAction?.steps?.length ?? 0) + 2;
  const saveForLater = async () => {
    if (!activeAction || !childId) return;
    if (closed) { leave(); return; }
    setBusy(true); setError("");
    try {
      await updateParentPracticeProgress(childId, activeAction.id, { currentStep: currentPosition(), bookmarked: true }, parentRequest());
      await queryClient.invalidateQueries({ queryKey: getGetParentDashboardQueryKey(childId) });
      leave();
    } catch (e) { setError(errMsg(e)); }
    finally { setBusy(false); }
  };
  const saveReflection = async () => {
    if (!activeAction || !childId || closed || (!outcome && !note.trim())) return;
    setBusy(true); setError("");
    try {
      const selected = OUTCOMES.find(([value]) => value === outcome);
      await updateParentPracticeProgress(childId, activeAction.id, { currentStep: currentPosition(3), bookmarked: false }, parentRequest());
      await logParentDailyAction(childId, activeAction.id, {
        eventType: "outcome",
        ...(selected ? { outcome: selected[0] } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      }, parentRequest());
      await queryClient.invalidateQueries({ queryKey: getGetParentDashboardQueryKey(childId) });
      leave();
    } catch (e) { setError(errMsg(e)); }
    finally { setBusy(false); }
  };
  const movePhase = (nextPhase) => {
    setPhase(nextPhase);
    setStarted(true);
    const nextTryStep = nextPhase === 2 ? 0 : tryStep;
    setTryStep(nextTryStep);
    if (!activeAction || !childId || closed) return;
    void updateParentPracticeProgress(childId, activeAction.id, {
      currentStep: currentPosition(nextPhase, nextTryStep),
      bookmarked: Boolean(activeAction.bookmarked || activeAction.status === "saved_for_later"),
    }, parentRequest()).catch((e) => setError(errMsg(e)));
  };
  const moveTryStep = (nextTryStep) => {
    setTryStep(nextTryStep);
    setPhase(2);
    if (!activeAction || !childId || closed) return;
    void updateParentPracticeProgress(childId, activeAction.id, {
      currentStep: currentPosition(2, nextTryStep),
      bookmarked: Boolean(activeAction.bookmarked || activeAction.status === "saved_for_later"),
    }, parentRequest()).catch((e) => setError(errMsg(e)));
  };
  const source = (action) => {
    const label = SOURCE_LABELS[action.sourceType] || "Source not available";
    const document = documents.find((item) => item.id === action.sourceDocumentId);
    return document?.title ? `${label} · ${document.title}` : label;
  };

  return (
    <section className="np-practice" aria-labelledby="practice-page-heading" data-testid="panel-practice">
      <header className="np-practice-head">
        <div><p className="pf-eyebrow">A family practice space</p><h2 id="practice-page-heading">Practice with {childName}</h2>
          <p>Small, low-pressure moments. Use only the steps already saved here, and pause whenever you need.</p></div>
      </header>
      {!activeAction && <nav className="np-practice-destinations" aria-label="Practice destinations">
        {VIEWS.map((item) => <button key={item} type="button" aria-current={view === item && !activeAction ? "page" : undefined}
          data-testid={`practice-view-${item.toLowerCase().replaceAll(" ", "-")}`} onClick={() => { setView(item); setToolsTab("Routines"); leave(); }}>
          <strong>{item}</strong><span>{VIEW_DETAILS[item]}</span>
        </button>)}
      </nav>}
      {error && <ErrorBox error={error} />}
      {activeAction ? (
        <article className="np-practice-detail" data-testid={`practice-detail-${activeAction.id}`}>
          <div className="np-practice-controls">
            <button type="button" onClick={leave} data-testid="button-exit-practice">Exit activity</button>
            {!closed && <button type="button" onClick={saveForLater} disabled={busy} data-testid="button-pause-practice">Pause · Save for later</button>}
          </div>
          <div><span className="np-practice-chip">{activeAction.estimatedMinutes} min · {source(activeAction)}</span>
            <h3>{activeAction.title}</h3><p>{activeAction.description}</p>
            <p className="np-practice-meta">Behavior: {activeAction.behaviorName || childName} · Goal: {goalFor(activeAction) || "No linked goal"}</p>
            {closed && <p className="np-practice-chip" role="status" data-testid="status-practice-closed">{activeAction.status === "skipped" ? "Closed" : "Completed"} · review only</p>}
            {!closed && activeAction.currentStep > 0 && <p className="np-practice-meta">Your place in this activity is saved.</p>}
          </div>
          {closed ? (
            <section className="np-practice-stage" data-testid="practice-closed-review">
              <h3>This activity is {activeAction.status === "skipped" ? "closed" : "completed"}</h3>
              <p>You can read it again below. Progress and reflections are not changed for a closed activity.</p>
              {activeAction.whyItMayHelp && <><h4>Why it may help</h4><p>{activeAction.whyItMayHelp}</p></>}
              {activeAction.steps?.length > 0 && <ol>{activeAction.steps.map((stepText, index) => <li key={index}>{stepText}</li>)}</ol>}
              <div className="np-practice-controls"><button type="button" className="primary" onClick={leave} data-testid="button-back-closed-practice">Back to activities</button></div>
            </section>
          ) : !started ? (
            <section className="np-practice-start">
              <h3>Ready to try it?</h3>
              <p>Move through the short guide one step at a time, or go straight to trying the saved steps.</p>
              <div className="np-practice-controls">
                <button type="button" className="primary" onClick={() => { setStarted(true); movePhase(0); }}>Start Activity</button>
                <button type="button" onClick={() => movePhase(2)}>Skip to Try Together</button>
              </div>
            </section>
          ) : <>
          <section className="np-practice-stage" aria-live="polite">
          {phase < 3 && <p className="np-practice-meta">Step {phase + 1} of 3 · {PHASE_LABELS[phase]}</p>}
          {phase === 0 && <><h3>Understand</h3><p>{activeAction.whyItMayHelp || "No additional explanation was included with this activity."}</p></>}
          {phase === 1 && <><h3>See an Example</h3><p>{activeAction.description}</p>
            {activeAction.steps?.[0] && <p className="np-practice-meta">Example: {activeAction.steps[0]}</p>}</>}
           {phase === 2 && <div className="np-practice-steps"><h3>Try Together</h3>
             {activeAction.steps?.length ? <div><p>Step {tryStep + 1} of {activeAction.steps.length}</p><p>{activeAction.steps[tryStep]}</p></div>
              : <p>No steps were included with this activity. You can pause or exit without trying it.</p>}
             <p className="np-practice-meta">Keep this low-risk and familiar. Stop if it does not feel right for your family.</p></div>}
          {phase === 3 && <><h3>How did it go?</h3><p>This optional note is a caregiver reflection, not a measure of mastery or clinical progress.</p>
            <div className="np-practice-controls">{OUTCOMES.map(([value, label]) => <button type="button" key={value} aria-pressed={outcome === value} onClick={() => setOutcome(value)}>{label}</button>)}</div>
            <label htmlFor="practice-reflection">Optional note</label>
            <textarea id="practice-reflection" maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Anything you'd like to remember?" />
            <div className="np-practice-controls"><button className="primary" type="button" disabled={busy || (!outcome && !note.trim())} onClick={saveReflection}>{busy ? "Saving…" : "Save reflection"}</button>
              <button type="button" onClick={leave}>Leave without saving</button></div></>}
          </section>
          <div className="np-practice-controls">
            {phase > 0 && <button type="button" onClick={() => phase === 2 && tryStep > 0 ? moveTryStep(tryStep - 1) : phase === 3 && activeAction.steps?.length ? moveTryStep(activeAction.steps.length - 1) : movePhase(phase - 1)}>Back</button>}
            {phase < 3 && <button className="primary" type="button" onClick={() => phase === 0 ? movePhase(1) : phase === 1 ? movePhase(activeAction.steps?.length ? 2 : 3) : phase === 2 && tryStep < activeAction.steps.length - 1 ? moveTryStep(tryStep + 1) : movePhase(3)}>{phase === 2 ? tryStep < activeAction.steps.length - 1 ? "Next step" : "Reflect" : "Continue"}</button>}
            {phase < 2 && <button type="button" onClick={() => movePhase(2)}>Skip to Try Together</button>}
          </div>
          </>}
          {(onGoals || onHistory) && <div className="np-practice-controls">
            {onGoals && <button type="button" onClick={onGoals}>Related goals</button>}
            {onHistory && <button type="button" onClick={onHistory}>Practice history</button>}
          </div>}
        </article>
       ) : view === "My Routines" ? (
        <FamilyTools key={toolsTab} childId={childId} childName={childName} actions={actions} initialTab={toolsTab} onActivities={() => setView("Activities")} />
      ) : visibleActions.length ? (
        <div className="np-practice-grid">
          {visibleActions.map((action) => <button type="button" className="np-practice-action" key={action.id}
            data-testid={`practice-activity-${action.id}`} onClick={() => start(action)}>
            <span className="np-practice-chip">{action.estimatedMinutes} min · {source(action)}</span>
            <h3>{action.title}</h3><span>{view === "Learn Why" ? action.whyItMayHelp || action.description : action.description}</span>
            {isClosedAction(action) && <span className="np-practice-chip">{action.status === "skipped" ? "Closed" : "Completed"}</span>}
            <span className="np-practice-meta">Behavior: {action.behaviorName} · Goal: {goalFor(action) || "No linked goal"} · Open guide</span>
          </button>)}
        </div>
      ) : (
        <div className="np-practice-empty" data-testid={view === "Saved for Later" ? "empty-practice-saved" : "empty-practice-activities"}>
          <strong>{view === "Saved for Later" ? "Nothing saved for later." : "No activities are ready yet."}</strong>
          <p>{view === "Saved for Later" ? "Use “Pause · Save for later” inside an activity to keep it on this list." : "Activities appear here when they are included in your child's saved daily actions."}</p>
          {onAddBehavior && view === "Activities" && <button type="button" className="pf-btn small" onClick={onAddBehavior}>Add a behavior</button>}
        </div>
      )}
      {card && !actions.length && <div className="pf-card"><h3>{card.replacementSkill || `Review support for ${card.behaviorName}`}</h3>
        {card.reinforcementIdea && <p><strong>Saved reinforcement idea:</strong> {card.reinforcementIdea}</p>}
        <button type="button" className="pf-btn small primary" onClick={() => onOpenSteps?.(card)}>Open skill steps</button>
      </div>}
    </section>
  );
}
