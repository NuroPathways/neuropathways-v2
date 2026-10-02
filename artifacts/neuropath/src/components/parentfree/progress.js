import { parentBehaviorIdentity } from "@workspace/api-client-react";

const DAY = 86400000;

export const logIdentity = (l) => (l.behaviorKey || l.customBehavior ? parentBehaviorIdentity({ behaviorKey: l.behaviorKey, customBehavior: l.customBehavior, behaviorName: l.customBehavior }) : null);
export const cardIdentity = (c) => parentBehaviorIdentity(c);

// Plain counts from real logs only. A "did not happen" entry is reported as logged, never as proof a goal was met.
export function summarize(logs, now = Date.now()) {
  const list = logs || [];
  const inWin = (l, from, to) => { const t = new Date(l.createdAt).getTime(); return t >= now - to * DAY && t < now - from * DAY; };
  const week = list.filter((l) => inWin(l, 0, 7));
  const prev = list.filter((l) => inWin(l, 7, 14));
  const happened = week.filter((l) => l.happened);
  const mins = happened.map((l) => Number(l.duration) || 0);
  return {
    total: list.length,
    entries: week.length,
    happened: happened.length,
    notHappened: week.length - happened.length,
    prevHappened: prev.filter((l) => l.happened).length,
    prevEntries: prev.length,
    avgMinutes: mins.length ? Math.round((mins.reduce((a, b) => a + b, 0) / mins.length) * 10) / 10 : null,
    high: happened.filter((l) => l.intensity === "high").length,
    last: list.length ? list.reduce((a, b) => (new Date(a.createdAt) > new Date(b.createdAt) ? a : b)).createdAt : null,
  };
}
