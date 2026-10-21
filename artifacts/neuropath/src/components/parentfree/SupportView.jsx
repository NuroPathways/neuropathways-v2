import GoalLines from "./GoalLines";

export function sourceLabel(card) {
  if (card?.helpNowSourceLabel || card?.sourceLabel) {
    return { text: card.helpNowSourceLabel || card.sourceLabel, kind: card?.source === "starter" ? "sun" : "" };
  }
  switch (card.source) {
    case "starter": return { text: "General starter support — not individualized", kind: "sun" };
    case "parent_document": return { text: "From your uploaded plan · not clinician-reviewed", kind: "" };
    case "clinician_reviewed": return card.reviewedBy && card.reviewedAt
      ? { text: "Clinician-approved support", kind: "" }
      : { text: "Needs review", kind: "warn" };
    case "clinician_document": return { text: "Clinician-uploaded plan · not approved", kind: "warn" };
    default: return { text: "Source not available", kind: "sun" };
  }
}

function Steps({ items, dash, big }) {
  const visible = (items || []).slice(0, 5);
  return (
    <>
      <ol className={`pf-list pf-support-steps ${dash ? "dash" : ""} ${big ? "featured" : ""}`}>
        {visible.map((t, i) => <li key={i} data-n={i + 1}><span>{t}</span></li>)}
      </ol>
      {visible.length > 0 && visible.length < 3 && <p className="pf-hint">Only {visible.length} source-grounded {visible.length === 1 ? "item is" : "items are"} available; no extra guidance has been added.</p>}
    </>
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
        {card.emergencyOnly ? (
          <Block title="Immediate safety" tone="help">
            <p>No individualized support steps are available for this situation yet.</p>
            <p>Follow the child’s current written safety plan, if available. If anyone is in immediate danger or hurt, call 911 or local emergency services.</p>
          </Block>
        ) : card.documentReferencedOnly ? (
          <Block title="From your uploaded plan" tone="context">
            <blockquote data-testid="text-help-source-excerpt">{card.documentExcerpt}</blockquote>
            <p className="pf-hint">This excerpt is shown as written. It has not been reviewed by your clinician, and no new strategy has been added.</p>
            <p>If anyone is in immediate danger, call 911 or local emergency services.</p>
          </Block>
        ) : (
          <>
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
          </>
        )}
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
        {card.source === "starter" && <p className="pf-hint">General starter support is educational information, not a clinician-approved treatment plan.</p>}
        <p className="pf-eyebrow">Behavior Support Card{childName ? ` for ${childName}` : ""}</p>
        <h2>{card.behaviorName}</h2>
        {card.emergencyOnly ? (
          <Block title="Immediate safety" tone="help">
            <p>No individualized support steps are available for this situation yet.</p>
            <p>Follow the child’s current written safety plan, if available. If anyone is in immediate danger or hurt, call 911 or local emergency services.</p>
          </Block>
        ) : card.documentReferencedOnly ? (
          <Block title="From your uploaded plan" tone="context">
            <blockquote data-testid="text-support-source-excerpt">{card.documentExcerpt}</blockquote>
            <p className="pf-hint">This excerpt is shown as written. It has not been reviewed by your clinician, and no new strategy has been added.</p>
            <p>If anyone is in immediate danger, call 911 or local emergency services.</p>
          </Block>
        ) : (
          <>
            <GoalLines card={card} active={active} />
            {onUpload && <button className="pf-btn small" style={{ marginTop: 12 }} onClick={onUpload} data-testid={`button-source-upload-${card.id}`}>Upload a Plan</button>}
          </>
        )}
      </div>
      {!card.emergencyOnly && !card.documentReferencedOnly && (
        <>
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
        </>
      )}
    </div>
  );
}
