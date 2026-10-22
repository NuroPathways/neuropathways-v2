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
): Promise<{ pdf: Buffer; searchableText: string }> {
  const pdf = await prepareClinicalPdf(bytes);
  try {
    return { pdf, searchableText: await readText() };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (
      message === parentPdfReaderMessages.unavailable ||
      message === parentPdfReaderMessages.processingUnavailable ||
      message === "No searchable text was found in this PDF."
    ) {
      // No fabricated OCR text or text-only substitution: the validated full
      // PDF is still supplied to the visual model, just as for clinician scans.
      return { pdf, searchableText: "" };
    }
    // Size/page limits and password/file errors must never be read around.
    throw error;
  }
}
