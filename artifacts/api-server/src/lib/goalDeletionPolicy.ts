type Goal = {
  parentId?: string | null;
  createdByClinician?: boolean | null;
  source?: string | null;
};

export function clientMayDeleteGoal(goal: Goal | null | undefined, authenticatedChildId: string | null): boolean {
  return Boolean(
    goal &&
    authenticatedChildId &&
    goal.parentId === authenticatedChildId &&
    goal.createdByClinician !== true &&
    ["manual", "parent_document"].includes(goal.source ?? ""),
  );
}
