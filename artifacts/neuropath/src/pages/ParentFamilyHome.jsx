import { useNavigate, useSearchParams } from "react-router-dom";
import { Activity, ArrowRight, BookOpen, ClipboardList, Heart, LifeBuoy, Target } from "lucide-react";

const childName = (child) => child?.child_name || child?.name || "Child";

function childPath(path, childId) {
  if (!childId) return path;
  const params = new URLSearchParams();
  params.set("child_id", childId);
  return `${path}?${params.toString()}`;
}

export default function ParentFamilyHome({ user, children = [], recentLogs = [], unreadMessages = 0, selectedChildId }) {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const requestedId = search.get("child_id");
  const child = children.find((item) => String(item.id) === String(requestedId))
    || children.find((item) => String(item.id) === String(selectedChildId))
    || children[0] || null;
  const firstName = (user?.display_name || user?.full_name || user?.primary_contact || "there").trim().split(/\s+/)[0];
  const latest = recentLogs.find((log) => !child || String(log.child_id) === String(child.id)) || null;
  const links = [
    { label: "Practice", detail: "Use a saved skill together", icon: Activity, path: "/Practice" },
    { label: "Goals", detail: "See goals and milestones", icon: Target, path: "/GoalsMilestones" },
    { label: "History", detail: "Review notes and activity", icon: ClipboardList, path: "/History" },
    { label: "Menu", detail: "More family tools", icon: ArrowRight, path: "/Menu" },
  ];

  return (
    <div className="np-family-home" data-testid="parent-family-home">
      <header className="np-family-home-hero">
        <p className="np-family-home-kicker">Family Home</p>
        <h1>One step at a time, {firstName}.</h1>
        <p>Choose what would help your family right now.</p>
        {child && <div className="np-family-child-label"><span>Support for</span><strong>{childName(child)}</strong></div>}
      </header>

      <main className="np-family-home-content">
        <section className="np-family-urgent" aria-labelledby="urgent-heading">
          <div className="np-family-urgent-copy">
            <span className="np-family-urgent-icon"><LifeBuoy size={21} aria-hidden="true" /></span>
            <div><h2 id="urgent-heading">Need help right now?</h2><p>Open saved support steps for a stressful moment.</p></div>
          </div>
          <button type="button" onClick={() => navigate(childPath("/HelpNow", child?.id))} data-testid="button-family-help-now">
            Help Now <ArrowRight size={17} aria-hidden="true" />
          </button>
        </section>

        <section className="np-family-home-section">
          <div className="np-family-section-heading"><div><span>For today</span><h2>Keep it simple</h2></div></div>
          <div className="np-family-shortcuts">
            {links.map(({ label, detail, icon: Icon, path }) => (
              <button key={label} type="button" className="np-family-shortcut" onClick={() => navigate(childPath(path, child?.id))} data-testid={`button-family-${label.toLowerCase()}`}>
                <span className="np-family-shortcut-icon"><Icon size={19} aria-hidden="true" /></span>
                <span className="np-family-shortcut-copy"><strong>{label}</strong><small>{detail}</small></span>
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>

        {latest ? (
          <section className="np-family-latest">
            <div className="np-family-latest-icon"><Heart size={18} aria-hidden="true" /></div>
            <div><span>Latest saved note</span><h2>{latest.behavior_type || "Behavior note"}</h2>
              <p>{new Date(latest.created_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}{latest.intensity ? ` · ${latest.intensity} intensity` : ""}</p>
            </div>
            <button type="button" aria-label="View history" onClick={() => navigate(childPath("/History", child?.id))}><ArrowRight size={18} /></button>
          </section>
        ) : (
          <p className="np-family-reassurance">No recent notes to review. You can start fresh whenever it feels useful.</p>
        )}
        {unreadMessages > 0 && <button type="button" className="np-family-messages" onClick={() => navigate(childPath("/Messages", child?.id))}>{unreadMessages} unread {unreadMessages === 1 ? "message" : "messages"} <ArrowRight size={15} /></button>}
        {!child && <div className="np-family-empty"><BookOpen size={20} /><strong>No child profile linked yet</strong><p>You can still open support tools. A clinic connection can link a profile when you are ready.</p></div>}
      </main>
    </div>
  );
}
