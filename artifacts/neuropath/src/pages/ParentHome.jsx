import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { getParentBehaviors, getParentDashboard, parentBehaviorIdentity, useGetParentDashboard, getGetParentDashboardQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/lib/AuthContext";
import { parentRequest } from "@/lib/parentSession";
import { ErrorBox, Skeleton } from "@/components/parentfree/common";
import RoleAwareShell from "@/components/navigation/RoleAwareShell";
import { createFreeCaregiverNavigation, mobilePrimaryKeysForRole } from "@/components/navigation/navigationModels";
import { isSetupComplete, useSelectedChild } from "@/components/parentfree/useParent";
import SupportCardView, { sourceLabel } from "@/components/parentfree/SupportView";
import GoalLines from "@/components/parentfree/GoalLines";
import LogPanel from "@/components/parentfree/LogPanel";
import DocsPanel from "@/components/parentfree/DocsPanel";
import ChatPanel from "@/components/parentfree/ChatPanel";
import ClinicPanel from "@/components/parentfree/ClinicPanel";
import BehaviorCards from "@/components/parentfree/BehaviorCards";
import ParentGoalsTab from "@/components/parentfree/ParentGoalsTab";
import ProgressView from "@/components/parentfree/ProgressView";
import { cardIdentity } from "@/components/parentfree/progress";
import BehaviorLibrary from "@/components/parentfree/BehaviorLibrary";
import ChildEditor from "@/components/parentfree/ChildEditor";
import SupportNowOverlay, { clearSupportPopupSession } from "@/components/support/SupportNowOverlay";
import { behaviorEmoji } from "@/lib/behaviorEmoji";

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

function Body({ child }) {
  const { user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const tab = TABS.some(([k]) => k === sp.get("tab")) ? sp.get("tab") : "today";
  const [selId, setSelId] = useState(() => readFocus(user?.id, child.id));
  const [section, setSection] = useState(() => sp.get("section"));
  const [addFromHelp, setAddFromHelp] = useState(null);
  const [supportStepId, setSupportStepId] = useState(null);
  const libraryRef = useRef(null);
  const q = useGetParentDashboard(child.id, { query: { queryKey: getGetParentDashboardQueryKey(child.id), staleTime: 0, refetchOnMount: "always" }, request: parentRequest() });
  useEffect(() => { setSection(sp.get("section")); }, [sp]);
  useEffect(() => { if (tab !== "steps") setSupportStepId(null); }, [tab]);
  useEffect(() => {
    if (tab === "today" && sp.get("section") === "library") {
      libraryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [tab, sp, q.data]);
  useEffect(() => {
    if (!selId) return;
    try { sessionStorage.setItem(`${focusPrefix(user?.id)}${child.id}`, selId); }
    catch { console.warn("This browser could not remember the selected support area for reloads."); }
  }, [child.id, user?.id, selId]);
  const go = (k, sec) => {
    setSection(sec || null);
    setSp(sec ? { tab: k, section: sec } : { tab: k }, { replace: true });
  };
  const d = q.data;
  const mine = d ? getParentBehaviors(d.child || child) : [];
  const allCards = (d?.supportCards || []).map((c) => {
    const m = mine.find((b) => parentBehaviorIdentity(b) === parentBehaviorIdentity(c));
    return m ? { ...c, goal: m.goal ?? null, ...(m.goal !== c.goal && c.goal ? { guidanceGoal: c.goal } : {}) } : c;
  });
  const cards = allCards.filter((c) => mine.some((b) => parentBehaviorIdentity(b) === parentBehaviorIdentity(c)));
  const archivedCards = allCards.filter((c) => !cards.includes(c));
  const helpCards = allCards.filter((c) => cards.includes(c) || c.source !== "starter");
  const activeIds = new Set(cards.map(cardIdentity));
  const card = cards.find((c) => cardIdentity(c) === selId) || cards[0];
  const supportStepCard = helpCards.find((c) => cardIdentity(c) === supportStepId);
  const curId = card ? cardIdentity(card) : null;
  const behaviors = cards.map((c) => ({ behaviorKey: c.behaviorKey, customBehavior: c.behaviorKey === "custom" ? c.behaviorName : null, behaviorName: c.behaviorName, goal: c.goal }));

  return (
    <div className="pf-app">
      <section style={{ minWidth: 0 }}>
      {q.isLoading && <div style={{ display: "grid", gap: 14 }}><Skeleton h={160} /><Skeleton h={220} /></div>}
      {q.isError && <ErrorBox error={q.error} onRetry={() => q.refetch()} />}
      {d && tab === "today" && (
        card ? (
          <div style={{ display: "grid", gap: 16 }} data-testid="panel-today">
            <div className="pf-card sage">
              <p className="pf-eyebrow">Current Focus</p>
              <p style={{ marginTop: 8 }}><strong>Current Behavior:</strong> <span data-testid="text-current-behavior">{card.behaviorName}</span></p>
              <p><strong>Current Goal:</strong> <span data-testid="text-current-goal">{card.goal || "No goal set yet"}</span></p>
              {card.planGoal && <p data-testid="text-current-plan-goal"><strong>Plan goal:</strong> {card.planGoal}</p>}
              <span className={`pf-tag ${sourceLabel(card).kind}`} style={{ marginTop: 10 }}>{sourceLabel(card).text}</span>
              <div style={{ marginTop: 12 }}><button className="pf-btn small" onClick={() => go("steps")} data-testid="button-open-steps">Open support steps</button></div>
            </div>
            <BehaviorCards cards={cards} selectedId={curId} onSelect={setSelId} />
            <ProgressView cards={cards} logs={d.logs} selectedId={curId} onLog={() => go("log")} />
             {archivedCards.some((c) => c.planGoal) && <div className="pf-card" data-testid="goals-found-in-plan">
               <h3>More goals found in your plan</h3>
               <p className="pf-hint">Available in Help Now without changing your saved behaviors or goals.</p>
               {archivedCards.filter((c) => c.planGoal).map((c) => <div key={c.id} style={{ marginTop: 12 }}><strong>{c.behaviorName}</strong><GoalLines card={c} active={false} /></div>)}
             </div>}
              <div id="parent-behavior-library" ref={libraryRef} style={{ scrollMarginTop: 84 }}>
                <BehaviorLibrary child={d.child || child} allCards={allCards} requestAdd={addFromHelp} onAddHandled={() => setAddFromHelp(null)} onUpload={() => go("docs")} onEdit={(sec) => go("edit", sec)} />
              </div>
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
          </div>
        ) : (
          <div className="pf-card" data-testid="empty-support">
            <h2>Pick a behavior and goal to get support steps</h2>
            <p style={{ margin: "8px 0 14px" }}>Choose one or more behaviors and a goal for each, for {child.name}.</p>
            <Link className="pf-btn primary" to="/ParentQuickStart" data-testid="link-finish-setup">Finish setup</Link>
          </div>
        )
      )}
      {d && tab === "steps" && (
        <div style={{ display: "grid", gap: 16 }} data-testid="panel-support-steps">
          {supportStepCard ? (
            <>
              <button
                type="button"
                className="pf-btn small"
                style={{ justifySelf: "start" }}
                onClick={() => setSupportStepId(null)}
                data-testid="button-back-to-support-blocks"
              >
                <span aria-hidden="true">←</span> All support behaviors
              </button>
              {supportStepCard.guidanceGoal && (
                <p className="pf-hint" data-testid="text-guidance-earlier-goal">
                  Guidance below was written for the earlier goal: {supportStepCard.guidanceGoal}
                </p>
              )}
              <SupportCardView
                card={supportStepCard}
                childName={child.name}
                active={activeIds.has(cardIdentity(supportStepCard))}
                onUpload={() => go("docs")}
              />
            </>
          ) : helpCards.length > 0 ? (
            <>
              <div className="pf-card sage">
                <h2>Choose a support behavior</h2>
                <p className="pf-hint" style={{ marginTop: 6 }}>
                  Select a block to see its full support steps. Behaviors found in an uploaded plan are available here without adding them to your active list.
                </p>
              </div>
              <BehaviorCards cards={helpCards} selectedId={null} onSelect={setSupportStepId} />
            </>
          ) : (
            <div className="pf-card" data-testid="empty-support-steps">
              <h2>No support blocks yet</h2>
              <p className="pf-hint" style={{ marginTop: 6 }}>
                Add a behavior or upload a support plan to see behavior-specific steps here.
              </p>
              <button type="button" className="pf-btn small" style={{ marginTop: 14 }} onClick={() => go("docs")}>
                Upload a plan
              </button>
            </div>
          )}
        </div>
      )}
      {d && tab === "log" && <LogPanel childId={child.id} childName={child.name} logs={d.logs} behaviors={behaviors} defaultId={curId} />}
      {d && tab === "docs" && <DocsPanel child={d.child || child} documents={d.documents} />}
      {tab === "ask" && <ChatPanel childId={child.id} childName={child.name} cards={cards} />}
      {d && tab === "clinic" && <ClinicPanel child={d.child || child} documents={d.documents} />}
      {tab === "edit" && section === "goals" && (
        <ParentGoalsTab
          child={d?.child || child}
          behaviors={mine}
          cards={cards}
          allCards={allCards}
          onUpload={() => go("docs")}
          onEdit={(targetSection) => go("edit", targetSection === "goals" ? "goal-editor" : targetSection)}
        />
      )}
      {tab === "edit" && section !== "goals" && (
        <ChildEditor
          child={d?.child || child}
          section={section === "goal-editor" ? "goals" : section}
          onUpload={() => go("docs")}
        />
      )}
      </section>
    </div>
  );
}

export default function ParentHome() {
  const nav = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();
  const { children, selected, select } = useSelectedChild();
  const [searchParams] = useSearchParams();
  const [supportRequest, setSupportRequest] = useState(0);
  const incomplete = useMemo(() => children.find((c) => !isSetupComplete(c)), [children]);
  const popupChildren = useMemo(() => children.map((child) => ({ ...child, child_name: child.name })), [children]);
  const activeTab = TABS.some(([key]) => key === searchParams.get("tab")) ? searchParams.get("tab") : "today";
  const activeSection = searchParams.get("section") || "";
  const goToTab = (tab, section) => {
    const params = new URLSearchParams();
    if (tab !== "today" || section) params.set("tab", tab);
    if (section) params.set("section", section);
    nav(`/ParentHome${params.size ? `?${params.toString()}` : ""}`);
  };
  const loadPopupProfile = useCallback(async (childId) => {
    const dashboard = await getParentDashboard(childId, parentRequest());
    if (!Array.isArray(dashboard.supportCards)) {
      throw new Error("Support cards could not be loaded.");
    }
    return {
      ...(dashboard.child || {}),
      behaviors: dashboard.supportCards
        .filter((card) => card && typeof card === "object" && !Array.isArray(card))
        .map((card) => ({
        id: card.id,
        name: card.behaviorName,
        emoji: behaviorEmoji(card.behaviorKey, card.behaviorName),
        sourceLabel: card.source === "starter" ? "Source: Pre-programmed library" : "Source: Behavior plan",
        what_may_be_happening: card.whatMayBeHappening,
        do_this_right_now: card.rightNow || [],
        avoid: card.avoid || [],
        prevention_tips: card.prevention || [],
        reinforcement_rewards: card.reinforcementIdea ? [card.reinforcementIdea] : [],
        when_to_contact_clinician: card.seekHelp,
      })),
    };
  }, []);
  if (!isAuthenticated || user?.account_type !== "parent_free") return <Navigate to="/ParentLogin" replace />;
  if (children.length === 0 || (incomplete && incomplete.id === selected?.id)) return <Navigate to="/ParentQuickStart" replace />;

  const navGroups = createFreeCaregiverNavigation({
    activeTab,
    activeSection,
    goToTab,
    onSupportNow: () => setSupportRequest((request) => request + 1),
    onAddChild: () => nav("/ParentQuickStart?new=1"),
  });
  const activeItem = navGroups.flatMap((group) => group.items).find((item) => item.active);
  const currentLabel = activeItem?.label || "Home";

  return (
    <RoleAwareShell
      role="caregiver"
      roleLabel="Caregiver workspace"
      currentLabel={currentLabel}
      activeKey={activeItem?.key}
      navGroups={navGroups}
      mobilePrimaryKeys={mobilePrimaryKeysForRole("caregiver")}
      accountName={user.first_name || user.full_name || "Caregiver"}
      accountMeta="Caregiver account"
      selectedChild={selected}
      childrenOptions={children}
      contextLabel="Viewing support for"
      onChildSelect={select}
      onLogout={() => { clearFocus(user?.id); clearSupportPopupSession(user?.id); logout(); }}
    >
      <div className="pf">
      <main className="pf-wrap wide">
        <p className="pf-eyebrow">Hi {user.first_name}</p>
        <h1 style={{ fontSize: "clamp(1.8rem,5vw,2.6rem)", margin: "4px 0 10px" }}>{activeTab === "today" && !activeSection ? "Today's Support" : currentLabel} <span style={{ color: "var(--pf-ink-soft)", fontWeight: 400 }}>for {selected.name}</span></h1>
        <Body key={selected.id} child={selected} />
      </main>
      </div>
      <SupportNowOverlay
        user={user}
        children={popupChildren}
        isIndividual={children.length === 1}
        loadProfileForChild={loadPopupProfile}
        logEngagement={false}
        openRequest={supportRequest}
      />
    </RoleAwareShell>
  );
}
