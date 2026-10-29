const STARTING_MESSAGE = "The document service is starting. Your file has not been rejected. Please retry scanning in a moment.";
const UNAVAILABLE_MESSAGE = "The document service is temporarily unavailable. Your file has not been rejected. Please retry in a moment.";

/** Also recognizes old errors that already contain an upstream HTML page. */
export function serviceResponseMessage(value: unknown): string | null {
  const text = String(value || "");
  if (!/<!doctype\s+html|<html[\s>]/i.test(text)) return null;
  return /your app is starting|__replco_starting|this is taking longer than expected/i.test(text)
    ? STARTING_MESSAGE
    : UNAVAILABLE_MESSAGE;
}

export class ServiceResponseError extends Error {
  readonly retryable = true;
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, starting: boolean) {
    super(message);
    this.name = "ServiceResponseError";
    this.status = status >= 400 ? status : 503;
    this.code = starting ? "SERVICE_STARTING" : "SERVICE_UNAVAILABLE";
  }
}

function waitForRetry(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(signal?.reason || Object.assign(new Error("Request cancelled"), { name: "AbortError" }));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}

/**
 * Retry only the proxy's recognizable startup page, which is returned before
 * the application handles the request. Never replay ambiguous network failures,
 * JSON errors or generic gateway timeouts: a write/scan may already have run.
 * FormData and string bodies are reusable; streaming bodies are not retried.
 */
export async function fetchWithServiceRecovery(
  input: RequestInfo | URL,
  init: RequestInit = {},
  expectJson = true,
): Promise<Response> {
  const request = typeof Request !== "undefined" && input instanceof Request ? input : null;
  const signal = init.signal || request?.signal;
  const streaming = init.body != null && typeof (init.body as ReadableStream).getReader === "function";
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(request ? request.clone() : input, init);
    const type = response.headers?.get("content-type") || "";
    const htmlType = /text\/html|application\/xhtml\+xml/i.test(type);
    if (!htmlType && (!expectJson || /application\/(?:json|[\w.+-]+\+json)/i.test(type) || typeof response.clone !== "function")) {
      return response;
    }
    // Leave successful HTML attachment downloads untouched.
    const html = await response.clone().text();
    const message = serviceResponseMessage(html);
    if (!htmlType && !message) return response;
    const starting = message === STARTING_MESSAGE;
    if (starting && !streaming && attempt < 4) {
      await waitForRetry(1_000 * 2 ** attempt, signal);
      continue;
    }
    if (starting || !response.ok || expectJson) {
      throw new ServiceResponseError(message || UNAVAILABLE_MESSAGE, response.status, starting);
    }
    return response;
  }
}
