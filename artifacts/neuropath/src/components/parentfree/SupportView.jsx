import GoalLines from "./GoalLines";

export function sourceLabel(card) {
  switch (card.source) {
    case "starter": return { text: "Source: Pre-programmed library", kind: "sun" };
    case "clinician_reviewed":
    case "clinician_document":
    case "parent_document":
      return { text: "Source: Behavior plan", kind: "" };
    default: return { text: "Source: Not available", kind: "sun" };
  }
}

function Steps({ items, dash, big }) {
  return (
    <ol className={`pf-list pf-support-steps ${dash ? "dash" : ""} ${big ? "featured" : ""}`}>
      {(items || []).map((t, i) => <li key={i} data-n={i + 1}><span>{t}</span></li>)}
    </ol>
  );
}

export function Block({ title, children, tone }) {
  return (
    <section className={`pf-card pf-support-section pf-support-section--${tone || "context"}`}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export function HelpNowView({ card, onClose, onLog, onAdd, embedded = false, active = true }) {
  const src = sourceLabel(card);
  const content = (
      <div className={embedded ? undefined : "pf-narrow"} style={{ display: "grid", gap: 18 }} data-testid="help-now-steps">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className={`pf-tag ${src.kind}`}>{src.text}</span>
          {onClose && <button className="pf-btn small" onClick={onClose} data-testid="button-close-help">Close</button>}
        </div>
        <p className="pf-eyebrow">Support Now</p>
        <h1 style={{ fontSize: "clamp(1.8rem,7vw,2.6rem)" }}>{card.behaviorName} Support</h1>
        <GoalLines card={card} active={active} />
        {card.guidanceGoal && <p className="pf-hint">These saved steps were written for the earlier goal: {card.guidanceGoal}.</p>}
        <Block title="Try these steps first" tone="now">
        <Steps items={card.rightNow} big />
        </Block>
        <Block title="What to avoid" tone="avoid"><Steps items={card.avoid} dash /></Block>
        <Block title="Why this may be happening" tone="context"><p>{card.whatMayBeHappening}</p></Block>
        <Block title="Practice a helpful skill" tone="skill">
          <p>{card.replacementSkill}</p>
          <p className="pf-support-detail"><strong>Reinforce:</strong> {card.reinforcementIdea}</p>
        </Block>
        {onLog && <button className="pf-btn" onClick={onLog} data-testid="button-help-log">Log what happened</button>}
        {onAdd && <><p className="pf-hint">You can use these plan steps now. Add this behavior to your active list before logging it.</p><button className="pf-btn" onClick={onAdd} data-testid="button-help-add-found">Add this behavior</button></>}
        <Block title="When to get help" tone="help"><p>If anyone is in danger or hurt, call your local emergency number. {card.seekHelp}</p></Block>
      </div>
  );
  return embedded ? content : <div className="pf-overlay" role="dialog" aria-label="Support Now" data-testid="dialog-help-now">{content}</div>;
}

export default function SupportCardView({ card, childName, onHelp, onUpload, active = true }) {
  const src = sourceLabel(card);
  return (
    <div style={{ display: "grid", gap: 16 }} data-testid={`card-support-${card.id}`}>
      <div className="pf-card sage pf-rise">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          <span className={`pf-tag ${src.kind}`} data-testid="text-source-label">{src.text}</span>
        </div>
        <p className="pf-eyebrow">Behavior Support Card{childName ? ` for ${childName}` : ""}</p>
        <h2>{card.behaviorName}</h2>
        <GoalLines card={card} active={active} />
        {onUpload && <button className="pf-btn small" style={{ marginTop: 12 }} onClick={onUpload} data-testid={`button-source-upload-${card.id}`}>Upload a Plan</button>}
      </div>
      <Block title="Try these steps first" tone="now"><Steps items={card.rightNow} big /></Block>
      <div className="pf-grid2 even">
        <Block title="What to avoid" tone="avoid"><Steps items={card.avoid} dash /></Block>
        <Block title="Why this may be happening" tone="context"><p>{card.whatMayBeHappening}</p></Block>
      </div>
      <div className="pf-grid2 even">
        <Block title="Prevent it next time" tone="prevention"><Steps items={card.prevention} dash /></Block>
        <Block title="Practice a helpful skill" tone="skill">
          <p>{card.replacementSkill}</p>
          <p className="pf-support-detail"><strong>Reinforce:</strong> {card.reinforcementIdea}</p>
        </Block>
      </div>
      <div className="pf-grid2 even">
        <Block title="What to notice" tone="track"><Steps items={card.track} dash /></Block>
        <Block title="When to get help" tone="help"><p>{card.seekHelp}</p></Block>
      </div>
    </div>
  );
}
