import React, { createContext, useState, useContext, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiBase, storeToken, clearToken } from "@/lib/api";

const SESSION_KEY = "np_mobile_session";

interface MobileUser {
  id: string;
  child_name?: string;
  username?: string;
}

interface AuthContextType {
  user: MobileUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, accessCode: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<MobileUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSession();
  }, []);

  const loadSession = async () => {
    try {
      const raw = await AsyncStorage.getItem(SESSION_KEY);
      if (raw) {
        const session = JSON.parse(raw);
        if (session?.id) setUser(session);
      }
    } catch {}
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
    const session: MobileUser = {
      id: data.child.id,
      child_name: data.child.child_name,
      username: data.child.username,
    };
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setUser(session);
  };

  const logout = async () => {
    await clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, isLoading, isAuthenticated: !!user, login, logout }}
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
