import "./_group.css";
import { useMemo, useState } from "react";
import {
  Activity, ArrowRight, Baby, BarChart3, BookOpen, Bot, Brain,
  Check, ChevronDown, ClipboardList, FileText, Heart, Home,
  LifeBuoy, Mail, MoreHorizontal, Settings, 
  Sparkles, Target, Users, X,
} from "lucide-react";

type Role = "caregiver" | "clinician" | "individual";
type NavItem = { label: string; icon: typeof Home; group: string; route: string; local?: boolean; support?: boolean };
type Child = { id: string; name: string; note: string };
const childList: Child[] = [
  { id: "maya", name: "Maya Chen", note: "Age 9 · North family" },
  { id: "leo", name: "Leo Chen", note: "Age 6 · North family" },
];
const navByRole: Record<Role, NavItem[]> = {
  caregiver: [
    { label: "Home", icon: Home, group: "Today", route: "/ParentDashboard" },
    { label: "Support Now", icon: LifeBuoy, group: "Today", route: "/HelpNow", support: true },
    { label: "Behavior Support Library", icon: BookOpen, group: "Care plan", route: "/ParentDashboard", local: true },
    { label: "Goals", icon: Target, group: "Care plan", route: "/GoalsMilestones" },
    { label: "Documents", icon: FileText, group: "Care plan", route: "/DocumentCenter" },
    { label: "Logs", icon: ClipboardList, group: "Care plan", route: "/LogBehavior" },
    { label: "AI Chat", icon: Bot, group: "Care plan", route: "/AIChat" },
    { label: "Child Profiles", icon: Users, group: "Family", route: "/ChildProfile" },
    { label: "Upload Plan", icon: FileText, group: "Family", route: "/DocumentCenter", local: true },
    { label: "Messages", icon: Mail, group: "Account", route: "/Messages" },
    { label: "Settings", icon: Settings, group: "Account", route: "/Settings" },
  ],
  clinician: [
    { label: "Dashboard", icon: Home, group: "Workspace", route: "/ClinicianDashboard" },
    { label: "Clients", icon: Users, group: "Workspace", route: "/ClinicianUsers" },
    { label: "Families", icon: Users, group: "Workspace", route: "/ClinicianUsers", local: true },
    { label: "Caregivers", icon: Users, group: "Workspace", route: "/ClinicianUsers", local: true },
    { label: "Documents", icon: FileText, group: "Workspace", route: "/ClinicianDocuments" },
    { label: "Goals", icon: Target, group: "Clinical", route: "/ProgressReports", local: true },
    { label: "Support Now usage", icon: LifeBuoy, group: "Clinical", route: "/ProgressReports", local: true },
    { label: "Behavior Logs", icon: Activity, group: "Clinical", route: "/ProgressReports", local: true },
    { label: "AI Review", icon: Sparkles, group: "Clinical", route: "/AIChat", local: true },
    { label: "Invites", icon: Mail, group: "Account", route: "/ClinicianUsers", local: true },
    { label: "Settings", icon: Settings, group: "Account", route: "/Settings" },
  ],
  individual: [
    { label: "Home", icon: Home, group: "Your space", route: "/ClientHome" },
    { label: "Support Now", icon: LifeBuoy, group: "Your space", route: "/HelpNow", support: true },
    { label: "Support Steps", icon: BookOpen, group: "Your plan", route: "/HelpNow", local: true },
    { label: "Goals", icon: Target, group: "Your plan", route: "/GoalsMilestones" },
    { label: "Documents", icon: FileText, group: "Your plan", route: "/DocumentCenter" },
    { label: "Logs", icon: ClipboardList, group: "Your plan", route: "/LogBehavior" },
    { label: "AI Chat", icon: Bot, group: "Your plan", route: "/AIChat" },
    { label: "Progress", icon: BarChart3, group: "Your plan", route: "/ProgressReports" },
    { label: "Rewards", icon: Heart, group: "Your plan", route: "/RewardTracker" },
    { label: "Messages", icon: Mail, group: "Account", route: "/Messages" },
    { label: "Settings", icon: Settings, group: "Account", route: "/Settings" },
  ],
};
const profileNames: Record<Role, string> = { caregiver: "Alex Chen", clinician: "Jordan Rivera", individual: "Morgan Lee" };
const initials: Record<Role, string> = { caregiver: "AC", clinician: "JR", individual: "ML" };

