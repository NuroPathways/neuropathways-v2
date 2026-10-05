import "./_group.css";
import { useState } from "react";
import {
  Baby, BarChart2, BookOpen, Bot, Brain, ChevronRight, ClipboardList, FileText,
  Home, LogOut, Menu, MessageSquare, Settings,
  ShieldAlert, Target, Upload, Users, X,
} from "lucide-react";

type Role = "caregiver" | "clinician" | "individual";
type Entry = { label: string; icon: typeof Home; key: string; alert?: boolean };

const parentTabs: Entry[] = [
  { label: "Dashboard", icon: Users, key: "dashboard" },
  { label: "Children", icon: Baby, key: "children" },
  { label: "NeuroPath AI", icon: MessageSquare, key: "ai" },
  { label: "Help Now", icon: ShieldAlert, key: "help", alert: true },
  { label: "Goals & Milestones", icon: Target, key: "goals" },
  { label: "My Progress", icon: BarChart2, key: "progress" },
  { label: "Documents", icon: FileText, key: "documents" },
  { label: "Messages", icon: MessageSquare, key: "messages" },
  { label: "Settings", icon: Settings, key: "settings" },
];
const clinicianTabs: Entry[] = [
  { label: "Dashboard", icon: Users, key: "dashboard" },
  { label: "Users", icon: Users, key: "users" },
  { label: "Intervention Plans", icon: ShieldAlert, key: "plans" },
  { label: "Documents", icon: Upload, key: "documents" },
  { label: "Progress Reports", icon: BarChart2, key: "progress" },
  { label: "Messages", icon: MessageSquare, key: "messages" },
  { label: "Settings", icon: Settings, key: "settings" },
];
const parentBottom: Entry[] = [
  { label: "Home", icon: Home, key: "dashboard" },
  { label: "Log", icon: ClipboardList, key: "log" },
  { label: "AI Chat", icon: Bot, key: "ai" },
  { label: "Messages", icon: MessageSquare, key: "messages" },
];
const clinicianBottom: Entry[] = [
  { label: "Dashboard", icon: Home, key: "dashboard" },
  { label: "Clients", icon: Users, key: "users" },
  { label: "Documents", icon: Upload, key: "documents" },
  { label: "Messages", icon: MessageSquare, key: "messages" },
];
const homeTabs = [
  ["today", "Today's Support"], ["steps", "Support Steps"], ["log", "Log What Happened"],
  ["docs", "Upload Plan"], ["ask", "Ask"], ["clinic", "Clinic"], ["edit", "Edit Child Profile"],
];
const clientTabs = [
  ["Dashboard", BookOpen, "home"], ["NeuroPath AI", Bot, "ai"], ["Help Now", ShieldAlert, "help"], ["Documents", FileText, "documents"],
] as const;
const kids = ["Maya Chen", "Leo Chen"];

function PreviewControl({ role, onChange }: { role: Role; onChange: (role: Role) => void }) {
  return (
    <div className="np-control">
      <div className="np-control-label"><span /> Preview only · Existing role surface</div>
      <select aria-label="Choose source role surface" value={role} onChange={(event) => onChange(event.target.value as Role)}>
        <option value="caregiver">Caregiver · Layout + ParentHome</option>
        <option value="clinician">Clinician · Layout + Dashboard</option>
        <option value="individual">Individual client · Layout + ClientHome</option>
      </select>
    </div>
  );
}

function Brand({ portal = false }: { portal?: boolean }) {
  return (
    <div className="np-brand">
      <span className="np-brand-mark"><Brain size={19} /></span>
      <div><div className="np-brand-name">NeuroPathways</div>{!portal && <div className="np-brand-sub">Client Portal</div>}</div>
    </div>
  );
}

