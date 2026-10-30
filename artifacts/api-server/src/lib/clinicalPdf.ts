import { spawn } from "node:child_process";
import { DocumentProcessingError, documentAiError } from "./documentAi";

const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_RENDER_MS = 30_000;

/**
 * Re-emit every original page through Poppler/Cairo before sending it to the
 * stricter AI PDF reader. This preserves visual content (not text extraction)
 * and repairs many readable PDFs with nonstandard cross-reference structures.
 * Originals remain untouched. Bytes are piped in memory, never saved to disk.
 */
export async function prepareClinicalPdf(bytes: Buffer): Promise<Buffer> {
  if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("This PDF is invalid. Re-export it as a PDF and upload it again.");
  }
  return new Promise((resolve, reject) => {
    const child = spawn("pdftocairo", ["-pdf", "-", "-"], { stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let length = 0;
    let diagnostic = "";
    let failure: Error | null = null;
    const stop = (message: string) => { failure ??= new Error(message); child.kill("SIGKILL"); };
    const timer = setTimeout(() => stop("This PDF took too long to read. Split it into smaller PDFs and upload it again."), MAX_RENDER_MS);
    child.stdout.on("data", (chunk: Buffer) => {
      length += chunk.length;
      if (length > MAX_PDF_BYTES) stop("This PDF is too large after preparing its pages. Split it into smaller PDFs and upload it again.");
      else chunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      // Use only to classify the error. Never log document text or filenames.
      if (diagnostic.length < 4096) diagnostic += chunk.toString("utf8").slice(0, 4096 - diagnostic.length);
    });
    child.stdin.on("error", () => undefined);
    child.once("error", () => {
      clearTimeout(timer);
      reject(new Error("The PDF processing service is unavailable. Please try again later."));
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (failure) return reject(failure);
      if (/password|encrypted/i.test(diagnostic)) {
        return reject(new Error("This PDF is password-protected. Upload an unlocked PDF copy."));
      }
      const result = Buffer.concat(chunks);
      if (code !== 0 || result.length < 100 || result.subarray(0, 5).toString("ascii") !== "%PDF-") {
        return reject(new Error("This PDF is damaged or incomplete and its pages could not be read. Re-export it as a PDF and upload it again."));
      }
      resolve(result);
    });
    child.stdin.end(bytes);
  });
}

export function clinicalScanServiceError(error: unknown): { status: number; code: string; message: string; invalidDocument: boolean } {
  const value = error as { status?: number; httpStatus?: number; message?: string };
  const message = String(value?.message ?? "");
  if (/PDF is invalid|password-protected|damaged or incomplete|too large after preparing|took too long to read/i.test(message)) {
    return {
      status: 422,
      code: /password-protected/i.test(message) ? "document_password_protected" : "document_pdf_unreadable",
      invalidDocument: true,
      message: `${message} Previously extracted information has been preserved.`,
    };
  }
  const processingError = error instanceof DocumentProcessingError
    ? error
    : documentAiError({
      ...value,
      status: value?.status ?? value?.httpStatus,
    });
  const safeMessage = /previous.*(preserved|kept)/i.test(processingError.message)
    ? processingError.message
    : `${processingError.message} Previously extracted information has been preserved.`;
  return {
    status: processingError.httpStatus,
    code: processingError.code,
    invalidDocument: processingError.httpStatus === 422 && !processingError.retryable,
    message: safeMessage,
  };
}
