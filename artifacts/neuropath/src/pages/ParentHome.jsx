import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { getParentBehaviors, parentBehaviorIdentity, useGetParentDashboard, getGetParentDashboardQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/lib/AuthContext";
import { parentRequest } from "@/lib/parentSession";
import { Shell, ErrorBox, Skeleton } from "@/components/parentfree/common";
import { isSetupComplete, useSelectedChild } from "@/components/parentfree/useParent";
import SupportCardView, { HelpNowView, sourceLabel } from "@/components/parentfree/SupportView";
import LogPanel from "@/components/parentfree/LogPanel";
import DocsPanel from "@/components/parentfree/DocsPanel";
import ChatPanel from "@/components/parentfree/ChatPanel";
import ClinicPanel from "@/components/parentfree/ClinicPanel";
import BehaviorCards from "@/components/parentfree/BehaviorCards";
import ProgressView from "@/components/parentfree/ProgressView";
import { cardIdentity } from "@/components/parentfree/progress";
import BehaviorLibrary from "@/components/parentfree/BehaviorLibrary";
import ChildEditor from "@/components/parentfree/ChildEditor";

const TABS = [["today", "Today's Support"], ["steps", "Support Steps"], ["log", "Log What Happened"], ["docs", "Upload Plan"], ["ask", "Ask"], ["clinic", "Clinic"], ["edit", "Edit Child Profile"]];

const focusPrefix = (userId) => `np-parent-focus:${userId}:`;
function readFocus(userId, childId) {
  try { return sessionStorage.getItem(`${focusPrefix(userId)}${childId}`); }
  catch { return null; }
}
function clearFocus(userId) {
  try {
    for (const key of Object.keys(sessionStorage)) if (key.startsWith(focusPrefix(userId))) sessionStorage.removeItem(key);
  } catch { /* Storage may be unavailable in a restricted browser. */ }
}

function HelpSelector({ cards, onPick, onAdd, onClose }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.querySelector("button")?.focus();
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    // restored on cleanup
    const key = (e) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key !== "Tab") return;
      const buttons = [...(ref.current?.querySelectorAll("button:not([disabled])") || [])];
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); document.body.style.overflow = overflow; prev?.focus?.(); };
  }, []);
  return (
    <div className="pf-overlay" role="dialog" aria-modal="true" aria-labelledby="help-select-title" ref={ref} data-testid="selector-help"><div className="pf-wrap pf-modal-card" style={{ display: "grid", gap: 14 }}>
      <h2 id="help-select-title">What do you need help with right now?</h2>
      {cards.map((c) => <button key={c.id} className="pf-card" style={{ textAlign: "left", cursor: "pointer", display: "grid", gap: 4 }} onClick={() => onPick(c.id)} data-testid={`select-help-${c.id}`}><strong style={{ fontSize: "1.1rem" }}>{c.behaviorName}</strong><span>Goal: {c.goal || "Not set"}</span></button>)}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="pf-btn" onClick={onAdd} data-testid="button-help-add-behavior">Add Another Behavior</button>
        <button className="pf-btn ghost" onClick={onClose} data-testid="button-help-close">Close</button>
      </div>
    </div></div>
  );
}

