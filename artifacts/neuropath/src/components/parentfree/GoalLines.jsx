export default function GoalLines({ card, active = true }) {
  return (
    <div style={{ display: "grid", gap: 4, fontSize: ".95rem", minWidth: 0, overflowWrap: "anywhere" }}>
      {active && <p><strong>Your saved goal:</strong> {card.goal || "No goal set yet"}</p>}
      {card.planGoal && <p data-testid={`plan-goal-${card.id}`}><strong>Plan goal:</strong> {card.planGoal}</p>}
      {!active && !card.planGoal && card.goal && <p><strong>Saved guidance goal:</strong> {card.goal}</p>}
      {card.planGoal && <p className="pf-hint">Read from the uploaded plan, not a new clinical review. Your saved goal is unchanged.</p>}
      {card.planGoal && card.planGoalSourceReferences?.length > 0 && <p className="pf-hint">Plan goal source: {card.planGoalSourceReferences.map((r) => r.title).join(", ")}</p>}
    </div>
  );
}