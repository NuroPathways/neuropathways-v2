import { getClientSession } from "@/lib/clientSession";

const PROTECTED_UPLOAD_PATH = /^\/api\/uploads(?:\/|$)/;
const BLOB_URL_REVOKE_DELAY_MS = 60_000;

/**
 * Intercept protected local upload links and open them with the active web
 * session. Safe external URLs are left to the browser's normal link behavior.
 */
export function openAuthenticatedFile(event, fileUrl, onError) {
  onError?.("");
  if (typeof fileUrl !== "string" || !fileUrl.trim()) {
    event.preventDefault();
    onError?.("This file link is unavailable.");
    return;
  }

  let url;
  try {
    url = new URL(fileUrl, window.location.href);
  } catch {
    event.preventDefault();
    onError?.("This file link is invalid.");
    return;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    event.preventDefault();
    onError?.("This file link is not supported.");
    return;
  }

  const isProtectedUpload =
    url.origin === window.location.origin &&
    PROTECTED_UPLOAD_PATH.test(url.pathname);

  // Leave external and other safe links unchanged; never add client tokens to
  // those requests.
  if (!isProtectedUpload) return;

  event.preventDefault();

  // Open synchronously during the click gesture so popup blockers do not stop
  // the authenticated request from being viewed in a new tab.
  const popup = window.open("about:blank", "_blank");
  if (!popup) {
    onError?.("Please allow pop-ups to view this file.");
    return;
  }
  popup.opener = null;

  const clientToken = getClientSession()?.invite_token;
  const headers = clientToken ? { "X-Client-Token": clientToken } : undefined;

  void (async () => {
    let blobUrl;
    try {
      const response = await fetch(url.href, {
        credentials: "include",
        headers,
      });
      if (!response.ok) {
        throw new Error(`The file could not be opened (HTTP ${response.status}).`);
      }

      blobUrl = URL.createObjectURL(await response.blob());
      popup.location.replace(blobUrl);
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), BLOB_URL_REVOKE_DELAY_MS);
    } catch (error) {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      popup.close();
      onError?.(error instanceof Error ? error.message : "The file could not be opened.");
    }
  })();
}