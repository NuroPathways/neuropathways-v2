import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Activity, ArrowRight, BookOpen, ClipboardList, LifeBuoy, Mail, Settings, Target, UserRound } from "lucide-react";
import { base44 } from "@/api/entities";
import { useAuth } from "@/lib/AuthContext";
import RoleAwareShell from "@/components/navigation/RoleAwareShell";
import SupportNowOverlay from "@/components/support/SupportNowOverlay";
import { clearSupportPopupSession } from "@/components/support/SupportNowOverlay";
import GoalsMilestones from "@/pages/GoalsMilestones";
import DocumentCenter from "@/pages/DocumentCenter";

const childName = (child) => child?.child_name || child?.name || "your child";
const routeWithChild = (path, childId) => {
  if (!childId) return path;
  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set("child_id", childId);
  return `${pathname}?${params.toString()}`;
};

export default function UnifiedParentHome() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [children, setChildren] = useState([]);
  const [supportRequest, setSupportRequest] = useState(0);
  const requestedChildId = new URLSearchParams(location.search).get("child_id");
  const currentTab = new URLSearchParams(location.search).get("tab");
  const showingPractice = currentTab === "practice";
  const showingGoals = currentTab === "goals";
  const showingDocuments = currentTab === "documents";
  const [storedChildId, setStoredChildId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!user?.id) return;
      if (Array.isArray(user.children) && user.children.length) {
        if (!cancelled) setChildren(user.children);
        return;
      }
      const [byId, byEmail] = await Promise.all([
        base44.entities.Child.filter({ parent_id: user.id }).catch(() => []),
        user.email ? base44.entities.Child.filter({ parent_email: user.email }).catch(() => []) : Promise.resolve([]),
      ]);
      const unique = new Map([...byId, ...byEmail].map((child) => [String(child.id), child]));
      if (!cancelled) setChildren([...unique.values()]);
    };
    void load();
    return () => { cancelled = true; };
  }, [user?.id, user?.email, user?.children]);

  useEffect(() => {
    if (!user?.id) return;
    try { setStoredChildId(localStorage.getItem(`np-family-child:${user.id}`)); }
    catch { setStoredChildId(null); }
  }, [user?.id]);

  const selectedChild = useMemo(() =>
    children.find((child) => String(child.id) === String(requestedChildId))
    || children.find((child) => String(child.id) === String(storedChildId))
    || (children.length === 1 ? children[0] : null)
    || null, [children, requestedChildId, storedChildId]);
  const firstName = (user?.display_name || user?.full_name || user?.primary_contact || "there").trim().split(/\s+/)[0];
  const setChild = (childId) => {
    try { localStorage.setItem(`np-family-child:${user.id}`, childId); } catch { /* Storage may be unavailable. */ }
    const params = new URLSearchParams(location.search);
    params.set("child_id", childId);
    navigate(`/ParentHome?${params.toString()}`, { replace: true });
    setStoredChildId(childId);
  };
  const navGroups = [
    { label: "Today", items: [
      { key: "home", label: "Home", icon: BookOpen, to: routeWithChild("/ParentHome", selectedChild?.id), active: !showingPractice && !showingGoals && !showingDocuments },
      { key: "support", label: "Help Now", icon: LifeBuoy, support: true, onSelect: () => setSupportRequest((n) => n + 1) },
    ] },
    { label: "Practice", items: [
      { key: "practice", label: "Practice", icon: Activity, to: routeWithChild("/ParentHome?tab=practice", selectedChild?.id), active: showingPractice },
    ] },
    { label: "Goals", items: [
      { key: "goals", label: "Goals", icon: Target, to: routeWithChild("/ParentHome?tab=goals", selectedChild?.id), active: showingGoals },
    ] },
    { label: "Menu", items: [
      { key: "menu", label: "Menu", icon: ArrowRight, to: routeWithChild("/Menu", selectedChild?.id) },
      { key: "history", label: "History", icon: ClipboardList, to: routeWithChild("/History", selectedChild?.id) },
      { key: "documents", label: "Document Center", icon: BookOpen, to: routeWithChild("/ParentHome?tab=documents", selectedChild?.id), active: showingDocuments },
      { key: "profiles", label: "Family & Children", icon: UserRound, to: routeWithChild("/ChildProfile", selectedChild?.id) },
      { key: "messages", label: "Messages", icon: Mail, to: routeWithChild("/Messages", selectedChild?.id) },
    ] },
    { label: "Account", items: [
      { key: "settings", label: "Settings", icon: Settings, to: "/Settings" },
    ] },
  ];
  const actions = [
    { label: "Practice Together", description: "Find an activity to try together.", action: () => navigate(routeWithChild("/Practice", selectedChild?.id)) },
    { label: "Prepare for Something", description: "Get ready for a routine or transition.", action: () => navigate(routeWithChild("/Practice?view=routines", selectedChild?.id)) },
  ];

  return (
    <RoleAwareShell
      role="caregiver"
      roleLabel="Caregiver workspace"
      currentLabel={showingPractice ? "Practice" : showingGoals ? "Goals & Milestones" : showingDocuments ? "Document Center" : "Home"}
      activeKey={showingPractice ? "practice" : showingGoals ? "goals" : showingDocuments ? "documents" : "home"}
      navGroups={navGroups}
      mobilePrimaryKeys={["home", "support", "practice", "goals"]}
      accountName={user?.first_name || user?.full_name || "Caregiver"}
      accountMeta="Caregiver account"
      selectedChild={selectedChild}
      childrenOptions={children}
      contextLabel="Viewing support for"
      onChildSelect={children.length > 1 ? setChild : undefined}
      onLogout={() => { clearSupportPopupSession(user?.id); logout?.(); }}
    >
      {(showingGoals || showingDocuments) ? (
        <div style={{ paddingTop: 12 }}>
          {showingGoals ? <GoalsMilestones embedded /> : <DocumentCenter embedded />}
        </div>
      ) : <main className="pf-wrap wide" style={{ paddingTop: 28, paddingBottom: 48 }}>
        <header className="pf-hero">
          <p className="pf-eyebrow">{showingPractice ? "Practice together" : `Welcome, ${firstName}`}</p>
          <h1 style={{ fontSize: "clamp(1.8rem,5vw,2.6rem)", margin: "4px 0 10px" }}>
            {showingPractice
              ? `Practice with ${selectedChild ? childName(selectedChild) : "your child"}`
              : `Support for ${selectedChild ? childName(selectedChild) : "your family"}`}
          </h1>
          <p style={{ color: "rgba(255,255,255,.86)", margin: 0 }}>
            {showingPractice ? "Use the support steps and materials available for this child." : "Support, activities, and routines that fit your day."}
          </p>
        </header>
        {!showingPractice && <section className="pf-help-cta" style={{ marginTop: 20 }} aria-label="Immediate support">
          <span className="ico"><LifeBuoy size={20} aria-hidden="true" /></span>
          <span><strong>I Need Help Right Now</strong><small>Open support steps for a stressful moment</small></span>
          <button type="button" className="pf-btn small" disabled={!selectedChild} onClick={() => setSupportRequest((n) => n + 1)}>Help Now</button>
        </section>}
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))", gap: 16, marginTop: 22 }}>
          {(showingPractice ? [
            { label: "Support Steps", description: "Review the strategies shared for this child.", action: () => navigate(routeWithChild("/HelpNow", selectedChild?.id)) },
            { label: "Care Plan & Documents", description: "Open the plans and materials available to your family.", action: () => navigate(routeWithChild("/DocumentCenter", selectedChild?.id)) },
          ] : actions).map(({ label, description, action }) => (
            <button key={label} type="button" className="pf-card" onClick={action} style={{ textAlign: "left", cursor: "pointer", minHeight: 130 }}>
              <strong style={{ fontSize: 18 }}>{label}</strong>
              <p className="pf-hint">{description}</p>
              <span className="pf-link">Explore <ArrowRight size={15} aria-hidden="true" /></span>
            </button>
          ))}
        </section>
        {!selectedChild && (
          <section className="pf-card" style={{ marginTop: 18 }}>
            <h2>{children.length > 1 ? "Choose which child needs support" : "No child profile is linked yet"}</h2>
            <p className="pf-hint">
              {children.length > 1
                ? "Select a child from the selector above before opening child-specific activities, goals, documents, or support steps."
                : "Your family tools will appear here when a child profile is linked to this account."}
            </p>
          </section>
        )}
      </main>}
      <SupportNowOverlay user={user} children={children} isIndividual={false} openRequest={supportRequest} autoOpen={false} />
    </RoleAwareShell>
  );
}
