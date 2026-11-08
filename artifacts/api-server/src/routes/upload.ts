import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { db, childrenTable, documentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireMobileAuth } from "./mobile";
import { validateClientSession, sessionMayAccessChild } from "./entities-helpers";
import { isParentDocument, canReadParentDocument, readParentDocumentBytes } from "../lib/parentDocuments";
import { isValidFileEncryptionKey } from "../lib/documentEncryptionPolicy";
import { clinicianCanAccessChild } from "../lib/clinicAuthorization";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  next();
}

type SupportedUpload = { extension: string; mimeType: string };

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".csv", ".json", ".rtf"]);

function detectSupportedUpload(file: Express.Multer.File, contents: Buffer): SupportedUpload | null {
  const originalExtension = path.extname(file.originalname).toLowerCase();

  if (contents.length >= 4 && contents[0] === 0xff && contents[1] === 0xd8 && contents[2] === 0xff) {
    return { extension: ".jpg", mimeType: "image/jpeg" };
  }
  if (contents.length >= 8 && contents.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extension: ".png", mimeType: "image/png" };
  }
  if (contents.length >= 6 && ["GIF87a", "GIF89a"].includes(contents.subarray(0, 6).toString("ascii"))) {
    return { extension: ".gif", mimeType: "image/gif" };
  }
  if (
    contents.length >= 12 &&
    contents.subarray(0, 4).toString("ascii") === "RIFF" &&
    contents.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { extension: ".webp", mimeType: "image/webp" };
  }
  if (contents.length >= 5 && contents.subarray(0, 5).toString("ascii") === "%PDF-") {
    return { extension: ".pdf", mimeType: "application/pdf" };
  }
  if (
    originalExtension === ".docx" &&
    contents.length >= 4 &&
    contents[0] === 0x50 &&
    contents[1] === 0x4b &&
    [0x03, 0x05, 0x07].includes(contents[2]) &&
    [0x04, 0x06, 0x08].includes(contents[3])
  ) {
    return {
      extension: ".docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
  }
  if (TEXT_EXTENSIONS.has(originalExtension) && !contents.subarray(0, 8192).includes(0)) {
    const mimeType = originalExtension === ".json"
      ? "application/json"
      : originalExtension === ".csv"
        ? "text/csv"
        : "text/plain";
    return { extension: originalExtension, mimeType };
  }

  return null;
}

function validateAndNormalizeUpload(file: Express.Multer.File): SupportedUpload | null {
  if (!Buffer.isBuffer(file.buffer)) return null;
  const detected = detectSupportedUpload(file, file.buffer);
  if (detected) file.mimetype = detected.mimeType;
  return detected;
}

const uploadDir = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// AES-256-GCM encryption at rest. The key is loaded from FILE_ENCRYPTION_KEY
// (64 hex chars = 32 bytes); new uploads are rejected when it is unavailable.
const ENCRYPTION_KEY: Buffer | null = (() => {
  const hex = process.env.FILE_ENCRYPTION_KEY;
  if (!hex) {
    console.warn("[NeuroPath] FILE_ENCRYPTION_KEY not set — document uploads are disabled");
    return null;
  }
  if (!isValidFileEncryptionKey(hex)) throw new Error("FILE_ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  return Buffer.from(hex, "hex");
})();

function encryptBuffer(plain: Buffer): Buffer {
  if (!ENCRYPTION_KEY) throw new Error("Encrypted document storage is unavailable");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Wire format: [12-byte IV][16-byte auth tag][ciphertext]
  return Buffer.concat([iv, tag, encrypted]);
}

function decryptBufferStrict(data: Buffer): Buffer | null {
  if (!ENCRYPTION_KEY || data.length < 29) return null;
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const ciphertext = data.subarray(28);
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    return null;
  }
}

export function decryptBuffer(data: Buffer): Buffer {
  if (!ENCRYPTION_KEY) return data;
  // Unencrypted files from before encryption was enabled won't have the
  // IV+tag prefix — detect by checking minimum size (12 IV + 16 tag + 1 byte).
  if (data.length < 29) return data;
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const ciphertext = data.subarray(28);
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    // Decryption failed — likely an unencrypted file from before the key was set
    return data;
  }
}