function NavList({ role, active, onNavigate, selectedKid, onSelectKid, compact = false }: {
  role: Role; active: string; onNavigate: (key: string) => void; selectedKid: string; onSelectKid: (kid: string) => void; compact?: boolean;
}) {
  const entries = role === "clinician" ? clinicianTabs : parentTabs;
  const individual = role === "individual";
  const navContent = role === "clinician" ? (
    entries.map(({ label, icon: Icon, key }) => (
      <button key={key} className={`np-side-link ${active === key ? "active" : ""}`} onClick={() => onNavigate(key)}>
        <Icon size={16} />{label}{active === key && <ChevronRight className="np-link-chevron" size={13} />}
      </button>
    ))
  ) : (
    <>
      <button className={`np-side-link ${active === "dashboard" ? "active" : ""}`} onClick={() => onNavigate("dashboard")}><Users size={16} />Dashboard{active === "dashboard" && <ChevronRight className="np-link-chevron" size={13} />}</button>
      <div className="np-child-list">
        <div className="np-child-caption">{individual ? "My Profile" : "Children"}</div>
        {(individual ? ["Morgan Lee"] : kids).map((kid) => (
          <button key={kid} className={`np-child-link ${(!individual && selectedKid === kid && active === "profile") || (individual && active === "profile") ? "active" : ""}`} onClick={() => { if (!individual) onSelectKid(kid); onNavigate("profile"); }}>
            {individual ? <Users size={14} /> : <Baby size={14} />}{kid}
          </button>
        ))}
      </div>
      {entries.slice(2).map(({ label, icon: Icon, key, alert }) => (
        <button key={key} className={`np-side-link ${alert ? "alert" : ""} ${active === key ? "active" : ""}`} onClick={() => onNavigate(key)}>
          <Icon size={16} />{label}{active === key && <ChevronRight className="np-link-chevron" size={13} />}
        </button>
      ))}
    </>
  );
  return <nav className={`np-current-nav ${compact ? "compact" : ""}`}>{navContent}</nav>;
}

function CurrentMobileDrawer({ open, role, active, close, navigate, selectedKid, selectKid }: {
  open: boolean; role: Role; active: string; close: () => void; navigate: (key: string) => void; selectedKid: string; selectKid: (kid: string) => void;
}) {
  if (!open) return null;
  return (
    <>
      <div className="np-current-drawer-backdrop" onClick={close} />
      <div className="np-current-drawer">
        <div className="np-current-account"><div className="np-account-row"><span className="np-avatar">AC</span><div><div className="np-account-name">Alex Chen</div><div className="np-account-sub">alex.chen@email.com</div></div></div></div>
        <NavList role={role} active={active} onNavigate={(key) => { navigate(key); close(); }} selectedKid={selectedKid} onSelectKid={selectKid} compact />
        <div className="np-current-account"><button className="np-signout"><LogOut size={15} />Sign out</button></div>
      </div>
    </>
  );
}

