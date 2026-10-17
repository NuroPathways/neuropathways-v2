import React, { createContext, useState, useContext, useEffect } from 'react';
import { getClientSession, clearClientSession, requireFamilyLogin, isFamilyLoginRequired, clearFamilyLoginRequirement } from '@/lib/clientSession';
import { getParentToken, saveParentToken, clearParentToken, parentRequest } from '@/lib/parentSession';
import { getParentSession, logoutParent } from '@workspace/api-client-react';

function toParentUser(session) {
  const p = session.parent;
  return {
    id: p.id,
    email: p.email,
    first_name: p.firstName,
    full_name: p.firstName,
    display_name: p.firstName,
    account_type: p.accountType,
    app_role: p.accountType === 'legacy_family' ? 'parent' : 'parent_free',
    workspace_id: p.workspaceId,
    parent_children: session.children || [],
  };
}

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

      // Check client session (username/access-code login) first.  A parent who
      // logged in via the client flow always did so AFTER any prior clinician
      // login, so their localStorage session is the newer, intended identity.
      // Explicit clinician login calls checkUserAuth() which clears the client
      // session, so by the next load the clinician cookie wins naturally.
      let clientSession = getClientSession();
      if (clientSession && !clientSession.invite_token) {
        clearClientSession();
        clientSession = null;
      }
      if (clientSession) {
        const response = await fetch("/api/parent/session", {
          credentials: "include", headers: { "X-Family-Token": clientSession.invite_token },
        });
        const session = await response.json();
        if (response.ok) setUser(toParentUser(session));
        else if (response.status === 409 && session.code === "individual_client") setUser(clientSession);
        else {
          if ([401, 403, 409].includes(response.status)) {
            clearClientSession();
            requireFamilyLogin();
          }
          setUser(null);
          setIsAuthenticated(false);
          setAuthError({ type: "family_session", message: session.error || "Your family session could not be verified. Sign in again." });
          setIsLoadingAuth(false);
          setAuthChecked(true);
          return;
        }
        setIsAuthenticated(true);
        setIsLoadingAuth(false);
        setAuthChecked(true);
        return;
      }
      // A rejected family session must not silently resurrect an unrelated
      // parent or clinician cookie. Only a subsequent explicit login clears it.
      if (isFamilyLoginRequired()) {
        setUser(null); setIsAuthenticated(false); setIsLoadingAuth(false); setAuthChecked(true);
        return;
      }

      // Free parent session (email account) uses its own token/cookie.
      try {
        const ps = await getParentSession(parentRequest());
        if (ps?.parent) {
          setUser(toParentUser(ps));
          setIsAuthenticated(true);
          setIsLoadingAuth(false);
          setAuthChecked(true);
          return;
        }
      } catch {
        if (getParentToken()) clearParentToken();
      }

      // No active client session — check for a cookie-based clinician session.
      let currentUser = null;
      try {
        currentUser = await fetchCurrentUser();
      } catch {
        currentUser = null;
      }
      if (currentUser) {
        setUser(currentUser);
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
      clearFamilyLoginRequirement();
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

  const setParentAuth = (result) => {
    clearFamilyLoginRequirement();
    if (result.token) saveParentToken(result.token);
    clearClientSession();
    setUser(toParentUser(result));
    setIsAuthenticated(true);
    setAuthChecked(true);
  };

  const refreshParent = async () => {
    try {
      const ps = await getParentSession(parentRequest());
      setUser(toParentUser(ps));
      return ps;
    } catch {
      return null;
    }
  };

  const logoutParentAccount = async () => {
    try { await logoutParent(parentRequest({ method: 'POST' })); } catch { /* token is cleared locally regardless */ }
    clearParentToken();
    clearClientSession();
    if (user?.account_type === "legacy_family") requireFamilyLogin();
    setUser(null);
    setIsAuthenticated(false);
    window.location.href = "/";
  };

  const logout = () => {
    if (['parent_free', 'legacy_family'].includes(user?.account_type)) { logoutParentAccount(); return; }
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
      setParentAuth,
      refreshParent,
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
