import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetParentDashboardQueryKey, logParentDailyAction, updateParentPracticeProgress } from "@workspace/api-client-react";
import { parentRequest } from "@/lib/parentSession";
import { ErrorBox, errMsg } from "./common";
import FamilyTools from "./FamilyTools";
import { CompactCard } from "@workspace/neuropathways-foundations/components/ui/compact-card";
import { MenuRow } from "@workspace/neuropathways-foundations/components/ui/menu-row";
import { ArrowRight, Bookmark, CalendarCheck, Footprints, Hand, HeartHandshake, ListChecks, MessageCircle, Puzzle, Shield, Shuffle, Sun } from "lucide-react";
import "./practice-phase-four.css";

// Presentation-only: one meaningful icon per activity, chosen from its existing category.
const CATEGORY_ICONS = {
  Communication: MessageCircle,
  "Calm & Coping": HeartHandshake,
  "Daily Routines": Sun,
  Transitions: Shuffle,
  "Playing Together": Puzzle,
  "Safety Skills": Shield,
};
const iconFor = (activity) => CATEGORY_ICONS[activity?.skill] || CATEGORY_ICONS[categoryFor(activity)] || Footprints;

const SOURCE_LABELS = {
  clinician_reviewed: "Clinician reviewed",
  clinician_uploaded_plan: "Clinician-uploaded plan",
  parent_uploaded_plan: "Based on your uploaded plan · not clinician-reviewed",
  starter_template: "Starter support",
  recent_log_pattern: "Based on recent parent notes",
  selected_behavior: "Based on your selected behavior",
};
export const OUTCOMES = [
  ["used_skill", "We tried it"],
  ["partially", "We needed support"],
  ["not_yet", "Didn't get a chance"],
];
export const CATEGORIES = ["Communication", "Calm & Coping", "Daily Routines", "Transitions", "Playing Together", "Safety Skills"];
const CATEGORY_HINTS = [
  ["Safety Skills", /safe|elop|wander|danger|street|stranger/],
  ["Transitions", /transition|first[- ]then|switch|leav|next activity|timer|change/],
  ["Calm & Coping", /calm|cop|regulat|break|breath|melt|tantrum|upset|sensory|aggress|hit|bite|frustrat/],
  ["Daily Routines", /routine|morning|bed|sleep|meal|eat|dress|brush|bath|toilet|schedule|getting ready/],
  ["Playing Together", /play|toy|game|turn[- ]tak|share|train|build/],
  ["Communication", /communicat|request|ask|aac|word|sign|talk|speech|help|choice/],
];
const CLOSED = new Set(["done", "logged", "skipped"]);
export const isClosedAction = (action) => CLOSED.has(String(action?.status || ""));
const GENERIC_WHY = /^(this|the) activity (helps|will help|can help) (improve|build|develop|with)?\s*(this|the|a)? ?skills?\.?$/i;
export const usefulWhy = (text) => {
  const value = String(text || "").trim();
  if (value.length < 25 || GENERIC_WHY.test(value) || /^no additional explanation/i.test(value)) return "";
  return value;
};
export const categoryFor = (action) => {
  if (action?.category && CATEGORIES.includes(action.category)) return action.category;
  if (action?.skill && CATEGORIES.includes(action.skill)) return action.skill;
  const text = `${action?.behaviorKey || ""} ${action?.behaviorName || ""} ${action?.title || ""}`.toLowerCase();
  return CATEGORY_HINTS.find(([, pattern]) => pattern.test(text))?.[0] || null;
};
// Assigned activities come from the clinician assignment contract (to be wired by the
// parent route). Only published entries for this child are ever shown.
export const visibleAssignments = (items, childId) => (Array.isArray(items) ? items : [])
  .filter((item) => String(item?.status || "").toLowerCase() === "published")
  .filter((item) => !childId || !item.childId || String(item.childId) === String(childId));

