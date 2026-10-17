import { getClientSession } from "./clientSession";
const KEY = "np_parent_token";

export function saveParentToken(token) {
  try { localStorage.setItem(KEY, token); } catch { /* storage unavailable; cookie remains */ }
}
export function getParentToken() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
export function clearParentToken() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

// Request options for generated parent API functions/hooks: token header plus cookie.
export function parentRequest(extra = {}) {
  const familyToken = getClientSession()?.invite_token;
  const token = getParentToken();
  return {
    credentials: "include",
    ...extra,
    headers: { ...(familyToken ? { "X-Family-Token": familyToken } : token ? { "X-Parent-Token": token } : {}), ...(extra.headers || {}) },
  };
}

// Pending clinic invite is preserved across signup/login redirects.
const INVITE_KEY = "np_parent_invite";
export function rememberInvite(token) { try { sessionStorage.setItem(INVITE_KEY, token); } catch { /* ignore */ } }
export function recallInvite() { try { return sessionStorage.getItem(INVITE_KEY); } catch { return null; } }
export function forgetInvite() { try { sessionStorage.removeItem(INVITE_KEY); } catch { /* ignore */ } }
