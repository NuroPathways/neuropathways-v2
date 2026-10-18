import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetParentDashboardQueryKey,
  parentBehaviorIdentity,
  useRecordParentGoalFeedback,
  useGetParentCareTeam,
  getGetParentCareTeamQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/AuthContext";
import { parentRequest } from "@/lib/parentSession";
import BehaviorLibrary from "./BehaviorLibrary";
import GoalLines from "./GoalLines";
import ClinicalGoals from "./ClinicalGoals";
import { ErrorBox, errMsg } from "./common";
import { GoalPreview, presentGoalTitle } from "./goalPresentation";
import "./goals-phase-five.css";

const SOURCE_LABEL = (source) => source === "clinician_reviewed" ? "Clinician reviewed"
  : source === "clinician_document" ? "Clinician-uploaded plan"
    : source === "parent_document" ? "Based on your uploaded plan · not clinician-reviewed"
      : "Starter support";

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

export default function ParentGoalsTab({
  child,
  behaviors,
  cards,
  allCards,
  dailyActions = [],
  planGoals = [],
  onUpload,
  onEdit,
}) {
  const queryClient = useQueryClient();
  const { refreshParent } = useAuth();
  const feedback = useRecordParentGoalFeedback({ request: parentRequest() });
  const [showLibrary, setShowLibrary] = useState(false);
  const [error, setError] = useState("");
  const activeBehaviors = Array.isArray(behaviors) ? behaviors : [];
  // Observe the same cache as ClinicalGoals so a care-team record has one home.
  const care = useGetParentCareTeam(child?.id || "", {
    query: { queryKey: getGetParentCareTeamQueryKey(child?.id || ""), enabled: !!child?.id, staleTime: 30_000 },
    request: parentRequest(),
  });
  const careGoalIds = new Set((care.data?.goals || [])
    .filter((goal) => goal.status === "published").map((goal) => goal.id));
  const activeIdentities = new Set(activeBehaviors.map(parentBehaviorIdentity));
  const discoveredPlanGoals = (Array.isArray(allCards) ? allCards : [])
    .filter((card) => card.planGoal?.trim() && !activeIdentities.has(parentBehaviorIdentity(card)))
    .filter((card, index, cardsWithGoals) =>
      cardsWithGoals.findIndex((candidate) =>
        parentBehaviorIdentity(candidate) === parentBehaviorIdentity(card) &&
        candidate.planGoal?.trim() === card.planGoal?.trim(),
      ) === index,
    );
  const cardPlanGoalTitles = new Set((Array.isArray(allCards) ? allCards : [])
    .map((card) => card.planGoal?.trim())
    .filter(Boolean)
    .map((title) => title.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ")));
  const storedPlanGoals = (Array.isArray(planGoals) ? planGoals : [])
    .filter((goal) => !careGoalIds.has(goal.id))
    .filter((goal) =>
      !cardPlanGoalTitles.has(goal.title.trim().normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ")),
    );

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
  const behaviorGoals = activeBehaviors.map((behavior) => {
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
              : linkedCard.source === "clinician_document" ? "Shared by your care team"
                : linkedCard.source === "parent_document" ? "Based on your uploaded document · not clinician-reviewed"
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

  return (
    <div className="pf-goals-tab np-goals-v5" data-testid="panel-goals">
      <p className="np-goals-intro">
        Caregiver check-ins and practice show participation. They do not automatically change treatment progress.
      </p>

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
            <p className="np-goal-source-line"><span className="pf-tag">{linkedPlan.sourceType === "clinician_uploaded_plan" ? "Clinician-uploaded plan" : "Based on your uploaded plan · not clinician-reviewed"}</span></p>
            {linkedPlan.description && linkedPlan.description !== careGoal.description && <p className="np-goal-desc">{linkedPlan.description}</p>}
            <PlanGoalMilestones goal={linkedPlan} dailyActions={dailyActions} childId={child?.id} />
          </section> : null;
        }}
      />

      {(discoveredPlanGoals.length > 0 || storedPlanGoals.length > 0) && (
        <section className="np-goal-group" aria-labelledby="plan-goals-heading" data-testid="goals-found-in-plan">
          <h3 id="plan-goals-heading">Goals From Plans &amp; Documents</h3>
          <p className="np-goal-group-sub">
            Found in {child.name}'s documents and added automatically. They do not replace your saved goals or show clinical progress.
          </p>
          <div className="np-goal-grid">
            {discoveredPlanGoals.map((card) => {
              const shown = presentGoalTitle(card.planGoal, []);
              const cardKey = `${parentBehaviorIdentity(card)}:${card.planGoal}`;
              return (
                <GoalPreview key={cardKey} id={`plan-card-${card.id}`} testId={`plan-card-goal-${card.id}`}
                  title={shown.title} rawTitle={shown.raw} needsSourceReview={shown.needsSourceReview}
                  source="Plan or document goal">
                  <p className="np-goal-source-line"><span className="pf-tag">{card.source === "clinician_reviewed" ? "Clinician reviewed" : SOURCE_LABEL(card.source)}</span></p>
                  <p className="np-goal-desc">Related behavior: {card.behaviorName}</p>
                  {card.planGoalSourceReferences?.length > 0 && (
                    <p className="pf-hint">
                      From: {card.planGoalSourceReferences.map((reference) => reference.title).join(", ")}
                    </p>
                  )}
                  <PlanMilestones card={card} dailyActions={dailyActions} childId={child?.id} />
                </GoalPreview>
              );
            })}
            {storedPlanGoals.map((goal) => {
              const shown = presentGoalTitle(goal.title, [goal.description]);
              return (
                <GoalPreview key={goal.id} id={`plan-${goal.id}`} testId={`plan-goal-${goal.id}`}
                  title={shown.title} rawTitle={shown.raw} needsSourceReview={shown.needsSourceReview}
                  source="Plan or document goal">
                  <p className="np-goal-source-line"><span className="pf-tag">{goal.sourceType === "clinician_uploaded_plan" ? "Clinician-uploaded plan" : "Based on your uploaded plan · not clinician-reviewed"}</span></p>
                  {goal.sourceType === "clinician_uploaded_plan" && <p className="pf-hint">From a clinician-uploaded document</p>}
                  {goal.description && <p className="np-goal-desc">{goal.description}</p>}
                  <PlanGoalMilestones goal={goal} dailyActions={dailyActions} childId={child?.id} />
                </GoalPreview>
              );
            })}
          </div>
        </section>
      )}

      <section className="np-goal-add" data-testid="add-goal-action">
        <div>
          <h3>Add a goal</h3>
          <p className="np-goal-group-sub">Add another behavior and set its starting goal.</p>
        </div>
        <button
          type="button"
          className="pf-btn small ink"
          aria-expanded={showLibrary}
          onClick={() => { setShowLibrary((open) => !open); setError(""); }}
          data-testid="button-add-goal"
        >
          {showLibrary ? "Close" : "Add a goal"}
        </button>
      </section>

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
