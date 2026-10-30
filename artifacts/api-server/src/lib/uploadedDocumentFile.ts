import { unlink } from "node:fs/promises";
import path from "node:path";

const uploadRoot = path.resolve(process.cwd(), "uploads");

/**
 * Remove a document uploaded through the legacy encrypted upload route.
 * Only relative application upload URLs are eligible; never fetch or delete
 * arbitrary remote paths from a document row.
 */
export async function deleteUploadedDocumentFile(fileUrl: unknown): Promise<boolean> {
  if (typeof fileUrl !== "string" || !fileUrl.trim()) return false;

  let pathname: string;
  try {
    const parsed = new URL(fileUrl, "http://local-document-upload");
    if (parsed.origin !== "http://local-document-upload") return false;
    pathname = parsed.pathname;
  } catch {
    return false;
  }

  const match = /^\/(?:api\/)?uploads\/([^/]+)$/.exec(pathname);
  if (!match || path.basename(match[1]) !== match[1] || match[1] === "." || match[1] === "..") {
    return false;
  }

  const filePath = path.resolve(uploadRoot, match[1]);
  if (!filePath.startsWith(`${uploadRoot}${path.sep}`)) return false;

  try {
    await unlink(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return true;
    throw error;
  }
}
