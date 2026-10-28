export const DOCUMENT_AI_TEXT_CHUNK_CHARS = 12_000;

/**
 * Split long extracted text into model-readable sections without dropping or
 * rewriting source characters. Prefer paragraph and line boundaries.
 */
export function splitDocumentTextForAi(
  text: string,
  maxChunkChars = DOCUMENT_AI_TEXT_CHUNK_CHARS,
): string[] {
  if (!text) return [];
  if (!Number.isSafeInteger(maxChunkChars) || maxChunkChars < 1) {
    throw new Error("maxChunkChars must be a positive integer.");
  }

  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const limit = Math.min(start + maxChunkChars, text.length);
    let end = limit;
    if (limit < text.length) {
      const window = text.slice(start, limit);
      const preferredBoundary = Math.floor(window.length * 0.6);
      const paragraph = window.lastIndexOf("\n\n");
      const line = window.lastIndexOf("\n");
      const space = window.lastIndexOf(" ");
      if (paragraph >= preferredBoundary) end = start + paragraph + 2;
      else if (line >= preferredBoundary) end = start + line + 1;
      else if (space >= preferredBoundary) end = start + space + 1;
    }
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}
