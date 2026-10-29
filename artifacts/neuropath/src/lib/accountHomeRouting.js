const CAREGIVER_ACCOUNT_TYPES = new Set([
  "parent",
  "parent_family",
  "parent_free",
  "legacy_family",
  "family",
  "caregiver",
]);

const LEGACY_CLIENT_HOME_ALIASES = new Set([
  "/ParentDashboard",
  "/ClientDashboard",
  "/ClientHome",
]);

const normalizePath = (path) => {
  const trimmed = String(path || "/").replace(/\/+$/, "");
  return trimmed || "/";
};

const hasCaregiverRole = (user) =>
  ["parent", "caregiver"].includes(user?.app_role)
  || ["parent", "caregiver"].includes(user?.role)
  || CAREGIVER_ACCOUNT_TYPES.has(user?.account_type);

/**
 * Returns the canonical home destination for legacy dashboard aliases.
 * Role-specific navigation and data routes are otherwise left untouched.
 */
export function getAccountHomeRedirect(user, pathname, search = "") {
  const path = normalizePath(pathname);
  const suffix = search || "";

  if (hasCaregiverRole(user) && LEGACY_CLIENT_HOME_ALIASES.has(path)) {
    return `/ParentHome${suffix}`;
  }

  const isIndividualClient = user?.account_type === "individual";
  if (isIndividualClient) {
    if (path === "/ClientDashboard") {
      return user?.invite_token ? `/ClientHome${suffix}` : `/ParentDashboard${suffix}`;
    }
    if (path === "/ClientHome" && !user?.invite_token) {
      return `/ParentDashboard${suffix}`;
    }
    if (path === "/ParentDashboard" && user?.invite_token) {
      return `/ClientHome${suffix}`;
    }
    return null;
  }

  // Preserve the existing username/access-code portal for other verified
  // client sessions that carry an invite token but no caregiver role.
  if (user?.invite_token && ["/ParentDashboard", "/ClientDashboard"].includes(path)) {
    return `/ClientHome${suffix}`;
  }

  return null;
}
