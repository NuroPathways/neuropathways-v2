import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useGetParentDashboard, getGetParentDashboardQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/lib/AuthContext";
import { parentRequest } from "@/lib/parentSession";
import { useSelectedChild } from "@/components/parentfree/useParent";
import { base44 } from "@/api/entities";
import { Activity, CalendarDays, ClipboardList } from "lucide-react";

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
  const isFree = user?.account_type === "parent_free";
  const allowedChild = freeChildren.find((child) => String(child.id) === params.get("child_id")) || freeSelected;
  const parentRequestOptions = parentRequest();
  const freeQuery = useGetParentDashboard(allowedChild?.id || "", {
    query: { queryKey: getGetParentDashboardQueryKey(allowedChild?.id || ""), enabled: isFree && !!allowedChild?.id },
    request: parentRequestOptions,
  });

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
    ...(!isFree ? legacyEvents.map((event) => ({ kind: "information", at: event.created_date || event.createdAt, id: `event-${event.id}`, event })) : []),
  ].sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0)), [logs, actions, isFree, legacyEvents]);

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