const positionToStep = (position, count) => position >= 2 && position < count + 2 ? position - 2 : 0;

/**
 * Focused guided activity: one instruction at a time, Back, Exit, optional feedback.
 * Exported so clinician "Preview as Parent" can render exactly what parents see
 * (pass `preview` to disable saving).
 */
export function ActivityGuide({ feedbackVisibility, activity, childName, assigned = false, relatedGoal, sourceLabel, closed = false, busy = false, preview = false, requireOutcome = false, presentation = false,
  initialStep = 0, initialFinished = false, onStep, onExit, onSaveForLater, onSaveUpdate, onSkip, onGoal, onHistory, error }) {
  const steps = Array.isArray(activity?.steps) ? activity.steps.filter(Boolean) : [];
  const [step, setStep] = useState(Math.min(initialStep, Math.max(0, steps.length - 1)));
  const [finished, setFinished] = useState(initialFinished);
  const [outcome, setOutcome] = useState("");
  const [note, setNote] = useState("");
  const guideId = useId();
  const instructionRef = useRef(null);
  const feedbackRef = useRef(null);
  const titleRef = useRef(null);
  const focusRequested = useRef(presentation);
  const why = usefulWhy(activity?.whyItMayHelp || activity?.whyThisHelps);
  const needs = activity?.whatYouNeed || activity?.materials;
  const category = activity?.skill || categoryFor(activity);
  const minutes = activity?.estimatedMinutes;
  const go = (next) => { focusRequested.current = presentation; setStep(next); onStep?.(next, false); };
  const finish = () => { focusRequested.current = presentation; setFinished(true); onStep?.(steps.length, true); };
  useEffect(() => {
    if (!presentation || !focusRequested.current) return;
    focusRequested.current = false;
    ((finished ? feedbackRef.current : instructionRef.current) || titleRef.current)?.focus();
  }, [step, finished, presentation]);

  return (
    <article className={presentation ? "np-practice-detail np-practice-guide-v4" : "np-practice-detail"} data-testid={`practice-detail-${activity.id}`}>
      {preview && <p className="np-preview-label" role="note" data-testid="label-preview">Preview as Parent · nothing is saved from this preview</p>}
      <div className="np-practice-controls np-practice-topbar">
        <button type="button" onClick={onExit} data-testid="button-exit-practice">Exit activity</button>
        {!closed && !preview && onSaveForLater && <button type="button" onClick={onSaveForLater} disabled={busy} data-testid="button-pause-practice">Save for later</button>}
      </div>
      <header className="np-guide-head">
        <h3 ref={presentation ? titleRef : undefined} tabIndex={presentation ? -1 : undefined} data-testid="text-activity-title">{activity.title}</h3>
        <div className="np-guide-meta">
          {category && <span>{category}</span>}
          {minutes ? <span>About {minutes} minutes</span> : null}
          {assigned && <span className="np-care-badge" data-testid="badge-care-team">Assigned by Your Care Team</span>}
        </div>
        {relatedGoal && <p className="np-practice-meta">Related goal: {onGoal ? <button type="button" className="np-link-btn" onClick={onGoal} data-testid="button-related-goal">{relatedGoal}</button> : relatedGoal}</p>}
        {sourceLabel && !assigned && <p className="np-practice-meta">{sourceLabel}</p>}
        {activity.description && <p>{activity.description}</p>}
      </header>
      {needs && <section className="np-guide-block"><h4>What You'll Need</h4><p>{needs}</p></section>}

      {closed ? (
        <section className="np-practice-stage" data-testid="practice-closed-review">
          <p className="np-practice-chip" role="status" data-testid="status-practice-closed">{activity.status === "skipped" ? "Closed" : "Completed"} · review only</p>
          {steps.length > 0 && <ol>{steps.map((text, index) => <li key={index}>{text}</li>)}</ol>}
          <div className="np-practice-controls"><button type="button" className="primary" onClick={onExit} data-testid="button-back-closed-practice">Back to Practice</button></div>
        </section>
      ) : !finished ? (
        <section className="np-practice-stage" aria-live="polite" data-testid="practice-stage">
          <h4>Let's Try It</h4>
          {steps.length ? <>
            <p id={presentation ? `${guideId}-count` : undefined} className="np-practice-meta" data-testid="text-step-count">Step {step + 1} of {steps.length}</p>
            <p ref={presentation ? instructionRef : undefined} tabIndex={presentation ? -1 : undefined}
              aria-describedby={presentation ? `${guideId}-count` : undefined} className="np-guide-step" data-testid="text-current-step">{steps[step]}</p>
          </> : <p ref={presentation ? instructionRef : undefined} tabIndex={presentation ? -1 : undefined}>No steps were included with this activity. You can exit without trying it.</p>}
          {activity.ifDifficult && (presentation
            // Parent Practice keeps difficulty/safety guidance always visible, never collapsed.
            ? <div className="np-practice-difficult" data-testid="details-if-difficult"><h5><Hand size={16} aria-hidden="true" /> If it becomes difficult</h5><p>{activity.ifDifficult}</p></div>
            : <details className="np-why" data-testid="details-if-difficult"><summary>If it becomes difficult</summary><p>{activity.ifDifficult}</p></details>)}
          <div className="np-practice-controls">
            {step > 0 && <button type="button" onClick={() => go(step - 1)} data-testid="button-step-back">Back</button>}
            {steps.length > 0 && step < steps.length - 1
              ? <button type="button" className="primary" onClick={() => go(step + 1)} data-testid="button-step-next">Next</button>
              : <button type="button" className="primary" onClick={finish} data-testid="button-step-finish">Finish</button>}
          </div>
        </section>
      ) : (
        <section className={presentation ? "np-practice-stage np-practice-feedback-v4" : "np-practice-stage"} data-testid="practice-feedback">
          <h4 ref={presentation ? feedbackRef : undefined} tabIndex={presentation ? -1 : undefined}>How did it go?</h4>
          <p className="np-practice-meta">Optional. Skip it if you prefer. Your answer is a description of what happened, not a measure of progress, and it does not change any goal.</p>
          {assigned && <p className="np-practice-meta" data-testid="text-feedback-visibility">{feedbackVisibility || "Your care team may see this update, depending on your family's sharing settings."}</p>}
          <div className="np-practice-controls" role="group" aria-label="How did it go?">
            {OUTCOMES.map(([value, label]) => <button type="button" key={value} aria-pressed={outcome === value} onClick={() => setOutcome(outcome === value ? "" : value)} data-testid={`button-outcome-${value}`}>{label}</button>)}
          </div>
          <label htmlFor="practice-reflection">Notes (optional)</label>
          <textarea id="practice-reflection" maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} placeholder={`Anything you noticed with ${childName}?`} data-testid="input-practice-note" />
          <div className="np-practice-controls">
            <button className="primary" type="button" disabled={busy || preview || (requireOutcome ? !outcome : (!outcome && !note.trim()))} onClick={() => onSaveUpdate?.({ outcome, note: note.trim() })} data-testid="button-save-update">{busy ? "Saving…" : "Save Update"}</button>
            <button type="button" onClick={onSkip} disabled={busy} data-testid="button-skip-feedback">Skip</button>
            <button type="button" onClick={() => { setFinished(false); go(Math.max(0, steps.length - 1)); }} data-testid="button-feedback-back">Back</button>
          </div>
        </section>
      )}
      {error && <ErrorBox error={error} />}
      {why && <details className="np-why" data-testid="details-why"><summary>Why this helps</summary><p>{why}</p></details>}
      {onHistory && !preview && <div className="np-practice-controls"><button type="button" onClick={onHistory}>Practice history</button></div>}
    </article>
  );
}

