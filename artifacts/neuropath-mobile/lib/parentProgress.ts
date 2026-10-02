import { parentBehaviorIdentity } from "@workspace/api-client-react";
import type { ParentLog } from "@workspace/api-client-react";

type LogLike = ParentLog;

export const logIdentity = (l: LogLike) => parentBehaviorIdentity({ behaviorKey: l.behaviorKey ?? "", customBehavior: l.customBehavior, behaviorName: null });

/** Plain counts from the parent's own logs. No percentages or outcome claims. */
export function progressFor(logs: ParentLog[], id: string) {
  const mine = (logs as LogLike[]).filter((l) => logIdentity(l) === id);
  const week = Date.now() - 7 * 86400000;
  const episodes = mine.filter((l) => l.happened);
  const sorted = [...mine].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  return {
    entries: mine.length,
    episodes: episodes.length,
    notHappened: mine.length - episodes.length,
    episodesWeek: episodes.filter((l) => +new Date(l.createdAt) >= week).length,
    last: sorted[0]?.createdAt ?? null,
  };
}
