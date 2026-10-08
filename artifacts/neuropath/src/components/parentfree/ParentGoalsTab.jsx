import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetParentDashboardQueryKey,
  parentBehaviorIdentity,
  useRecordParentGoalFeedback,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/AuthContext";
import { parentRequest } from "@/lib/parentSession";
import { behaviorEmoji } from "@/lib/behaviorEmoji";
import BehaviorLibrary from "./BehaviorLibrary";
import GoalLines from "./GoalLines";
import { ErrorBox, errMsg } from "./common";

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

function PlanMilestones({ card, dailyActions = [] }) {
  const planActivities = Array.isArray(card.dailyActivities) ? card.dailyActivities : [];
  const todayActions = dailyActions.filter((action) =>
    action.kind === "task" && action.supportCardId === card.id,
  );

  return (
    <section className="pf-card sage" style={{ marginTop: 14 }} data-testid={`plan-milestones-${card.id}`}>
      <h4>Plan milestones and practice</h4>
      {planActivities.length > 0 ? (
        <ul className="pf-list" style={{ marginTop: 8 }}>
          {planActivities.map((activity, index) => (
            <li key={`${card.id}-plan-activity-${index}`} style={{ display: "block" }}>
              <strong>{activity.title}</strong>
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
  );
}

function PlanGoalMilestones({ goal, dailyActions }) {
  const goalKey = goal.title.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  const activities = dailyActions.filter((action) =>
    action.kind === "task" &&
    !action.supportCardId &&
    action.sourceType === goal.sourceType &&
    action.behaviorName.trim().toLocaleLowerCase().replace(/\s+/g, " ") === goalKey,
  );

  return (
    <div style={{ marginTop: 10 }}>
      <h5 style={{ margin: 0 }}>Plan milestones and practice</h5>
      {goal.milestones.length > 0 && (
        <ul className="pf-list" style={{ marginTop: 6 }}>
          {goal.milestones.map((milestone, index) => <li key={`${goal.id}-milestone-${index}`}>{milestone}</li>)}
        </ul>
      )}
      {activities.length > 0 ? (
        <ul className="pf-list" style={{ marginTop: 6 }}>
          {activities.map((activity) => (
            <li key={activity.id} style={{ display: "block" }}>
              <strong>{activity.title}</strong>
              <span className="pf-hint" style={{ display: "block", marginTop: 3 }}>{activity.description}</span>
            </li>
          ))}
        </ul>
      ) : goal.milestones.length === 0 ? (
        <p className="pf-hint" style={{ marginTop: 5 }}>Activities based on this goal will appear in Today.</p>
      ) : null}
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

  return (
    <div style={{ display: "grid", gap: 16 }} data-testid="panel-goals">
      <section className="pf-card sage">
        <p className="pf-eyebrow">Goals</p>
        <h2 style={{ marginTop: 6 }}>How are the current goals going?</h2>
        <p className="pf-hint" style={{ marginTop: 6 }}>
          Check in on each goal. Your rating is caregiver feedback, not an automatic change to progress.
        </p>
      </section>

      {activeBehaviors.length === 0 ? (
        <section className="pf-card" data-testid="empty-goals">
          <h3>No active goals yet</h3>
          <p className="pf-hint" style={{ marginTop: 6 }}>
            Add a behavior and its goal below to start checking in.
          </p>
        </section>
      ) : activeBehaviors.map((behavior) => {
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

        return (
          <article className="pf-card" key={identity} data-testid={`goal-card-${behavior.behaviorKey}`}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span aria-hidden="true" style={{ fontSize: "1.6rem" }}>
                {behaviorEmoji(behavior.behaviorKey, behavior.behaviorName)}
              </span>
              <h3 style={{ margin: 0 }}>{behavior.behaviorName}</h3>
            </div>
            <div style={{ marginTop: 12 }}>
              <GoalLines card={goalCard} active />
            </div>
          {linkedCard?.planGoal && <PlanMilestones card={linkedCard} dailyActions={dailyActions} />}

            {behavior.goal ? (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--pf-line)" }}>
                <p style={{ fontWeight: 700, marginBottom: 8 }}>How is this goal going?</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
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
                  <p role="status" aria-live="polite" className="pf-hint" style={{ marginTop: 8 }}>
                    Current check-in: {behavior.goalRating === "positive" ? "Going well" : "Needs support"}.
                    {behavior.goalRatingAt && ` ${lastCheckInLabel(behavior.goalRatingAt)}.`}
                  </p>
                )}
              </div>
            ) : (
              <p className="pf-hint" style={{ marginTop: 14 }}>
                Add a goal to start checking in on this behavior.
              </p>
            )}
          </article>
        );
      })}

      {(discoveredPlanGoals.length > 0 || storedPlanGoals.length > 0) && (
        <section className="pf-card" aria-labelledby="plan-goals-heading" data-testid="goals-found-in-plan">
          <p className="pf-eyebrow">Added from read documents</p>
          <h3 id="plan-goals-heading" style={{ marginTop: 5 }}>Goals and milestones from plans and reports</h3>
          <p className="pf-hint" style={{ marginTop: 6 }}>
            These goals were found in {child.name}'s documents and added automatically. They do not replace your saved goals.
          </p>
          <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
            {discoveredPlanGoals.map((card) => (
              <article className="pf-card sage" key={`${parentBehaviorIdentity(card)}:${card.planGoal}`}>
                <h4>{card.behaviorName}</h4>
                <p style={{ marginTop: 6 }}><strong>Plan goal:</strong> {card.planGoal}</p>
                {card.planGoalSourceReferences?.length > 0 && (
                  <p className="pf-hint" style={{ marginTop: 5 }}>
                    From: {card.planGoalSourceReferences.map((reference) => reference.title).join(", ")}
                  </p>
                )}
                <PlanMilestones card={card} dailyActions={dailyActions} />
              </article>
            ))}
            {storedPlanGoals.map((goal) => (
              <article className="pf-card sage" key={goal.id} data-testid={`plan-goal-${goal.id}`}>
                <p className="pf-eyebrow">
                  {goal.sourceType === "clinician_uploaded_plan" ? "From a clinician-uploaded document" : "From an uploaded plan"}
                </p>
                <h4 style={{ marginTop: 5 }}>{goal.title}</h4>
                {goal.description && <p style={{ marginTop: 6 }}>{goal.description}</p>}
                <PlanGoalMilestones goal={goal} dailyActions={dailyActions} />
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="pf-card sun" data-testid="add-goal-action">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h3>Add a goal</h3>
            <p className="pf-hint" style={{ marginTop: 4 }}>
              Add another behavior and set its starting goal.
            </p>
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
        </div>
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
