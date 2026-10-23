import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { getParentBehaviors, getParentDashboard, getStarterLibrary, parentBehaviorIdentity, useGetParentDashboard, useGetStarterLibrary, getGetParentDashboardQueryKey, useGetParentCareTeam, getGetParentCareTeamQueryKey, saveCareTeamPracticeProgress, recordCareTeamPractice } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CARE_OUTCOME, newRequestId } from "@/lib/careTeam";
import { useAuth } from "@/lib/AuthContext";
import { parentRequest } from "@/lib/parentSession";
import { ErrorBox, Skeleton } from "@/components/parentfree/common";
import RoleAwareShell from "@/components/navigation/RoleAwareShell";
import { createFreeCaregiverNavigation, mobilePrimaryKeysForRole } from "@/components/navigation/navigationModels";
import { isSetupComplete, useSelectedChild } from "@/components/parentfree/useParent";
import SupportCardView from "@/components/parentfree/SupportView";
import GoalLines from "@/components/parentfree/GoalLines";
import LogPanel from "@/components/parentfree/LogPanel";
import DocsPanel from "@/components/parentfree/DocsPanel";
import ChatPanel from "@/components/parentfree/ChatPanel";
import ClinicPanel from "@/components/parentfree/ClinicPanel";
import MessagesPanel from "@/components/parentfree/MessagesPanel";
import BehaviorCards from "@/components/parentfree/BehaviorCards";
import ParentGoalsTab from "@/components/parentfree/ParentGoalsTab";
import { cardIdentity } from "@/components/parentfree/progress";
import { PageHeader } from "@workspace/neuropathways-foundations/components/ui/page-header";
import "@workspace/neuropathways-foundations/scoped.css";
import "@/components/parentfree/goals-phase-five.css";
import "@/components/parentfree/home-phase-two.css";
import BehaviorLibrary from "@/components/parentfree/BehaviorLibrary";
import ChildEditor from "@/components/parentfree/ChildEditor";
import DailySupportHome from "@/components/parentfree/DailySupportHome";
import PracticePage from "@/components/parentfree/PracticePage";
import { parentDirectBehaviors } from "@/components/parentfree/parentDirectSupport";
import SupportNowOverlay from "@/components/support/SupportNowOverlay";
import { clearSupportPopupSession, markSupportPopupShown } from "@/lib/supportPopupSession";
import { AlertTriangle } from "lucide-react";

const TABS = [["today", "Today's Support"], ["practice", "Practice"], ["steps", "Support Steps"], ["log", "Log What Happened"], ["docs", "Upload Plan"], ["ask", "Ask"], ["clinic", "Clinic"], ["messages", "Messages"], ["edit", "Edit Child Profile"]];

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