function CurrentSurface({ role, active, navigate, selectedKid, selectKid }: {
  role: Role; active: string; navigate: (key: string) => void; selectedKid: string; selectKid: (kid: string) => void;
}) {
  if (role === "caregiver") {
    return (
      <>
        <div className="np-current-page">
          <p className="np-source-eyebrow">Hi Alex</p>
          <h1 className="np-source-title">Today's Support <span style={{ color: "#8794a2", fontWeight: 400 }}>for {selectedKid.split(" ")[0]}</span></h1>
          {kids.length > 1 && <div className="np-source-chiprow">{kids.map((kid) => <button key={kid} className={`np-source-chip ${selectedKid === kid ? "selected" : ""}`} aria-pressed={selectedKid === kid} onClick={() => selectKid(kid)}>{kid.split(" ")[0]}</button>)}</div>}
          <div className="np-source-tabs" role="tablist">
            {homeTabs.map(([key, label]) => {
              const selected = active === `home-${key}` || (active === "dashboard" && key === "today");
              return <button key={key} role="tab" aria-selected={selected} className={`np-source-tab ${selected ? "active" : ""}`} onClick={() => navigate(`home-${key}`)}>{label}</button>;
            })}
          </div>
          <section className="np-surface-card np-source-warning">
            <div><strong>Need help right now?</strong><p>Open plan-guided support for {selectedKid.split(" ")[0]}.</p></div>
            <button className="np-source-button" onClick={() => navigate("help")}>I Need Help Now</button>
          </section>
          <div className="np-surface-card">
            <p className="np-source-eyebrow">Current Focus</p><h3>Transitioning between activities</h3>
            <p>Current Goal: Move to the next activity with one reminder. Review practical support steps or log what happened.</p>
          </div>
          <div className="np-surface-card"><h3>Quick Actions</h3><div className="np-source-chiprow"><button className="np-source-chip" onClick={() => navigate("home-log")}>Log What Happened</button><button className="np-source-chip" onClick={() => navigate("home-docs")}>Upload a Plan</button><button className="np-source-chip" onClick={() => navigate("home-edit")}>Edit Child Profile</button></div></div>
        </div>
      </>
    );
  }
  if (role === "individual") {
    return (
      <>
        <div className="np-portal-header"><Brand portal /><span className="np-portal-account">Morgan's account</span></div>
        <nav className="np-source-tabs" aria-label="Family portal">
          {clientTabs.map(([label, Icon, key]) => <button key={key} className={`np-source-tab ${active === key ? "active" : ""}`} aria-current={active === key ? "page" : undefined} onClick={() => navigate(key)}><Icon size={15} /> {label}</button>)}
        </nav>
        <div className="np-current-page">
          <p className="np-source-eyebrow">Your space</p><h1 className="np-source-title">A steadier day,<br /><span style={{ color: "#4a6fa5", fontWeight: 450 }}>one step at a time.</span></h1>
          <p className="np-source-sub">Welcome back, Morgan. Find the plans, notes, and next steps your care team has shared.</p>
          <section className="np-surface-card np-source-warning"><div><strong>Support for you — when you need it.</strong><p>Take a breath, then open the support plan for practical next steps.</p></div><button className="np-source-button" onClick={() => navigate("help")}>Open help now</button></section>
          <section className="np-surface-card"><h3>Go to</h3><div className="np-source-chiprow">{["Help right now", "Log a behavior", "Goals & milestones", "Progress reports", "Documents", "Messages", "Ask a question", "Rewards"].map((label, index) => <button key={label} className="np-source-chip" onClick={() => navigate(["help", "log", "goals", "progress", "documents", "messages", "ai", "rewards"][index])}>{label}</button>)}</div></section>
        </div>
      </>
    );
  }
  return (
    <div className="np-current-page">
      <p className="np-source-eyebrow">Clinical overview</p><h1 className="np-source-title">Good morning, Dr. Rivera</h1><p className="np-source-sub">Here's your clinical overview for today.</p>
      <div className="np-surface-card"><h3>Quick Actions</h3><div className="np-source-chiprow">{["Add Client", "Intervention Plans", "Upload Docs", "Progress Reports", "Messages", "Users"].map((label) => <button key={label} className="np-source-chip" onClick={() => navigate(label === "Users" ? "users" : label === "Messages" ? "messages" : label === "Upload Docs" ? "documents" : "dashboard")}>{label}</button>)}</div></div>
      <div className="np-surface-card"><h3>My Clients</h3><p>North family · 2 profiles · Recent activity: transition routine logged this morning.</p></div>
      <div className="np-surface-card"><h3>All Tools</h3><p>Intervention Plans · Documents · Progress Reports · Messages · Users · Settings</p></div>
    </div>
  );
}

