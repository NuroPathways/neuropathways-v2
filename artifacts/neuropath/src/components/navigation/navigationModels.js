import {
  Activity,
  BarChart2,
  BookOpen,
  Bot,
  ClipboardList,
  FileText,
  Heart,
  Home,
  LifeBuoy,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Upload,
  UserRound,
  Users,
} from "lucide-react";

export function resolveNavigationRole(user, individualFallback = false) {
  const rawRole = user?.app_role || user?.role;
  if (rawRole === "clinician" || rawRole === "admin") return "clinician";
  if (user?.account_type === "individual" || individualFallback) return "individual";
  return "caregiver";
}

export function createRoleNavigation(role, homePath, includeUploadPlan = false) {
  if (role === "clinician") {
    return [
      {
        label: "Workspace",
        items: [
          { key: "dashboard", label: "Dashboard", icon: Home, to: "/ClinicianDashboard", pages: ["ClinicianDashboard"] },
          { key: "clients", label: "Clients", icon: Users, to: "/ClinicianUsers", pages: ["ClinicianUsers", "FamilyDetail", "ClientDetail"] },
          { key: "documents", label: "Documents", icon: FileText, to: "/ClinicianDocuments", pages: ["ClinicianDocuments"] },
        ],
      },
      {
        label: "Clinical",
        items: [
          { key: "plans", label: "Intervention Plans", icon: ShieldAlert, to: "/InterventionBuilder", pages: ["InterventionBuilder", "BehaviorPlanBuilder"] },
          { key: "reports", label: "Progress Reports", icon: BarChart2, to: "/ProgressReports", pages: ["ProgressReports"] },
          { key: "ai-review", label: "AI Review", icon: Bot, to: "/AIChat", pages: ["AIChat"] },
        ],
      },
      {
        label: "Account",
        items: [
          { key: "messages", label: "Messages", icon: Mail, to: "/Messages", pages: ["Messages"] },
          { key: "settings", label: "Settings", icon: Settings, to: "/Settings", pages: ["Settings"] },
        ],
      },
    ];
  }

  if (role === "individual") {
    return [
      {
        label: "Your space",
        items: [
          { key: "home", label: "Home", icon: Home, to: "/ClientHome", pages: ["ClientHome"] },
          { key: "support", label: "Support Now", icon: LifeBuoy, to: "/HelpNow", support: true, pages: ["HelpNow"] },
        ],
      },
      {
        label: "Your plan",
        items: [
          { key: "goals", label: "Goals", icon: Target, to: "/GoalsMilestones", pages: ["GoalsMilestones"] },
          { key: "documents", label: "Documents", icon: FileText, to: "/DocumentCenter", pages: ["DocumentCenter"] },
          { key: "logs", label: "Logs", icon: ClipboardList, to: "/LogBehavior", pages: ["LogBehavior"] },
          { key: "ai-chat", label: "AI Chat", icon: Bot, to: "/AIChat", pages: ["AIChat"] },
          { key: "progress", label: "Progress", icon: Activity, to: "/ProgressReports", pages: ["ProgressReports"] },
          { key: "rewards", label: "Rewards", icon: Heart, to: "/RewardTracker", pages: ["RewardTracker"] },
        ],
      },
      {
        label: "Account",
        items: [
          { key: "messages", label: "Messages", icon: Mail, to: "/Messages", pages: ["Messages"] },
          { key: "settings", label: "Settings", icon: Settings, to: "/Settings", pages: ["Settings"] },
        ],
      },
    ];
  }

  return [
    {
      label: "Family",
      items: [
        { key: "home", label: "Home", icon: Home, to: homePath, pages: ["ParentDashboard", "ClientDashboard"] },
        { key: "support", label: "Support Now", icon: LifeBuoy, to: "/HelpNow", support: true, pages: ["HelpNow"] },
        { key: "practice", label: "Practice", icon: Activity, to: "/Practice", pages: ["Practice"] },
        { key: "goals", label: "Goals", icon: Target, to: "/GoalsMilestones", pages: ["GoalsMilestones"] },
        { key: "menu", label: "Menu", icon: MoreHorizontal, to: "/Menu", pages: ["Menu", "History"] },
      ],
    },
    {
      label: "More",
      items: [
        { key: "history", label: "History", icon: ClipboardList, to: "/History", pages: ["History"] },
        { key: "library", label: "Support Library", icon: BookOpen, to: "/ParentHome?tab=today&section=library" },
        { key: "documents", label: "Care plan & documents", icon: FileText, to: "/DocumentCenter", pages: ["DocumentCenter"] },
        { key: "ai-chat", label: "AI Chat", icon: Bot, to: "/AIChat", pages: ["AIChat"] },
        { key: "profiles", label: "Child Profiles", icon: Users, to: "/ChildProfile", pages: ["ChildProfile"] },
        ...(includeUploadPlan
          ? [{ key: "upload-plan", label: "Upload Plan", icon: Upload, to: "/UploadBehaviorPlan", pages: ["UploadBehaviorPlan"] }]
          : []),
      ],
    },
    {
      label: "Account",
      items: [
        { key: "messages", label: "Messages", icon: Mail, to: "/Messages", pages: ["Messages"] },
        { key: "settings", label: "Settings", icon: Settings, to: "/Settings", pages: ["Settings"] },
      ],
    },
  ];
}

