import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Activity, AlertCircle, ArrowDownRight, ArrowRight, ArrowUpRight, Baby, BookOpen, CalendarDays, Check, ChevronRight, ClipboardList, FileText, Heart, MessageCircle, ShieldCheck, Sparkles, Star, UserRound, Wind, Zap } from "lucide-react";
import { base44 } from "@/api/entities";
import { useAuth } from "@/lib/AuthContext";
import RoleAwareShell from "@/components/navigation/RoleAwareShell";
import { createClientHomeNavigation, mobilePrimaryKeysForRole } from "@/components/navigation/navigationModels";
import { PageHeader } from "@workspace/neuropathways-foundations/components/ui/page-header";
import { Button } from "@workspace/neuropathways-foundations/components/ui/button";
import "@workspace/neuropathways-foundations/scoped.css";

const ROUTES = [
  { label: "Help right now", route: "/HelpNow", icon: ShieldCheck, note: "Plan-guided support" },
  { label: "Log a behavior", route: "/LogBehavior", icon: ClipboardList, note: "Add a real observation" },
  { label: "Goals & milestones", route: "/GoalsMilestones", icon: Star, note: "Steps you are working on" },
  { label: "Progress reports", route: "/ProgressReports", icon: Activity, note: "See patterns over time" },
  { label: "Documents", route: "/DocumentCenter", icon: FileText, note: "Plans and shared files" },
  { label: "Messages", route: "/Messages", icon: MessageCircle, note: "Stay in touch with your team" },
  { label: "Ask a question", route: "/AIChat", icon: Sparkles, note: "Get practical guidance" },
  { label: "Rewards", route: "/RewardTracker", icon: Heart, note: "Celebrate progress" },
];

const value = (row, ...keys) => {
  for (const key of keys) if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== "") return row[key];
  return null;
};
const dateValue = (row) => value(row, "createdDate", "created_date", "date", "loggedAt", "logged_at", "updatedDate", "updated_date");
const labelOf = (row) => value(row, "behaviorName", "behavior_name", "behaviorType", "behavior_type", "name", "title", "goalName", "goal_name", "description");
const goalLabel = (goal) => typeof goal === "string" ? goal : labelOf(goal);
const dateLabel = (date, options = { month: "short", day: "numeric" }) => {
  if (!date) return "Date not recorded";
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? "Date not recorded" : new Intl.DateTimeFormat(undefined, options).format(parsed);
};
const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || "there";
const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
};

function Stat({ label, count, foot, icon: Icon }) {
  return <div className="ch-stat np-surface-separated"><span className="ch-stat-icon"><Icon size={17} strokeWidth={1.8} /></span><strong>{count}</strong><span className="ch-stat-label">{label}</span>{foot && <small>{foot}</small>}</div>;
}

function EmptyMessage({ title, children }) {
  return <div className="ch-empty"><span className="ch-empty-mark"><Wind size={19} /></span><div><strong>{title}</strong><p>{children}</p></div></div>;
}

function LoadingState() {
  return <div className="ch-loading" aria-label="Loading your home" role="status"><div className="ch-skeleton ch-skel-wide" /><div className="ch-skel-row"><div className="ch-skeleton" /><div className="ch-skeleton" /><div className="ch-skeleton" /></div><div className="ch-skel-columns"><div className="ch-skeleton" /><div className="ch-skeleton" /></div></div>;
}