const UUID_DOCUMENT_FILENAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:pdf|jpg|png|txt|md|csv|json|rtf)$/i;

function isNewEncryptedDocumentFile(document: typeof documentsTable.$inferSelect, filePath: string): boolean {
  const filename = path.basename(filePath);
  const extension = path.extname(filename);
  const isSupportedUpload = UUID_DOCUMENT_FILENAME.test(filename);
  const isPriorMobileEncryptedFile = extension.toLowerCase() === ".enc";
  return (isSupportedUpload || isPriorMobileEncryptedFile) &&
    filename.slice(0, -extension.length).toLowerCase() === document.id.toLowerCase();
}

const secureDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, fieldSize: 1024, fields: 8, files: 1, parts: 10 },
});

function requireDocumentAuth(req: any, res: Response, next: NextFunction) {
  if (req.user?.id) return next();
  return requireMobileAuth(req, res, next);
}

function requireEncryptionConfigured(_req: Request, res: Response, next: NextFunction): void {
  if (!ENCRYPTION_KEY) {
    res.status(503).json({ error: "Encrypted document storage is unavailable" });
    return;
  }
  next();
}

function removeFile(filePath?: string) {
  if (!filePath) return;
  try {
    fs.unlinkSync(filePath);
  } catch {
    // The file may already have been removed by Multer or a previous cleanup.
  }
}

function persistEncryptedUpload(contents: Buffer, extension: string): string {
  if (!ENCRYPTION_KEY) throw new Error("Encrypted document storage is unavailable");
  const filename = `${crypto.randomUUID()}${extension}`;
  const filePath = path.join(uploadDir, filename);
  try {
    fs.writeFileSync(filePath, encryptBuffer(contents), { flag: "wx", mode: 0o600 });
    fs.chmodSync(filePath, 0o600);
    return filename;
  } catch (error) {
    removeFile(filePath);
    throw error;
  }
}

function safeDisplayFilename(originalName: string): string {
  const basename = path.basename(originalName.replace(/\\/g, "/"));
  const safe = basename
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"|?*]/g, "_")
    .trim()
    .slice(0, 255);
  return safe || "upload";
}

function detectSecureDocument(file: Express.Multer.File, contents: Buffer): SupportedUpload | null {
  if (contents.length >= 3 && contents[0] === 0xff && contents[1] === 0xd8 && contents[2] === 0xff) {
    return { extension: ".jpg", mimeType: "image/jpeg" };
  }
  if (
    contents.length >= 8 &&
    contents.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { extension: ".png", mimeType: "image/png" };
  }
  if (contents.length >= 5 && contents.subarray(0, 5).toString("ascii") === "%PDF-") {
    return { extension: ".pdf", mimeType: "application/pdf" };
  }

  const extension = path.extname(file.originalname).toLowerCase();
  if (!TEXT_EXTENSIONS.has(extension) || contents.includes(0)) return null;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(contents);
  } catch {
    return null;
  }
  if (extension === ".rtf" && !text.startsWith("{\\rtf")) return null;
  if (extension === ".json") {
    try {
      JSON.parse(text);
    } catch {
      return null;
    }
  }
  const mimeType = extension === ".json"
    ? "application/json; charset=utf-8"
    : extension === ".csv"
      ? "text/csv; charset=utf-8"
      : extension === ".rtf"
        ? "application/rtf"
        : extension === ".md"
          ? "text/markdown; charset=utf-8"
          : "text/plain; charset=utf-8";
  return { extension, mimeType };
}

