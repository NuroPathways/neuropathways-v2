const MAX_TEXT_CHARS = 120_000;
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_PDF_PAGES = 500;
const MAX_READ_MS = 30_000;

const PDF_READER_UNAVAILABLE = "The PDF text reader is unavailable.";
const PDF_PROCESSING_UNAVAILABLE = "The PDF reader could not process this file right now. Please try again.";
const PDF_UNREADABLE = "This PDF is damaged or unreadable. Re-export it as a PDF and upload it again.";

type PdfError = Error & { name: string };

export function classifyParentPdfReaderError(error: unknown): Error {
  const value = error as Partial<PdfError> | null;
  if (value?.name === "PasswordException") {
    return new Error("This PDF is password-protected. Upload an unlocked PDF copy.");
  }
  if (["InvalidPDFException", "FormatError", "XRefParseException", "MissingPDFException"].includes(value?.name || "")) {
    return new Error(PDF_UNREADABLE);
  }
  if (value instanceof Error &&
      (value.message === PDF_READER_UNAVAILABLE ||
       value.message === PDF_PROCESSING_UNAVAILABLE ||
       value.message === PDF_UNREADABLE ||
       value.message === "This PDF is password-protected. Upload an unlocked PDF copy." ||
       value.message === "This PDF has too many pages to read in one pass." ||
       value.message === "This plan is too long to read in one pass. Split it into smaller files and retry." ||
       value.message === "No searchable text was found in this PDF.")) {
    return value;
  }
  return new Error(PDF_PROCESSING_UNAVAILABLE);
}

/**
 * Extract searchable text in-process so production does not depend on a host
 * pdftotext binary. The original bytes remain untouched for visual readers.
 */
export async function readParentPdfText(bytes: Buffer): Promise<string> {
  if (bytes.length > MAX_PDF_BYTES) {
    throw new Error("This PDF is too large to read (over 20 MB).");
  }
  let pdfjs: typeof import("pdfjs-dist/legacy/build/pdf.mjs");
  try {
    pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  } catch {
    throw new Error(PDF_READER_UNAVAILABLE);
  }

  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
    stopAtErrors: true,
    verbosity: 0,
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(PDF_PROCESSING_UNAVAILABLE)), MAX_READ_MS);
    });
    const read = async () => {
      const pdf = await task.promise;
      if (pdf.numPages > MAX_PDF_PAGES) throw new Error("This PDF has too many pages to read in one pass.");

      const textParts: string[] = [];
      let textLength = 0;
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        for (const item of content.items) {
          if (!("str" in item) || typeof item.str !== "string" || !item.str) continue;
          textParts.push(item.str);
          textLength += item.str.length;
          if (textLength > MAX_TEXT_CHARS) {
            throw new Error("This plan is too long to read in one pass. Split it into smaller files and retry.");
          }
        }
        textParts.push("\n");
        if (textLength + textParts.length > MAX_TEXT_CHARS) {
          throw new Error("This plan is too long to read in one pass. Split it into smaller files and retry.");
        }
      }
      const text = textParts.join(" ").replace(/[ \t]+\n/g, "\n").trim();
      if (!text) throw new Error("No searchable text was found in this PDF.");
      return text;
    };
    return await Promise.race([read(), timeout]);
  } catch (error) {
    throw classifyParentPdfReaderError(error);
  } finally {
    if (timer) clearTimeout(timer);
    await task.destroy().catch(() => undefined);
  }
}

export const parentPdfReaderMessages = {
  unavailable: PDF_READER_UNAVAILABLE,
  processingUnavailable: PDF_PROCESSING_UNAVAILABLE,
  unreadable: PDF_UNREADABLE,
} as const;