export default function ClientHome({ onSupportNow }) {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isIndividualClient = user?.account_type === "individual";
  const practiceView = !isIndividualClient && new URLSearchParams(location.search).get("view") === "practice";
  const [selectedId, setSelectedId] = useState(() =>
    new URLSearchParams(location.search).get("child_id") || user?.children?.[0]?.id || user?.child_id || user?.id || null
  );
  const [portal, setPortal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestSequence = useRef(0);

  const sessionChildren = useMemo(() => Array.isArray(user?.children) ? user.children : [], [user?.children]);
  useEffect(() => {
    if (!selectedId && sessionChildren.length) setSelectedId(sessionChildren[0]?.id || null);
  }, [selectedId, sessionChildren]);

  const loadPortal = useCallback(async (id) => {
    const requestId = ++requestSequence.current;
    if (!id || !user?.id || !user?.invite_token) {
      setLoading(false);
      setError(new Error(isIndividualClient
        ? "Your session could not be matched to your profile. Please sign in again."
        : "Your session could not be matched to a child profile. Please sign in again."));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await base44.functions.invoke("getClientPortalData", {
        child_id: id,
        account_id: user.id,
        invite_token: user.invite_token,
      });
       if (!response?.data) throw new Error(isIndividualClient
         ? "We couldn't load your information."
         : "We couldn't load this child's information.");
      if (requestId !== requestSequence.current) return;
      setPortal(response.data);
    } catch (loadError) {
      if (requestId !== requestSequence.current) return;
      setPortal(null);
      setError(loadError);
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [user?.id, user?.invite_token, isIndividualClient]);

  useEffect(() => {
    if (selectedId) loadPortal(selectedId);
    else {
      requestSequence.current += 1;
      setLoading(false);
      setError(new Error("No child profile is connected to this session. Please sign in again or contact your care team."));
    }
  }, [selectedId, loadPortal]);

  const child = portal?.child || sessionChildren.find((item) => item.id === selectedId) || {
    id: selectedId,
    childName: isIndividualClient ? user?.display_name || user?.full_name || "You" : user?.child_name || "Your child",
  };
  const childName = value(child, "childName", "child_name", "name") ||
    user?.child_name ||
    (isIndividualClient ? firstName(user?.display_name || user?.full_name) : "Your child");
  const plans = Array.isArray(portal?.plans) ? portal.plans : [];
  const interventionPlans = Array.isArray(portal?.interventionPlans) ? portal.interventionPlans : [];
  const profileGoals = Array.isArray(portal?.profile?.goals) ? portal.profile.goals : [];
  const planGoals = plans.flatMap((plan, planIndex) => {
    const listedGoals = Array.isArray(plan.goals) ? plan.goals : [];
    const explicitGoals = [
      value(plan, "goal", "goalName", "goal_name", "planGoal", "plan_goal"),
      value(plan, "goalDescription", "goal_description"),
    ].filter(Boolean);
    return [...listedGoals, ...explicitGoals].filter(Boolean).map((goal, goalIndex) =>
      typeof goal === "string" ? { id: `plan-goal-${planIndex}-${goalIndex}`, name: goal } : goal
    );
  });
  const goals = [...profileGoals, ...planGoals];
  const logs = useMemo(() => (Array.isArray(portal?.behaviorLogs) ? [...portal.behaviorLogs] : [])
    .sort((a, b) => new Date(dateValue(b) || 0) - new Date(dateValue(a) || 0)), [portal?.behaviorLogs]);
  const documents = Array.isArray(portal?.documents) ? portal.documents : [];
  const messages = Array.isArray(portal?.messages) ? portal.messages : [];
  const siblings = useMemo(() => {
    const fromData = Array.isArray(portal?.siblings) ? portal.siblings : [];
    const combined = [...sessionChildren, ...fromData];
    const unique = new Map();
    combined.forEach((item) => { if (item?.id) unique.set(item.id, item); });
    return [...unique.values()];
  }, [portal?.siblings, sessionChildren]);
  const unread = messages.filter((message) => value(message, "isRead", "is_read") === false && value(message, "toUserId", "to_user_id") === user?.id).length;
  const overviewCount = (arr) => arr.length.toLocaleString();
  const go = (route) => navigate(`${route}?child_id=${encodeURIComponent(selectedId || "")}`);
  const greetingName = firstName(user?.display_name || user?.full_name || user?.primary_contact || user?.family_name || childName);
  const weeklyLogs = logs.filter((log) => {
    const timestamp = new Date(dateValue(log) || 0).getTime();
    return timestamp >= Date.now() - 7 * 24 * 60 * 60 * 1000 && timestamp <= Date.now();
  });
  const homeChildren = siblings.length ? siblings : [child];
  const originalNavigation = createClientHomeNavigation({
    isIndividualClient,
    selectedId,
    onSupportNow,
    activePage: practiceView ? "practice" : "home",
  });
  const navigationItems = originalNavigation.flatMap((group) => group.items);
  const primaryKeys = ["practice", "ai-chat", "support", "documents", "messages", "settings"];
  const navigationGroups = [
    { label: "", items: navigationItems.filter((item) => item.key === "home").map((item) => ({ ...item, label: "Dashboard", icon: UserRound })) },
    { label: "", items: primaryKeys.map((key) => navigationItems.find((item) => item.key === key)).filter(Boolean).map((item) => ({
      ...item,
      label: item.key === "ai-chat" ? "NeuroPath AI" : item.key === "support" ? "Help Now" : item.label,
    })) },
    { label: "More tools", items: navigationItems.filter((item) => item.key !== "home" && !primaryKeys.includes(item.key)) },
  ];

  if (!isAuthenticated || !user?.invite_token) return <Navigate to="/UsernameLogin" replace />;

  return (
    <RoleAwareShell
      role={isIndividualClient ? "individual" : "caregiver"}
      roleLabel="Client Portal"
      showChildLinks={!isIndividualClient}
      currentLabel={practiceView ? "Practice" : "Dashboard"}
      activeKey={practiceView ? "practice" : "home"}
      navGroups={navigationGroups}
      mobilePrimaryKeys={isIndividualClient ? mobilePrimaryKeysForRole("individual") : ["home", "support", "practice", "logs"]}
      accountName={isIndividualClient ? firstName(user?.display_name || user?.full_name || childName) : `${firstName(childName)}’s family`}
      accountMeta={isIndividualClient ? "Individual account" : "Family account"}
      selectedChild={isIndividualClient ? null : siblings.find((sibling) => sibling.id === selectedId) || child}
      childrenOptions={isIndividualClient ? [] : homeChildren}
      contextLabel={isIndividualClient ? undefined : "Viewing support for"}
      onChildSelect={isIndividualClient ? undefined : setSelectedId}
      onLogout={logout}
    >
    <div className="client-home np-foundations">
      <style>{`
        .client-home{min-height:100dvh;background:var(--np-color-background);color:var(--np-color-foreground);font-family:var(--np-font-sans)}
        .client-home .ch-shell{width:min(1100px,100%);margin-inline:auto;padding-inline:var(--np-space-gutter)}
        .client-home .ch-main{display:grid;gap:var(--np-space-section);padding-block:var(--np-space-section)}
        .client-home .ch-hero-inner{display:grid;gap:var(--np-space-related-lg);padding-top:var(--np-space-section)}
        .client-home .ch-hero-inner>header{display:grid;gap:4px}
        .client-home .ch-hero-inner>header h1{margin:0;font:700 var(--np-text-page-title)/var(--np-leading-page-title) var(--np-font-display);overflow-wrap:anywhere}
        .client-home .ch-hero-inner>header p{margin:0;color:var(--np-color-muted-foreground)}
        .client-home .ch-urgent-banner{display:flex;align-items:center;gap:var(--np-space-related);width:100%;min-height:var(--np-space-control);padding:var(--np-space-related-lg);border-radius:var(--np-radius);text-align:left;white-space:normal}
        .client-home .ch-urgent-icon{display:grid;place-items:center;width:36px;height:36px;flex:none}
        .client-home .ch-urgent-banner>span:nth-child(2){display:grid;flex:1}
        .client-home .ch-urgent-banner small{font-weight:400}
        .client-home .ch-topline{margin-bottom:var(--np-space-related-lg)}
        .client-home .ch-hero-stats,.client-home .ch-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--np-space-related)}
        .client-home .ch-stat{display:grid;grid-template-columns:1fr auto;align-items:center;gap:4px 8px;padding:var(--np-space-card);border-radius:var(--np-radius);background:var(--np-color-card);box-shadow:none}
        .client-home .ch-stat strong{font:700 var(--np-text-section-title)/1.2 var(--np-font-display)}
        .client-home .ch-stat-label{color:var(--np-color-muted-foreground);font-size:var(--np-text-support-sm);font-weight:600}
        .client-home .ch-stat small{grid-column:1/-1;color:var(--np-color-muted-foreground);font-size:var(--np-text-support-sm)}
        .client-home .ch-stat-icon,.client-home .ch-resource-icon,.client-home .ch-empty-mark,.client-home .ch-child-avatar{display:grid;place-items:center;border-radius:10px;background:var(--np-color-accent);color:var(--np-color-primary)}
        .client-home .ch-stat-icon{grid-column:2;grid-row:1/3;width:34px;height:34px}
        .client-home .ch-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(240px,290px);gap:var(--np-space-related-lg);align-items:start}
        .client-home .ch-primary,.client-home .ch-side{display:grid;gap:var(--np-space-related-lg);min-width:0}
        .client-home .ch-side{position:sticky;top:16px}
        .client-home .ch-panel,.client-home .ch-plan-card,.client-home .ch-child-card,.client-home .ch-error{min-width:0;padding:var(--np-space-card);border:1px solid var(--np-color-border);border-radius:var(--np-radius);background:var(--np-color-card);color:var(--np-color-foreground)}
        .np-legacy .client-home .ch-panel,.np-legacy .client-home .ch-plan-card,.np-legacy .client-home .ch-child-card,.np-legacy .client-home .ch-error,.np-legacy .client-home .ch-stat{background:var(--np-color-card);border-color:var(--np-color-border);color:var(--np-color-foreground)}
        .client-home .ch-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--np-space-related);margin-bottom:var(--np-space-related-lg)}
        .client-home .ch-panel h3,.client-home .ch-plan-card h3{margin:0;font:600 var(--np-text-card-title)/var(--np-leading-card-title) var(--np-font-display)}
        .client-home .ch-panel-sub,.client-home .ch-plan-card p,.client-home .ch-empty p{margin:4px 0 0;color:var(--np-color-muted-foreground);font-size:var(--np-text-support)}
        .client-home .ch-empty{display:flex;align-items:flex-start;gap:var(--np-space-related);padding-block:var(--np-space-related-lg)}
        .client-home .ch-empty strong{display:block}
        .client-home .ch-text-link{display:inline-flex;align-items:center;gap:6px;min-height:var(--np-space-control);padding:6px 0;border:0;background:transparent;color:var(--np-color-primary);font:600 var(--np-text-support)/1.4 var(--np-font-sans);cursor:pointer}
        .client-home .ch-activity{display:grid;grid-template-columns:36px minmax(0,1fr) auto;align-items:center;gap:var(--np-space-related);padding:var(--np-space-related) 0;border-top:1px solid var(--np-color-border)}
        .client-home .ch-activity:first-child{border-top:0;padding-top:0}
        .client-home .ch-activity-icon,.client-home .ch-empty-mark{display:grid;place-items:center;width:36px;height:36px;border-radius:10px;background:var(--np-color-muted);color:var(--np-color-primary)}
        .client-home .ch-activity-name,.client-home .ch-resource strong{font-weight:650;overflow-wrap:anywhere}
        .client-home .ch-activity-context,.client-home .ch-activity-date,.client-home .ch-resource small{color:var(--np-color-muted-foreground);font-size:var(--np-text-support-sm);overflow-wrap:anywhere}
        .client-home .ch-plan-head,.client-home .ch-plan-foot{display:flex;align-items:center;justify-content:space-between;gap:var(--np-space-list);color:var(--np-color-muted-foreground);font-size:var(--np-text-support-sm)}
        .client-home .ch-plan-foot{margin-top:var(--np-space-related);padding-top:var(--np-space-related);border-top:1px solid var(--np-color-border)}
        .client-home .ch-resource{display:grid;grid-template-columns:32px minmax(0,1fr) auto;align-items:center;gap:var(--np-space-related);width:100%;min-height:var(--np-space-control);padding:var(--np-space-list) 0;border:0;border-top:1px solid var(--np-color-border);background:transparent;color:var(--np-color-foreground);text-align:left;cursor:pointer}
        .client-home .ch-resource-icon{width:30px;height:30px}
        .client-home .ch-resource strong,.client-home .ch-resource small{display:block}
        .client-home .ch-children-section{display:grid;gap:var(--np-space-related);margin:0}
        .client-home .ch-children-section>h2{display:flex;align-items:center;gap:8px;margin:0;font-size:var(--np-text-section-title)}
        .client-home .ch-children-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:var(--np-space-related)}
        .client-home .ch-child-overview,.client-home .ch-child-actions{display:flex;align-items:center;gap:var(--np-space-related)}
        .client-home .ch-child-overview{width:100%;padding:0;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer}
        .client-home .ch-child-avatar{width:44px;height:44px;flex:none;font-weight:700}
        .client-home .ch-child-copy{display:grid;min-width:0;flex:1}
        .client-home .ch-child-copy small{color:var(--np-color-muted-foreground);overflow-wrap:anywhere}
        .client-home .ch-child-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin-top:var(--np-space-related)}
        .client-home .ch-child-actions button{display:grid;justify-items:center;gap:4px;min-height:var(--np-space-control);padding:6px;border:1px solid var(--np-color-border);border-radius:var(--np-radius);background:var(--np-color-background);color:var(--np-color-foreground);font:600 var(--np-text-support-sm)/1.25 var(--np-font-sans);cursor:pointer}
        .client-home .ch-child-actions button:first-child{color:var(--np-color-destructive)}
        .client-home .ch-error{display:flex;align-items:center;justify-content:space-between;gap:var(--np-space-related)}
        .client-home .ch-error p{color:var(--np-color-muted-foreground)}
        .client-home .ch-error button{min-height:var(--np-space-control);white-space:normal}
        .client-home .ch-skeleton{min-height:112px;border-radius:var(--np-radius);background:var(--np-color-muted);animation:client-skeleton 1.4s ease-in-out infinite alternate}
        .client-home .ch-skel-wide{height:120px}.client-home .ch-skel-row,.client-home .ch-skel-columns{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--np-space-related)}
        .client-home .ch-skel-columns{grid-template-columns:1.4fr 1fr}.client-home .ch-skel-columns .ch-skeleton{height:220px}
        .client-home .ch-footer{display:flex;justify-content:space-between;gap:var(--np-space-related);padding-block:var(--np-space-related) calc(var(--np-space-section) + 66px);border-top:1px solid var(--np-color-border);color:var(--np-color-muted-foreground);font-size:var(--np-text-support-sm)}
        .client-home .ch-footer-note{display:flex;align-items:center;gap:7px}
        @keyframes client-skeleton{to{opacity:.55}}
        @media(max-width:900px){.client-home .ch-layout{grid-template-columns:minmax(0,1fr)}.client-home .ch-side{position:static}}
        @media(max-width:767px){.client-home .ch-shell{padding-inline:16px}.client-home .ch-hero-stats,.client-home .ch-stats,.client-home .ch-skel-row{grid-template-columns:1fr}.client-home .ch-stat{padding:10px}.client-home .ch-stat-label{font-size:11px}.client-home .ch-stat small{font-size:10px}.client-home .ch-skel-columns{grid-template-columns:1fr}.client-home .ch-skel-columns .ch-skeleton:last-child{display:none}.client-home .ch-footer{flex-direction:column;padding-bottom:calc(var(--np-space-section) + 66px + env(safe-area-inset-bottom))}}
        @media(prefers-reduced-motion:reduce){.client-home .ch-skeleton{animation:none}}
      `}</style>
      <section className="ch-hero">
        <div className="ch-shell ch-hero-inner">
          <PageHeader context={`${greeting()},`} title={greetingName} description={isIndividualClient ? "Your personal support hub" : "Your family's behavioral support hub"} />
          <div className="ch-hero-stats" aria-label="Dashboard summary">
            <Stat label={isIndividualClient ? "My Plans" : "Children"} count={loading ? "—" : isIndividualClient ? overviewCount(plans) : overviewCount(homeChildren)} icon={isIndividualClient ? BookOpen : Baby} />
            <Stat label="Logs This Week" count={loading ? "—" : overviewCount(weeklyLogs)} foot={homeChildren.length > 1 ? `For ${childName}` : undefined} icon={Activity} />
            <Stat label="Messages" count={loading ? "—" : unread} icon={MessageCircle} />
          </div>
        </div>
      </section>
      <main className="ch-shell ch-main">
        <Button type="button" variant="destructive" className="ch-urgent-banner" data-testid="button-client-help-now" onClick={() => onSupportNow ? onSupportNow() : go("/HelpNow")}>
          <span className="ch-urgent-icon"><AlertCircle size={23} /></span>
          <span><strong>I Need Help Right Now</strong><small>Get guidance from your support plans</small></span>
          <ChevronRight size={20} />
        </Button>
        {!practiceView && !loading && !error && (
          <section className="ch-children-section" aria-label={isIndividualClient ? "My profile" : "My Children"}>
            <h2><Baby size={16} />{isIndividualClient ? "My Profile" : "My Children"}</h2>
            <div className="ch-children-grid">
              {homeChildren.map((person) => {
                const name = value(person, "childName", "child_name", "name") || childName;
                const route = (path) => navigate(`${path}?child_id=${encodeURIComponent(person.id || selectedId || "")}`);
                return <article className="ch-child-card" key={person.id}>
                  <button type="button" className="ch-child-overview" onClick={() => route("/ChildProfile")}>
                    <span className="ch-child-avatar">{String(name).charAt(0).toUpperCase()}</span>
                    <span className="ch-child-copy"><strong>{name}</strong><small>{[person.age ? `Age ${person.age}` : null, person.diagnosis].filter(Boolean).join(" · ") || "View profile"}</small></span>
                    <ChevronRight size={17} />
                  </button>
                  <div className="ch-child-actions">
                    <button type="button" onClick={() => { setSelectedId(person.id); onSupportNow ? onSupportNow() : route("/HelpNow"); }}><Zap size={15} />Help Now</button>
                    <button type="button" onClick={() => route("/LogBehavior")}><ClipboardList size={15} />Log</button>
                    <button type="button" onClick={() => route("/ChildProfile")}><BookOpen size={15} />Plans</button>
                  </div>
                </article>;
              })}
            </div>
          </section>
        )}

        {practiceView ? (
          loading ? <LoadingState /> : error ? (
            <div className="ch-error" role="alert"><div><strong>Practice could not load.</strong><p>{error?.message || "Your saved information is safe. Try again in a moment."}</p></div><Button variant="outline" type="button" onClick={() => loadPortal(selectedId)}>Try again</Button></div>
          ) : (
            <section className="ch-panel" data-testid="panel-practice">
              <div className="ch-panel-head">
                <div>
                  <p className="ch-eyebrow">Familiar steps from your shared plan</p>
                  <h2>Practice</h2>
                  <p className="ch-panel-sub">Use a calm, ordinary moment. Keep to guidance already shared by your care team.</p>
                </div>
              </div>
              {plans.length || interventionPlans.length ? (
                <>
                  <h3>{value(interventionPlans[0] || plans[0], "title", "planName", "plan_name", "behaviorName", "behavior_name") || "Your shared support plan"}</h3>
                  <p className="ch-subtitle">
                    {value(interventionPlans[0] || plans[0], "replacementSkill", "replacement_skill", "strategySteps", "strategy_steps", "description", "summary") ||
                      `Review one familiar support step with ${isIndividualClient ? "yourself" : childName}.`}
                  </p>
                  {goals.length > 0 && <p className="ch-panel-sub">Connected goal: {goalLabel(goals[0])}</p>}
                  <button type="button" className="ch-text-link" onClick={() => go("/HelpNow")}>Open support steps <ArrowRight size={14} /></button>
                </>
              ) : (
                <EmptyMessage title="No shared plan yet">
                  <>Practice guidance will appear here when your care team shares a plan.</>
                </EmptyMessage>
              )}
            </section>
          )
        ) : loading ? <LoadingState /> : error ? (
          <div className="ch-error" role="alert"><div><strong>We couldn’t open your home just now.</strong><p>{error?.message || "Your saved information is safe. Try again in a moment."}</p></div><Button variant="outline" type="button" onClick={() => loadPortal(selectedId)}>Try again</Button></div>
        ) : (
          <div className="ch-layout">
            <section className="ch-primary">
              <div className="ch-stats" aria-label="Saved information overview">
                <Stat label="Current plans" count={overviewCount(plans)} foot={plans.length ? "Shared by your care team" : "No plan shared yet"} icon={BookOpen} />
                <Stat label="Plan/profile goals" count={overviewCount(goals)} foot={goals.length ? "From a shared plan or profile" : "No goal recorded"} icon={Star} />
                <Stat label="Observations" count={overviewCount(logs)} foot={logs.length ? "Behavior notes on file" : "No logs on file"} icon={Activity} />
              </div>

              <section className="ch-panel">
                 <div className="ch-panel-head"><div><h3>Recent notes</h3><p className="ch-panel-sub">A short view of what has been recorded {isIndividualClient ? "for you" : `for ${childName}`}.</p></div><button type="button" className="ch-text-link" onClick={() => go("/ProgressReports")}>View progress <ArrowRight size={14} /></button></div>
                {logs.length ? <div className="ch-activity-list">{logs.slice(0, 4).map((log, index) => {
                  const name = labelOf(log) || "Behavior observation";
                  const context = value(log, "context", "notes", "description", "antecedent");
                  return <div className="ch-activity" key={log.id || `${name}-${index}`}><span className="ch-activity-icon"><Activity size={16} /></span><div><div className="ch-activity-name">{name}</div>{context && <div className="ch-activity-context">{context}</div>}</div><span className="ch-activity-date">{dateLabel(dateValue(log))}</span></div>;
                })}</div> : <EmptyMessage title="No behavior logs yet"><>When an observation is recorded, it will appear here. You can add one whenever you’re ready.</></EmptyMessage>}
              </section>

               {goals.length > 0 ? <section className="ch-panel"><div className="ch-panel-head"><div><h3>Goals & milestones</h3><p className="ch-panel-sub">Plan and profile goals currently recorded {isIndividualClient ? "for you" : `for ${childName}`}.</p></div><button type="button" className="ch-text-link" onClick={() => go("/GoalsMilestones")}>See goals <ArrowRight size={14} /></button></div><div className="ch-activity-list">{goals.slice(0, 3).map((goal, index) => <div className="ch-activity" key={goal.id || index}><span className="ch-activity-icon"><Check size={16} /></span><div><div className="ch-activity-name">{goalLabel(goal) || "Saved goal"}</div>{value(goal, "description", "details") && <div className="ch-activity-context">{value(goal, "description", "details")}</div>}</div><span className="ch-activity-date">{value(goal, "status", "goalStatus", "goal_status") || "Recorded"}</span></div>)}</div></section> : <section className="ch-panel"><div className="ch-panel-head"><div><h3>Goals & milestones</h3><p className="ch-panel-sub">A clear view of the steps you’re working on.</p></div><button type="button" className="ch-text-link" onClick={() => go("/GoalsMilestones")}>Open goals <ArrowRight size={14} /></button></div><EmptyMessage title="No plan or profile goals recorded"><>There are no goal entries in {isIndividualClient ? "your" : `${childName}’s`} profile or shared plans yet.</></EmptyMessage></section>}
            </section>

            <aside className="ch-side">
               {plans.length > 0 ? <section className="ch-plan-card"><div className="ch-plan-head"><ShieldCheck size={15} /> Clinician-supported</div><h3>{value(plans[0], "title", "planName", "plan_name", "behaviorName", "behavior_name") || "Your support plan"}</h3><p>{value(plans[0], "description", "summary", "behaviorDescription", "behavior_description", "strategySteps", "strategy_steps") || `Your care team has shared plan guidance ${isIndividualClient ? "for you" : `for ${childName}`}.`}</p><div className="ch-plan-foot"><span>{interventionPlans.length ? `${interventionPlans.length} support ${interventionPlans.length === 1 ? "guide" : "guides"}` : "Saved plan"}</span><button type="button" className="ch-text-link" onClick={() => go("/HelpNow")}>Open <ArrowUpRight size={13} /></button></div></section> : <section className="ch-plan-card"><div className="ch-plan-head"><BookOpen size={15} /> Plan library</div><h3>No plan shared yet</h3><p>Your home is ready. When your clinician shares a plan, it will be available here.</p><div className="ch-plan-foot"><span>Nothing is missing</span><span><ArrowDownRight size={14} /></span></div></section>}

               <section className="ch-panel ch-side-panel"><div className="ch-panel-head"><div><h3>Go to</h3><p className="ch-panel-sub">Useful places, all in one spot.</p></div></div>{ROUTES.map(({ label, route, icon: Icon, note }) => <button type="button" className="ch-resource" key={route} onClick={() => go(route)}><span className="ch-resource-icon"><Icon size={15} /></span><span><strong>{label}{route === "/Messages" && unread > 0 ? ` · ${unread} unread` : ""}</strong><small>{note}</small></span><ChevronRight className="ch-resource-arrow" size={15} /></button>)}<button type="button" className="ch-resource" onClick={() => go("/ChildProfile")}><span className="ch-resource-icon"><UserRound size={15} /></span><span><strong>{isIndividualClient ? "Your profile" : "Child profile"}</strong><small>Details shared with your team</small></span><ChevronRight className="ch-resource-arrow" size={15} /></button></section>

              {documents.length > 0 && <section className="ch-panel ch-side-panel"><div className="ch-panel-head"><div><h3>Shared documents</h3><p className="ch-panel-sub">{documents.length} {documents.length === 1 ? "document" : "documents"} available.</p></div><button className="ch-text-link" type="button" onClick={() => go("/DocumentCenter")} aria-label="Open documents"><ArrowRight size={14} /></button></div>{documents.slice(0, 2).map((doc, index) => <button type="button" className="ch-resource" key={doc.id || index} onClick={() => go("/DocumentCenter")}><span className="ch-resource-icon"><FileText size={15} /></span><span><strong>{value(doc, "title", "name", "fileName", "file_name") || "Shared document"}</strong><small>{value(doc, "documentType", "document_type", "category") || "Open document center"}</small></span><ChevronRight className="ch-resource-arrow" size={15} /></button>)}</section>}
            </aside>
          </div>
        )}
      </main>
       <footer className="ch-shell ch-footer"><span className="ch-footer-note"><CalendarDays size={13} /> {isIndividualClient ? "Your space, built around your care plan." : "Your family space, built around your care plan."}</span><span>Questions? Your care team is here to help.</span></footer>
    </div>
    </RoleAwareShell>
  );
}