function ActivityCard({ activity, assigned, meta, sourceLabel, onStart, onSave, saved, goal, toggle = false }) {
  const Icon = iconFor(activity);
  return (
    <CompactCard className="np-practice-card" data-testid={`practice-activity-${activity.id}`} headingLevel="h4"
      leading={<span className="np-practice-card-icon"><Icon size={18} /></span>}
      title={activity.title}
      meta={meta || sourceLabel || goal || assigned ? <>
        {meta && <span className="np-activity-meta">{meta}</span>}
        {sourceLabel && !assigned && <span className="np-activity-meta" data-testid={`practice-source-${activity.id}`}>{sourceLabel}</span>}
        {goal && <span className="np-activity-meta">Related goal: {goal}</span>}
        {assigned && <span className="np-care-badge np-care-source">Assigned by Your Care Team</span>}
      </> : null}
      description={activity.description || null}
      actions={<>
        <button type="button" className="primary np-practice-start" onClick={onStart} data-testid={`button-start-${activity.id}`}>{isClosedAction(activity) ? "Review" : "Start Activity"}{!isClosedAction(activity) && <ArrowRight size={16} aria-hidden="true" />}</button>
        {onSave && <button type="button" onClick={onSave} disabled={saved && !toggle} aria-pressed={saved} data-testid={`button-save-${activity.id}`}>{saved ? "Saved" : "Save"}</button>}
      </>} />
  );
}

