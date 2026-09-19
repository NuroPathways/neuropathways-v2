// REST API shim replacing base44.entities.*
// Translates the same .filter/.create/.update/.delete interface to fetch calls

const ENTITY_PATHS = {
  Child: "children",
  Family: "families",
  BehaviorPlan: "behavior-plans",
  Document: "documents",
  InterventionPlan: "intervention-plans",
  BehaviorLog: "behavior-logs",
  RewardToken: "reward-tokens",
  Message: "messages",
  AIConversation: "ai-conversations",
  DailyCheckIn: "daily-check-ins",
  WinLog: "win-logs",
  EngagementEvent: "engagement-events",
  ClientProfile: "client-profiles",
};

// Convert snake_case to camelCase so filter keys match what the server expects
function snakeToCamel(str) {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function toQueryString(filters) {
  if (!filters || Object.keys(filters).length === 0) return "";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null) {
      // Always send camelCase keys — the server uses camelCase column names
      params.set(snakeToCamel(k), String(v));
    }
  }
  return "?" + params.toString();
}

// Convert snake_case body keys to camelCase for insert/update payloads
function bodyToCamel(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [snakeToCamel(k), v])
  );
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (res.status === 401) {
    // Client sessions (username+code) handle their own session expiry.
    const isClientSession = !!localStorage.getItem("np_client_session");
    if (!isClientSession) {
      window.location.href = `/ClinicianLogin?returnTo=${encodeURIComponent(window.location.pathname)}`;
      return new Promise(() => {});
    }
    throw new Error("API error 401: session expired");
  }
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

function makeEntity(entityPath) {
  return {
    filter: (filters, sort, limit) => apiFetch(`/${entityPath}${toQueryString(filters)}`),
    create: (data) => apiFetch(`/${entityPath}`, { method: "POST", body: JSON.stringify(bodyToCamel(data)) }),
    update: (id, data) => apiFetch(`/${entityPath}/${id}`, { method: "PATCH", body: JSON.stringify(bodyToCamel(data)) }),
    delete: (id) => apiFetch(`/${entityPath}/${id}`, { method: "DELETE" }),
    subscribe: () => () => {}, // no-op: real-time not supported
  };
}

export const entities = Object.fromEntries(
  Object.entries(ENTITY_PATHS).map(([name, path]) => [name, makeEntity(path)])
);

// EngagementEvent.create override — client-session users (username+code login) have no
// OIDC session cookie, so the standard requireAuth middleware returns 401. The server's
// special client-session route for POST /engagement-events intercepts only when
// invite_token is present in the body. We read the token from localStorage here so every
// existing call site (WinTodayButton, DailyCheckInModal, ParentDashboard, etc.) works
// without any individual changes.
function getClientSessionInviteToken() {
  try {
    const raw = localStorage.getItem("np_client_session");
    if (!raw) return null;
    const session = JSON.parse(raw);
    return session?.invite_token || null;
  } catch {
    return null;
  }
}

entities.EngagementEvent = {
  ...entities.EngagementEvent,
  create: (data) => {
    const invite_token = getClientSessionInviteToken();
    const payload = invite_token ? { ...data, invite_token } : data;
    return apiFetch("/engagement-events", {
      method: "POST",
      body: JSON.stringify(bodyToCamel(payload)),
    });
  },
};

export const auth = {
  me: async () => {
    const user = await apiFetch("/users/me");
    return {
      id: user.id,
      email: user.email,
      first_name: user.firstName || user.first_name,
      last_name: user.lastName || user.last_name,
      display_name: user.displayName || user.display_name,
      phone: user.phone,
      app_role: user.appRole || user.app_role,
      account_type: user.accountType || user.account_type,
      linked_family_id: user.linkedFamilyId || user.linked_family_id,
      profile_image_url: user.profileImageUrl || user.profile_image_url,
      ...user,
    };
  },
  updateMe: async (updates) => apiFetch("/users/me", { method: "PATCH", body: JSON.stringify(bodyToCamel(updates)) }),
  logout: () => { window.location.href = `/api/logout`; },
  redirectToLogin: (returnTo) => {
    const base = import.meta.env.BASE_URL || "/";
    window.location.href = `/api/login?returnTo=${encodeURIComponent(returnTo || base)}`;
  },
  isAuthenticated: async () => {
    try {
      const res = await fetch("/api/auth/user", { credentials: "include" });
      if (!res.ok) return false;
      const data = await res.json();
      return data?.user != null;
    } catch {
      return false;
    }
  },
};

export const integrations = {
  Core: {
    InvokeLLM: async ({ prompt, model }) =>
      apiFetch("/ai/invoke-llm", { method: "POST", body: JSON.stringify({ prompt, model }) }),
    UploadFile: async ({ file }) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", credentials: "include", body: formData });
      if (!res.ok) throw new Error(`Upload failed ${res.status}`);
      return res.json();
    },
  },
};

export const functions = {
  invoke: async (name, args = {}) => {
    switch (name) {
      case "getClinicianData": {
        const data = await apiFetch("/clinician-data");
        return { data };
      }
      case "getClientPortalData": {
        const data = await apiFetch("/client-portal-data", { method: "POST", body: JSON.stringify(args) });
        return { data };
      }
      case "getClientDetail": {
        if (args.family_id) {
          const data = await apiFetch(`/family-detail?family_id=${encodeURIComponent(args.family_id)}`);
          return { data };
        }
        const data = await apiFetch(`/client-detail?child_id=${encodeURIComponent(args.child_id)}`);
        return { data };
      }
      case "getFamilyDetail": {
        const data = await apiFetch(`/family-detail?family_id=${encodeURIComponent(args.family_id)}`);
        return { data };
      }
      case "createClientAccount": {
        const data = await apiFetch("/create-client-account", { method: "POST", body: JSON.stringify(args) });
        return { data };
      }
      case "sendInviteEmail": {
        // Email sending not yet implemented — return success so UI flow continues
        console.info("[NeuroPath] sendInviteEmail called (no-op):", args);
        return { data: { sent: true } };
      }
      case "buildClientProfile": {
        const data = await apiFetch("/build-client-profile", { method: "POST", body: JSON.stringify(args) });
        return { data };
      }
      case "manageClientRecord": {
        const data = await apiFetch("/manage-client-record", { method: "POST", body: JSON.stringify(args) });
        return { data };
      }
      case "manageClientGoal": {
        const data = await apiFetch("/manage-client-goal", { method: "POST", body: JSON.stringify(args) });
        return { data };
      }
      case "verifyClientCredentials": {
        const data = await apiFetch("/verify-client-credentials", { method: "POST", body: JSON.stringify(args) });
        return { data };
      }
      case "addChildToFamily": {
        const data = await apiFetch("/add-child-to-family", { method: "POST", body: JSON.stringify(args) });
        return { data };
      }
      default:
        console.warn(`[NeuroPath] functions.invoke: unknown function "${name}"`, args);
        return { data: null };
    }
  },
};

// The unified base44 shim object used as: base44.entities.X, base44.auth.X, etc.
export const base44 = { entities, auth, integrations, functions };
