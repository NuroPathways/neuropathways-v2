import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { base44 } from "@/api/entities";
import { useAuth } from "@/lib/AuthContext";
import SupportNowOverlay from "@/components/support/SupportNowOverlay";
import {
  Activity,
  BarChart2,
  Bot,
  ClipboardList,
  FileText,
  Home,
  LifeBuoy,
  Mail,
  Settings,
  ShieldAlert,
  Target,
  Upload,
  Users,
} from "lucide-react";
import RoleAwareShell from "@/components/navigation/RoleAwareShell";

const noLayoutPages = ["Splash", "Login", "RoleSelection", "ClinicianLogin", "ParentLogin", "ParentSignup", "ParentQuickStart", "ParentHome", "ClientLogin", "RoleSetup", "HelpNow"];

function createNavigation(role, homePath, includeUploadPlan) {
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
      label: "Today",
      items: [
        { key: "home", label: "Home", icon: Home, to: homePath, pages: ["ParentDashboard", "ClientDashboard"] },
        { key: "support", label: "Support Now", icon: LifeBuoy, to: "/HelpNow", support: true, pages: ["HelpNow"] },
      ],
    },
    {
      label: "Care plan",
      items: [
        { key: "goals", label: "Goals", icon: Target, to: "/GoalsMilestones", pages: ["GoalsMilestones"] },
        { key: "documents", label: "Documents", icon: FileText, to: "/DocumentCenter", pages: ["DocumentCenter"] },
        { key: "logs", label: "Logs", icon: ClipboardList, to: "/LogBehavior", pages: ["LogBehavior"] },
        { key: "ai-chat", label: "AI Chat", icon: Bot, to: "/AIChat", pages: ["AIChat"] },
      ],
    },
    {
      label: "Family",
      items: [
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

export default function Layout({ children, currentPageName }) {
  const { user, isLoadingAuth } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [childrenList, setChildrenList] = useState([]);
  const [isIndividualFallback, setIsIndividualFallback] = useState(false);
  const [supportRequest, setSupportRequest] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setChildrenList([]);
    setIsIndividualFallback(false);
    if (!user) return () => { cancelled = true; };

    if (user.invite_token) {
      setChildrenList(
        Array.isArray(user.children) && user.children.length
          ? user.children
          : user.id ? [{ id: user.id, child_name: user.child_name }] : []
      );
      return () => { cancelled = true; };
    }

    if (user.app_role === "clinician" || user.role === "admin") {
      base44.entities.Child.filter({ clinician_id: user.id })
        .then((children) => { if (!cancelled) setChildrenList(children); })
        .catch(() => {});
    } else if (user.app_role === "parent") {
      Promise.all([
        base44.entities.Child.filter({ parent_id: user.id }).catch(() => []),
        user.email ? base44.entities.Child.filter({ parent_email: user.email }).catch(() => []) : Promise.resolve([]),
      ]).then(([byId, byEmail]) => {
        if (cancelled) return;
        const uniqueChildren = new Map();
        for (const child of [...byId, ...byEmail]) uniqueChildren.set(child.id, child);
        const children = Array.from(uniqueChildren.values());
        setChildrenList(children);
        if (!user.account_type) {
          const familyId = user.linked_family_id || children[0]?.family_id;
          if (familyId) {
            base44.entities.Family.filter({ id: familyId })
              .catch(() => [])
              .then((families) => {
                if (!cancelled && families[0]?.account_type === "individual") setIsIndividualFallback(true);
              });
          }
        }
      });
    }
    return () => { cancelled = true; };
  }, [user?.id, user?.app_role, user?.role, user?.invite_token, user?.children, user?.email]);

  if (noLayoutPages.includes(currentPageName)) return <>{children}</>;

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <>{children}</>;

  const isIndividualClient = user.account_type === "individual" || isIndividualFallback;
  const rawRole = user.app_role || user.role;
  const role = rawRole === "clinician" || rawRole === "admin"
    ? "clinician"
    : isIndividualClient
      ? "individual"
      : "caregiver";
  const homePath = user.invite_token ? "/ClientHome" : "/ParentDashboard";
  const currentChildId = new URLSearchParams(location.search).get("child_id") || user.child_id || user.children?.[0]?.id;
  const selectedChild = role === "caregiver" && childrenList.length
    ? childrenList.find((child) => String(child.id) === String(currentChildId)) || childrenList[0]
    : null;
  const hasPortalChildContext = role === "caregiver" && Boolean(user.invite_token);
  const accountName =
    (user.display_name || user.full_name || user.primary_contact)?.trim() ||
    (role === "individual" ? user.child_name : "") ||
    (user.email && !user.email.endsWith("@clients.neuropathways.app")
      ? user.email.split("@")[0].split(/[._-]/)[0].replace(/^(.)/, (letter) => letter.toUpperCase())
      : "") ||
    childrenList[0]?.child_name ||
    "Account";
  const accountMeta = role === "clinician"
    ? "Clinical team"
    : role === "individual"
      ? "Individual account"
      : "Family account";
  const baseGroups = createNavigation(role, homePath, role === "caregiver" && !user.invite_token);
  const groups = baseGroups.map((group) => ({
    ...group,
    items: group.items.map((item) => {
      const openSupportOverlay = item.key === "support" && role !== "clinician";
      return {
        ...item,
        active: item.pages?.includes(currentPageName) || false,
        to: openSupportOverlay ? undefined : item.to && ((path) => {
          if (!user.invite_token || path === "/ClientHome") return path;
          const childId = currentChildId;
          if (!childId) return path;
          return `${path}?child_id=${encodeURIComponent(childId)}`;
        })(item.to),
        onSelect: openSupportOverlay ? () => setSupportRequest((request) => request + 1) : item.onSelect,
        disabled: openSupportOverlay && childrenList.length === 0,
      };
    }),
  }));
  const currentItem = groups.flatMap((group) => group.items).find((item) => item.active);
  const currentLabel = currentItem?.label || currentPageName;
  const mobilePrimaryKeys = role === "clinician"
    ? ["dashboard", "clients", "reports"]
    : role === "individual"
      ? ["home", "support", "progress"]
      : ["home", "support", "logs"];

  const handleChildSelect = (childId) => {
    if (user.invite_token) {
      const params = new URLSearchParams(location.search);
      params.set("child_id", childId);
      navigate(`${location.pathname}?${params.toString()}`);
    } else {
      navigate(`/ChildProfile?child_id=${encodeURIComponent(childId)}`);
    }
  };

  return (
    <RoleAwareShell
      role={role}
      roleLabel={role === "clinician" ? "Clinician workspace" : role === "individual" ? "Your personal space" : "Caregiver workspace"}
      currentLabel={currentLabel}
      activeKey={currentItem?.key}
      navGroups={groups}
      mobilePrimaryKeys={mobilePrimaryKeys}
      accountName={accountName}
      accountMeta={accountMeta}
      selectedChild={hasPortalChildContext ? selectedChild : null}
      childrenOptions={hasPortalChildContext ? childrenList : []}
      contextLabel="Viewing support for"
      onChildSelect={hasPortalChildContext && childrenList.length > 1 ? handleChildSelect : undefined}
      onLogout={() => base44.auth.logout("/")}
    >
      {children}
      {role !== "clinician" && (
        <SupportNowOverlay
          user={user}
          children={childrenList}
          isIndividual={role === "individual"}
          openRequest={supportRequest}
          autoOpen={false}
        />
      )}
    </RoleAwareShell>
  );
}