function contentDispositionFilename(filename: string): string {
  const fallback = filename
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\;]/g, "_")
    .replace(/[\r\n]/g, "_");
  const validFilename = Array.from(filename)
    .filter((character) => !(character.length === 1 && /[\uD800-\uDFFF]/.test(character)))
    .join("");
  const encoded = encodeURIComponent(validFilename).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `inline; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function resolveDocumentFilePath(document: typeof documentsTable.$inferSelect): string | null {
  if (!document.fileUrl) return null;
  let pathname: string;
  try {
    pathname = new URL(document.fileUrl, "https://local.invalid").pathname;
  } catch {
    return null;
  }

  const contentRoute = /^\/(?:api\/)?mobile\/documents\/([^/]+)\/content$/.exec(pathname);
  if (contentRoute?.[1] === document.id) {
    return path.join(uploadDir, `${document.id}.enc`);
  }

  const uploadRoute = /^\/(?:api\/)?uploads\/([^/]+)$/.exec(pathname);
  if (!uploadRoute) return null;
  let filename: string;
  try {
    filename = decodeURIComponent(uploadRoute[1]);
  } catch {
    return null;
  }
  if (!filename || filename === "." || filename === ".." || path.basename(filename) !== filename) return null;
  return path.resolve(uploadDir, filename);
}

async function canReadDocument(
  document: typeof documentsTable.$inferSelect,
  req: any,
  allowLegacyInviteToken = false,
): Promise<boolean> {
  const parentMetadata = await isParentDocument(document.id);
  if (parentMetadata) return canReadParentDocument(req, parentMetadata);
  if (req.user?.id) {
    return Boolean(
      document.childId &&
      await clinicianCanAccessChild(req.user.id, document.childId),
    );
  }
  if (req.mobileUser?.childId) {
    if (document.childId !== req.mobileUser.childId) return false;
    const [child] = await db.select().from(childrenTable).where(eq(childrenTable.id, req.mobileUser.childId));
    return Boolean(child);
  }
  const legacyClientToken = typeof req.headers["x-client-token"] === "string"
    ? req.headers["x-client-token"]
    : allowLegacyInviteToken && typeof req.query?.invite_token === "string"
      ? req.query.invite_token
      : undefined;
  if (allowLegacyInviteToken && legacyClientToken && document.childId) {
    const session = await validateClientSession(legacyClientToken);
    return Boolean(session && await sessionMayAccessChild(session.childId, document.childId));
  }
  return false;
}

router.post(
  "/mobile/documents/upload",
  requireDocumentAuth,
  requireEncryptionConfigured,
  secureDocumentUpload.single("file"),
  async (req: any, res: Response) => {
    const uploaded = req.file as Express.Multer.File | undefined;
    try {
      if (!uploaded) return res.status(400).json({ error: "No file provided" });
      if (req.body?.authorized_uploader !== "true") {
        return res.status(400).json({ error: 'authorized_uploader must be "true"' });
      }

      const isClinician = Boolean(req.user?.id);
      const childId = isClinician ? req.body?.child_id : req.mobileUser?.childId;
      if (typeof childId !== "string" || !childId) {
        return res.status(400).json({ error: isClinician ? "child_id required" : "Selected child required" });
      }
      if (!isClinician && req.body?.child_id && req.body.child_id !== childId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const [child] = await db.select().from(childrenTable).where(eq(childrenTable.id, childId));
      if (!child) {
        return res.status(404).json({ error: "Child not found" });
      }
      if (isClinician && !(await clinicianCanAccessChild(req.user.id, childId))) {
        return res.status(403).json({ error: "Access denied" });
      }

      const originalName = safeDisplayFilename(uploaded.originalname);
      const detected = detectSecureDocument({ ...uploaded, originalname: originalName }, uploaded.buffer);
      if (!detected) {
        return res.status(415).json({
          error: "Unsupported file. Upload a PDF, JPEG, PNG, or UTF-8 text file.",
        });
      }

      const title = typeof req.body?.title === "string" && req.body.title.trim()
        ? req.body.title.trim()
        : "Uploaded document";
      const category = typeof req.body?.category === "string" && req.body.category.trim()
        ? req.body.category.trim()
        : "other";
      if (title.length > 255 || category.length > 100 || /[\u0000-\u001f\u007f]/.test(title + category)) {
        return res.status(400).json({ error: "Invalid title or category" });
      }

      const documentId = crypto.randomUUID();
      const storedFilename = `${documentId}${detected.extension}`;
      const encryptedPath = path.join(uploadDir, storedFilename);
      try {
        fs.writeFileSync(encryptedPath, encryptBuffer(uploaded.buffer), { flag: "wx", mode: 0o600 });
        fs.chmodSync(encryptedPath, 0o600);
      } catch {
        removeFile(encryptedPath);
        return res.status(500).json({ error: "Document encryption failed" });
      }

      try {
        const [document] = await db.insert(documentsTable).values({
          id: documentId,
          childId: child.id,
          clinicianId: child.clinicianId,
          tenantId: child.clinicianId,
          title,
          category,
          fileName: originalName,
          fileUrl: `/api/uploads/${storedFilename}`,
          scanStatus: "pending",
          uploadedBy: isClinician ? req.user.id : `client:${child.id}`,
        }).returning();
        if (!document) {
          removeFile(encryptedPath);
          return res.status(500).json({ error: "Document record could not be saved" });
        }
        return res.status(201).json(document);
      } catch {
        removeFile(encryptedPath);
        return res.status(500).json({ error: "Document record could not be saved" });
      }
    } catch {
      return res.status(500).json({ error: "Document upload failed" });
    }
  },
);

router.get("/mobile/documents/:id/content", requireDocumentAuth, async (req: any, res: Response) => {
  try {
    const [document] = await db.select().from(documentsTable).where(eq(documentsTable.id, req.params.id));
    if (!document) return res.status(404).json({ error: "Document not found" });
    if (!(await canReadDocument(document, req))) return res.status(403).json({ error: "Access denied" });

    const parentMetadata = await isParentDocument(document.id);
    if (parentMetadata) {
      const content = await readParentDocumentBytes(document.id);
      res.setHeader("Content-Type", parentMetadata.mimeType);
      res.setHeader("Content-Disposition", contentDispositionFilename(safeDisplayFilename(document.fileName || "document")));
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Length", content.length);
      return res.send(content);
    }

    const filePath = resolveDocumentFilePath(document);
    if (!filePath || !filePath.startsWith(`${uploadDir}${path.sep}`)) {
      return res.status(404).json({ error: "Document content not found" });
    }
    let content: Buffer;
    try {
      const stored = fs.readFileSync(filePath);
      const decrypted = isNewEncryptedDocumentFile(document, filePath)
        ? decryptBufferStrict(stored)
        : decryptBuffer(stored);
      if (!decrypted) return res.status(404).json({ error: "Document content is unreadable" });
      content = decrypted;
    } catch {
      return res.status(404).json({ error: "Document content not found" });
    }
    const detected = detectSupportedUpload(
      { originalname: document.fileName ?? "document" } as Express.Multer.File,
      content,
    );
    if (!detected) return res.status(415).json({ error: "Stored document content is unsupported" });

    const filename = safeDisplayFilename(document.fileName || `document${detected.extension}`);
    res.setHeader("Content-Type", detected.mimeType);
    res.setHeader("Content-Disposition", contentDispositionFilename(filename));
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Length", content.length);
    return res.send(content);
  } catch {
    return res.status(500).json({ error: "Document content could not be loaded" });
  }
});

router.post("/upload", requireAuth, requireEncryptionConfigured, secureDocumentUpload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file provided" });
  const detected = validateAndNormalizeUpload(req.file);
  if (!detected) {
    return res.status(400).json({
      error: "This file could not be read. Upload a PDF, DOCX, JPG, PNG, GIF, WebP, or text file.",
    });
  }

  let filename: string;
  try {
    filename = persistEncryptedUpload(req.file.buffer, detected.extension);
  } catch {
    return res.status(500).json({ error: "Encryption failed" });
  }

  const fileUrl = `/api/uploads/${filename}`;
  return res.json({ file_url: fileUrl, file_name: req.file.originalname });
});

// ──────────────────────────────────────────────
// Client-session upload — parents can upload photos/docs with an invite_token
// ──────────────────────────────────────────────

router.post("/client-upload", requireEncryptionConfigured, secureDocumentUpload.single("file"), async (req: any, res) => {
  const invite_token = req.body?.invite_token;
  if (!invite_token) {
    return res.status(401).json({ error: "invite_token required" });
  }
  if (req.body?.authorized_uploader !== "true") {
    return res.status(400).json({ error: 'authorized_uploader must be "true"' });
  }

  const csession = await validateClientSession(invite_token);
  if (!csession) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  if (!req.file) return res.status(400).json({ error: "No file provided" });
  const detected = validateAndNormalizeUpload(req.file);
  if (!detected) {
    return res.status(400).json({
      error: "This file could not be read. Upload a PDF, DOCX, JPG, PNG, GIF, WebP, or text file. Convert HEIC photos to JPG first.",
    });
  }

  // Verify child access
  const child_id = req.body?.child_id;
  if (!child_id) {
    return res.status(400).json({ error: "child_id required" });
  }
  if (!(await sessionMayAccessChild(csession.childId, child_id))) {
    return res.status(403).json({ error: "Access denied" });
  }

  let filename: string;
  try {
    filename = persistEncryptedUpload(req.file.buffer, detected.extension);
  } catch {
    return res.status(500).json({ error: "Encryption failed" });
  }

  const fileUrl = `/api/uploads/${filename}`;
  return res.json({ file_url: fileUrl, file_name: req.file.originalname });
});

// Serve uploaded files (decrypts on the fly)
router.use("/uploads", (req: any, res: Response) => {
  const safePath = path.normalize(req.path).replace(/^[/\\]+/, "");
  if (!safePath || path.basename(safePath) !== safePath || safePath === "." || safePath === "..") {
    res.status(400).json({ error: "Invalid path" });
    return;
  }
  const filePath = path.resolve(uploadDir, safePath);
  if (!filePath.startsWith(`${uploadDir}${path.sep}`)) {
    res.status(400).json({ error: "Invalid path" });
    return;
  }
  if (path.extname(safePath).toLowerCase() === ".enc") {
    res.status(404).json({ error: "File not found" });
    return;
  }

  const serveFile = (registeredDocument?: typeof documentsTable.$inferSelect) => {
    try {
      const encrypted = fs.readFileSync(filePath);
      const plain = registeredDocument && isNewEncryptedDocumentFile(registeredDocument, filePath)
        ? decryptBufferStrict(encrypted)
        : decryptBuffer(encrypted);
      if (!plain) {
        res.status(404).json({ error: "Document content is unreadable" });
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const mimeMap: Record<string, string> = {
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".txt": "text/plain; charset=utf-8",
        ".md": "text/markdown; charset=utf-8",
        ".csv": "text/csv; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".rtf": "application/rtf",
      };
      const contentType = mimeMap[ext] || "application/octet-stream";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Length", plain.length);
      res.send(plain);
    } catch {
      res.status(404).json({ error: "File not found" });
    }
  };

  const canonicalFileUrl = `/api/uploads/${path.basename(safePath)}`;
  const localFileUrl = `/uploads/${path.basename(safePath)}`;
  void (async () => {
    try {
      let [associatedDocument] = await db
        .select()
        .from(documentsTable)
        .where(eq(documentsTable.fileUrl, canonicalFileUrl));
      if (!associatedDocument) {
        [associatedDocument] = await db
          .select()
          .from(documentsTable)
          .where(eq(documentsTable.fileUrl, localFileUrl));
      }
      if (!associatedDocument) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      const registeredDocument = associatedDocument;

      const checkDocumentAccess = async (allowLegacyInviteToken = false) => {
        const allowed = await canReadDocument(registeredDocument, req, allowLegacyInviteToken);
        if (!allowed) {
          res.status(403).json({ error: "Access denied" });
          return;
        }
        serveFile(registeredDocument);
      };
      if (req.user?.id) {
        await checkDocumentAccess();
      } else if (typeof req.headers["x-mobile-token"] === "string") {
        requireMobileAuth(req, res, () => {
          void checkDocumentAccess().catch(() => {
            res.status(500).json({ error: "Document content could not be loaded" });
          });
        });
      } else if (typeof req.headers["x-client-token"] === "string") {
        await checkDocumentAccess(true);
      } else if (typeof req.query?.invite_token === "string") {
        await checkDocumentAccess(true);
      } else {
        res.status(401).json({ error: "Authentication required" });
      }
    } catch {
      res.status(500).json({ error: "Document content could not be loaded" });
      return;
    }
  })();
});

router.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "File too large. Maximum size is 20 MB." });
  }
  return next(err);
});

export default router;
