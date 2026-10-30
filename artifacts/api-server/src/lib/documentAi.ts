/** Public errors never contain provider payloads, document text or credentials. */
export class DocumentProcessingError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly httpStatus: number,
    readonly retryable: boolean,
    readonly upstreamStatus?: number,
  ) {
    super(message);
    this.name = "DocumentProcessingError";
  }
}

export interface DocumentAiRequestOptions {
  timeout: number;
  maxRetries: number;
  signal: AbortSignal;
}

export function documentAiError(error: unknown): DocumentProcessingError {
  if (error instanceof DocumentProcessingError) return error;
  const value = error as { status?: number; name?: string; message?: string };
  const status = typeof value?.status === "number" ? value.status : undefined;
  // Inspect provider diagnostics only to classify, never send or log raw text.
  const message = String(value?.message || "");
  if (status === 413 || (status === 400 && /context|too many tokens|too long|too large|page limit|maximum.*pages|pages?.*exceed|exceed.*pages?/i.test(message))) {
    return new DocumentProcessingError(
      "This document exceeds the AI reader's size or page limit. Split it into smaller files and try again. Your original document is saved.",
      "document_ai_limit", 422, false, status,
    );
  }
  if (status === 400 && /pdf|image.*invalid|invalid.*image|document.*(invalid|corrupt|password)/i.test(message)) {
    return new DocumentProcessingError(
      "The AI reader could not open this file. Upload an unlocked, re-exported copy. Your original document is saved.",
      "document_ai_file_rejected", 422, false, status,
    );
  }
  if (status !== undefined && status >= 400 && status < 500 && ![408, 409, 429].includes(status)) {
    return new DocumentProcessingError(
      "The AI document service needs attention before it can read this file. Your document is saved; please contact the app administrator.",
      "document_ai_configuration", 503, false, status,
    );
  }
  if (status === 429) {
    return new DocumentProcessingError(
      "The AI document reader is busy. Automatic retries did not finish. Your document is saved; please retry shortly.",
      "document_ai_busy", 503, true, status,
    );
  }
  return new DocumentProcessingError(
    "The AI document reader is temporarily unavailable. Automatic retries did not finish. Your document is saved; please retry shortly.",
    "document_ai_unavailable", 503, true, status,
  );
}

export async function requestDocumentAi<T>(
  request: (options: DocumentAiRequestOptions) => Promise<T>,
): Promise<T> {
  try {
    // Let the SDK retry connection errors, 408/409/429 and 5xx responses.
    // One deadline includes all retries/backoff, so requests cannot run forever.
    return await request({
      timeout: 240_000,
      maxRetries: 2,
      signal: AbortSignal.timeout(300_000),
    });
  } catch (error) {
    throw documentAiError(error);
  }
}

export function requireCompleteDocumentAiResponse(response: { stop_reason?: string | null }): void {
  if (response.stop_reason === "max_tokens") {
    throw new DocumentProcessingError(
      "The AI reader reached its response limit before finishing. Split this document into smaller files and retry. Previous complete findings are preserved.",
      "document_ai_output_limit", 422, false,
    );
  }
}
