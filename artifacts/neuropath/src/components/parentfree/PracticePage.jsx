import { sourceLabel } from "./SupportView";

export default function PracticePage({ childName, card, onOpenSteps, onAddBehavior }) {
  const source = card ? sourceLabel(card) : null;

  return (
    <section className="pf-daily-section" aria-labelledby="practice-page-heading" data-testid="panel-practice">
      <div className="pf-daily-section-heading">
        <div>
          <p className="pf-eyebrow">Calm, familiar moments</p>
          <h2 id="practice-page-heading">Practice This Skill</h2>
        </div>
        {source && <span className={`pf-tag ${source.kind}`}>{source.text}</span>}
      </div>
      {card ? (
        <div className="pf-card">
          <h3>{card.replacementSkill || `Review support for ${card.behaviorName}`}</h3>
          {card.reinforcementIdea && (
            <p className="pf-hint" style={{ marginTop: 8 }}>
              <strong>Saved reinforcement idea:</strong> {card.reinforcementIdea}
            </p>
          )}
          <p className="pf-hint" style={{ marginTop: 8 }}>
            Try this only during a calm, ordinary moment, using supports already familiar to {childName}.
          </p>
          <button type="button" className="pf-btn small primary" style={{ marginTop: 12 }} onClick={() => onOpenSteps(card)}>
            Open skill steps
          </button>
        </div>
      ) : (
        <div className="pf-card">
          <p>Add a behavior to see a related starter skill here.</p>
          <button type="button" className="pf-btn small primary" style={{ marginTop: 12 }} onClick={onAddBehavior}>
            Add a behavior
          </button>
        </div>
      )}
    </section>
  );
}
