import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useGetParentDashboard, getGetParentDashboardQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/lib/AuthContext";
import { parentRequest } from "@/lib/parentSession";
import { Shell, ErrorBox, Skeleton } from "@/components/parentfree/common";
import { isSetupComplete, useSelectedChild } from "@/components/parentfree/useParent";
import SupportCardView, { HelpNowView, sourceLabel } from "@/components/parentfree/SupportView";
import LogPanel from "@/components/parentfree/LogPanel";
import DocsPanel from "@/components/parentfree/DocsPanel";
import ChatPanel from "@/components/parentfree/ChatPanel";
import ClinicPanel from "@/components/parentfree/ClinicPanel";
import ChildEditor from "@/components/parentfree/ChildEditor";

const TABS = [["today", "Today's Support"], ["steps", "Support Steps"], ["log", "Log What Happened"], ["docs", "Upload Plan"], ["ask", "Ask"], ["clinic", "Clinic"], ["edit", "Edit Behavior / Goal"]];

function Body({ child }) {
  const [sp, setSp] = useSearchParams();
  const tab = TABS.some(([k]) => k === sp.get("tab")) ? sp.get("tab") : "today";
  const [help, setHelp] = useState(false);
  const [cardIdx, setCardIdx] = useState(0);
  const q = useGetParentDashboard(child.id, { query: { queryKey: getGetParentDashboardQueryKey(child.id), staleTime: 0, refetchOnMount: "always" }, request: parentRequest() });
  useEffect(() => { setCardIdx(0); setHelp(false); }, [child.id]);
  const go = (k) => setSp({ tab: k }, { replace: true });
  const d = q.data;
  const cards = d?.supportCards || [];
  const card = cards[cardIdx] || cards[0];

  return (
    <>
      <div className="pf-tabs" role="tablist" style={{ margin: "16px 0 22px" }}>
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className="pf-tab" onClick={() => setSp({ tab: k }, { replace: true })} data-testid={`tab-${k}`}>{l}</button>)}
      </div>
      {q.isLoading && <div style={{ display: "grid", gap: 14 }}><Skeleton h={160} /><Skeleton h={220} /></div>}
      {q.isError && <ErrorBox error={q.error} onRetry={() => q.refetch()} />}
      {d && tab === "today" && (
        card ? (
          <div style={{ display: "grid", gap: 16 }} data-testid="panel-today">
            <div className="pf-card warn pf-rise">
              <h2>Need help right now?</h2>
              <button className="pf-btn primary" style={{ marginTop: 14 }} onClick={() => setHelp(true)} data-testid="button-help-now">I Need Help Now</button>
            </div>
            <div className="pf-card sage">
              <p className="pf-eyebrow">Current Focus</p>
              <p style={{ marginTop: 8 }}><strong>Current Behavior:</strong> <span data-testid="text-current-behavior">{card.behaviorName}</span></p>
              <p><strong>Current Goal:</strong> <span data-testid="text-current-goal">{card.goal || child.goal}</span></p>
              <span className={`pf-tag ${sourceLabel(card).kind}`} style={{ marginTop: 10 }}>{sourceLabel(card).text}</span>
            </div>
            <div className="pf-card">
              <h3 style={{ marginBottom: 12 }}>Quick Actions</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button className="pf-btn small" onClick={() => go("steps")} data-testid="button-open-steps">Open Support Steps</button>
                <button className="pf-btn small" onClick={() => go("log")} data-testid="button-quick-log">Log What Happened</button>
                <button className="pf-btn small" onClick={() => go("docs")} data-testid="button-quick-upload">Upload Plan</button>
                <button className="pf-btn small" onClick={() => go("edit")} data-testid="button-quick-edit">Edit Behavior / Goal</button>
              </div>
            </div>
            <div className="pf-card sun" data-testid="card-upload-plan">
              <h3>Make this more personalized</h3>
              <p style={{ margin: "6px 0 14px" }}>Upload a behavior plan, school support plan, or treatment plan when you are ready.</p>
              <button className="pf-btn ink" onClick={() => go("docs")} data-testid="button-upload-plan">Upload a Plan</button>
            </div>
            {help && <HelpNowView card={card} onClose={() => setHelp(false)} onLog={() => { setHelp(false); go("log"); }} />}
          </div>
        ) : (
          <div className="pf-card" data-testid="empty-support">
            <h2>Pick a behavior and goal to get support steps</h2>
            <p style={{ margin: "8px 0 14px" }}>Choose one behavior and one goal for {child.name}.</p>
            <Link className="pf-btn primary" to="/ParentQuickStart" data-testid="link-finish-setup">Finish setup</Link>
          </div>
        )
      )}
      {d && tab === "steps" && card && (
        <div style={{ display: "grid", gap: 16 }}>
          {cards.length > 1 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }} data-testid="list-behaviors">
              {cards.map((c, i) => <button key={c.id} className="pf-chip" aria-pressed={i === cardIdx} onClick={() => setCardIdx(i)} data-testid={`chip-behavior-${c.id}`}>{c.behaviorName}{i === 0 ? " (focus)" : ""}</button>)}
            </div>
          )}
          <SupportCardView card={card} childName={child.name} />
        </div>
      )}
      {d && tab === "log" && <LogPanel childId={child.id} childName={child.name} logs={d.logs} />}
      {d && tab === "docs" && <DocsPanel child={d.child || child} documents={d.documents} />}
      {tab === "ask" && <ChatPanel childId={child.id} childName={child.name} cards={cards} />}
      {d && tab === "clinic" && <ClinicPanel child={d.child || child} documents={d.documents} />}
      {tab === "edit" && <ChildEditor child={d?.child || child} />}
    </>
  );
}

export default function ParentHome() {
  const nav = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();
  const { children, selected, select } = useSelectedChild();
  const incomplete = useMemo(() => children.find((c) => !isSetupComplete(c)), [children]);
  if (!isAuthenticated || user?.account_type !== "parent_free") return <Navigate to="/ParentLogin" replace />;
  if (children.length === 0 || (incomplete && incomplete.id === selected?.id)) return <Navigate to="/ParentQuickStart" replace />;

  return (
    <Shell right={<>
      <button className="pf-btn small" onClick={() => nav("/ParentQuickStart?new=1")} data-testid="button-add-child">Add a child</button>
      <button className="pf-btn small ghost" onClick={logout} data-testid="button-logout">Sign out</button>
    </>}>
      <main className="pf-wrap" style={{ paddingBottom: 80 }}>
        <p className="pf-eyebrow">Hi {user.first_name}</p>
        <h1 style={{ fontSize: "clamp(1.8rem,5vw,2.6rem)", margin: "4px 0 10px" }}>Today's Support <span style={{ color: "var(--pf-ink-soft)", fontWeight: 400 }}>for {selected.name}</span></h1>
        {children.length > 1 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} data-testid="list-children">
            {children.map((c) => <button key={c.id} className="pf-chip" aria-pressed={c.id === selected.id} onClick={() => select(c.id)} data-testid={`button-child-${c.id}`}>{c.name}</button>)}
          </div>
        )}
        <Body key={selected.id} child={selected} />
      </main>
    </Shell>
  );
}
