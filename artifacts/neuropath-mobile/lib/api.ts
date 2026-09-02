import AsyncStorage from "@react-native-async-storage/async-storage";

const TOKEN_KEY = "np_mobile_token";
const SESSION_KEY = "np_mobile_session";

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

export async function apiFetch(path: string, options: RequestInit = {}) {
  const base = getApiBase();
  const token = await getMobileToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["X-Mobile-Token"] = token;

  const res = await fetch(`${base}/api${path}`, { ...options, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => res.status.toString());
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
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

export async function invokeAI(prompt: string): Promise<string> {
  const result = await apiFetch("/ai/invoke-llm", {
    method: "POST",
    body: JSON.stringify({ prompt, model: "claude-opus-4-5" }),
  });
  return result?.content?.[0]?.text ?? result?.text ?? JSON.stringify(result);
}

export async function storeToken(token: string) {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function clearToken() {
  await AsyncStorage.removeItem(TOKEN_KEY);
  await AsyncStorage.removeItem(SESSION_KEY);
}
