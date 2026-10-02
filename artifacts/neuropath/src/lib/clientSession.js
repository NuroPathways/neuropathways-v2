const KEY = "np_client_session";
const SUPPORT_POPUP_DISMISSED_KEY = "np_support_popup_dismissed";

export function saveClientSession(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
  try { sessionStorage.removeItem(SUPPORT_POPUP_DISMISSED_KEY); } catch { /* Session storage may be unavailable. */ }
}

export function getClientSession() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearClientSession() {
  localStorage.removeItem(KEY);
  try { sessionStorage.removeItem(SUPPORT_POPUP_DISMISSED_KEY); } catch { /* Session storage may be unavailable. */ }
}