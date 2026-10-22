// Shared helpers for the care-team goals & activities contract.
export const CARE_STATUSES = ["draft", "published", "paused", "archived"];
export const CARE_STATUS_LABELS = {
  draft: "Draft",
  needs_review: "Needs review",
  needs_details: "Needs more detail",
  approved: "Approved · not published",
  published: "Published",
  paused: "Paused",
  archived: "Archived",
  rejected: "Rejected",
  superseded: "Superseded",
};
export const CARE_SKILLS = ["Communication", "Transitions", "Daily Living", "Emotional Regulation", "Safety", "Other"];
export const CARE_MEASUREMENTS = [
  ["frequency", "Frequency"],
  ["duration", "Duration"],
  ["percentage", "Percentage of observed opportunities"],
  ["completed_steps", "Completed steps"],
  ["clinician_defined", "Clinician-defined measurement"],
  ["observation", "Observation only"],
];
// Parent feedback values (UI) -> contract outcome values.
export const CARE_OUTCOME = { used_skill: "tried", partially: "needed_support", not_yet: "not_tried" };
export const CARE_OUTCOME_LABELS = { tried: "We tried it", needed_support: "We needed support", not_tried: "Didn't get a chance" };
export const isCareTeamGoal = (goal) => String(goal?.source || "") === "care_team";
export const newRequestId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `req-${Date.now()}-${Math.random().toString(36).slice(2)}`);
export const formatDay = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
};
