import { useState } from "react";
import { ChevronDown, Target } from "lucide-react";
import { CompactCard } from "@workspace/neuropathways-foundations/components/ui/compact-card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@workspace/neuropathways-foundations/components/ui/collapsible";

// Phase 5 display-only title presentation. Local on purpose: the global
// readableGoalTitle helper is used elsewhere and must not change. Never
// writes back, never invents text; the raw saved title stays available.
const TIMESTAMP = /\b\d{1,2}:\d{2}(?::\d{2})?\b/;
const TECHNICAL = /^(?:[a-z]\d+\s+)?(?:goal|retest|test)(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/i;

export function isTechnicalGoalTitle(value) {
  const text = String(value || "").trim();
  return !text || TECHNICAL.test(text) || (TIMESTAMP.test(text) && /^(?:[a-z]\d+\s+)?(?:goal|retest|test)\b/i.test(text));
}

export function presentGoalTitle(rawTitle, savedTexts = []) {
  const raw = String(rawTitle || "").trim();
  if (!isTechnicalGoalTitle(raw)) return { title: raw, raw, needsSourceReview: false };
  const fallback = savedTexts
    .map((value) => String(value || "").trim())
    .find((value) => value && !isTechnicalGoalTitle(value));
  const sentence = fallback ? fallback.split(/[.!?\n]/).map((part) => part.trim()).find(Boolean) : "";
  return { title: sentence || raw || "Goal details unavailable", raw, needsSourceReview: true };
}

export function formatGoalDate(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

// Compact preview + forceMounted details. Closed details stay mounted
// (hidden), so in-progress edit drafts and focus are never lost.
export function GoalPreview({ id, title, source, lastLine, needsSourceReview, rawTitle, testId, children }) {
  const [open, setOpen] = useState(false);
  const detailsId = `goal-details-${id}`;
  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <CompactCard
        className="np-goal-preview"
        data-testid={testId}
        headingLevel="h4"
        leading={<span className="np-goal-icon"><Target size={18} /></span>}
        title={title}
        meta={<>
          <span className="np-goal-source" data-testid={`text-goal-source-${id}`}>{source}</span>
          {lastLine && <span data-testid={`text-goal-last-${id}`}>{lastLine}</span>}
          {needsSourceReview && <span className="np-goal-review" data-testid={`flag-goal-source-review-${id}`}>Title needs source review</span>}
        </>}
      >
        <div className="np-goal-actions">
          <CollapsibleTrigger asChild>
            <button type="button" className="np-goal-view" aria-controls={detailsId} aria-label={`${open ? "Close" : "View"} goal: ${title}`} data-testid={`button-view-goal-${id}`}>
              {open ? "Close" : "View Goal"}
              <ChevronDown size={16} aria-hidden="true" className="np-goal-chevron" />
            </button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent forceMount hidden={!open} id={detailsId} className="np-goal-details">
          {needsSourceReview && rawTitle && (
            <p className="np-goal-raw" data-testid={`text-goal-raw-title-${id}`}>Saved title: {rawTitle}</p>
          )}
          {children}
        </CollapsibleContent>
      </CompactCard>
    </Collapsible>
  );
}