export default function PracticePage({ childId, childName = "your child", actions = [], child, documents = [], onOpenSteps, onAddBehavior, card, initialActionId, initialView, onGoals, onHistory, onExitRoute,
  assignedActivities = [], initialAssignmentId, hideTitle = false, feedbackVisibility, onSaveAssigned, onAssignedProgress, onRecordAssignedPractice, careError, onRetryCare }) {
  const queryClient = useQueryClient();
  const startView = initialView === "My Routines" ? "routines" : initialView === "Saved for Later" || initialView === "Saved Activities" ? "saved" : "main";
  const [view, setView] = useState(startView);
  const [toolsTab] = useState(initialView === "My Routines" ? "Preferences" : "Routines");
  const [activeId, setActiveId] = useState(initialActionId || null);
  // Snapshot of the open assignment so a background refetch never yanks the activity away.
  const [activeAssigned, setActiveAssigned] = useState(null);
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const activeAction = actions.find((action) => action.id === activeId);
  const assigned = useMemo(() => visibleAssignments(assignedActivities, childId), [assignedActivities, childId]);
  const openedInitial = useRef(false);
  // Keep local position authoritative until the dashboard catches up. Serialize
  // step writes so a slower earlier request cannot undo a later pause/finish.
  const dailyProgress = useRef(null);
  const dailyPosition = (action) => dailyProgress.current?.id === action.id
    ? dailyProgress.current.currentStep : action.currentStep ?? 0;
  const waitForDailyProgress = (actionId) => dailyProgress.current?.id === actionId
    ? dailyProgress.current.pending.catch(() => {}) : Promise.resolve();
  useEffect(() => {
    if (openedInitial.current || !initialAssignmentId) return;
    const match = assigned.find((item) => String(item.id) === String(initialAssignmentId));
    if (match) { openedInitial.current = true; setActiveAssigned(match); }
  }, [assigned, initialAssignmentId]);
  useEffect(() => { setError(""); }, [activeId, activeAssigned?.id]);

  const goalFor = (action) => child?.behaviors?.find((behavior) => behavior.behaviorKey === action.behaviorKey)?.goal || null;
  const source = (action) => {
    const label = SOURCE_LABELS[action.sourceType] || "";
    const document = documents.find((item) => item.id === action.sourceDocumentId);
    return document?.title && label ? `${label} · ${document.title}` : label;
  };
  const metaFor = (action) => [categoryFor(action), action.estimatedMinutes ? `${action.estimatedMinutes} minutes` : null].filter(Boolean).join(" · ");
  const isSaved = (action) => Boolean(action.bookmarked || action.status === "saved_for_later");
  const open = actions.filter((action) => !isClosedAction(action));
  const featured = open.slice(0, 3);
  const featuredIds = new Set(featured.map((action) => action.id));
  const explore = actions.filter((action) => !featuredIds.has(action.id));
  const presentCategories = CATEGORIES.filter((name) => explore.some((action) => categoryFor(action) === name));
  const filtered = category ? explore.filter((action) => categoryFor(action) === category) : explore;
  const savedList = open.filter(isSaved);
  const savedAssigned = assigned.filter((item) => item.bookmarked);
  // Keep the opened snapshot (id, version, local position) but read bookmark state from the latest cache.
  const liveAssigned = activeAssigned ? assigned.find((item) => item.id === activeAssigned.id) : null;
  const currentAssigned = activeAssigned ? { ...activeAssigned, bookmarked: liveAssigned ? Boolean(liveAssigned.bookmarked) : Boolean(activeAssigned.bookmarked) } : null;

  const leave = () => { setActiveId(null); setActiveAssigned(null); setError(""); onExitRoute?.(); };
  const persist = async (action, body) => {
    await waitForDailyProgress(action.id);
    await updateParentPracticeProgress(childId, action.id, body, parentRequest());
    await queryClient.invalidateQueries({ queryKey: getGetParentDashboardQueryKey(childId) });
  };
  const run = async (fn) => {
    setBusy(true); setError("");
    try { await fn(); return true; } catch (e) { setError(errMsg(e)); return false; } finally { setBusy(false); }
  };
  const saveCard = (action) => childId && run(() => persist(action, { currentStep: dailyPosition(action), bookmarked: true }));
  const startAction = (action) => { setActiveAssigned(null); setActiveId(action.id); };
  const startAssigned = (item) => { setActiveId(null); setActiveAssigned(item); };

  if (activeAssigned) {
    const steps = activeAssigned.steps || [];
    const position = activeAssigned.currentStep ?? 0;
    return (
      <section className="np-practice np-practice-v4 np-foundations" aria-labelledby="practice-page-heading" data-testid="panel-practice">
        <h2 id="practice-page-heading" className="sr-only">Practice With {childName}</h2>
        <ActivityGuide key={activeAssigned.id} presentation feedbackVisibility={feedbackVisibility} activity={activeAssigned} childName={childName} assigned requireOutcome busy={busy} error={error}
          relatedGoal={activeAssigned.goalTitle || activeAssigned.relatedGoal?.title} onGoal={onGoals}
          initialStep={Math.min(position, Math.max(0, steps.length - 1))} initialFinished={steps.length > 0 && position >= steps.length}
          onStep={(index, done) => {
            const currentStep = done ? steps.length : index;
            setActiveAssigned((prev) => prev ? { ...prev, currentStep } : prev);
            void Promise.resolve(onAssignedProgress?.({ ...currentAssigned, currentStep }, currentStep)).catch((e) => setError(errMsg(e)));
          }}
          onExit={leave}
          onSaveForLater={onSaveAssigned ? () => run(() => onSaveAssigned(currentAssigned, { currentStep: position, bookmarked: true })).then((ok) => ok && leave()) : undefined}
          onSkip={leave}
          onSaveUpdate={(feedback) => onRecordAssignedPractice
            ? run(() => onRecordAssignedPractice(currentAssigned, feedback)).then((ok) => ok && leave())
            : leave()}
          onHistory={onHistory} />
      </section>
    );
  }

  if (activeAction) {
    const count = activeAction.steps?.length ?? 0;
    const position = dailyPosition(activeAction);
    const closed = isClosedAction(activeAction);
    const progress = (index, done) => {
      if (closed || !childId) return;
      const currentStep = done ? count + 2 : index + 2;
      const pending = waitForDailyProgress(activeAction.id)
        .then(() => updateParentPracticeProgress(childId, activeAction.id, { currentStep, bookmarked: isSaved(activeAction) }, parentRequest()));
      dailyProgress.current = { id: activeAction.id, currentStep, pending };
      void pending.catch((e) => setError(errMsg(e)));
    };
    return (
      <section className="np-practice np-practice-v4 np-foundations" aria-labelledby="practice-page-heading" data-testid="panel-practice">
        <h2 id="practice-page-heading" className="sr-only">Practice With {childName}</h2>
        {!closed && position > 0 && position < count + 2 && <p className="np-practice-meta" role="status">Picking up where you left off.</p>}
        <ActivityGuide key={activeAction.id} presentation activity={activeAction} childName={childName} closed={closed} busy={busy} error={error}
          relatedGoal={goalFor(activeAction)} sourceLabel={source(activeAction)}
          initialStep={positionToStep(position, count)} initialFinished={!closed && count > 0 && position >= count + 2}
          onStep={progress} onExit={leave} onGoal={onGoals} onHistory={onHistory}
          onSaveForLater={() => run(() => persist(activeAction, {
            currentStep: dailyPosition(activeAction),
            bookmarked: true,
          })).then((ok) => ok && leave())}
          onSkip={() => run(() => persist(activeAction, { currentStep: count + 2, bookmarked: false })).then((ok) => ok && leave())}
          onSaveUpdate={({ outcome, note }) => run(async () => {
            await waitForDailyProgress(activeAction.id);
            await updateParentPracticeProgress(childId, activeAction.id, { currentStep: count + 2, bookmarked: false }, parentRequest());
            await logParentDailyAction(childId, activeAction.id, { eventType: "outcome", ...(outcome ? { outcome } : {}), ...(note ? { note } : {}) }, parentRequest());
            await queryClient.invalidateQueries({ queryKey: getGetParentDashboardQueryKey(childId) });
          }).then((ok) => ok && leave())} />
      </section>
    );
  }

  const subView = view !== "main";
  return (
    <section className="np-practice np-practice-v4 np-foundations" aria-labelledby="practice-page-heading" data-testid="panel-practice">
      <header className="np-practice-intro">
        {subView && <button type="button" className="np-link-btn" onClick={() => setView("main")} data-testid="button-back-to-practice">Back to Practice</button>}
        <h2 id="practice-page-heading" data-testid="text-practice-title" className={hideTitle && !subView ? "sr-only" : undefined}>{view === "routines" ? "My Routines" : view === "saved" ? "Saved Activities" : `Practice With ${childName}`}</h2>
        {!(hideTitle && !subView) && <p>{view === "routines" ? "Create or open familiar routines." : view === "saved" ? "Return to activities you saved." : "Simple activities and routines you can try together."}</p>}
      </header>
      {error && <ErrorBox error={error} />}

      {view === "routines" ? (
        <FamilyTools key={toolsTab} childId={childId} childName={childName} actions={actions} initialTab={toolsTab} onActivities={() => setView("main")} />
      ) : view === "saved" ? (
        savedList.length || savedAssigned.length ? <div className="np-activity-grid">
          {savedAssigned.map((item) => <ActivityCard key={`assigned-${item.id}`} activity={item} assigned meta={[item.skill || categoryFor(item), item.estimatedMinutes ? `${item.estimatedMinutes} minutes` : null].filter(Boolean).join(" · ")}
            onStart={() => startAssigned(item)} goal={item.goalTitle} />)}
          {savedList.map((action) => <ActivityCard key={action.id} activity={action} meta={metaFor(action)} sourceLabel={source(action)} onStart={() => startAction(action)} />)}
        </div> : <div className="np-practice-empty" data-testid="empty-practice-saved">
          <strong>Nothing saved yet.</strong>
          <p>Use Save on any activity to keep it here.</p>
        </div>
      ) : <>
        {careError && <section className="np-practice-section" data-testid="section-care-team-error">
          <h3>Assigned by Your Care Team</h3>
          <ErrorBox error={careError} onRetry={onRetryCare} />
        </section>}
        {!careError && assigned.length > 0 && <section className="np-practice-section" aria-labelledby="care-team-heading" data-testid="section-care-team">
          <h3 id="care-team-heading">Assigned by Your Care Team</h3>
          <p className="np-section-sub">Activities your care team has selected for {childName}.</p>
          <div className="np-activity-grid">
            {assigned.map((item) => <ActivityCard key={item.id} activity={item} assigned
              meta={[item.skill || categoryFor(item), item.estimatedMinutes ? `${item.estimatedMinutes} minutes` : null].filter(Boolean).join(" · ")}
              onStart={() => startAssigned(item)} onSave={onSaveAssigned ? () => run(() => onSaveAssigned(item, { currentStep: item.currentStep ?? 0, bookmarked: !item.bookmarked })) : undefined} saved={Boolean(item.bookmarked)} toggle
              goal={item.goalTitle} />)}
          </div>
        </section>}

        <section className="np-practice-section" aria-labelledby="child-activities-heading" data-testid="section-child-activities">
          <h3 id="child-activities-heading">Activities for {childName}</h3>
          {featured.length ? <div className="np-activity-grid">
            {featured.map((action) => <ActivityCard key={action.id} activity={action} meta={metaFor(action)} sourceLabel={source(action)} onStart={() => startAction(action)}
              onSave={childId ? () => saveCard(action) : undefined} saved={isSaved(action)} />)}
          </div> : <div className="np-practice-empty" data-testid="empty-practice-activities">
            <strong>No activities are ready yet.</strong>
            <p>Activities appear here once a behavior or plan is saved for {childName}.</p>
            {onAddBehavior && <button type="button" className="pf-btn small" onClick={onAddBehavior}>Add a behavior</button>}
          </div>}
          {card && !actions.length && <div className="pf-card"><h3>{card.replacementSkill || `Review support for ${card.behaviorName}`}</h3>
            {card.reinforcementIdea && <p><strong>Saved reinforcement idea:</strong> {card.reinforcementIdea}</p>}
            <button type="button" className="pf-btn small primary" onClick={() => onOpenSteps?.(card)}>Open skill steps</button>
          </div>}
        </section>

        {explore.length > 0 && <section className="np-practice-section" aria-labelledby="explore-heading" data-testid="section-explore">
          <h3 id="explore-heading"><ListChecks size={18} aria-hidden="true" /> Explore More Activities</h3>
          {presentCategories.length > 0 && <div className="np-category-filter" role="group" aria-label="Filter by category">
            <button type="button" aria-pressed={!category} onClick={() => setCategory("")} data-testid="filter-category-all">All</button>
            {presentCategories.map((name) => <button type="button" key={name} aria-pressed={category === name} onClick={() => setCategory(name)} data-testid={`filter-category-${name.toLowerCase().replace(/[^a-z]+/g, "-")}`}>{name}</button>)}
          </div>}
          <div className="np-activity-grid">
            {filtered.map((action) => <ActivityCard key={action.id} activity={action} meta={metaFor(action)} sourceLabel={source(action)} onStart={() => startAction(action)}
              onSave={childId && !isClosedAction(action) ? () => saveCard(action) : undefined} saved={isSaved(action)} />)}
          </div>
        </section>}

        <nav className="np-practice-rows" aria-label="Routines and saved activities">
          <MenuRow className="np-practice-row" icon={<CalendarCheck />} label="My Routines" description="Create or open familiar routines." onClick={() => setView("routines")} data-testid="practice-view-my-routines" />
          <MenuRow className="np-practice-row" icon={<Bookmark />} label="Saved Activities" description="Return to previously saved activities." onClick={() => setView("saved")} data-testid="practice-view-saved-activities" />
        </nav>
      </>}
    </section>
  );
}