function Current() {
  const [role, setRole] = useState<Role>("caregiver");
  const [active, setActive] = useState("dashboard");
  const [selectedKid, setSelectedKid] = useState(kids[0]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [supportNotice, setSupportNotice] = useState(false);
  const [supportKid, setSupportKid] = useState("");
  const [supportStarted, setSupportStarted] = useState(false);
  const individual = role === "individual";
  const bottom = role === "clinician" ? clinicianBottom : parentBottom;
  const roleName = role === "clinician" ? "Clinician Portal" : "Client Portal";
  const switchRole = (next: Role) => {
    setRole(next);
    setActive("dashboard");
    setDrawerOpen(false);
  };
  const navigate = (key: string) => {
    setActive(key);
    if (key === "help") {
      setSupportKid("");
      setSupportStarted(false);
      setSupportNotice(true);
    }
  };
  return (
    <div className="np-preview np-current">
      <PreviewControl role={role} onChange={switchRole} />
      <div className="np-current-app">
        <aside className="np-current-sidebar">
          <div className="np-brand"><span className="np-brand-mark"><Brain size={20} /></span><div><div className="np-brand-name">NeuroPathways</div><div className="np-brand-sub">{roleName}</div></div></div>
          <NavList role={role} active={active} onNavigate={navigate} selectedKid={selectedKid} onSelectKid={setSelectedKid} />
          <div className="np-current-account"><div className="np-account-row"><span className="np-avatar">{role === "clinician" ? "JR" : "AC"}</span><div><div className="np-account-name">{role === "clinician" ? "Jordan Rivera" : "Alex Chen"}</div><div className="np-account-sub">{role === "clinician" ? "jordan.r@email.com" : "alex.chen@email.com"}</div></div></div><button className="np-signout"><LogOut size={15} />Sign out</button></div>
        </aside>
        <main className="np-current-main">
          <div className="np-current-mobile-head"><Brand portal /><button className="np-current-menu-button" aria-label={drawerOpen ? "Close navigation" : "Open navigation"} onClick={() => setDrawerOpen(!drawerOpen)}>{drawerOpen ? <X size={20} /> : <Menu size={20} />}</button></div>
          <CurrentMobileDrawer open={drawerOpen} role={role} active={active} close={() => setDrawerOpen(false)} navigate={navigate} selectedKid={selectedKid} selectKid={setSelectedKid} />
          <CurrentSurface role={role} active={active} navigate={navigate} selectedKid={selectedKid} selectKid={setSelectedKid} />
          <nav className="np-bottom-tabs" aria-label="Primary navigation">
            {bottom.map(({ label, icon: Icon, key }) => <button key={key} className={`np-bottom-tab ${active === key ? "active" : ""}`} onClick={() => navigate(key)}><Icon size={19} strokeWidth={active === key ? 2.5 : 1.8} /><span>{label}</span></button>)}
          </nav>
        </main>
      </div>
      {supportNotice && <div className="np-ra-modal-backdrop" onClick={() => setSupportNotice(false)}><section className="np-ra-modal" role="dialog" aria-modal="true" aria-labelledby="source-help-title" onClick={(event) => event.stopPropagation()}><div className="np-ra-modal-top"><span className="np-ra-modal-mark"><ShieldAlert size={20} /></span><button className="np-ra-close" aria-label="Close support preview" onClick={() => setSupportNotice(false)}><X size={17} /></button></div>
        {role === "caregiver" ? <>
          <h2 id="source-help-title">Who needs help right now?</h2><p>Choose a profile to open plan-guided support. Your current dashboard selection stays unchanged.</p>
          {kids.map((kid) => <button key={kid} className={`np-ra-person-option ${supportKid === kid ? "selected" : ""}`} aria-pressed={supportKid === kid} onClick={() => setSupportKid(kid)}><span className="np-ra-avatar"><Baby size={15} /></span><span><strong>{kid}</strong><small>Support plan and steps</small></span></button>)}
          <div className="np-ra-modal-actions"><button className="np-ra-cancel" onClick={() => setSupportNotice(false)}>Cancel</button><button className="np-ra-continue" disabled={!supportKid} onClick={() => setSupportStarted(true)}>Continue to support</button></div>
          {supportStarted && <div className="np-ra-confirmation" role="status">Plan-guided support is ready for {supportKid.split(" ")[0]}. This is a local preview.</div>}
        </> : <>
          <h2 id="source-help-title">{individual ? "Help right now" : "Help Now"}</h2><p>{individual ? "Plan-guided support, available when you need it." : "Plan-guided support for your clients."}</p><div className="np-ra-confirmation">This preview represents the existing route destination. No service or account data is connected.</div>
        </>}
      </section></div>}
    </div>
  );
}

export { Current };
export default Current;