function RoleControl({ role, changeRole }: { role: Role; changeRole: (role: Role) => void }) {
  return (
    <div className="np-control">
      <div className="np-control-label"><span /> Preview only · Role-aware navigation</div>
      <select aria-label="Preview role" value={role} onChange={(event) => changeRole(event.target.value as Role)}>
        <option value="caregiver">Caregiver account</option>
        <option value="clinician">Clinician account</option>
        <option value="individual">Individual client account</option>
      </select>
    </div>
  );
}

function AccountMark({ role }: { role: Role }) {
  return <span className="np-ra-avatar">{initials[role]}</span>;
}

function MenuItems({ role, active, onNavigate, close, mobile = false }: {
  role: Role; active: string; onNavigate: (item: NavItem) => void; close?: () => void; mobile?: boolean;
}) {
  const entries = navByRole[role];
  const groups = [...new Set(entries.map((entry) => entry.group))];
  return (
    <nav className="np-ra-nav" aria-label="Main navigation">
      {groups.map((group) => (
        <div key={group}>
          <div className="np-ra-nav-group">{group}</div>
          {entries.filter((entry) => entry.group === group).map((entry) => {
            const Icon = entry.icon;
            const selected = active === entry.label;
            return (
              <button key={entry.label} className={`np-ra-item ${entry.support ? "support" : ""} ${selected ? "active" : ""}`} aria-current={selected ? "page" : undefined} onClick={() => { onNavigate(entry); close?.(); }}>
                <Icon size={15} strokeWidth={selected ? 2.2 : 1.8} /><span className="np-ra-item-label">{entry.label}</span>{entry.local && !mobile && <span className="np-ra-role-chip">Section</span>}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function RoleAware() {
  const [role, setRole] = useState<Role>("caregiver");
  const [active, setActive] = useState("Home");
  const [selectedChildId, setSelectedChildId] = useState(childList[0].id);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [supportPickerOpen, setSupportPickerOpen] = useState(false);
  const [supportPersonId, setSupportPersonId] = useState("");
  const [supportStarted, setSupportStarted] = useState(false);
  const [destination, setDestination] = useState<NavItem>(navByRole.caregiver[0]);
  const selectedChild = useMemo(() => childList.find((child) => child.id === selectedChildId) || childList[0], [selectedChildId]);
  const isCaregiver = role === "caregiver";
  const isIndividual = role === "individual";
  const entries = navByRole[role];
  const current = entries.find((item) => item.label === active) || entries[0];
  const beginSupport = () => {
    setActive("Support Now");
    setDestination(navByRole[role].find((item) => item.support) || navByRole[role][1]);
    setMobileOpen(false);
    if (isCaregiver) {
      setSupportPersonId("");
      setSupportStarted(false);
      setSupportPickerOpen(true);
    } else {
      setSupportStarted(true);
      setSupportPickerOpen(true);
    }
  };
  const navigate = (item: NavItem) => {
    if (item.support) {
      beginSupport();
      return;
    }
    setActive(item.label);
    setDestination(item);
    setSupportPickerOpen(false);
    setSupportStarted(false);
  };
  const changeRole = (next: Role) => {
    setRole(next);
    setActive(next === "clinician" ? "Dashboard" : "Home");
    setDestination(navByRole[next][0]);
    setSupportPickerOpen(false);
    setSupportStarted(false);
    setMobileOpen(false);
  };
  const continueSupport = () => {
    if (isCaregiver && !supportPersonId) return;
    setSupportStarted(true);
  };
  const mobilePrimary = [
    entries.find((item) => item.label === (isCaregiver || isIndividual ? "Home" : "Dashboard")),
    entries.find((item) => item.support),
    entries.find((item) => item.label === (role === "clinician" ? "Clients" : "Logs")),
  ].filter((item): item is NavItem => Boolean(item));
  const heading = current.label === "Home" || current.label === "Dashboard"
    ? isCaregiver ? `Today's support for ${selectedChild.name.split(" ")[0]}` : isIndividual ? "A steadier day, one step at a time." : "Your clinical overview"
    : current.label;
  const subheading = current.label === "Home" || current.label === "Dashboard"
    ? isCaregiver ? "Your plan, practical steps, and recent notes in one place." : isIndividual ? "Your plans, next steps, and progress are here when you need them." : "A clear view of your clients, current work, and next steps."
    : current.local ? `A focused view within ${destination.route} — preview state only.` : `Open ${destination.route} in the existing NeuroPathways app.`;

  return (
    <div className="np-preview np-role-aware">
      <RoleControl role={role} changeRole={changeRole} />
      <div className="np-ra-app">
        <aside className="np-ra-sidebar">
          <div className="np-ra-brand"><span className="np-ra-brandmark"><Brain size={19} /></span><div><strong>NeuroPathways</strong><small>{role === "clinician" ? "Clinician workspace" : isIndividual ? "Your personal space" : "Caregiver workspace"}</small></div></div>
          {isCaregiver && <div className="np-ra-context"><span className="np-ra-context-icon"><Users size={15} /></span><div><div className="np-ra-context-label">Viewing support for</div><div className="np-ra-context-value">{selectedChild.name}</div></div><ChevronDown size={14} color="#8193a7" /></div>}
          {role === "clinician" && <div className="np-ra-context"><span className="np-ra-context-icon"><Activity size={15} /></span><div><div className="np-ra-context-label">Caseload</div><div className="np-ra-context-value">12 active clients</div></div></div>}
          <MenuItems role={role} active={active} onNavigate={navigate} />
          <div className="np-ra-sidebar-foot"><div className="np-ra-user"><AccountMark role={role} /><div><strong>{profileNames[role]}</strong><small>{role === "clinician" ? "Clinical team" : isIndividual ? "Individual account" : "Family account"}</small></div></div></div>
        </aside>
        <main className="np-ra-main">
          <header className="np-ra-topbar">
            <div className="np-ra-location"><span>Workspace</span><ArrowRight size={12} /><strong>{current.label}</strong></div>
            <div className="np-ra-top-actions">
              {isCaregiver && <label className="np-ra-child-select"><span>For</span><select value={selectedChildId} aria-label="Choose child profile" onChange={(event) => setSelectedChildId(event.target.value)}>{childList.map((child) => <option key={child.id} value={child.id}>{child.name}</option>)}</select></label>}
              <button className="np-ra-support-btn" onClick={beginSupport}><LifeBuoy size={15} />Support Now</button>
              <div className="np-ra-account"><AccountMark role={role} /><span>{profileNames[role]}</span></div>
            </div>
          </header>
          <header className="np-ra-mobile-head">
            <div className="np-ra-mobile-brand"><span className="np-ra-brandmark"><Brain size={16} /></span>NeuroPathways</div>
            {isCaregiver && <label className="np-ra-mobile-context"><Baby size={14} /><select aria-label="Choose child profile" value={selectedChildId} onChange={(event) => setSelectedChildId(event.target.value)}>{childList.map((child) => <option key={child.id} value={child.id}>{child.name}</option>)}</select></label>}
            {!isCaregiver && <button className="np-ra-role-chip" onClick={() => setMobileOpen(true)}>{role === "clinician" ? "Clinician" : "Your space"}</button>}
          </header>
          <div className="np-ra-content">
            <div className="np-ra-welcome">
              <div><p className="np-ra-kicker">{role === "clinician" ? "Clinical workspace" : isIndividual ? "Your space" : `Viewing ${selectedChild.name}`}</p><h1 className="np-ra-title">{heading}</h1><p className="np-ra-desc">{subheading}</p></div>
              {isCaregiver && <button className="np-ra-role-chip" onClick={() => navigate(navByRole.caregiver.find((item) => item.label === "Child Profiles")!)}>Child profiles <ArrowRight size={12} /></button>}
              {role === "clinician" && <button className="np-ra-role-chip" onClick={() => navigate(navByRole.clinician.find((item) => item.label === "Invites")!)}>Manage invites <ArrowRight size={12} /></button>}
            </div>
            <div className="np-ra-overview">
              <section className="np-ra-focus">
                <div className="np-ra-focus-label">{role === "clinician" ? "Caseload at a glance" : isIndividual ? "Your next step" : "A place to start"}</div>
                <h2>{role === "clinician" ? "Stay close to the work that matters." : isIndividual ? "Take one step at your pace." : "Support is here for this moment."}</h2>
                <p>{role === "clinician" ? "Open the caseload, review new notes, or check support activity across your clients." : isIndividual ? "Open your plan, revisit a goal, or reach out when you want some help." : "Open the plan-guided steps and choose what feels useful right now."}</p>
                <button className="np-ra-focus-link" onClick={beginSupport}>{role === "clinician" ? "Review Support Now usage" : "Open Support Now"}<ArrowRight size={13} /></button>
              </section>
              <section className="np-ra-activity">
                <div className="np-ra-panel-heading"><h3>{role === "clinician" ? "Recent caseload activity" : "Recent activity"}</h3><span>Updated today</span></div>
                <div className="np-ra-activity-line"><span className="np-ra-activity-icon"><ClipboardList size={14} /></span><div><strong>{role === "clinician" ? "Behavior log reviewed" : "Morning routine recorded"}</strong><small>{isCaregiver ? selectedChild.name : role === "clinician" ? "North family · 10:24 am" : "Today · 10:24 am"}</small></div></div>
                <div className="np-ra-activity-line"><span className="np-ra-activity-icon"><Target size={14} /></span><div><strong>{role === "clinician" ? "Goal progress updated" : "One small goal in progress"}</strong><small>{role === "clinician" ? "2 hours ago" : "Keep the next step manageable"}</small></div></div>
              </section>
            </div>
            <div className="np-ra-lower">
              {[
                { icon: role === "clinician" ? Users : BookOpen, title: role === "clinician" ? "Clients & families" : "Behavior Support Library", note: role === "clinician" ? "Open your active caseload" : "Plan guidance for everyday moments", label: role === "clinician" ? "Clients" : "Behavior Support Library" },
                { icon: Target, title: "Goals", note: isIndividual ? "Steps you are working on" : "See the next achievable step", label: "Goals" },
                { icon: FileText, title: "Documents", note: "Plans and shared files", label: "Documents" },
                { icon: role === "clinician" ? Activity : ClipboardList, title: role === "clinician" ? "Behavior Logs" : "Logs", note: "Review recent observations", label: role === "clinician" ? "Behavior Logs" : "Logs" },
                { icon: role === "clinician" ? Sparkles : Bot, title: role === "clinician" ? "AI Review" : "AI Chat", note: role === "clinician" ? "Review AI-assisted summaries" : "Ask for practical guidance", label: role === "clinician" ? "AI Review" : "AI Chat" },
                { icon: Mail, title: "Messages", note: "Stay in touch with your team", label: "Messages" },
              ].map(({ icon: Icon, title, note, label }) => {
                const item = entries.find((entry) => entry.label === label) || current;
                return <button key={title} className="np-ra-shortcut" onClick={() => navigate(item)}><span className="np-ra-shortcut-icon"><Icon size={15} /></span><strong>{title}</strong><small>{note}</small></button>;
              })}
            </div>
          </div>
          <nav className="np-ra-bottom" aria-label="Mobile navigation">
            {mobilePrimary.map((item) => {
              const Icon = item.icon;
              return <button key={item.label} className={`np-ra-bottom-item ${item.support ? "support" : ""} ${active === item.label ? "active" : ""}`} onClick={() => navigate(item)}><Icon size={19} /><span>{item.label}</span></button>;
            })}
            <button className={`np-ra-bottom-item ${mobileOpen ? "active" : ""}`} onClick={() => setMobileOpen(!mobileOpen)}><MoreHorizontal size={20} /><span>More</span></button>
          </nav>
        </main>
      </div>
      {mobileOpen && <><div className="np-ra-mobile-backdrop" onClick={() => setMobileOpen(false)} /><aside className="np-ra-mobile-drawer"><div className="np-ra-brand"><span className="np-ra-brandmark"><Brain size={18} /></span><div><strong>NeuroPathways</strong><small>{isIndividual ? "Your personal space" : role === "clinician" ? "Clinician workspace" : "Caregiver workspace"}</small></div><button className="np-ra-close" style={{ marginLeft: "auto" }} aria-label="Close menu" onClick={() => setMobileOpen(false)}><X size={17} /></button></div>{isCaregiver && <div className="np-ra-context"><span className="np-ra-context-icon"><Users size={15} /></span><div><div className="np-ra-context-label">Viewing support for</div><div className="np-ra-context-value">{selectedChild.name}</div></div></div>}<MenuItems role={role} active={active} onNavigate={navigate} close={() => setMobileOpen(false)} mobile /></aside></>}
      {supportPickerOpen && <div className="np-ra-modal-backdrop" onClick={() => { setSupportPickerOpen(false); setSupportStarted(false); }}><section className="np-ra-modal" role="dialog" aria-modal="true" aria-labelledby="support-title" onClick={(event) => event.stopPropagation()}>
        <div className="np-ra-modal-top"><span className="np-ra-modal-mark"><LifeBuoy size={20} /></span><button className="np-ra-close" aria-label="Close Support Now" onClick={() => { setSupportPickerOpen(false); setSupportStarted(false); }}><X size={17} /></button></div>
        {isCaregiver ? <>
          <h2 id="support-title">Who needs help right now?</h2>
          <p>Choose a profile to open the right plan. Your current dashboard selection stays unchanged.</p>
          {childList.map((child) => <button key={child.id} className={`np-ra-person-option ${supportPersonId === child.id ? "selected" : ""}`} aria-pressed={supportPersonId === child.id} onClick={() => setSupportPersonId(child.id)}><span className="np-ra-avatar"><Baby size={15} /></span><span><strong>{child.name}</strong><small>{child.note}</small></span>{supportPersonId === child.id && <Check size={16} style={{ marginLeft: "auto" }} />}</button>)}
          <div className="np-ra-modal-actions"><button className="np-ra-cancel" onClick={() => setSupportPickerOpen(false)}>Cancel</button><button className="np-ra-continue" disabled={!supportPersonId} onClick={continueSupport}>Continue to support</button></div>
          {supportStarted && <div className="np-ra-confirmation" role="status">Support steps are ready for {childList.find((child) => child.id === supportPersonId)?.name}. This is a local navigation preview.</div>}
        </> : <>
          <h2 id="support-title">{role === "clinician" ? "Support Now usage" : "Help right now"}</h2>
          <p>{role === "clinician" ? "A preview of the support activity destination in the clinician workspace." : "Your plan-guided support is ready. Choose a next step that feels manageable."}</p>
          {supportStarted && <div className="np-ra-confirmation" role="status">{role === "clinician" ? "Usage overview opened in this local preview." : "Your support steps are ready. You can take them one at a time."}</div>}
          <div className="np-ra-modal-actions"><button className="np-ra-cancel" onClick={() => setSupportPickerOpen(false)}>Close</button></div>
        </>}
      </section></div>}
    </div>
  );
}

export { RoleAware };
export default RoleAware;
