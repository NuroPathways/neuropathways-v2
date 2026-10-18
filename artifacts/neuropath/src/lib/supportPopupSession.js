const POPUP_SHOWN_PREFIX = "np-support-popup-shown:";
const shownInMemory = new Set();

function storageKey(userId) {
  return `${POPUP_SHOWN_PREFIX}${String(userId || "")}`;
}

export function hasSupportPopupBeenShown(userId) {
  if (!userId) return false;
  const key = storageKey(userId);
  try {
    return window.sessionStorage.getItem(key) === "1" || shownInMemory.has(key);
  } catch {
    return shownInMemory.has(key);
  }
}

export function markSupportPopupShown(userId) {
  if (!userId) return;
  const key = storageKey(userId);
  shownInMemory.add(key);
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    // The in-memory marker still prevents duplicate opens during this page load.
  }
}

export function clearSupportPopupSession(userId) {
  if (!userId) return;
  const key = storageKey(userId);
  shownInMemory.delete(key);
  try {
    window.sessionStorage.removeItem(key);
    // Remove the old shared marker written by earlier versions of this flow.
    window.sessionStorage.removeItem("np_support_popup_dismissed");
  } catch {
    // The in-memory marker is still cleared when storage is unavailable.
  }
}
