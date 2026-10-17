import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import { getParentSession, loginParent, logoutParent, registerParent } from "@workspace/api-client-react";
import { getParentBehaviors } from "@workspace/api-client-react";
import type { ParentChild, Parent } from "@workspace/api-client-react";
import { PARENT_CHILD_KEY, PARENT_TOKEN_KEY, clearParentStorage, clearShareCache, parentOpts } from "@/lib/parent";
import { useAuth } from "@/context/AuthContext";

interface ParentCtx {
  error: string | null;
  ready: boolean;
  token: string | null;
  parent: Parent | null;
  children: ParentChild[];
  child: ParentChild | null;
  setupComplete: boolean;
  opts: { headers: Record<string, string> };
  signup: (v: {
    firstName: string;
    email: string;
    password: string;
    confirmPassword: string;
    accountHolderAgeGroup: "13_17" | "18_plus";
    adultOrGuardianConfirmed: true;
    parentGuardianAuthorityConfirmed: true;
  }) => Promise<void>;
  signin: (email: string, password: string) => Promise<void>;
  signout: () => Promise<void>;
  selectChild: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  upsertChild: (c: ParentChild) => void;
}

const Ctx = createContext<ParentCtx | null>(null);

export const isSetupComplete = (c: ParentChild | null) => {
  if (!c || !c.name) return false;
  const b = getParentBehaviors(c);
  return b.length > 0 && b.every((x) => !!x.goal?.trim());
};

export function ParentProvider({ children: kids }: { children: React.ReactNode }) {
  const auth = useAuth();
  const identityKey = auth.user ? `${auth.user.role}:${auth.user.id}` : "parent-account";
  const [loadedIdentity, setLoadedIdentity] = useState<string | null>(null);
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [parent, setParent] = useState<Parent | null>(null);
  const [children, setChildren] = useState<ParentChild[]>([]);
  const [childId, setChildId] = useState<string | null>(null);

  const apply = useCallback(async (p: Parent, list: ParentChild[]) => {
    const selectionKey = `${PARENT_CHILD_KEY}:${p.id}`;
    const saved = await AsyncStorage.getItem(selectionKey);
    const pick = list.find((c) => c.id === saved) ?? (list.length === 1 ? list[0] : null);
    setParent(p);
    setChildren(list);
    setChildId(pick?.id ?? null);
    if (pick) await AsyncStorage.setItem(selectionKey, pick.id);
    else await AsyncStorage.removeItem(selectionKey);
  }, []);

  useEffect(() => {
    if (auth.isLoading) return;
    let active = true;
    setReady(false);
    setError(null);
    (async () => {
      try {
        const familyToken = auth.user?.role === "family" ? await AsyncStorage.getItem("np_mobile_token") : null;
        const t = familyToken ? `family-mobile:${familyToken}` : auth.user ? null : await AsyncStorage.getItem(PARENT_TOKEN_KEY);
        if (t) {
          const s = await getParentSession(parentOpts(t));
          if (!active) return;
          setToken(t);
          await apply(s.parent, s.children);
        } else if (active) {
          setToken(null); setParent(null); setChildren([]); setChildId(null);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "The family session could not be verified");
        if (active) { setToken(null); setParent(null); setChildren([]); setChildId(null); }
        if (e instanceof Error && /401|expired|token|auth|session/i.test(e.message)) await clearParentStorage();
      }
      if (active) { setLoadedIdentity(identityKey); setReady(true); }
    })();
    return () => { active = false; };
  }, [apply, auth.isLoading, auth.user?.id, auth.user?.role]);

  const finishAuth = async (t: string, p: Parent, list: ParentChild[]) => {
    if (auth.user) await auth.logout();
    await AsyncStorage.setItem(PARENT_TOKEN_KEY, t);
    await clearShareCache();
    qc.clear();
    setToken(t);
    await apply(p, list);
    setLoadedIdentity("parent-account");
    setReady(true);
  };

  const signup: ParentCtx["signup"] = async (v) => {
    const r = await registerParent({
      firstName: v.firstName.trim(),
      email: v.email.trim(),
      password: v.password,
      confirmPassword: v.confirmPassword,
      privacyConsent: true,
      healthConsent: true,
      accountHolderType: "parent_guardian",
      accountHolderAgeGroup: v.accountHolderAgeGroup,
      adultOrGuardianConfirmed: v.adultOrGuardianConfirmed,
      parentGuardianAuthorityConfirmed: v.parentGuardianAuthorityConfirmed,
    } as any);
    await finishAuth(r.token, r.parent, r.children);
  };
  const signin: ParentCtx["signin"] = async (email, password) => {
    const r = await loginParent({ email: email.trim(), password });
    await finishAuth(r.token, r.parent, r.children);
  };
  const signout = async () => {
    if (parent?.accountType === "legacy_family" || auth.user?.role === "family") await auth.logout();
    try { await logoutParent(parentOpts(token)); } catch { /* local credentials are always removed */ }
    await clearParentStorage();
    qc.clear();
    setToken(null); setParent(null); setChildren([]); setChildId(null);
  };
  const selectChild = async (id: string) => {
    if (!children.some(c => c.id === id)) throw new Error("This child is not available to your family");
    if (id === childId) return;
    await qc.cancelQueries();
    await clearShareCache();
    await AsyncStorage.setItem(`${PARENT_CHILD_KEY}:${parent?.id}`, id);
    qc.clear();
    setChildId(id);
  };
  const refresh = async () => {
    const s = await getParentSession(parentOpts(token));
    setParent(s.parent);
    setChildren(s.children);
    if (!s.children.some((c) => c.id === childId)) {
      const nextChild = s.children.length === 1 ? s.children[0] : null;
      setChildId(nextChild?.id ?? null);
      if (nextChild) await AsyncStorage.setItem(`${PARENT_CHILD_KEY}:${s.parent.id}`, nextChild.id);
      else await AsyncStorage.removeItem(`${PARENT_CHILD_KEY}:${s.parent.id}`);
    }
  };
  const upsertChild = (c: ParentChild) => {
    setChildren((prev) => (prev.some((x) => x.id === c.id) ? prev.map((x) => (x.id === c.id ? c : x)) : [...prev, c]));
    setChildId((cur) => cur ?? c.id);
    AsyncStorage.setItem(`${PARENT_CHILD_KEY}:${parent?.id}`, c.id).catch(() => undefined);
  };

  const child = children.find((c) => c.id === childId) ?? null;
  const value = useMemo<ParentCtx>(
    () => ({ ready: ready && loadedIdentity === identityKey, error, token, parent, children, child, setupComplete: parent?.accountType === "legacy_family" ? !!child : isSetupComplete(child), opts: parentOpts(token), signup, signin, signout, selectChild, refresh, upsertChild }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, loadedIdentity, identityKey, error, token, parent, children, childId],
  );
  return <Ctx.Provider value={value}>{kids}</Ctx.Provider>;
}

export const useParent = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useParent must be used within ParentProvider");
  return c;
};
