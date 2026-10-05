import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, BookOpen, CalendarDays, Check, ChevronRight, ClipboardList, FileText, Heart, LifeBuoy, Mail, MessageCircle, Settings, ShieldCheck, Sparkles, Star, Target, UserRound, Wind } from "lucide-react";
import { base44 } from "@/api/entities";
import { useAuth } from "@/lib/AuthContext";
import RoleAwareShell from "@/components/navigation/RoleAwareShell";

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

function Stat({ label, count, foot, icon: Icon }) {
  return <div className="ch-stat"><span className="ch-stat-icon"><Icon size={17} strokeWidth={1.8} /></span><strong>{count}</strong><span className="ch-stat-label">{label}</span><small>{foot}</small></div>;
}

function EmptyMessage({ title, children }) {
  return <div className="ch-empty"><span className="ch-empty-mark"><Wind size={19} /></span><div><strong>{title}</strong><p>{children}</p></div></div>;
}

function LoadingState() {
  return <div className="ch-loading" aria-label="Loading your home"><div className="ch-skeleton ch-skel-wide" /><div className="ch-skel-row"><div className="ch-skeleton" /><div className="ch-skeleton" /><div className="ch-skeleton" /></div><div className="ch-skel-columns"><div className="ch-skeleton" /><div className="ch-skeleton" /></div></div>;
}

