import React, { createContext, useState, useContext, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import { getApiBase, storeToken, storeClinicianToken, clearToken, apiFetch } from "@/lib/api";

const SESSION_KEY = "np_mobile_session";

interface MobileUser {
  id: string;
  child_name?: string;
  username?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  role: "client" | "clinician";
}

interface AuthContextType {
  user: MobileUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, accessCode: string) => Promise<void>;
  loginClinician: (email: string, password: string) => Promise<void>;
  registerClinician: (email: string, password: string, firstName: string, lastName: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<MobileUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    loadSession();
  }, []);

  const loadSession = async () => {
    try {
      const raw = await AsyncStorage.getItem(SESSION_KEY);
      if (raw) {
        const session: MobileUser = JSON.parse(raw);
        if (session?.id && session.role === "clinician") {
          const data = await apiFetch("/auth/user");
          if (data.user?.id === session.id) setUser(session);
          else await clearToken();
        } else if (session?.id) {
          const children = await apiFetch("/mobile/children");
          if (children.some((child: { id: string }) => child.id === session.id)) setUser({ ...session, role: "client" });
          else await clearToken();
        }
      }
    } catch (error) {
      // Only clear stored credentials when the server explicitly rejects them.
      if (error instanceof Error && /401|expired|token|Authentication required/i.test(error.message)) await clearToken();
    }
    setIsLoading(false);
  };

  const login = async (username: string, accessCode: string) => {
    const base = getApiBase();
    const res = await fetch(`${base}/api/mobile/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, access_code: accessCode }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Login failed");
    }
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    await storeToken(data.token);
    queryClient.clear();
    const session: MobileUser = {
      id: data.child.id,
      child_name: data.child.child_name,
      username: data.child.username,
      role: "client",
    };
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setUser(session);
  };

  const clinicianAuth = async (path: "login" | "register", payload: Record<string, string>) => {
    const res = await fetch(`${getApiBase()}/api/mobile/clinician/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.token || data.clinician?.role !== "clinician") {
      throw new Error(data.error || "Clinician sign-in failed");
    }
    await storeClinicianToken(data.token);
    queryClient.clear();
    const session: MobileUser = data.clinician;
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setUser(session);
  };

  const loginClinician = (email: string, password: string) =>
    clinicianAuth("login", { email: email.trim(), password });

  const registerClinician = (email: string, password: string, firstName: string, lastName: string) =>
    clinicianAuth("register", { email: email.trim(), password, firstName: firstName.trim(), lastName: lastName.trim() });

  const logout = async () => {
    try {
      if (user?.role === "clinician") await apiFetch("/mobile/clinician/logout", { method: "DELETE" });
      else await apiFetch("/mobile/auth/logout", { method: "DELETE" });
    } catch {
      // Always remove local credentials even if the server is unavailable.
    }
    await clearToken();
    queryClient.clear();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, isLoading, isAuthenticated: !!user, login, loginClinician, registerClinician, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
