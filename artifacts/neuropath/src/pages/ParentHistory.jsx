import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useGetParentDashboard, getGetParentDashboardQueryKey, useGetParentFamilyTools, getGetParentFamilyToolsQueryKey, useGetParentCareTeam, getGetParentCareTeamQueryKey } from "@workspace/api-client-react";
import { CARE_OUTCOME_LABELS } from "@/lib/careTeam";
import { useAuth } from "@/lib/AuthContext";
import { parentRequest } from "@/lib/parentSession";
import { useSelectedChild } from "@/components/parentfree/useParent";
import { base44 } from "@/api/entities";
import { Activity, CalendarDays, ClipboardList, ListChecks } from "lucide-react";

function DateLabel({ value }) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function ParentHistory() {
  const { user } = useAuth();
  const { children: freeChildren, selected: freeSelected } = useSelectedChild();
  const [params] = useSearchParams();
  const [legacyLogs, setLegacyLogs] = useState([]);
  const [legacyEvents, setLegacyEvents] = useState([]);
  const [legacyLoading, setLegacyLoading] = useState(false);
  const [legacyError, setLegacyError] = useState(false);
  const isFree = ["parent_free", "legacy_family"].includes(user?.accountType || user?.account_type);
  const allowedChild = freeChildren.find((child) => String(child.id) === params.get("child_id")) || freeSelected;
  const parentRequestOptions = parentRequest();
  const freeQuery = useGetParentDashboard(allowedChild?.id || "", {
    query: { queryKey: getGetParentDashboardQueryKey(allowedChild?.id || ""), enabled: isFree && !!allowedChild?.id },
    request: parentRequestOptions,
  });
  // Same normalized care-team query for direct parents and legacy family sessions (parentRequest bridges scope).
  const [legacyChildId, setLegacyChildId] = useState("");
  const careChildId = String((isFree ? allowedChild?.id : legacyChildId) || "");
  const careQuery = useGetParentCareTeam(careChildId, {
    query: { queryKey: getGetParentCareTeamQueryKey(careChildId), enabled: !!careChildId, retry: 1, staleTime: 30_000 },
    request: parentRequestOptions,
  });
  const carePractice = careQuery.data?.recentPractice || [];
  const toolsQuery = useGetParentFamilyTools(String(allowedChild?.id || ""), {
    query: { queryKey: getGetParentFamilyToolsQueryKey(String(allowedChild?.id || "")), enabled: isFree && !!allowedChild?.id, retry: false },
    request: parentRequestOptions,
  });
  const routines = isFree ? toolsQuery.data?.routines || [] : [];
  const routineRuns = isFree ? toolsQuery.data?.routineRuns || [] : [];

  useEffect(() => {
    if (isFree || !user) return;
    let cancelled = false;
    async function load() {
      setLegacyLoading(true);
      setLegacyError(false);
      try {
        const children = Array.isArray(user.children) ? user.children : await Promise.all([
          base44.entities.Child.filter({ parent_id: user.id }).catch(() => []),
          user.email ? base44.entities.Child.filter({ parent_email: user.email }).catch(() => []) : Promise.resolve([]),
        ]).then(([byId, byEmail]) => [...new Map([...byId, ...byEmail].map((child) => [child.id, child])).values()]);
        const childId = children.find((child) => String(child.id) === params.get("child_id"))?.id || children[0]?.id;
        if (!cancelled) setLegacyChildId(childId ? String(childId) : "");
        if (!childId) { if (!cancelled) setLegacyLogs([]); return; }
        const [rows, events] = await Promise.all([
          base44.entities.BehaviorLog.filter({ child_id: childId }).catch(() => []),
          base44.entities.EngagementEvent.filter({ child_id: childId }).catch(() => []),
        ]);
        if (!cancelled) {
          setLegacyLogs(rows.sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0)));
          setLegacyEvents(events.sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0)));
        }
      } catch { if (!cancelled) setLegacyError(true); }
      finally { if (!cancelled) setLegacyLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [isFree, user?.id, user?.email, params]);

  const logs = isFree ? freeQuery.data?.logs || [] : legacyLogs;
  const actions = isFree ? freeQuery.data?.dailyActions || [] : [];
  const loading = isFree ? freeQuery.isLoading : legacyLoading;
  const error = isFree ? freeQuery.isError : legacyError;
  const timeline = useMemo(() => [
    ...logs.map((log) => ({ kind: "behavior", at: log.createdAt || log.created_date, id: `log-${log.id}`, log })),
    ...actions.flatMap((action) => (action.logs || []).map((event) => ({ kind: "activity", at: event.createdAt, id: `action-${action.id}-${event.id}`, action, event }))),
    ...carePractice.map((record) => ({ kind: "care", at: record.createdAt, id: `care-${record.id}`, record })),
    ...routineRuns.map((run) => ({ kind: "routine", at: run.updatedAt || run.createdAt, id: `routine-${run.id}`, run, routine: routines.find((r) => r.id === run.routineId) })),
    ...(!isFree ? legacyEvents.map((event) => ({ kind: "information", at: event.created_date || event.createdAt, id: `event-${event.id}`, event })) : []),
  ].filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index)
    .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0)), [logs, actions, isFree, legacyEvents, routineRuns, routines, carePractice]);

  return (
    <main className="np-parent-history">
      <header><span>Family records</span><h1>History</h1><p>Notes and activity already saved for {freeQuery.data?.child?.name || allowedChild?.name || "your child"}.</p></header>
      {loading ? <div className="np-history-loading" aria-label="Loading history"><i /><i /><i /></div> : error ? (
        <div className="np-history-state" role="alert"><strong>History could not load.</strong><p>Check your connection and try again.</p><button type="button" onClick={() => isFree ? freeQuery.refetch() : window.location.reload()}>Try again</button></div>
      ) : timeline.length === 0 ? (
        <div className="np-history-state"><CalendarDays size={25} /><strong>No saved history yet</strong><p>Behavior notes and practice activity will appear here after they are recorded.</p></div>
      ) : (
        <section className="np-history-list" aria-label="Saved records">
          {timeline.map((item) => item.kind === "behavior" ? (
            <article className="np-history-row behavior" key={item.id} data-testid={`history-behavior-${item.log.id}`}>
               <span className="np-history-symbol"><ClipboardList size={17} /></span><div><span className="np-history-kind">Behavior observation</span><h2>{item.log.behaviorName || item.log.behavior_type || "Behavior note"}</h2><p>{item.log.happened === false ? "Did not happen" : [item.log.intensity && `${item.log.intensity} intensity`, item.log.duration != null && `${item.log.duration} min`].filter(Boolean).join(" · ") || "Caregiver note"}</p>{item.log.whatHelped && <p>What helped: {item.log.whatHelped}</p>}{item.log.clinicianFeedback && <p><strong>Clinician feedback:</strong> {item.log.clinicianFeedback}</p>}</div><time><DateLabel value={item.at} /></time>
            </article>
          ) : item.kind === "activity" ? (
            <article className="np-history-row activity" key={item.id} data-testid={`history-activity-${item.action.id}`}>
               <span className="np-history-symbol"><Activity size={17} /></span><div><span className="np-history-kind">Practice activity</span><h2>{item.action.title}</h2><p>{item.event.outcome || item.event.rating || item.event.eventType || "Activity updated"}</p>
                 {isFree && allowedChild?.id && <a data-testid={`link-practice-history-${item.action.id}`} href={`/ParentHome?tab=practice&activity_id=${encodeURIComponent(item.action.id)}&child_id=${encodeURIComponent(allowedChild.id)}`}>Open this activity</a>}
               </div><time><DateLabel value={item.at} /></time>
            </article>
          ) : item.kind === "care" ? (
            <article className="np-history-row activity" key={item.id} data-testid={`history-care-${item.record.id}`}>
              <span className="np-history-symbol"><Activity size={17} /></span><div><span className="np-history-kind">Care team activity</span><h2>{item.record.title}</h2>
                <p>{CARE_OUTCOME_LABELS[item.record.outcome] || "Practice recorded"}{item.record.note ? ` · ${item.record.note}` : ""}</p>
                {item.record.goalTitle && <p>Related goal: {item.record.goalTitle}</p>}
                {careChildId && <a data-testid={`link-care-history-${item.record.id}`} href={`/ParentHome?tab=practice&assignment_id=${encodeURIComponent(item.record.assignmentId)}&child_id=${encodeURIComponent(careChildId)}`}>Open this activity</a>}
              </div><time><DateLabel value={item.at} /></time>
            </article>
          ) : item.kind === "routine" ? (
            <article className="np-history-row activity" key={item.id} data-testid={`history-routine-${item.run.id}`}>
              <span className="np-history-symbol"><ListChecks size={17} /></span><div><span className="np-history-kind">Routine</span><h2>{item.routine?.title || item.routine?.name || "Family routine"}</h2><p>{item.run.status === "completed" ? "Completed" : item.run.status === "paused" ? `Paused at step ${(Number(item.run.currentStep) || 0) + 1}` : String(item.run.status || "Started")}</p></div><time><DateLabel value={item.at} /></time>
            </article>
          ) : (
            <article className="np-history-row information" key={item.id} data-testid={`history-information-${item.event.id}`}>
              <span className="np-history-symbol"><CalendarDays size={17} /></span><div><span className="np-history-kind">Information event</span><h2>{String(item.event.event_type || item.event.eventType || "App activity").replaceAll("_", " ")}</h2><p>{item.event.topic || "This records use of a support feature, not a behavior observation."}</p></div><time><DateLabel value={item.at} /></time>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
