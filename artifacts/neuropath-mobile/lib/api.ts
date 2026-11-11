import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchWithServiceRecovery } from "@workspace/api-client-react";

const TOKEN_KEY = "np_mobile_token";
const CLINICIAN_TOKEN_KEY = "np_clinician_token";
const SESSION_KEY = "np_mobile_session";
const SELECTED_CHILD_KEY = "np_mobile_child_id";

async function getMobileToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : "";
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getMobileToken();
  const clinicianToken = await AsyncStorage.getItem(CLINICIAN_TOKEN_KEY);
  const selectedChild = await AsyncStorage.getItem(SELECTED_CHILD_KEY);
  const headers: Record<string, string> = {};
  if (clinicianToken) headers.Authorization = `Bearer ${clinicianToken}`;
  else if (token) {
    headers["X-Mobile-Token"] = token;
    if (selectedChild) headers["X-Mobile-Child-Id"] = selectedChild;
  }
  return headers;
}

export async function apiRequest(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  for (const [name, value] of Object.entries(await getAuthHeaders())) headers.set(name, value);
  const res = await fetchWithServiceRecovery(`${getApiBase()}/api${path}`, { ...options, headers }, false);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `API ${res.status}`);
  }
  return res;
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const res = await apiRequest(path, options);
  return res.status === 204 ? null : res.json();
}

export async function storeSelectedChild(id: string) {
  await AsyncStorage.setItem(SELECTED_CHILD_KEY, id);
}

function toQS(filters?: Record<string, any>): string {
  if (!filters) return "";
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null) p.set(k, String(v));
  }
  const s = p.toString();
  return s ? "?" + s : "";
}

// Mobile-scoped entity paths — served by /api/mobile/* routes with per-child auth
const MOBILE_PATHS: Record<string, string> = {
  Child: "mobile/children",
  BehaviorPlan: "mobile/behavior-plans",
  BehaviorLog: "mobile/behavior-logs",
  Message: "mobile/messages",
  Document: "mobile/documents",
  RewardToken: "mobile/reward-tokens",
  WinLog: "mobile/win-logs",
  DailyCheckIn: "mobile/daily-check-ins",
  AIConversation: "mobile/ai-conversations",
};

export const entities: Record<string, {
  filter: (f?: Record<string, any>) => Promise<any[]>;
  create: (d: any) => Promise<any>;
  update: (id: string, d: any) => Promise<any>;
  delete: (id: string) => Promise<any>;
}> = {};

for (const [name, path] of Object.entries(MOBILE_PATHS)) {
  entities[name] = {
    filter: (filters?: Record<string, any>) =>
      apiFetch(`/${path}${toQS(filters)}`),
    create: (data: any) =>
      apiFetch(`/${path}`, { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      apiFetch(`/${path}/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) =>
      apiFetch(`/${path}/${id}`, { method: "DELETE" }),
  };
}

export async function chatSupport(
  childId: string,
  message: string,
  priorMessages: string[] = [],
  mode: "chat" | "help_now" = "chat",
): Promise<{ answer: string; sourceReferences: any[]; disclaimer: string; outcome: string }> {
  return apiFetch("/ai/chat", {
    method: "POST",
    body: JSON.stringify({ childId, message, priorMessages, mode }),
  });
}

export async function storeToken(token: string) {
  await AsyncStorage.removeItem(CLINICIAN_TOKEN_KEY);
  await AsyncStorage.removeItem(SELECTED_CHILD_KEY);
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function storeClinicianToken(token: string) {
  await AsyncStorage.removeItem(TOKEN_KEY);
  await AsyncStorage.removeItem(SELECTED_CHILD_KEY);
  await AsyncStorage.setItem(CLINICIAN_TOKEN_KEY, token);
}

export async function clearToken() {
  await AsyncStorage.removeItem(TOKEN_KEY);
  await AsyncStorage.removeItem(CLINICIAN_TOKEN_KEY);
  await AsyncStorage.removeItem(SESSION_KEY);
  await AsyncStorage.removeItem(SELECTED_CHILD_KEY);
}
