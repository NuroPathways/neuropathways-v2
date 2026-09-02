const KEY = "np_client_session";

export function saveClientSession(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
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
}