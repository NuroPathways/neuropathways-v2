import path from "node:path";

const SUPPORTED_EXTENSIONS = new Set([
  ".doc",
  ".docx",
  ".gif",
  ".jpeg",
  ".jpg",
  ".json",
  ".md",
  ".pdf",
  ".png",
  ".rtf",
  ".txt",
  ".webp",
  ".csv",
]);

export type LocalUploadReference = {
  filename: string;
  extension: string;
};

/**
 * Resolve only local upload routes; never fetch an arbitrary document URL.
 * Legacy upload URLs may be absolute, percent-encoded, or carry query strings.
 */
export function resolveLocalUploadReference(
  fileUrl: string | null | undefined,
  originalFileName?: string | null,
): LocalUploadReference | null {
  if (!fileUrl) return null;

  try {
    const pathname = new URL(fileUrl, "https://local.invalid").pathname;
    const match = /^\/(?:api\/)?uploads\/([^/]+)$/i.exec(pathname);
    if (!match) return null;

    const filename = decodeURIComponent(match[1]);
    if (
      !filename ||
      filename === "." ||
      filename === ".." ||
      path.basename(filename) !== filename ||
      filename.toLowerCase().endsWith(".enc")
    ) {
      return null;
    }

    const storedExtension = path.extname(filename).toLowerCase();
    const originalName = path.basename(String(originalFileName || "").replace(/\\/g, "/"));
    const originalExtension = path.extname(originalName).toLowerCase();
    const extension = SUPPORTED_EXTENSIONS.has(storedExtension)
      ? storedExtension
      : SUPPORTED_EXTENSIONS.has(originalExtension)
        ? originalExtension
        : storedExtension || originalExtension;

    return { filename, extension };
  } catch {
    return null;
  }
}