function Body({ child }) {
  const { user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const tab = TABS.some(([k]) => k === sp.get("tab")) ? sp.get("tab") : "today";
  const [help, setHelp] = useState(false);
  const [selId, setSelId] = useState(() => readFocus(user?.id, child.id));
  const [section, setSection] = useState(null);
  const q = useGetParentDashboard(child.id, { query: { queryKey: getGetParentDashboardQueryKey(child.id), staleTime: 0, refetchOnMount: "always" }, request: parentRequest() });
  useEffect(() => { setHelp(false); }, [child.id]);
  useEffect(() => {
    if (!selId) return;
    try { sessionStorage.setItem(`${focusPrefix(user?.id)}${child.id}`, selId); }
    catch { console.warn("This browser could not remember the selected support area for reloads."); }
  }, [child.id, user?.id, selId]);
  const go = (k, sec) => { setSection(sec || null); setSp({ tab: k }, { replace: true }); };
  const d = q.data;
  const mine = d ? getParentBehaviors(d.child || child) : [];
  const allCards = (d?.supportCards || []).map((c) => {
    const m = mine.find((b) => parentBehaviorIdentity(b) === parentBehaviorIdentity(c));
    return m && m.goal && m.goal !== c.goal ? { ...c, goal: m.goal, guidanceGoal: c.goal } : c;
  });
  const cards = allCards.filter((c) => mine.some((b) => parentBehaviorIdentity(b) === parentBehaviorIdentity(c)));
  const archivedCards = allCards.filter((c) => !cards.includes(c));
  const card = cards.find((c) => cardIdentity(c) === selId) || cards[0];
  const curId = card ? cardIdentity(card) : null;
  const behaviors = cards.map((c) => ({ behaviorKey: c.behaviorKey, customBehavior: c.behaviorKey === "custom" ? c.behaviorName : null, behaviorName: c.behaviorName, goal: c.goal }));

  return (
    <div className="pf-app">
      <nav><div className="pf-tabs" role="tablist" style={{ margin: "0" }}>
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className="pf-tab" onClick={() => go(k)} data-testid={`tab-${k}`}>{l}</button>)}
      </div></nav>
      <section style={{ minWidth: 0 }}>
      {q.isLoading && <div style={{ display: "grid", gap: 14 }}><Skeleton h={160} /><Skeleton h={220} /></div>}
      {q.isError && <ErrorBox error={q.error} onRetry={() => q.refetch()} />}
      {d && tab === "today" && (
        card ? (
          <div style={{ display: "grid", gap: 16 }} data-testid="panel-today">
            <div className="pf-grid2 even">
              <div className="pf-card warn pf-rise">
                <h2>Need help right now?</h2>
                <button className="pf-btn primary" style={{ marginTop: 14 }} onClick={() => setHelp(cards.length > 1 ? "select" : card.id)} data-testid="button-help-now">I Need Help Now</button>
              </div>
              <div className="pf-card sage">
                <p className="pf-eyebrow">Current Focus</p>
                <p style={{ marginTop: 8 }}><strong>Current Behavior:</strong> <span data-testid="text-current-behavior">{card.behaviorName}</span></p>
                <p><strong>Current Goal:</strong> <span data-testid="text-current-goal">{card.goal || child.goal}</span></p>
                <span className={`pf-tag ${sourceLabel(card).kind}`} style={{ marginTop: 10 }}>{sourceLabel(card).text}</span>
                <div style={{ marginTop: 12 }}><button className="pf-btn small" onClick={() => go("steps")} data-testid="button-open-steps">Open support steps</button></div>
              </div>
            </div>
            <BehaviorCards cards={cards} selectedId={curId} onSelect={setSelId} />
            <ProgressView cards={cards} logs={d.logs} selectedId={curId} onLog={() => go("log")} />
            <BehaviorLibrary child={d.child || child} allCards={allCards} onUpload={() => go("docs")} onEdit={(sec) => go("edit", sec)} />
            <div className="pf-card">
              <h3 style={{ marginBottom: 12 }}>Quick Actions</h3>
              <div className="pf-actions">
                <button className="pf-btn small" onClick={() => go("log")} data-testid="button-quick-log">Log What Happened</button>
                <button className="pf-btn small" onClick={() => go("docs")} data-testid="button-quick-upload">Upload a Plan</button>
                <button className="pf-btn small" onClick={() => go("edit", "behaviors")} data-testid="button-quick-add-behavior">Add Behavior</button>
                <button className="pf-btn small" onClick={() => go("edit", "goals")} data-testid="button-quick-add-goal">Add Goal</button>
                <button className="pf-btn small" onClick={() => go("edit", "profile")} data-testid="button-quick-edit">Edit Child Profile</button>
              </div>
            </div>
            <div className="pf-card sun" data-testid="card-upload-plan">
              <h3>Make this more personalized</h3>
              <p style={{ margin: "6px 0 14px" }}>Upload a behavior plan, school support plan, or treatment plan when you are ready.</p>
              <button className="pf-btn ink" onClick={() => go("docs")} data-testid="button-upload-plan">Upload a Plan</button>
            </div>
            {help === "select" && <HelpSelector cards={cards} onPick={(id) => { const chosen = cards.find((c) => c.id === id); if (chosen) setSelId(cardIdentity(chosen)); setHelp(id); }} onClose={() => setHelp(false)} onAdd={() => { setHelp(false); go("edit", "behaviors"); }} />}
            {help && help !== "select" && cards.find((c) => c.id === help) && <HelpNowView card={cards.find((c) => c.id === help)} onClose={() => setHelp(false)} onLog={() => { setHelp(false); go("log"); }} />}
          </div>
        ) : (
          <div className="pf-card" data-testid="empty-support">
            <h2>Pick a behavior and goal to get support steps</h2>
            <p style={{ margin: "8px 0 14px" }}>Choose one or more behaviors and a goal for each, for {child.name}.</p>
            <Link className="pf-btn primary" to="/ParentQuickStart" data-testid="link-finish-setup">Finish setup</Link>
          </div>
        )
      )}
      {d && tab === "steps" && card && (
        <div style={{ display: "grid", gap: 16 }}>
          {cards.length > 1 && <BehaviorCards cards={cards} selectedId={curId} onSelect={setSelId} />}
          {card.guidanceGoal && <p className="pf-hint" data-testid="text-guidance-earlier-goal">Guidance below was written for the earlier goal: {card.guidanceGoal}</p>}
          <SupportCardView card={card} childName={child.name} onUpload={() => go("docs")} />
          {archivedCards.length > 0 && <div className="pf-card">
            <h3>Other saved plan guidance</h3>
            <p className="pf-hint">These behaviors are not currently active. Their plan guidance is kept for reference and can be added from the library.</p>
            {archivedCards.map((saved) => <details key={saved.id} style={{ marginTop: 12 }}>
              <summary>{saved.behaviorName} — {saved.goal}</summary>
              <SupportCardView card={saved} childName={child.name} onUpload={() => go("docs")} />
            </details>)}
          </div>}
        </div>
      )}
      {d && tab === "log" && <LogPanel childId={child.id} childName={child.name} logs={d.logs} behaviors={behaviors} defaultId={curId} />}
      {d && tab === "docs" && <DocsPanel child={d.child || child} documents={d.documents} />}
      {tab === "ask" && <ChatPanel childId={child.id} childName={child.name} cards={cards} />}
      {d && tab === "clinic" && <ClinicPanel child={d.child || child} documents={d.documents} />}
      {tab === "edit" && <ChildEditor child={d?.child || child} section={section} onUpload={() => go("docs")} />}
      </section>
    </div>
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
      <button className="pf-btn small ghost" onClick={() => { clearFocus(user?.id); logout(); }} data-testid="button-logout">Sign out</button>
    </>}>
      <main className="pf-wrap wide" style={{ paddingBottom: 80 }}>
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
