import { logger } from "./logger";

function safeErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(code)
    ? code
    : undefined;
}

/**
 * Log a minimal, PHI-safe error record and return a generic client response.
 * Database messages, query text, parameters, and stack traces must never be
 * reflected to API callers.
 */
export function respondWithInternalError(
  req: any,
  res: any,
  error: unknown,
  operation: string,
  publicMessage: string | Record<string, unknown> = "An unexpected error occurred. Please try again.",
) : void {
  const requestId = typeof req?.id === "string" || typeof req?.id === "number"
    ? String(req.id).slice(0, 120)
    : undefined;
  const context = {
    operation: operation.slice(0, 100),
    error_name: error instanceof Error ? error.name.slice(0, 80) : "UnknownError",
    error_code: safeErrorCode(error),
    ...(requestId ? { request_id: requestId } : {}),
  };
  if (typeof req?.log?.error === "function") {
    req.log.error(context, "API request failed");
  } else {
    logger.error(context, "API request failed");
  }

  res.status(500).json({
    error: publicMessage,
    ...(requestId ? { request_id: requestId } : {}),
  });
}
