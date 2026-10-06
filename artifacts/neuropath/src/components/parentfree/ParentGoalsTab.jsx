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

export default function ParentGoalsTab({
  child,
  behaviors,
  cards,
  allCards,
  onUpload,
  onEdit,
}) {
  const queryClient = useQueryClient();
  const { refreshParent } = useAuth();
  const feedback = useRecordParentGoalFeedback({ request: parentRequest() });
  const [showLibrary, setShowLibrary] = useState(false);
  const [error, setError] = useState("");
  const activeBehaviors = Array.isArray(behaviors) ? behaviors : [];

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
