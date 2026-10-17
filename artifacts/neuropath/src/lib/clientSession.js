const KEY = "np_client_session";
const SUPPORT_POPUP_DISMISSED_KEY = "np_support_popup_dismissed";
const FAMILY_LOGIN_REQUIRED = "np_family_login_required";
export function requireFamilyLogin() { try { localStorage.setItem(FAMILY_LOGIN_REQUIRED, "1"); } catch { /* unavailable */ } }
export function isFamilyLoginRequired() { try { return localStorage.getItem(FAMILY_LOGIN_REQUIRED) === "1"; } catch { return false; } }
export function clearFamilyLoginRequirement() { try { localStorage.removeItem(FAMILY_LOGIN_REQUIRED); } catch { /* unavailable */ } }

export function saveClientSession(data) {
  clearFamilyLoginRequirement();
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