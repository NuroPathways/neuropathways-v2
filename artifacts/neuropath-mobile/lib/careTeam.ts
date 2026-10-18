import { getGetParentCareTeamQueryKey, useGetParentCareTeam } from "@workspace/api-client-react";
import type { CareActivity, CareGoal, CarePractice } from "@workspace/api-client-react";
import { useParent } from "@/context/ParentContext";

/** Published, current care-team goals/assignments for the selected child. Server filters drafts and other children; we re-check defensively. */
export function useCareTeam() {
  const { child, opts, token } = useParent();
  const id = child?.id ?? "";
  const q = useGetParentCareTeam(id, {
    request: opts,
    query: { queryKey: getGetParentCareTeamQueryKey(id), enabled: !!token && !!child, staleTime: 30_000, retry: false },
  });
  const assignments: CareActivity[] = (q.data?.assignments ?? []).filter((a) => a.childId === id && a.status === "published");
  const goals: CareGoal[] = (q.data?.goals ?? []).filter((g) => g.childId === id && g.status === "published");
  const recentPractice: CarePractice[] = (q.data?.recentPractice ?? []).filter((p) => p.childId === id);
  return { query: q, assignments, goals, recentPractice, queryKey: getGetParentCareTeamQueryKey(id) };
}

const GENERIC_WHY = /^(this (activity|exercise) )?(helps?|will help|can help) (to )?(improve|build|develop|with) (this|the) skill\.?$/i;
export const usefulWhy = (text?: string | null) => {
  const t = (text ?? "").trim();
  return t.length > 12 && !GENERIC_WHY.test(t) ? t : "";
};

export const CATEGORIES = [
  { name: "Communication", re: /communicat|request|ask|aac|word|talk|speech|sign/i },
  { name: "Calm & Coping", re: /calm|cop|regulat|meltdown|upset|breath|anger|emotion|frustrat/i },
  { name: "Daily Routines", re: /routine|morning|bed|meal|dress|hygiene|daily|bath|teeth/i },
  { name: "Transitions", re: /transition|first.?then|switch|change|leav|wait/i },
  { name: "Playing Together", re: /play|turn|game|toy|shar/i },
  { name: "Safety Skills", re: /safe|elop|wander|street|run away/i },
] as const;
export const categoryOf = (text: string) => CATEGORIES.find((c) => c.re.test(text))?.name ?? null;

export const newRequestId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