function currentLocalDay() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function Body({ child }) {
  const { user } = useAuth();
  const isLegacy = (user?.accountType || user?.account_type) === "legacy_family";
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const LEARN_WHY = ["learn-why", "learnwhy", "learn_why", "learn"];
  const legacyPracticeRoute = (sp.get("tab") === "today" && sp.get("section") === "practice")
    || LEARN_WHY.includes(String(sp.get("section") || "").toLowerCase())
    || LEARN_WHY.includes(String(sp.get("tab") || "").toLowerCase())
    || String(sp.get("view") || "").toLowerCase().replace(/\s+/g, "-") === "learn-why";
  const tab = legacyPracticeRoute ? "practice" : TABS.some(([k]) => k === sp.get("tab")) ? sp.get("tab") : "today";
  const [selId, setSelId] = useState(() => readFocus(user?.id, child.id));
  const [section, setSection] = useState(() => sp.get("section"));
  const [addFromHelp, setAddFromHelp] = useState(null);
  const [supportStepId, setSupportStepId] = useState(null);
  const libraryRef = useRef(null);
  const dashboardRequest = parentRequest();
  const dashboardHeaders = new Headers(dashboardRequest.headers);
  dashboardHeaders.set("X-Parent-Local-Date", currentLocalDay());
  const q = useGetParentDashboard(child.id, { query: { queryKey: getGetParentDashboardQueryKey(child.id), staleTime: 0, refetchOnMount: "always" }, request: { ...dashboardRequest, headers: dashboardHeaders } });
  const starterLibraryQuery = useGetStarterLibrary({ request: parentRequest() });
  const queryClient = useQueryClient();
  const careKey = getGetParentCareTeamQueryKey(child.id);
  // Optional enhancement: errors or an empty result simply hide care-team sections.
  const careQ = useGetParentCareTeam(child.id, { query: { queryKey: careKey, staleTime: 30_000, refetchInterval: 60_000, retry: 1 }, request: parentRequest() });
  const careAssignments = careQ.data?.assignments || [];
  const refreshCare = () => queryClient.invalidateQueries({ queryKey: careKey });
  const saveAssigned = async (item, { currentStep = item.currentStep ?? 0, bookmarked = true } = {}) => {
    await saveCareTeamPracticeProgress(child.id, item.id, { version: item.version, currentStep, bookmarked }, parentRequest());
    await refreshCare();
  };
  const assignedProgress = (item, currentStep) => saveCareTeamPracticeProgress(child.id, item.id, { version: item.version, currentStep, bookmarked: Boolean(item.bookmarked) }, parentRequest());
  const pendingPracticeRequests = useRef(new Map());
  const recordAssigned = async (item, { outcome, note }) => {
    const key = `${child.id}:${item.id}:${item.version}`;
    if (!pendingPracticeRequests.current.has(key)) pendingPracticeRequests.current.set(key, newRequestId());
    await recordCareTeamPractice(child.id, item.id, { version: item.version, outcome: CARE_OUTCOME[outcome] || outcome, ...(note ? { note } : {}), requestId: pendingPracticeRequests.current.get(key) }, parentRequest());
    await refreshCare();
    pendingPracticeRequests.current.delete(key);
  };
  useEffect(() => { setSection(sp.get("section")); }, [sp]);
  useEffect(() => { if (tab !== "steps") setSupportStepId(null); }, [tab]);
  useEffect(() => {
    if (legacyPracticeRoute) {
      setSp({ tab: "practice" }, { replace: true });
    } else if (tab === "today" && sp.get("section") === "library") {
      libraryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [tab, sp, setSp, legacyPracticeRoute, q.data]);
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
  const helpCards = parentDirectBehaviors(d?.child || child, allCards, starterLibraryQuery.data || []);
  const activeIds = new Set(cards.map(cardIdentity));
  const card = cards.find((c) => cardIdentity(c) === selId) || cards[0];
  const supportStepCard = helpCards.find((c) => cardIdentity(c) === supportStepId);
  const curId = card ? cardIdentity(card) : null;
  const focusedCard = cards.find((item) => cardIdentity(item) === selId) || card;
  const behaviors = cards.map((c) => ({ behaviorKey: c.behaviorKey, customBehavior: c.behaviorKey === "custom" ? c.behaviorName : null, behaviorName: c.behaviorName, goal: c.goal }));

  return (
    <div className="pf-app">
      <section style={{ minWidth: 0 }}>
      {q.isLoading && <div style={{ display: "grid", gap: 14 }}><Skeleton h={160} /><Skeleton h={220} /></div>}
      {q.isError && <ErrorBox error={q.error} onRetry={() => q.refetch()} />}
      {d && tab === "today" && section === "library" && (
        <div id="parent-behavior-library" ref={libraryRef} style={{ display: "grid", gap: 16, scrollMarginTop: 84 }}>
          {archivedCards.some((c) => c.planGoal) && <div className="pf-card" data-testid="goals-found-in-plan">
            <h3>More goals found in your plan</h3>
            <p className="pf-hint">These plan discoveries do not change your saved behaviors or goals.</p>
            {archivedCards.filter((c) => c.planGoal).map((c) => <div key={c.id} style={{ marginTop: 12 }}><strong>{c.behaviorName}</strong><GoalLines card={c} active={false} /></div>)}
          </div>}
          <BehaviorLibrary child={d.child || child} allCards={allCards} requestAdd={addFromHelp} onAddHandled={() => setAddFromHelp(null)} onUpload={() => go("docs")} onEdit={(sec) => go("edit", sec)} />
        </div>
      )}
      {d && tab === "today" && section !== "library" && (
        <DailySupportHome
          childId={child.id}
          childName={child.name}
          actions={d.dailyActions || []}
          logs={d.logs || []}
          documents={d.documents || []}
          cards={cards}
          selectedId={curId}
          onSelectBehavior={setSelId}
          onOpenSteps={(supportCard) => { setSupportStepId(cardIdentity(supportCard)); go("steps"); }}
          onOpenLibrary={() => go("today", "library")}
          onLog={() => go("log")}
          onUpload={() => go("docs")}
          onAsk={() => go("ask")}
          onAddBehavior={() => go("edit", "behaviors")}
          onGoals={() => go("edit", "goals")}
          onEditProfile={() => go("edit", "profile")}
        />
      )}
      {d && tab === "practice" && (
        <PracticePage
          childId={child.id}
          childName={child.name}
          child={d.child || child}
          actions={d.dailyActions || []}
          documents={d.documents || []}
          documentActivitySuggestions={d.documentActivitySuggestions || []}
          initialActionId={sp.get("activity_id")}
          hideTitle
          feedbackVisibility={isLegacy
            ? "Your care team can see updates saved in this family account."
            : "Your care team sees this update only if you have chosen to share observations with your clinic. You can change that in Clinic."}
          assignedActivities={careAssignments}
          careError={careQ.isError ? (careQ.error || "Care team activities could not load.") : null}
          onRetryCare={() => careQ.refetch()}
          initialAssignmentId={sp.get("assignment_id")}
          onSaveAssigned={saveAssigned}
          onAssignedProgress={assignedProgress}
          onRecordAssignedPractice={recordAssigned}
          initialView={section === "preferences" ? "My Routines" : undefined}
          key={section === "preferences" ? "practice-preferences" : "practice"}
          onExitRoute={() => {
            if (sp.has("activity_id") || sp.has("assignment_id")) {
              const next = new URLSearchParams(sp);
              next.delete("activity_id");
              next.delete("assignment_id");
              setSp(next, { replace: true });
            }
          }}
          onGoals={() => go("edit", "goals")}
          onHistory={() => navigate(`/History?child_id=${encodeURIComponent(child.id)}`)}
          onOpenSteps={(supportCard) => { setSupportStepId(cardIdentity(supportCard)); go("steps"); }}
          onAddBehavior={() => go("edit", "behaviors")}
        />
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
              <h2>No individualized support steps are available for this situation yet.</h2>
              <p className="pf-hint" style={{ marginTop: 6 }}>
                Add general starter support from the Support Library, review an uploaded document, or contact your care team.
              </p>
              <p role="note" className="pf-hint" style={{ marginTop: 10 }}>
                If anyone is in immediate danger, call 911 or local emergency services.
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
                <button type="button" className="pf-btn small" onClick={() => go("today", "library")}>Open Support Library</button>
                <button type="button" className="pf-btn small" onClick={() => go("docs")}>Review Documents</button>
                <button type="button" className="pf-btn small" onClick={() => go("messages")}>Contact Care Team</button>
              </div>
            </div>
          )}
        </div>
      )}
      {d && tab === "log" && <LogPanel childId={child.id} childName={child.name} logs={d.logs} behaviors={behaviors} defaultId={curId} />}
      {d && tab === "docs" && <DocsPanel child={d.child || child} documents={d.documents} />}
      {tab === "ask" && <ChatPanel childId={child.id} childName={child.name} cards={allCards} />}
      {d && tab === "clinic" && (isLegacy
        ? <div className="pf-card" data-testid="legacy-clinic-managed"><h2>Your clinic manages this family</h2><p className="pf-hint" style={{ marginTop: 6 }}>Your clinician already has access to this family account. Use Messages to reach your care team.</p><button type="button" className="pf-btn small" style={{ marginTop: 12 }} onClick={() => go("messages")}>Open Messages</button></div>
        : <ClinicPanel child={d.child || child} documents={d.documents} />)}
      {tab === "messages" && <MessagesPanel childId={child.id} childName={child.name} />}
      {tab === "edit" && section === "goals" && (
        <ParentGoalsTab
          child={d?.child || child}
          behaviors={mine}
          cards={cards}
          allCards={allCards}
          dailyActions={d?.dailyActions || []}
          planGoals={d?.planGoals || []}
          onUpload={() => go("docs")}
          onEdit={(targetSection) => go("edit", targetSection === "goals" ? "goal-editor" : targetSection)}
        />
      )}
      {tab === "edit" && section !== "goals" && (
        <ChildEditor
          child={d?.child || child}
          section={section === "goal-editor" ? "goals" : section}
          lockDemographics={isLegacy}
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [supportRequest, setSupportRequest] = useState(0);
  const incomplete = useMemo(() => children.find((c) => !isSetupComplete(c)), [children]);
  const popupChildren = useMemo(() => children.map((child) => ({ ...child, child_name: child.name })), [children]);
  const deepLinkedChild = children.find((child) => String(child.id) === String(searchParams.get("child_id")));
  const activeChild = deepLinkedChild || selected;
  const legacyPracticeRoute = searchParams.get("tab") === "today" && searchParams.get("section") === "practice";
  const activeTab = legacyPracticeRoute ? "practice" : TABS.some(([key]) => key === searchParams.get("tab")) ? searchParams.get("tab") : "today";
  const activeSection = legacyPracticeRoute ? "" : searchParams.get("section") || "";
  const goalsRoute = activeTab === "edit" && (activeSection === "goals" || activeSection === "goal-editor");
  useEffect(() => {
    if (user?.id && activeTab === "steps") markSupportPopupShown(user.id);
  }, [user?.id, activeTab]);
  const goToTab = (tab, section) => {
    const params = new URLSearchParams();
    if (tab !== "today" || section) params.set("tab", tab);
    if (section) params.set("section", section);
    if (activeChild?.id) params.set("child_id", activeChild.id);
    nav(`/ParentHome${params.size ? `?${params.toString()}` : ""}`);
  };
  const loadPopupProfile = useCallback(async (childId) => {
    const request = parentRequest();
    const headers = new Headers(request.headers);
    headers.set("X-Parent-Local-Date", currentLocalDay());
    const [dashboard, starterLibrary] = await Promise.all([
      getParentDashboard(childId, { ...request, headers }),
      getStarterLibrary(request).catch(() => []),
    ]);
    if (!Array.isArray(dashboard.supportCards)) {
      throw new Error("Support cards could not be loaded.");
    }
    const safetyPlan = dashboard.safetyPlan && String(dashboard.safetyPlan.childId) === String(childId)
      ? dashboard.safetyPlan
      : null;
    return {
      ...(dashboard.child || {}),
      safetyPlan,
      safetyPlanLoadError: !safetyPlan,
      safety_plan_uploaded: safetyPlan?.hasSafetyPlan === true,
      behaviors: parentDirectBehaviors(dashboard.child || {}, dashboard.supportCards, starterLibrary),
      documentSupportCards: Array.isArray(dashboard.documentSupportCards) ? dashboard.documentSupportCards : [],
      documentSupportCardsLoadError: !Array.isArray(dashboard.documentSupportCards),
    };
  }, []);
  const isLegacyFamily = (user?.accountType || user?.account_type) === "legacy_family";
  if (!isAuthenticated) return <Navigate to="/ParentLogin" replace />;
  if (["parent_free", "legacy_family"].includes(user?.account_type) || ["parent_free", "legacy_family"].includes(user?.accountType)) {
  if (!isLegacyFamily && (children.length === 0 || (activeChild && incomplete?.id === activeChild.id))) return <Navigate to="/ParentQuickStart" replace />;
  } else if (
    user?.app_role === "parent" || user?.role === "parent" || user?.app_role === "caregiver" ||
    user?.role === "caregiver" || ["parent", "parent_family", "family", "caregiver"].includes(user?.account_type)
  ) {
    if (children.length === 0) return <Navigate to="/ParentQuickStart" replace />;
  } else if (user?.app_role === "clinician" || user?.role === "clinician" || user?.role === "admin") {
    return <Navigate to="/ClinicianDashboard" replace />;
  } else {
    return <Navigate to={user?.account_type === "individual" || user?.invite_token ? "/ClientHome" : "/ParentLogin"} replace />;
  }

  const navGroups = createFreeCaregiverNavigation({
    activeTab,
    activeSection,
    goToTab,
    onSupportNow: () => setSupportRequest((request) => request + 1),
    onAddChild: () => nav("/ParentQuickStart?new=1"),
    onMenu: () => nav(`/Menu${activeChild?.id ? `?child_id=${encodeURIComponent(activeChild.id)}` : ""}`),
    onHistory: () => nav(`/History${activeChild?.id ? `?child_id=${encodeURIComponent(activeChild.id)}` : ""}`),
  });
  const legacyHidden = new Set(["add-child", "profiles", "clinic"]);
  if (isLegacyFamily) for (const group of navGroups) group.items = group.items.filter((item) => !legacyHidden.has(item.key));
  for (const group of navGroups) for (const item of group.items) if (item.key === "messages") { delete item.to; delete item.pages; item.active = activeTab === "messages"; item.onSelect = () => goToTab("messages"); }
  const activeItem = navGroups.flatMap((group) => group.items).find((item) => item.active);
  const currentLabel = activeItem?.label || "Home";

  return (
    <RoleAwareShell
      role="caregiver"
      roleLabel="Client Portal"
      legacyAppearance
      currentLabel={currentLabel}
      activeKey={activeItem?.key}
      navGroups={navGroups}
      mobilePrimaryKeys={["home", "support", "practice", "goals"]}
      accountName={user.first_name || user.full_name || "Caregiver"}
      accountMeta="Caregiver account"
      selectedChild={activeChild}
      childrenOptions={children}
      contextLabel="Viewing support for"
      onChildSelect={(childId) => {
        select(childId);
        const next = new URLSearchParams(searchParams);
        next.set("child_id", childId);
        setSearchParams(next, { replace: true });
      }}
      onLogout={() => { clearFocus(user?.id); clearSupportPopupSession(user?.id); logout(); }}
    >
      <div className={`pf${activeTab === "today" && !activeSection ? " np-foundations np-home" : activeTab === "practice" ? " np-foundations np-practice-host" : goalsRoute ? ` np-foundations np-goals-host${activeSection === "goal-editor" ? " np-goal-editor-host" : ""}` : ""}`}>
      <main className="pf-wrap wide">
        {activeTab === "today" && !activeSection ? (
          <PageHeader
            className="np-home-heading"
            context={`Hi ${user.first_name || "there"}`}
            title={activeChild ? `Today's Support for ${activeChild.name}` : "Choose a child profile"}
            description="Small steps for today, with support when you need it."
            actions={<Link to="/DataRequests" className="np-home-privacy">Privacy &amp; data requests</Link>}
          />
        ) : activeTab === "practice" && activeChild ? (
          <PageHeader
            className="np-practice-heading"
            title={<>Practice With {activeChild.name}</>}
            description={<span data-testid="text-practice-subtitle">Simple activities and routines you can try together.</span>}
            actions={<Link to="/DataRequests" className="np-practice-privacy">Privacy &amp; data requests</Link>}
          />
        ) : goalsRoute && activeChild ? (
          <PageHeader
            className="np-goals-heading"
            context={activeChild.name}
            title={activeSection === "goal-editor" ? "Edit Goals" : "Goals & Milestones"}
            description="Family goals, care team goals and goals from plans, each in one place."
            actions={<Link to="/DataRequests" className="np-goals-privacy">Privacy &amp; data requests</Link>}
          />
        ) : <div className="pf-hero"><p className="pf-eyebrow">Hi {user.first_name}</p>
        <h1 style={{ fontSize: "clamp(1.8rem,5vw,2.6rem)", margin: "4px 0 10px" }}>
          {activeChild
            ? activeTab === "practice" ? <>Practice With {activeChild.name}</>
              : <>{activeTab === "today" && !activeSection ? "Today's Support" : currentLabel} <span className="pf-hero-child" style={{ fontWeight: 400 }}>for {activeChild.name}</span></>
            : "Choose a child profile"}
        </h1>
        {activeChild && activeTab === "practice" && <p className="pf-hero-sub" style={{ margin: "0 0 8px" }} data-testid="text-practice-subtitle">Simple activities and routines you can try together.</p>}
        <Link to="/DataRequests" className="text-sm underline underline-offset-4" style={{ color: "hsl(var(--primary))" }}>Privacy &amp; data requests</Link></div>}
        {activeTab === "today" && !activeSection && <button type="button" className="pf-help-cta" disabled={!activeChild} onClick={() => setSupportRequest((request) => request + 1)} data-testid="button-dashboard-help-now"><span className="ico"><AlertTriangle size={20} /></span><span><strong>I Need Help Right Now</strong><small>{activeChild ? "Open support steps for a stressful moment" : "Choose which child needs support first"}</small></span></button>}
        {activeChild ? <Body key={activeChild.id} child={activeChild} /> : (
          <section className="pf-card" data-testid="choose-child-before-support">
            <h2>Which child needs support?</h2>
            <p className="pf-hint">Choose a child from the selector above to load the right activities, goals, documents, and support steps.</p>
          </section>
        )}
      </main>
      </div>
      <SupportNowOverlay
        user={user}
        children={popupChildren}
        isIndividual={children.length === 1}
        loadProfileForChild={loadPopupProfile}
        logEngagement={false}
        openRequest={supportRequest}
        autoOpen={activeTab === "today" && !activeSection}
        autoOpenReady={children.length > 0}
        parentDirect
        initialChildId={activeChild?.id || null}
      />
    </RoleAwareShell>
  );
}
