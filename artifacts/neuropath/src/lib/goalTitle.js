// Display-only normalization for goal titles. Never writes back or invents objectives:
// a technical title (e.g. "F4 goal 13:32:51") falls back to the first sentence
// of text already saved on the goal record.
export const isGeneratedGoalTitle = (title) =>
  !title || /^(?:[a-z]\d+\s+)?goal\s+\d{1,2}:\d{2}(?::\d{2})?$/i.test(String(title).trim());

export function readableGoalTitle(goal, fallback = "Goal details unavailable") {
  if (!goal) return fallback;
  const current = goal.goal_title || goal.goalTitle || goal.goal_name || goal.reward_description || goal.token_name || goal.title;
  if (!isGeneratedGoalTitle(current)) return String(current).trim();
  const text = [goal.goal_description, goal.goalDescription, goal.description, goal.reward_description]
    .map((value) => String(value || "").trim())
    .find((value) => value && !isGeneratedGoalTitle(value));
  if (!text) return fallback;
  return text.split(/[.!?\n]/).map((part) => part.trim()).find(Boolean) || fallback;
}
