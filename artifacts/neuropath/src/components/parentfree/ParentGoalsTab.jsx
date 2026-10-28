import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Circle, Plus, Target, ThumbsDown, ThumbsUp } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@workspace/neuropathways-foundations/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/neuropathways-foundations/components/ui/select";
import {
  getGetParentDashboardQueryKey,
  parentBehaviorIdentity,
  useRecordParentGoalFeedback,
  useGetParentCareTeam,
  getGetParentCareTeamQueryKey,
} from "@workspace/api-client-react";
import { base44 } from "@/api/entities";
import { useAuth } from "@/lib/AuthContext";
import { parentRequest } from "@/lib/parentSession";
import BehaviorLibrary from "./BehaviorLibrary";
import GoalLines from "./GoalLines";
import ClinicalGoals from "./ClinicalGoals";
import { ErrorBox, errMsg } from "./common";
import { GoalPreview, presentGoalTitle } from "./goalPresentation";
import "./goals-phase-five.css";

const RATINGS = [
  { value: "positive", label: "Going well", Icon: ThumbsUp },
  { value: "needs_support", label: "Needs support", Icon: ThumbsDown },
];

function lastCheckInLabel(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return `Last checked in ${parsed.toLocaleDateString()}`;
}

function PlanMilestones({ card, dailyActions = [], childId }) {
  const planActivities = Array.isArray(card.dailyActivities) ? card.dailyActivities : [];
  const todayActions = dailyActions.filter((action) =>
    action.kind === "task" && action.supportCardId === card.id,
  );

  return (
    <div className="np-goal-block" data-testid={`plan-milestones-${card.id}`}>
      <h5>Plan milestones and practice</h5>
      <section>
      {planActivities.length > 0 ? (
        <ul className="pf-list" style={{ marginTop: 8 }}>
          {planActivities.map((activity, index) => (
            <li key={`${card.id}-plan-activity-${index}`} style={{ display: "block" }}>
              <strong>{activity.title}</strong>
              {activity.assignedAt && <span className="pf-tag" aria-label="Assigned by clinician">Assigned by your care team</span>}
              <span className="pf-hint" style={{ display: "block", marginTop: 3 }}>
                {activity.routineContext} · Practice: {activity.skill}
                {activity.reinforcement ? ` · Reinforce: ${activity.reinforcement}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : todayActions.length > 0 ? (
        <ul className="pf-list" style={{ marginTop: 8 }}>
          {todayActions.map((action) => (
            <li key={action.id} style={{ display: "block" }}>
              <strong>{action.title}</strong>
              <span className="pf-hint" style={{ display: "block", marginTop: 3 }}>{action.description}</span>
              <a className="pf-btn small" data-testid={`goal-practice-link-${action.id}`} href={`/ParentHome?tab=practice&activity_id=${encodeURIComponent(action.id)}&child_id=${encodeURIComponent(childId || action.childId)}`}>Open this activity</a>
            </li>
          ))}
        </ul>
      ) : card.conflict ? (
        <p className="pf-hint" style={{ marginTop: 6 }}>
          The plan has conflicting steps. Ask the clinician to review it before using plan-specific activities.
        </p>
      ) : (
        <p className="pf-hint" style={{ marginTop: 6 }}>
          This goal is saved. Re-read the plan from Upload Plan to refresh its practice activities.
        </p>
      )}
      </section>
    </div>
  );
}

function PlanGoalMilestones({ goal, dailyActions, childId }) {
  const goalKey = goal.title.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  const activities = dailyActions.filter((action) =>
    action.kind === "task" &&
    !action.supportCardId &&
    action.sourceType === goal.sourceType &&
    action.behaviorName.trim().toLocaleLowerCase().replace(/\s+/g, " ") === goalKey,
  );

  return (
    <div className="np-goal-block">
      <h5>Plan milestones and practice</h5>
      <div>
        {goal.milestones.length > 0 && (
          <ul className="pf-list">
            {goal.milestones.map((milestone, index) => <li key={`${goal.id}-milestone-${index}`}>{milestone}</li>)}
          </ul>
        )}
        {activities.length > 0 ? (
          <ul className="pf-list">
            {activities.map((activity) => (
              <li key={activity.id} style={{ display: "block" }}>
                <strong>{activity.title}</strong>
                <span className="pf-hint" style={{ display: "block", marginTop: 3 }}>{activity.description}</span>
                <a className="pf-btn small" data-testid={`goal-practice-link-${activity.id}`} href={`/ParentHome?tab=practice&activity_id=${encodeURIComponent(activity.id)}&child_id=${encodeURIComponent(childId || activity.childId)}`}>Open this activity</a>
              </li>
            ))}
          </ul>
        ) : goal.milestones.length === 0 ? (
          <p className="pf-hint">Activities based on this goal will appear in Today.</p>
        ) : null}
      </div>
    </div>
  );
}

function PlanProgressCard({
  goal,
  card,
  childId,
  dailyActions,
  testId,
  onLogStep,
  isSaving,
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const title = goal.title || card?.planGoal || "Goal from document";
  const target = Math.max(1, Number(goal.target) || 10);
  const progress = Math.min(target, Math.max(0, Number(goal.progress) || 0));
  const percent = Math.round((progress / target) * 100);
  const description = goal.description || card?.goalDescription || "";
  const sourceLabel = goal.sourceType === "clinician_uploaded_plan" || card?.source === "clinician_document"
    ? "Clinician-uploaded document"
    : "Self-uploaded document";
  const detailsId = `plan-goal-details-${goal.id || card?.id || testId}`;
  const trackable = Boolean(goal.id);

  return (
    <article className="np-goals-plan-card" data-testid={testId}>
      <span className="np-goals-plan-source">{sourceLabel}</span>
      <div className="np-goals-plan-card-header">
        <div className="np-goals-plan-title">
          {progress >= target
            ? <CheckCircle2 aria-hidden="true" size={22} />
            : <Circle aria-hidden="true" size={22} />}
          <h3>{title}</h3>
        </div>
        <Button
          type="button"
          size="icon"
          aria-label={`Log one practice step for ${title}`}
          title={trackable ? "Log one practice step" : "Progress tracking will be available after this goal is saved"}
          disabled={!trackable || isSaving || progress >= target}
          onClick={() => onLogStep(goal)}
          data-testid={`button-plan-goal-progress-${goal.id || card?.id || testId}`}
          className="np-goals-plan-add"
        >
          <Plus aria-hidden="true" size={19} />
        </Button>
      </div>

      <button
        type="button"
        className="np-goals-plan-description-toggle"
        aria-expanded={detailsOpen}
        aria-controls={detailsId}
        aria-label={`${detailsOpen ? "Close" : "View"} goal: ${title}`}
        onClick={() => setDetailsOpen((open) => !open)}
        data-testid={`button-view-goal-${goal.id || card?.id || testId}`}
      >
        {detailsOpen ? "Close goal details" : "Read goal description"}
      </button>

      <p className="np-goals-plan-count" data-testid={`text-goal-progress-${goal.id || card?.id || testId}`}>
        {progress} of {target} practice steps logged
      </p>
      <div className="np-goals-plan-progress-meta">
        <span>{percent}% logged</span>
        <span>{progress >= target ? "Goal reached" : `${target - progress} to go`}</span>
      </div>
      <div
        className="np-goals-plan-progress"
        role="progressbar"
        aria-label={`Practice steps logged for ${title}`}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={progress}
      >
        <div style={{ width: `${percent}%` }} />
      </div>

      <div id={detailsId} className="np-goals-plan-details" hidden={!detailsOpen}>
        {description && <p>{description}</p>}
        {card?.planGoalSourceReferences?.length > 0 && (
          <p className="np-goals-plan-reference">
            From: {card.planGoalSourceReferences.map((reference) => reference.title).join(", ")}
          </p>
        )}
        {card
          ? <PlanMilestones card={card} dailyActions={dailyActions} childId={childId} />
          : <PlanGoalMilestones goal={goal} dailyActions={dailyActions} childId={childId} />}
      </div>
    </article>
  );
}

export default function ParentGoalsTab({
  child,
  childrenOptions = [],
  onChildSelect,
  behaviors,
  cards,
  allCards,
  dailyActions = [],
  planGoals = [],
  onUpload,
  onEdit,
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { refreshParent, user } = useAuth();
  const feedback = useRecordParentGoalFeedback({ request: parentRequest() });
  const [showLibrary, setShowLibrary] = useState(false);
  const [error, setError] = useState("");
  const [progressOverrides, setProgressOverrides] = useState({});
  const [savingGoalId, setSavingGoalId] = useState(null);
  const activeBehaviors = Array.isArray(behaviors) ? behaviors : [];
  // Observe the same cache as ClinicalGoals so a care-team record has one home.
  const care = useGetParentCareTeam(child?.id || "", {
    query: { queryKey: getGetParentCareTeamQueryKey(child?.id || ""), enabled: !!child?.id, staleTime: 30_000 },
    request: parentRequest(),
  });
  const careGoalIds = new Set((care.data?.goals || [])
    .filter((goal) => goal.status === "published").map((goal) => goal.id));
  const normalizeTitle = (title) => String(title || "").normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
  const planCards = (Array.isArray(allCards) ? allCards : [])
    .filter((card) => card.planGoal?.trim())
    .filter((card, index, list) => list.findIndex((candidate) =>
      normalizeTitle(candidate.planGoal) === normalizeTitle(card.planGoal) &&
      candidate.source === card.source,
    ) === index);
  const storedPlanGoals = (Array.isArray(planGoals) ? planGoals : [])
    .filter((goal) => !careGoalIds.has(goal.id))
    .map((goal) => ({
      ...goal,
      progress: progressOverrides[goal.id] ?? goal.progress ?? 0,
      card: planCards.find((card) => normalizeTitle(card.planGoal) === normalizeTitle(goal.title)) || null,
    }));
  const storedTitleKeys = new Set(storedPlanGoals.map((goal) => normalizeTitle(goal.title)));
  const cardOnlyPlanGoals = planCards
    .filter((card) => !storedTitleKeys.has(normalizeTitle(card.planGoal)))
    .map((card) => ({
      id: null,
      title: card.planGoal.trim(),
      description: card.goalDescription || "",
      milestones: [],
      sourceType: card.source === "clinician_document" ? "clinician_uploaded_plan" : "parent_uploaded_plan",
      progress: 0,
      target: 10,
      card,
    }));
  const documentGoalTitles = new Set([
    ...storedPlanGoals.map((goal) => normalizeTitle(goal.title)),
    ...cardOnlyPlanGoals.map((goal) => normalizeTitle(goal.title)),
  ]);
  const visiblePlanGoals = [...storedPlanGoals, ...cardOnlyPlanGoals];

  const saveRating = (behavior, rating) => {
    if (!behavior.goal) return;
    setError("");
    const data = {
      behaviorKey: behavior.behaviorKey,
      ...(behavior.behaviorKey === "custom"
        ? { customBehavior: behavior.customBehavior || behavior.behaviorName }
        : {}),
      goal: behavior.goal,
      rating,
    };
    feedback.mutate(
      { childId: child.id, data },
      {
        onSuccess: async () => {
          await queryClient.invalidateQueries({
            queryKey: getGetParentDashboardQueryKey(child.id),
          });
          await refreshParent();
        },
        onError: (mutationError) => setError(errMsg(mutationError)),
      },
    );
  };

  // Parent-saved behavior goals are always classified as Family Goals, even when
  // linked guidance came from a plan; provenance stays inside the details.
  const behaviorGoals = activeBehaviors
    .filter((behavior) => !documentGoalTitles.has(normalizeTitle(behavior.goal)))
    .map((behavior) => {
    const identity = parentBehaviorIdentity(behavior);
    const linkedCard =
      cards.find((card) => parentBehaviorIdentity(card) === identity) ||
      allCards.find((card) => parentBehaviorIdentity(card) === identity);
    const goalCard = {
      ...(linkedCard || {}),
      id: linkedCard?.id || identity,
      behaviorName: behavior.behaviorName,
      goal: behavior.goal,
    };
    const ratingId = `${behavior.behaviorKey}-${identity}`;
    const lastCheckIn = behavior.goalRating ? lastCheckInLabel(behavior.goalRatingAt) : "";

    return (
      <GoalPreview key={identity} id={`behavior-${identity}`} testId={`goal-card-${behavior.behaviorKey}`}
        title={behavior.behaviorName} source="Family Goal" lastLine={lastCheckIn}>
        {linkedCard?.source && (
          <p className="np-goal-source-line"><span className="pf-tag">
            {linkedCard.source === "clinician_reviewed" ? "Clinician reviewed"
              : linkedCard.source === "clinician_document" ? "Clinician-uploaded document"
                : linkedCard.source === "parent_document" ? "Self-uploaded document"
                  : "Starter support"}
          </span></p>
        )}
        <GoalLines card={goalCard} active />
        {linkedCard?.planGoal && <PlanMilestones card={linkedCard} dailyActions={dailyActions} childId={child?.id} />}

        {behavior.goal ? (
          <div className="np-goal-block">
            <h5>Your check-in (parent observation)</h5>
            <p className="np-goal-note">How is this goal going? Check-ins do not change clinical progress.</p>
            <div className="np-goal-actions">
              {RATINGS.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  className="pf-chip"
                  aria-pressed={behavior.goalRating === value}
                  aria-label={`${label} for ${behavior.behaviorName}`}
                  disabled={feedback.isPending}
                  onClick={() => saveRating(behavior, value)}
                  data-testid={`button-goal-rating-${ratingId}-${value}`}
                >
                  <Icon aria-hidden="true" size={17} />
                  {label}
                </button>
              ))}
            </div>
            {behavior.goalRating && (
              <p role="status" aria-live="polite" className="pf-hint">
                Current check-in: {behavior.goalRating === "positive" ? "Going well" : "Needs support"}.
                {behavior.goalRatingAt && ` ${lastCheckInLabel(behavior.goalRatingAt)}.`}
              </p>
            )}
          </div>
        ) : (
          <p className="pf-hint">
            Add a goal to start checking in on this behavior.
          </p>
        )}
      </GoalPreview>
    );
    });

  const logPlanStep = async (goal) => {
    if (!goal?.id || savingGoalId) return;
    const goalId = String(goal.id);
    const current = Math.max(0, Number(progressOverrides[goalId] ?? goal.progress) || 0);
    const target = Math.max(1, Number(goal.target) || 10);
    if (current >= target) return;
    const next = current + 1;
    setError("");
    setSavingGoalId(goalId);
    try {
      await base44.entities.RewardToken.update(goalId, { progress: next, tokens_earned: next })
        .catch(() => base44.functions.invoke("manageClientGoal", {
          action: "update",
          goal_id: goalId,
          child_id: child?.id,
          data: { progress: next, tokensEarned: next, tokens_earned: next },
          account_id: user?.id,
          invite_token: user?.invite_token,
        }));
      setProgressOverrides((previous) => ({ ...previous, [goalId]: next }));
      await queryClient.invalidateQueries({ queryKey: getGetParentDashboardQueryKey(child.id) });
      await refreshParent();
    } catch (updateError) {
      setError(errMsg(updateError));
    } finally {
      setSavingGoalId(null);
    }
  };

  return (
    <div className="pf-goals-tab np-goals-v5" data-testid="panel-goals">
      <section className="np-goals-banner" aria-labelledby="parent-goals-title">
        <Button
          type="button"
          variant="ghost"
          className="np-goals-back"
          onClick={() => navigate(`/ParentHome${child?.id ? `?child_id=${encodeURIComponent(child.id)}` : ""}`)}
          data-testid="button-goals-back"
        >
          <ArrowLeft aria-hidden="true" size={18} />
          Back
        </Button>
        <div className="np-goals-banner-row">
          <div className="np-goals-banner-title">
            <span className="np-goals-banner-icon"><Target aria-hidden="true" size={21} /></span>
            <div>
              <h1 id="parent-goals-title">Goals &amp; Milestones</h1>
              <p>{child?.name ? `${child.name}'s progress` : "Child progress"}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="np-goals-banner-add"
            aria-expanded={showLibrary}
            onClick={() => { setShowLibrary((open) => !open); setError(""); }}
            data-testid="button-add-goal"
          >
            <Plus aria-hidden="true" size={17} />
            {showLibrary ? "Close" : "Add Goal"}
          </Button>
        </div>
      </section>

      <section className="np-goals-child-panel" aria-label="Choose child progress">
        <label htmlFor="parent-goals-child">Viewing progress for</label>
        <Select
          value={String(child?.id || "")}
          onValueChange={onChildSelect}
          disabled={childrenOptions.length <= 1 || !onChildSelect}
        >
          <SelectTrigger id="parent-goals-child" data-testid="select-parent-goals-child">
            <SelectValue placeholder={child?.name || "Select a child"} />
          </SelectTrigger>
          <SelectContent>
            {(childrenOptions.length ? childrenOptions : child ? [child] : []).map((option) => (
              <SelectItem key={option.id} value={String(option.id)}>
                {option.name || option.child_name || "Child"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      {visiblePlanGoals.length > 0 && (
        <section className="np-goals-plan-list" aria-label="Goals from plans and documents" data-testid="goals-found-in-plan">
          {visiblePlanGoals.map((goal, index) => {
            const shown = presentGoalTitle(goal.title, [goal.description]);
            const card = goal.card;
            const testId = card ? `plan-card-goal-${card.id}` : `plan-goal-${goal.id}`;
            return (
              <PlanProgressCard
                key={goal.id || `${normalizeTitle(goal.title)}-${index}`}
                goal={{ ...goal, title: shown.title }}
                card={card}
                childId={child?.id}
                dailyActions={dailyActions}
                testId={testId}
                onLogStep={logPlanStep}
                isSaving={savingGoalId === String(goal.id)}
              />
            );
          })}
        </section>
      )}

      <ClinicalGoals
        childId={child?.id}
        childName={child?.name}
        dailyActions={dailyActions}
        presentation="phase5"
        familyExtras={behaviorGoals}
        familyExtrasCount={behaviorGoals.length}
        careGoalDetails={(careGoal) => {
          const linkedPlan = planGoals.find((goal) => goal.id === careGoal.id);
          return linkedPlan ? <section aria-label="Linked plan source" data-testid={`linked-plan-${linkedPlan.id}`}>
            <p className="np-goal-source-line"><span className="pf-tag">{linkedPlan.sourceType === "clinician_uploaded_plan" ? "Clinician-uploaded document" : "Self-uploaded document"}</span></p>
            {linkedPlan.description && linkedPlan.description !== careGoal.description && <p className="np-goal-desc">{linkedPlan.description}</p>}
            <PlanGoalMilestones goal={linkedPlan} dailyActions={dailyActions} childId={child?.id} />
          </section> : null;
        }}
      />

      {showLibrary && (
        <BehaviorLibrary
          child={child}
          allCards={allCards}
          onUpload={onUpload}
          onEdit={onEdit}
          onAdded={() => setShowLibrary(false)}
        />
      )}
      <ErrorBox error={error} />
    </div>
  );
}