export function mobilePrimaryKeysForRole(role) {
  if (role === "clinician") return ["dashboard", "clients", "reports"];
  if (role === "individual") return ["home", "support", "progress"];
  return ["home", "support", "practice", "goals"];
}

export function getMobileNavigationItems(navGroups, primaryKeys) {
  const allItems = (navGroups || []).flatMap((group) => group.items || []);
  return (primaryKeys || []).map((key) => allItems.find((item) => item.key === key)).filter(Boolean);
}

export function activateNavigationItem(item, closeMenu) {
  if (item?.disabled) return false;
  item?.onSelect?.();
  closeMenu?.();
  return true;
}

export function canChooseNavigationChild(childrenOptions, onChildSelect) {
  return Boolean(childrenOptions?.length > 1 && onChildSelect);
}

const routeForChild = (route, childId) => {
  if (!childId) return route;
  const [path, query = ""] = route.split("?");
  const params = new URLSearchParams(query);
  params.set("child_id", childId);
  return `${path}?${params.toString().replace(/\+/g, "%20")}`;
};

export function createClientHomeNavigation({ isIndividualClient, selectedId, onSupportNow, activePage = "home" }) {
  const navigationRoute = (route) => routeForChild(route, selectedId);
  if (isIndividualClient) {
    return [
      {
        label: "Your space",
        items: [
          { key: "home", label: "Home", icon: BookOpen, to: "/ClientHome", active: activePage === "home", pages: ["ClientHome"] },
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
    ];
  }

  return [
    {
      label: "Today",
      items: [
        { key: "home", label: "Home", icon: BookOpen, to: "/ClientHome", active: activePage === "home", pages: ["ClientHome"] },
        { key: "support", label: "Support Now", icon: LifeBuoy, support: true, onSelect: () => onSupportNow?.() },
        { key: "practice", label: "Practice", icon: Activity, to: navigationRoute("/ClientHome?view=practice"), active: activePage === "practice" },
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
        { key: "messages", label: "Messages", icon: MessageCircle, to: navigationRoute("/Messages") },
        { key: "settings", label: "Settings", icon: Settings, to: navigationRoute("/Settings") },
      ],
    },
  ];
}

export function createFreeCaregiverNavigation({ activeTab, activeSection, goToTab, onSupportNow, onAddChild, onMenu, onHistory }) {
  return [
    {
      label: "Today",
      items: [
        { key: "home", label: "Home", icon: Home, active: activeTab === "today" && !activeSection, onSelect: () => goToTab("today") },
        { key: "support", label: "Help Now", icon: LifeBuoy, support: true, onSelect: onSupportNow },
      ],
    },
    {
      label: "Practice",
      items: [
        { key: "practice", label: "Practice", icon: Activity, active: activeTab === "practice", onSelect: () => goToTab("practice") },
      ],
    },
    {
      label: "Goals",
      items: [
        { key: "goals", label: "Goals", icon: Target, active: activeTab === "edit" && activeSection === "goals", onSelect: () => goToTab("edit", "goals") },
      ],
    },
    {
      label: "Menu",
      items: [
        { key: "menu", label: "Menu", icon: MoreHorizontal, active: false, onSelect: onMenu },
        { key: "history", label: "History", icon: ClipboardList, active: false, onSelect: onHistory },
        { key: "library", label: "Support library", icon: BookOpen, active: activeTab === "today" && activeSection === "library", onSelect: () => goToTab("today", "library") },
        { key: "care-plan", label: "Care plan & documents", icon: FileText, active: activeTab === "docs", onSelect: () => goToTab("docs") },
        { key: "upload", label: "Upload a plan", icon: Upload, active: activeTab === "docs", onSelect: () => goToTab("docs") },
        { key: "ask", label: "AI Chat", icon: Sparkles, active: activeTab === "ask", onSelect: () => goToTab("ask") },
        { key: "preferences", label: "Enjoyment & preferences", icon: UserRound, active: activeTab === "edit" && activeSection !== "goals", onSelect: () => goToTab("edit", "profile") },
        { key: "profiles", label: "Child profile", icon: UserRound, active: false, onSelect: () => goToTab("edit", "profile") },
        { key: "clinic", label: "Clinic connection", icon: Heart, active: activeTab === "clinic", onSelect: () => goToTab("clinic") },
        { key: "messages", label: "Messages", icon: Mail, to: "/Messages", pages: ["Messages"] },
        { key: "add-child", label: "Add a child", icon: Plus, onSelect: onAddChild },
      ],
    },
    {
      label: "Account",
      items: [
        { key: "settings", label: "Settings", icon: Settings, to: "/Settings", pages: ["Settings"] },
      ],
    },
  ];
}
