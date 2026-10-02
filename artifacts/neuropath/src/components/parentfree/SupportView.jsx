import { Fragment } from "react";
import GoalLines from "./GoalLines";

export function sourceLabel(card) {
  switch (card.source) {
    case "clinician_reviewed": return { text: "Support steps reviewed by your clinician.", kind: "" };
    case "clinician_document": return { text: "Based on your child's uploaded plan.", kind: "" };
    case "parent_document": return { text: "Based on your uploaded plan. Not yet reviewed by a clinician.", kind: "sun" };
    default: return { text: "Starter support based on common behavior patterns. Upload your child's plan later for more personalized guidance.", kind: "sun" };
  }
}

function Steps({ items, dash, big }) {
  return (
    <ol className={`pf-list ${dash ? "dash" : ""}`} style={big ? { fontSize: "1.2rem", gap: 16 } : undefined}>
      {(items || []).map((t, i) => <li key={i} data-n={i + 1}><span>{t}</span></li>)}
    </ol>
  );
}

export function Block({ title, children, tone }) {
  return (
    <div className={`pf-card ${tone || ""}`}>
      <h3 style={{ marginBottom: 10 }}>{title}</h3>
      {children}
    </div>
  );
}

export function SourceNotes({ card }) {
  const refs = card.sourceReferences || [];
  return (
    <Fragment>
      {card.conflict && (
        <div className="pf-error" data-testid="text-conflict" style={{ marginTop: 12 }}>
          Conflict detected. Clinician review recommended.{card.conflictMessage ? ` ${card.conflictMessage}` : ""}
        </div>
      )}
      {refs.length > 0 && (
        <p className="pf-hint" data-testid="text-sources" style={{ marginTop: 10 }}>
          Based on: {refs.map((r) => r.title).join(", ")}
        </p>
      )}
    </Fragment>
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
        <h2>What to do right now</h2>
        <Steps items={card.rightNow} big />
        <Block title="What to avoid" tone="warn"><Steps items={card.avoid} dash /></Block>
        <Block title="What may be happening"><p>{card.whatMayBeHappening}</p></Block>
        <Block title="Try this replacement skill"><p>{card.replacementSkill}</p></Block>
        <SourceNotes card={card} />
        {card.source === "starter" && <p className="pf-card sun" data-testid="text-starter-note">This is starter support. Upload your child's plan for personalized guidance.</p>}
        {onLog && <button className="pf-btn" onClick={onLog} data-testid="button-help-log">Log what happened</button>}
        {onAdd && <><p className="pf-hint">You can use these plan steps now. Add this behavior to your active list before logging it.</p><button className="pf-btn" onClick={onAdd} data-testid="button-help-add-found">Add this behavior</button></>}
        <p className="pf-hint">If anyone is in danger or hurt, call your local emergency number. {card.seekHelp}</p>
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
        <SourceNotes card={card} />
        {onUpload && <button className="pf-btn small" style={{ marginTop: 12 }} onClick={onUpload} data-testid={`button-source-upload-${card.id}`}>Upload a Plan</button>}
      </div>
      <Block title="What to do right now"><Steps items={card.rightNow} /></Block>
      <div className="pf-grid2 even">
        <Block title="What to avoid" tone="warn"><Steps items={card.avoid} dash /></Block>
        <Block title="What may be happening"><p>{card.whatMayBeHappening}</p></Block>
      </div>
      <div className="pf-grid2 even">
        <Block title="Prevent it next time"><Steps items={card.prevention} dash /></Block>
        <Block title="Replacement skill">
          <p>{card.replacementSkill}</p>
          <p style={{ marginTop: 10 }}><strong>Reinforce:</strong> {card.reinforcementIdea}</p>
        </Block>
      </div>
      <div className="pf-grid2 even">
        <Block title="What to track"><Steps items={card.track} dash /></Block>
        <Block title="When to seek help" tone="sun"><p>{card.seekHelp}</p></Block>
      </div>
    </div>
  );
}
