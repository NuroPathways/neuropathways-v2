type ParentBehaviorRecord = {
  behaviorKey: string;
  customBehavior: string | null;
  behaviorName: string;
  goal: string | null;
  goalRating: "positive" | "needs_support" | null;
  goalRatingAt: string | null;
};

type ParentBehaviorSelectionInput = {
  behaviorKey: string;
  customBehavior?: string | null;
  goal?: string | null;
};

type ParentBehaviorSource = {
  behaviorKey?: unknown;
  customBehavior?: unknown;
  behaviorName?: unknown;
  goal?: unknown;
  goalRating?: unknown;
  goalRatingAt?: unknown;
};

function normalizedName(value: unknown): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").toLowerCase()
    : "";
}

/** Stable identity shared by selected behaviors and support cards. */
export function parentBehaviorIdentity(selection: ParentBehaviorSource): string {
  const key = typeof selection.behaviorKey === "string" ? selection.behaviorKey : "";
  const customName = normalizedName(selection.customBehavior) ||
    (key === "custom" ? normalizedName(selection.behaviorName) : "");
  return key === "custom" || customName
    ? `custom:${customName}`
    : key
      ? `starter:${key}`
      : `custom:${normalizedName(selection.behaviorName)}`;
}

/** Return the behavior list, falling back to the legacy scalar projection for older API records. */
export function getParentBehaviors(child: ParentBehaviorSource & {
  behaviors?: unknown;
}): ParentBehaviorRecord[] {
  if (Array.isArray(child.behaviors)) {
    const behaviors = child.behaviors.flatMap((entry): ParentBehaviorRecord[] => {
      if (!entry || typeof entry !== "object") return [];
      const value = entry as ParentBehaviorSource & ParentBehaviorSelectionInput;
      if (typeof value.behaviorKey !== "string" || typeof value.behaviorName !== "string") return [];
      return [{
        behaviorKey: value.behaviorKey,
        customBehavior: typeof value.customBehavior === "string" ? value.customBehavior : null,
        behaviorName: value.behaviorName,
        goal: typeof value.goal === "string" ? value.goal : null,
        goalRating: value.goalRating === "positive" || value.goalRating === "needs_support"
          ? value.goalRating
          : null,
        goalRatingAt: typeof value.goalRatingAt === "string" ? value.goalRatingAt : null,
      }];
    });
    if (behaviors.length) return behaviors;
  }
  if (typeof child.behaviorKey !== "string" || !child.behaviorKey) return [];
  const customBehavior = typeof child.customBehavior === "string" ? child.customBehavior : null;
  const behaviorName = typeof child.behaviorName === "string"
    ? child.behaviorName
    : customBehavior || child.behaviorKey;
  return [{
    behaviorKey: child.behaviorKey,
    customBehavior,
    behaviorName,
    goal: typeof child.goal === "string" ? child.goal : null,
    goalRating: null,
    goalRatingAt: null,
  }];
}