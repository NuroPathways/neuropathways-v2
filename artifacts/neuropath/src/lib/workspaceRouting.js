const DESTINATIONS = Object.freeze({
  "platform-administration": { type: "platform_admin", homePath: "/PlatformAdminClinics" },
  "clinic-administration": { type: "clinic_admin", homePath: "/ClinicianUsers" },
  "clinical-workspace": { type: "clinician", homePath: "/ClinicianDashboard" },
});

export function getAuthorizedWorkspaces(user) {
  const authorizedWorkspaces = user?.authorizedWorkspaces ?? user?.authorized_workspaces;
  return (Array.isArray(authorizedWorkspaces) ? authorizedWorkspaces : [])
    .filter((workspace) => DESTINATIONS[workspace?.id]?.type === workspace?.type)
    .map((workspace) => ({
      id: workspace.id,
      type: workspace.type,
      label: String(workspace.label || ""),
      homePath: DESTINATIONS[workspace.id].homePath,
    }));
}

export function getWorkspaceById(user, id) {
  return getAuthorizedWorkspaces(user).find((workspace) => workspace.id === id) || null;
}

export function getPostLoginPath(user, workspaceIntent) {
  const workspaces = getAuthorizedWorkspaces(user);
  const intentId = workspaceIntent === "clinic-admin"
    ? "clinic-administration"
    : workspaceIntent === "clinician"
      ? "clinical-workspace"
      : null;
  const requested = intentId ? workspaces.find((workspace) => workspace.id === intentId) : null;
  if (requested) return requested.homePath;
  if (workspaces.length > 1) return "/WorkspaceSelect";
  if (workspaces.length === 1) return workspaces[0].homePath;

  const role = user?.appRole || user?.app_role;
  if (role === "parent" || role === "caregiver") return "/ParentHome";
  if (role === "parent_free" || user?.accountType === "parent_free") return "/ParentHome";
  if (role === "pending_clinician") return "/RoleSetup?role=clinician";
  return null;
}

export function resolveActiveWorkspace(user, pathname, search = "") {
  const workspaces = getAuthorizedWorkspaces(user);
  const query = new URLSearchParams(search);
  const selected = workspaces.find((workspace) => workspace.id === query.get("workspace"));
  if (selected) return selected;

  const routePreference = pathname === "/PlatformAdminClinics"
    ? "platform-administration"
    : pathname === "/ClinicianUsers"
      ? "clinic-administration"
      : ["/ClinicianDashboard", "/ClinicianDocuments", "/InterventionBuilder", "/ProgressReports", "/AIChat", "/Messages"].includes(pathname)
        ? "clinical-workspace"
        : null;
  const routeWorkspace = workspaces.find((workspace) => workspace.id === routePreference);
  if (routeWorkspace) return routeWorkspace;
  return workspaces.find((workspace) => workspace.id === (user?.defaultWorkspaceId ?? user?.default_workspace_id)) || workspaces[0] || null;
}
