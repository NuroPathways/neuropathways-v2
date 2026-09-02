import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { base44 } from '@/api/entities';
import { useAuth } from "@/lib/AuthContext";
import { Brain, Users, MessageSquare, LogOut, Menu, X, ChevronRight, FileText, Settings, Baby, AlertCircle, BarChart2, Upload, ShieldAlert, Home, Bot, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

const noLayoutPages = ["Splash", "Login", "RoleSelection", "ClinicianLogin", "ParentLogin", "ClientLogin", "RoleSetup", "HelpNow"];

// Parent bottom tabs
const PARENT_TABS = [
  { label: "Home", icon: Home, to: "/ParentDashboard", pages: ["ParentDashboard", "ClientDashboard", "ChildProfile"] },
  { label: "AI Chat", icon: Bot, to: "/AIChat", pages: ["AIChat"] },
  { label: "Messages", icon: MessageSquare, to: "/Messages", pages: ["Messages"] },
  { label: "Settings", icon: Settings, to: "/Settings", pages: ["Settings"] },
];

// Clinician bottom tabs
const CLINICIAN_TABS = [
  { label: "Dashboard", icon: Home, to: "/ClinicianDashboard", pages: ["ClinicianDashboard"] },
  { label: "Clients", icon: Users, to: "/ClinicianUsers", pages: ["ClinicianUsers", "FamilyDetail", "ClientDetail"] },
  { label: "Documents", icon: Upload, to: "/ClinicianDocuments", pages: ["ClinicianDocuments"] },
  { label: "Messages", icon: MessageSquare, to: "/Messages", pages: ["Messages"] },
];

function BottomTabBar({ role, currentPageName }) {
  const tabs = role === "clinician" ? CLINICIAN_TABS : PARENT_TABS;

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border flex"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {tabs.map((tab) => {
        const isActive = tab.pages.includes(currentPageName);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[56px] transition-colors ${isActive ? "text-primary" : "text-muted-foreground"}`}
          >
            <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 1.8} />
            <span className={`text-[10px] font-medium ${isActive ? "text-primary" : "text-muted-foreground"}`}>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default function Layout({ children, currentPageName }) {
  const { user, isLoadingAuth } = useAuth();
  const location = useLocation();
  const [children_list, setChildrenList] = useState([]);
  const [isIndividualFallback, setIsIndividualFallback] = useState(false);
  const isIndividualClient = user?.account_type === "individual" || isIndividualFallback;
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (user.app_role === "clinician") {
      base44.entities.Child.filter({ clinician_id: user.id }).then(setChildrenList).catch(() => {});
    } else if (user.app_role === "parent") {
      // Username+code client sessions carry their children with them
      if (user.children && user.children.length > 0) {
        setChildrenList(user.children);
        return;
      }
      Promise.all([
        base44.entities.Child.filter({ parent_id: user.id }).catch(() => []),
        user.email ? base44.entities.Child.filter({ parent_email: user.email }).catch(() => []) : Promise.resolve([]),
      ]).then(([byId, byEmail]) => {
        const map = new Map();
        for (const k of [...byId, ...byEmail]) map.set(k.id, k);
        const kids = Array.from(map.values());
        setChildrenList(kids);
        if (!user.account_type) {
          const familyId = user.linked_family_id || kids[0]?.family_id;
          if (familyId) {
            base44.entities.Family.filter({ id: familyId }).catch(() => []).then(fams => {
              if (fams[0]?.account_type === "individual") setIsIndividualFallback(true);
            });
          }
        }
      });
    }
  }, [user?.id]);

  // Close mobile drawer on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  if (noLayoutPages.includes(currentPageName)) {
    return <>{children}</>;
  }

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <>{children}</>;

  const role = user.app_role || user.role;
  const handleLogout = () => base44.auth.logout("/");
  const parentDashboardActive = currentPageName === "ParentDashboard" || currentPageName === "ClientDashboard";

  // Robust account label for the sidebar footer (name → caregiver → email prefix → child name → "Account").
  const realEmail = user.email && !user.email.endsWith("@clients.neuropathways.app") ? user.email : "";
  const emailPrefix = realEmail
    ? realEmail.split("@")[0].split(/[._-]/)[0].replace(/^(.)/, (c) => c.toUpperCase())
    : "";
  const accountLabel =
    (user.display_name || user.full_name)?.trim() ||
    user.primary_contact?.trim() ||
    emailPrefix ||
    user.family_name?.trim() ||
    user.child_name ||
    children_list[0]?.child_name ||
    "Account";
  const accountSubLabel = realEmail || (children_list.length > 0 ? "Client access" : "");

  return (
    <div className="min-h-screen bg-background font-inter flex">
      {/* ── Desktop Sidebar ── */}
      <aside className="hidden md:flex flex-col w-64 bg-card border-r border-border">
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
              <Brain className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <p className="font-semibold text-foreground text-sm">NeuroPathways</p>
              <p className="text-xs text-muted-foreground">{role === "clinician" ? "Clinician Portal" : "Client Portal"}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {role === "clinician" ? (
            <>
              <SidebarLink to="/ClinicianDashboard" active={currentPageName === "ClinicianDashboard"} icon={<Users className="w-4 h-4" />} label="Dashboard" />
              <SidebarLink to="/ClinicianUsers" active={currentPageName === "ClinicianUsers"} icon={<Users className="w-4 h-4" />} label="Users" />
              <SidebarLink to="/InterventionBuilder" active={currentPageName === "InterventionBuilder"} icon={<ShieldAlert className="w-4 h-4" />} label="Intervention Plans" />
              <SidebarLink to="/ClinicianDocuments" active={currentPageName === "ClinicianDocuments"} icon={<Upload className="w-4 h-4" />} label="Documents" />
              <SidebarLink to="/ProgressReports" active={currentPageName === "ProgressReports"} icon={<BarChart2 className="w-4 h-4" />} label="Progress Reports" />
              <SidebarLink to="/Messages" active={currentPageName === "Messages"} icon={<MessageSquare className="w-4 h-4" />} label="Messages" />
              <SidebarLink to="/Settings" active={currentPageName === "Settings"} icon={<Settings className="w-4 h-4" />} label="Settings" />
            </>
          ) : (
            <>
              <SidebarLink to="/ParentDashboard" active={parentDashboardActive} icon={<Users className="w-4 h-4" />} label="Dashboard" />
              {children_list.length > 0 && (
                <div className="mt-2">
                  <p className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{isIndividualClient ? "My Profile" : "Children"}</p>
                  {children_list.map((child) => {
                    const isActive = currentPageName === "ChildProfile" && new URLSearchParams(window.location.search).get("child_id") === child.id;
                    return (
                      <Link key={child.id} to={`/ChildProfile?child_id=${child.id}`} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
                        <Baby className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">{child.child_name}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
              <SidebarLink to="/AIChat" active={currentPageName === "AIChat"} icon={<MessageSquare className="w-4 h-4" />} label="NeuroPath AI" />
              <Link to="/HelpNow" className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${currentPageName === "HelpNow" ? "bg-red-600 text-white" : "text-red-600 hover:text-red-700 hover:bg-red-50"}`}>
                <AlertCircle className="w-4 h-4" /> Help Now
                {currentPageName === "HelpNow" && <ChevronRight className="w-3 h-3 ml-auto" />}
              </Link>
              <SidebarLink to="/GoalsMilestones" active={currentPageName === "GoalsMilestones"} icon={<Target className="w-4 h-4" />} label="Goals & Milestones" />
              <SidebarLink to="/ProgressReports" active={currentPageName === "ProgressReports"} icon={<BarChart2 className="w-4 h-4" />} label="My Progress" />
              <SidebarLink to="/DocumentCenter" active={currentPageName === "DocumentCenter"} icon={<FileText className="w-4 h-4" />} label="Documents" />
              <SidebarLink to="/Messages" active={currentPageName === "Messages"} icon={<MessageSquare className="w-4 h-4" />} label="Messages" />
              <SidebarLink to="/Settings" active={currentPageName === "Settings"} icon={<Settings className="w-4 h-4" />} label="Settings" />
            </>
          )}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 mb-3 px-1">
            <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
              <span className="text-accent-foreground text-xs font-semibold">{accountLabel?.[0]?.toUpperCase() || "U"}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{accountLabel}</p>
              {accountSubLabel && <p className="text-xs text-muted-foreground truncate">{accountSubLabel}</p>}
            </div>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground hover:text-foreground gap-2 min-h-[44px]" onClick={handleLogout}>
            <LogOut className="w-4 h-4" /> Sign out
          </Button>
        </div>
      </aside>

      {/* ── Mobile Header ── */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-50 bg-card border-b border-border px-4 h-14 flex items-center justify-between"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <Brain className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-foreground text-sm">NeuroPathways</span>
        </div>
        <button
          className="min-w-[44px] min-h-[44px] flex items-center justify-center text-foreground"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile drawer backdrop */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="md:hidden fixed inset-0 z-40 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="md:hidden fixed top-0 left-0 bottom-0 z-50 w-72 bg-card border-r border-border overflow-y-auto"
            style={{ paddingTop: "env(safe-area-inset-top)" }}
          >
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                  <Brain className="w-4 h-4 text-primary-foreground" />
                </div>
                <span className="font-semibold text-foreground text-sm">NeuroPathways</span>
              </div>
              <button className="min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground" onClick={() => setMobileOpen(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="p-4 space-y-1">
              {role === "clinician" ? (
                <>
                  <DrawerLink to="/ClinicianDashboard" active={currentPageName === "ClinicianDashboard"} icon={<Users className="w-4 h-4" />} label="Dashboard" />
                  <DrawerLink to="/ClinicianUsers" active={currentPageName === "ClinicianUsers"} icon={<Users className="w-4 h-4" />} label="Users" />
                  <DrawerLink to="/InterventionBuilder" active={currentPageName === "InterventionBuilder"} icon={<ShieldAlert className="w-4 h-4" />} label="Intervention Plans" />
                  <DrawerLink to="/ClinicianDocuments" active={currentPageName === "ClinicianDocuments"} icon={<Upload className="w-4 h-4" />} label="Documents" />
                  <DrawerLink to="/ProgressReports" active={currentPageName === "ProgressReports"} icon={<BarChart2 className="w-4 h-4" />} label="Progress Reports" />
                  <DrawerLink to="/Messages" active={currentPageName === "Messages"} icon={<MessageSquare className="w-4 h-4" />} label="Messages" />
                  <DrawerLink to="/Settings" active={currentPageName === "Settings"} icon={<Settings className="w-4 h-4" />} label="Settings" />
                </>
              ) : (
                <>
                  <DrawerLink to="/ParentDashboard" active={parentDashboardActive} icon={<Users className="w-4 h-4" />} label="Dashboard" />
                  {children_list.length > 0 && (
                    <div className="mt-2">
                      <p className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{isIndividualClient ? "My Profile" : "Children"}</p>
                      {children_list.map((child) => {
                        const isActive = currentPageName === "ChildProfile" && new URLSearchParams(window.location.search).get("child_id") === child.id;
                        return (
                          <Link key={child.id} to={`/ChildProfile?child_id=${child.id}`} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium min-h-[44px] ${isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
                            <Baby className="w-3.5 h-3.5 flex-shrink-0" /><span className="truncate">{child.child_name}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                  <DrawerLink to="/AIChat" active={currentPageName === "AIChat"} icon={<MessageSquare className="w-4 h-4" />} label="NeuroPath AI" />
                  <Link to="/HelpNow" className={`flex items-center gap-3 px-3 min-h-[44px] rounded-lg text-sm font-medium ${currentPageName === "HelpNow" ? "bg-red-600 text-white" : "text-red-600 hover:text-red-700 hover:bg-red-50"}`}>
                    <AlertCircle className="w-4 h-4" /> Help Now
                  </Link>
                  <DrawerLink to="/GoalsMilestones" active={currentPageName === "GoalsMilestones"} icon={<Target className="w-4 h-4" />} label="Goals & Milestones" />
                  <DrawerLink to="/ProgressReports" active={currentPageName === "ProgressReports"} icon={<BarChart2 className="w-4 h-4" />} label="My Progress" />
                  <DrawerLink to="/DocumentCenter" active={currentPageName === "DocumentCenter"} icon={<FileText className="w-4 h-4" />} label="Documents" />
                  <DrawerLink to="/Messages" active={currentPageName === "Messages"} icon={<MessageSquare className="w-4 h-4" />} label="Messages" />
                  <DrawerLink to="/Settings" active={currentPageName === "Settings"} icon={<Settings className="w-4 h-4" />} label="Settings" />
                </>
              )}
            </nav>
            <div className="p-4 border-t border-border">
              <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground gap-2 min-h-[44px]" onClick={handleLogout}>
                <LogOut className="w-4 h-4" /> Sign out
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-auto md:pt-0 pt-14" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="md:pb-0 pb-20">
          <motion.div
            key={currentPageName}
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -20, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            {children}
          </motion.div>
        </div>
      </main>

      {/* ── Mobile Bottom Tab Bar ── */}
      <BottomTabBar role={role} currentPageName={currentPageName} />
    </div>
  );
}

function SidebarLink({ to, active, icon, label }) {
  return (
    <Link to={to} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 min-h-[44px] ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
      {icon} {label}
      {active && <ChevronRight className="w-3 h-3 ml-auto" />}
    </Link>
  );
}

function DrawerLink({ to, active, icon, label }) {
  return (
    <Link to={to} className={`flex items-center gap-3 px-3 min-h-[44px] rounded-lg text-sm font-medium ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
      {icon} {label}
    </Link>
  );
}