export default function ClientHome({ onSupportNow }) {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isIndividualClient = user?.account_type === "individual";
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
  const unread = messages.filter((message) => value(message, "isRead", "is_read") === false && value(message, "toUserId", "to_user_id") === user.id).length;
  const overviewCount = (arr) => arr.length.toLocaleString();
  const go = (route) => navigate(`${route}?child_id=${encodeURIComponent(selectedId || "")}`);
  const portalSubject = isIndividualClient ? "you" : childName;
  const navigationRoute = (route) => selectedId
    ? `${route}?child_id=${encodeURIComponent(selectedId)}`
    : route;
  const navigationGroups = isIndividualClient
    ? [
        {
          label: "Your space",
          items: [
            { key: "home", label: "Home", icon: BookOpen, to: "/ClientHome", active: true, pages: ["ClientHome"] },
            { key: "support", label: "Support Now", icon: LifeBuoy, support: true, onSelect: () => onSupportNow?.() },
            { key: "support-steps", label: "Support Steps", icon: ShieldCheck, to: navigationRoute("/HelpNow") },
          ],
        },
        {
          label: "Your plan",
          items: [
            { key: "goals", label: "Goals", icon: Target, to: navigationRoute("/GoalsMilestones") },
            { key: "progress", label: "Progress", icon: Activity, to: navigationRoute("/ProgressReports") },
            { key: "documents", label: "Documents", icon: FileText, to: navigationRoute("/DocumentCenter") },
            { key: "logs", label: "Logs", icon: ClipboardList, to: navigationRoute("/LogBehavior") },
            { key: "ai-chat", label: "AI Chat", icon: Sparkles, to: navigationRoute("/AIChat") },
            { key: "rewards", label: "Rewards", icon: Heart, to: navigationRoute("/RewardTracker") },
          ],
        },
        {
          label: "Account",
          items: [
            { key: "messages", label: "Messages", icon: Mail, to: navigationRoute("/Messages") },
            { key: "settings", label: "Settings", icon: Settings, to: navigationRoute("/Settings") },
          ],
        },
      ]
    : [
        {
          label: "Today",
          items: [
            { key: "home", label: "Home", icon: BookOpen, to: "/ClientHome", active: true, pages: ["ClientHome"] },
            { key: "support", label: "Support Now", icon: LifeBuoy, support: true, onSelect: () => onSupportNow?.() },
          ],
        },
        {
          label: "Care plan",
          items: [
            { key: "support-steps", label: "Support Steps", icon: ShieldCheck, to: navigationRoute("/HelpNow") },
            { key: "goals", label: "Goals", icon: Target, to: navigationRoute("/GoalsMilestones") },
            { key: "documents", label: "Documents", icon: FileText, to: navigationRoute("/DocumentCenter") },
            { key: "logs", label: "Logs", icon: ClipboardList, to: navigationRoute("/LogBehavior") },
            { key: "ai-chat", label: "AI Chat", icon: Sparkles, to: navigationRoute("/AIChat") },
            { key: "progress", label: "Progress", icon: Activity, to: navigationRoute("/ProgressReports") },
            { key: "rewards", label: "Rewards", icon: Heart, to: navigationRoute("/RewardTracker") },
          ],
        },
        {
          label: "Family",
          items: [
            { key: "profiles", label: "Child Profiles", icon: UserRound, to: navigationRoute("/ChildProfile") },
          ],
        },
        {
          label: "Account",
          items: [
            { key: "messages", label: "Messages", icon: Mail, to: navigationRoute("/Messages") },
            { key: "settings", label: "Settings", icon: Settings, to: navigationRoute("/Settings") },
          ],
        },
      ];

  if (!isAuthenticated || !user?.invite_token) return <Navigate to="/UsernameLogin" replace />;

  return (
    <RoleAwareShell
      role={isIndividualClient ? "individual" : "caregiver"}
      roleLabel={isIndividualClient ? "Your personal space" : "Caregiver workspace"}
      currentLabel="Home"
      activeKey="home"
      navGroups={navigationGroups}
      mobilePrimaryKeys={isIndividualClient ? ["home", "support", "progress"] : ["home", "support", "logs"]}
      accountName={isIndividualClient ? firstName(user?.display_name || user?.full_name || childName) : `${firstName(childName)}’s family`}
      accountMeta={isIndividualClient ? "Individual account" : "Family account"}
      selectedChild={isIndividualClient ? null : siblings.find((sibling) => sibling.id === selectedId) || child}
      childrenOptions={isIndividualClient ? [] : siblings}
      contextLabel={isIndividualClient ? undefined : "Viewing support for"}
      onChildSelect={isIndividualClient ? undefined : setSelectedId}
      onLogout={logout}
    >
    <div className="client-home">
      <style>{`
        .client-home{--ch-ink:#17343f;--ch-muted:#476069;--ch-teal:#2b6f93;--ch-teal-deep:#1f5675;--ch-paper:#fff;--ch-canvas:#eaf3f9;--ch-line:#cfe0e6;--ch-peach:#fbe9df;--ch-soft:#dcecf5;--ch-lemon:#dff0e4;min-height:100dvh;background:var(--ch-canvas);color:var(--ch-ink);font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;position:relative;overflow:hidden}
        .client-home .ch-title,.client-home .ch-welcome-card h2,.client-home .ch-stat strong,.client-home .ch-panel h3,.client-home .ch-plan-card h3,.client-home .ch-error strong{font-family:Georgia,"Times New Roman",serif}
        .client-home:before{background:radial-gradient(ellipse at 78% 15%,rgba(207,224,230,.76),transparent 48%),linear-gradient(120deg,#f0f7ff,#e8f5f0 65%)}
        .client-home .ch-welcome-card{background:var(--ch-teal);box-shadow:0 12px 24px rgba(23,52,63,.1)}
        .client-home .ch-welcome-card:after{border-color:rgba(234,243,249,.2);box-shadow:0 0 0 26px rgba(234,243,249,.045),0 0 0 54px rgba(234,243,249,.03)}
        .client-home .ch-welcome-kicker{color:#d3e8f3}.client-home .ch-welcome-card p{color:#e2eff6}
        .client-home .ch-welcome-action{background:#dff0e4;color:#17343f}.client-home .ch-welcome-action:hover{background:#edf7f0}
        .client-home .ch-plan-card{background:#dcecf5;border-color:#bcd6e6}.client-home .ch-plan-head,.client-home .ch-plan-foot{color:#1f5675}.client-home .ch-plan-card p{color:#476069}.client-home .ch-plan-foot{border-color:#bcd6e6}
        .client-home .ch-activity-icon{background:#fbe9df;color:#8b4f35}.client-home .ch-activity:nth-child(2n) .ch-activity-icon{background:#dcecf5;color:#1f5675}
        .client-home .ch-avatar{background:#dcecf5;color:#1f5675}
        .client-home .ch-skeleton{background:linear-gradient(100deg,#d9e8ef 20%,#e8f1f6 45%,#d9e8ef 70%)}
        .client-home *{box-sizing:border-box}.client-home:before{content:"";position:absolute;inset:0 0 auto;height:340px;background:radial-gradient(ellipse at 78% 15%,rgba(207,224,230,.76),transparent 48%),linear-gradient(120deg,#f0f7ff,#e8f5f0 65%);pointer-events:none}.client-home>div,.client-home>header{position:relative}
        .ch-shell{width:min(1220px,100% - 48px);margin:auto}.ch-header{height:78px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(24,60,67,.12)}
        .ch-brand{display:flex;align-items:center;gap:10px;color:var(--ch-ink);font-weight:800;font-size:15px;letter-spacing:-.04em}.ch-brand-mark{width:29px;height:29px;border-radius:10px 10px 10px 3px;background:var(--ch-teal);color:#eff6eb;display:grid;place-items:center;font-family:Georgia,serif;font-size:18px}
        .ch-header-actions{display:flex;align-items:center;gap:10px}.ch-quiet-btn{border:0;background:transparent;color:var(--ch-muted);font:inherit;font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:11px;cursor:pointer}.ch-quiet-btn:hover{background:rgba(255,255,255,.7);color:var(--ch-ink)}
         .ch-tabs{display:flex;gap:5px;align-items:center;overflow-x:auto;scrollbar-width:none;border-bottom:1px solid rgba(24,60,67,.12);padding:8px 0 0}.ch-tabs::-webkit-scrollbar{display:none}.ch-tab{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:42px;padding:9px 14px;border:0;border-bottom:2px solid transparent;border-radius:10px 10px 0 0;background:transparent;color:var(--ch-muted);font:inherit;font-size:12px;font-weight:700;white-space:nowrap;cursor:pointer}.ch-tab:hover{background:rgba(255,255,255,.65);color:var(--ch-ink)}.ch-tab[aria-current="page"]{color:var(--ch-teal-deep);border-bottom-color:var(--ch-teal);background:rgba(255,255,255,.55)}
        .ch-main{padding:44px 0 72px}.ch-topline{display:flex;justify-content:space-between;align-items:end;gap:20px;margin-bottom:24px}.ch-eyebrow{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--ch-teal);font-weight:800;margin:0 0 11px}.ch-title{font-family:"Fraunces",Georgia,serif;font-size:clamp(35px,5vw,56px);font-weight:500;letter-spacing:-.045em;line-height:1.02;margin:0}.ch-title em{color:var(--ch-teal);font-weight:400}.ch-subtitle{color:var(--ch-muted);margin:12px 0 0;max-width:540px;font-size:14px;line-height:1.6}
        .ch-select-wrap{position:relative;min-width:210px}.ch-select-label{display:block;color:var(--ch-muted);font-size:10px;text-transform:uppercase;letter-spacing:.13em;font-weight:800;margin:0 0 7px 2px}.ch-select{appearance:none;width:100%;border:1px solid #cad9d0;background:rgba(255,253,248,.88);padding:12px 40px 12px 14px;border-radius:13px;color:var(--ch-ink);font:inherit;font-size:14px;font-weight:600;outline:none}.ch-select:focus{border-color:var(--ch-teal);box-shadow:0 0 0 3px rgba(23,108,104,.12)}.ch-select-chevron{position:absolute;right:14px;bottom:13px;color:var(--ch-muted);pointer-events:none}
        .ch-layout{display:grid;grid-template-columns:minmax(0,1fr) 286px;gap:20px;align-items:start}.ch-primary{min-width:0;display:grid;gap:18px}.ch-side{display:grid;gap:16px;position:sticky;top:18px}
        .ch-welcome-card{min-height:214px;border-radius:25px;background:var(--ch-teal-deep);color:#f8f5e9;position:relative;overflow:hidden;padding:30px 34px;display:flex;align-items:center;justify-content:space-between;gap:22px;box-shadow:0 12px 24px rgba(20,73,68,.1)}.ch-welcome-card:after{content:"";position:absolute;width:270px;height:270px;border:1px solid rgba(236,241,220,.18);border-radius:50%;right:34px;top:-78px;box-shadow:0 0 0 26px rgba(236,241,220,.035),0 0 0 54px rgba(236,241,220,.025)}.ch-welcome-copy{position:relative;z-index:1;max-width:520px}.ch-welcome-kicker{font-size:10px;letter-spacing:.17em;text-transform:uppercase;color:#bdd9c9;font-weight:800;margin:0 0 15px}.ch-welcome-card h2{font-family:"Fraunces",Georgia,serif;font-size:clamp(27px,3vw,38px);font-weight:500;letter-spacing:-.035em;line-height:1.08;margin:0}.ch-welcome-card p{color:#d1e2d4;font-size:13px;line-height:1.6;margin:11px 0 0;max-width:400px}.ch-welcome-action{position:relative;z-index:1;white-space:nowrap;background:#f3e8d8;border:0;color:#194f4d;padding:14px 17px;border-radius:12px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:12px;transition:transform .18s,background .18s}.ch-welcome-action:hover{transform:translateY(-2px);background:#fff4df}
        .ch-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.ch-stat{background:rgba(255,253,248,.84);border:1px solid var(--ch-line);border-radius:17px;padding:17px 19px;display:grid;grid-template-columns:1fr auto;align-items:center;column-gap:8px}.ch-stat-icon{grid-column:2;grid-row:1 / span 2;color:var(--ch-teal);width:33px;height:33px;border-radius:11px;background:var(--ch-soft);display:grid;place-items:center}.ch-stat strong{font-family:"Fraunces",Georgia,serif;font-size:28px;line-height:1.1;font-weight:500}.ch-stat-label{font-size:12px;color:var(--ch-muted);font-weight:700}.ch-stat small{grid-column:1 / -1;color:#839598;font-size:10px;margin-top:9px}
        .ch-panel{background:var(--ch-paper);border:1px solid var(--ch-line);border-radius:20px;padding:22px 23px}.ch-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}.ch-panel h3{font-family:"Fraunces",Georgia,serif;font-size:21px;letter-spacing:-.02em;font-weight:500;margin:0}.ch-panel-sub{color:var(--ch-muted);font-size:12px;margin:5px 0 0}.ch-text-link{background:transparent;border:0;color:var(--ch-teal);font:inherit;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:6px;cursor:pointer;padding:8px 0}.ch-text-link:hover{color:var(--ch-teal-deep)}
        .ch-activity-list{display:grid;gap:0}.ch-activity{display:grid;grid-template-columns:38px 1fr auto;align-items:center;gap:12px;padding:12px 0;border-top:1px solid #edf0e9}.ch-activity:first-child{border-top:0;padding-top:0}.ch-activity-icon{width:36px;height:36px;border-radius:12px;background:#f6eadf;color:#ad684a;display:grid;place-items:center}.ch-activity:nth-child(2n) .ch-activity-icon{background:#e6efea;color:#32756e}.ch-activity-name{font-size:13px;font-weight:700;line-height:1.35}.ch-activity-context{color:var(--ch-muted);font-size:11px;margin-top:4px;max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ch-activity-date{color:#829294;font-size:10px;white-space:nowrap}
        .ch-side-panel{padding:20px}.ch-side-panel .ch-panel-head{margin-bottom:12px}.ch-resource{width:100%;border:0;border-top:1px solid #edf0e9;background:transparent;text-align:left;padding:13px 1px;display:grid;grid-template-columns:31px 1fr auto;align-items:center;gap:10px;cursor:pointer;color:var(--ch-ink)}.ch-resource:first-of-type{border-top:0}.ch-resource-icon{width:30px;height:30px;display:grid;place-items:center;color:var(--ch-teal);background:var(--ch-soft);border-radius:10px}.ch-resource strong{display:block;font-size:12px;font-weight:700}.ch-resource small{display:block;color:#839598;font-size:10px;margin-top:3px}.ch-resource:hover strong{color:var(--ch-teal)}.ch-resource-arrow{color:#a4b1ae}
        .ch-plan-card{background:#f5f0dd;border:1px solid #e9dfb8;border-radius:19px;padding:20px}.ch-plan-head{display:flex;gap:10px;align-items:center;color:#736641;font-size:10px;font-weight:800;letter-spacing:.13em;text-transform:uppercase}.ch-plan-card h3{font-family:"Fraunces",Georgia,serif;font-size:20px;line-height:1.18;font-weight:500;margin:13px 0 7px}.ch-plan-card p{font-size:12px;line-height:1.6;color:#6d6b55;margin:0}.ch-plan-foot{margin-top:15px;padding-top:12px;border-top:1px solid #e4d9b3;display:flex;justify-content:space-between;align-items:center;color:#817957;font-size:10px}.ch-empty{display:flex;gap:12px;align-items:flex-start;padding:17px 0;color:var(--ch-ink)}.ch-empty-mark{width:36px;height:36px;display:grid;place-items:center;border-radius:12px;background:var(--ch-soft);color:var(--ch-teal);flex:0 0 auto}.ch-empty strong{display:block;font-size:13px}.ch-empty p{font-size:11px;line-height:1.55;color:var(--ch-muted);margin:4px 0 0}
        .ch-error{border:1px solid #e4b9a7;background:#fbefe7;border-radius:18px;padding:23px;display:flex;align-items:center;justify-content:space-between;gap:16px}.ch-error strong{font-family:"Fraunces",Georgia,serif;font-size:21px;font-weight:500}.ch-error p{font-size:12px;color:#765a4c;margin:6px 0 0}.ch-retry{border:1px solid #c9886d;color:#7e4d3a;background:#fff9f5;border-radius:10px;padding:10px 14px;font:inherit;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap}.ch-retry:hover{background:#f7e2d5}
        .ch-skeleton{background:linear-gradient(100deg,#e4eae2 20%,#eff2ea 45%,#e4eae2 70%);background-size:240% 100%;animation:ch-shimmer 1.6s ease-in-out infinite;border-radius:18px;min-height:112px}.ch-skel-wide{height:214px}.ch-skel-row{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.ch-skel-columns{display:grid;grid-template-columns:1.4fr 1fr;gap:16px}.ch-skel-columns .ch-skeleton{height:260px}@keyframes ch-shimmer{to{background-position:-240% 0}}.ch-footer{padding:18px 0 32px;border-top:1px solid rgba(24,60,67,.12);font-size:11px;color:#728586;display:flex;justify-content:space-between;gap:12px}.ch-footer-note{display:flex;align-items:center;gap:7px}.ch-profile{display:flex;align-items:center;gap:8px;border:1px solid rgba(24,60,67,.12);padding:6px 10px 6px 6px;border-radius:30px;color:var(--ch-muted);font-size:11px;font-weight:700}.ch-avatar{height:27px;width:27px;border-radius:50%;background:#d8e9df;color:#256a63;display:grid;place-items:center}
        @media(max-width:900px){.ch-layout{grid-template-columns:minmax(0,1fr) 250px;gap:14px}.ch-shell{width:min(100% - 36px,760px)}.ch-welcome-card{padding:25px}.ch-stat{padding:14px}.ch-panel{padding:19px}}
         @media(max-width:700px){.ch-shell{width:calc(100% - 32px)}.ch-header{height:68px}.ch-tabs{width:100%;padding:7px 12px 0;gap:2px}.ch-tab{flex:1;gap:5px;padding:8px 6px;font-size:10px}.ch-main{padding:32px 0 48px}.ch-topline{align-items:stretch;flex-direction:column;margin-bottom:18px;gap:17px}.ch-select-wrap{max-width:none}.ch-layout{grid-template-columns:1fr}.ch-side{position:static;grid-template-columns:1fr}.ch-welcome-card{min-height:250px;padding:24px;align-items:flex-start;flex-direction:column;justify-content:center}.ch-welcome-card:after{right:-92px;top:-10px}.ch-welcome-action{padding:12px 15px}.ch-stats{gap:8px}.ch-stat{padding:13px 12px;border-radius:14px}.ch-stat strong{font-size:24px}.ch-stat-label{font-size:10px}.ch-stat small{font-size:9px}.ch-skel-columns{grid-template-columns:1fr}.ch-skel-columns .ch-skeleton:last-child{display:none}.ch-footer{flex-direction:column}.ch-header-actions .ch-quiet-btn span{display:none}}
        @media(prefers-reduced-motion:reduce){.client-home *{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
      `}</style>
      <main className="ch-shell ch-main">
        <div className="ch-topline">
          <div>
             <p className="ch-eyebrow">{isIndividualClient ? "Your personal space" : "Your family space"}</p>
            <h1 className="ch-title">A steadier day,<br /><em>one step at a time.</em></h1>
             <p className="ch-subtitle">
               {isIndividualClient
                 ? `Welcome back, ${firstName(user?.display_name || user?.full_name || childName)}. Find your plans, notes, and next steps from your care team.`
                 : `Welcome back, ${firstName(childName)}’s family. Find the plans, notes, and next steps your care team has shared.`}
             </p>
          </div>
        </div>

        {loading ? <LoadingState /> : error ? (
          <div className="ch-error" role="alert"><div><strong>We couldn’t open your home just now.</strong><p>{error?.message || "Your saved information is safe. Try again in a moment."}</p></div><button className="ch-retry" type="button" onClick={() => loadPortal(selectedId)}>Try again</button></div>
        ) : (
          <div className="ch-layout">
            <section className="ch-primary">
              <div className="ch-welcome-card">
                 <div className="ch-welcome-copy"><p className="ch-welcome-kicker">A place to start</p><h2>Support for {portalSubject} —<br />when you need it.</h2><p>Take a breath, then open the clinician-supported plan for practical steps that fit this moment.</p></div>
                <button type="button" className="ch-welcome-action" onClick={() => go("/HelpNow")}>Open help now <ArrowRight size={16} /></button>
              </div>

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