import { prepareClinicalPdf } from "./clinicalPdf";
import { parentPdfReaderMessages, readParentPdfText } from "./parentPdfText";

/**
 * All account types use the same complete-page PDF reader. Searchable text is
 * supplementary evidence, never a prerequisite for reading scanned pages.
 * Validation/repair must succeed before a document can reach the visual reader.
 */
export async function prepareSupportPdf(
  bytes: Buffer,
  readText: () => Promise<string> = () => readParentPdfText(bytes),
  options: {
    preparePages?: typeof prepareClinicalPdf;
    enforceTextLimits?: boolean;
  } = {},
): Promise<{ pdf: Buffer; searchableText: string }> {
  let searchableText = "";
  let textError: Error | undefined;
  let originalValidated = false;
  try {
    searchableText = await readText();
    originalValidated = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    textError = error instanceof Error ? error : new Error("The PDF could not be read.");
    originalValidated = message === "No searchable text was found in this PDF.";
    const limitError = /too large|too many pages|too long to read/i.test(message);
    if (/password-protected/i.test(message) ||
        (limitError && options.enforceTextLimits !== false)) {
      throw textError;
    }
  }
  try {
    const pdf = await (options.preparePages || prepareClinicalPdf)(bytes);
    // The complete-page validator succeeded. Text is supplementary; never
    // manufacture searchable excerpts when its independent reader failed.
    return { pdf, searchableText };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (originalValidated && /processing service is unavailable|took too long to read/i.test(message)) {
      // PDF.js has already parsed every page. Conversion is an optimization,
      // not a mandatory host executable: send the unchanged complete PDF.
      return { pdf: Buffer.from(bytes), searchableText };
    }
    if (textError?.message === parentPdfReaderMessages.unavailable &&
        /processing service is unavailable/i.test(message)) {
      throw new Error("The PDF processing service is unavailable. Your document is saved. Please try again later.");
    }
    throw error;
  }
}
