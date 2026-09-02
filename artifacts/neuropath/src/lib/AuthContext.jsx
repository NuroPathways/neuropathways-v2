import React, { createContext, useState, useContext, useEffect } from 'react';
import { getClientSession, clearClientSession } from '@/lib/clientSession';

const AuthContext = createContext();

async function fetchCurrentUser() {
  const res = await fetch("/api/users/me", { credentials: "include" });
  if (!res.ok) throw new Error("not authenticated");
  const raw = await res.json();
  const firstName = raw.firstName || raw.first_name || "";
  const lastName = raw.lastName || raw.last_name || "";
  const fullName =
    raw.fullName ||
    raw.full_name ||
    [firstName, lastName].filter(Boolean).join(" ").trim() ||
    null;
  const displayName = raw.displayName || raw.display_name || fullName;
  return {
    ...raw,
    id: raw.id,
    email: raw.email,
    first_name: firstName || undefined,
    last_name: lastName || undefined,
    full_name: fullName,
    display_name: displayName,
    phone: raw.phone,
    app_role: raw.appRole || raw.app_role,
    account_type: raw.accountType || raw.account_type,
    linked_family_id: raw.linkedFamilyId || raw.linked_family_id,
    profile_image_url: raw.profileImageUrl || raw.profile_image_url,
  };
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings] = useState(null);

  useEffect(() => {
    checkAppState();
  }, []);

  const checkAppState = async () => {
    try {
      setIsLoadingAuth(true);
      setAuthError(null);

      // A real cookie-based server session (Replit Auth or email/password
      // clinician, or a Replit-Auth parent) always takes precedence over a
      // localStorage client session. Otherwise a leftover client session from
      // an earlier username/access-code login would mask a freshly signed-in
      // clinician and route them into the client portal.
      let currentUser = null;
      try {
        currentUser = await fetchCurrentUser();
      } catch {
        currentUser = null;
      }
      if (currentUser) {
        clearClientSession();
        setUser(currentUser);
        setIsAuthenticated(true);
        setIsLoadingAuth(false);
        setAuthChecked(true);
        return;
      }

      let clientSession = getClientSession();
      if (clientSession && !clientSession.invite_token) {
        clearClientSession();
        clientSession = null;
      }
      if (clientSession) {
        setUser(clientSession);
        setIsAuthenticated(true);
        setIsLoadingAuth(false);
        setAuthChecked(true);
        return;
      }

      setIsAuthenticated(false);
      setIsLoadingAuth(false);
      setAuthChecked(true);
    } catch (error) {
      setAuthError({ type: 'unknown', message: error.message || 'Failed to load app' });
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  };

  const checkUserAuth = async () => {
    try {
      setIsLoadingAuth(true);
      const currentUser = await fetchCurrentUser();
      // A server session supersedes any leftover localStorage client session.
      clearClientSession();
      setUser(currentUser);
      setIsAuthenticated(true);
    } catch {
      setIsAuthenticated(false);
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  };

  const refreshUser = async () => {
    try {
      const currentUser = await fetchCurrentUser();
      setUser(currentUser);
      return currentUser;
    } catch {
      return null;
    }
  };

  const logout = () => {
    clearClientSession();
    setUser(null);
    setIsAuthenticated(false);
    setAuthChecked(false);
    window.location.href = "/api/logout";
  };

  const navigateToLogin = () => {
    const base = import.meta.env.BASE_URL || "/";
    window.location.href = `/api/login?returnTo=${encodeURIComponent(base)}`;
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      authChecked,
      authError,
      appPublicSettings,
      logout,
      navigateToLogin,
      checkAppState,
      checkUserAuth,
      refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
