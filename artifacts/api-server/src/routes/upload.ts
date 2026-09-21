import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { validateClientSession, sessionMayAccessChild, getChildWithClinician } from "./entities-helpers";

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
  const contents = fs.readFileSync(file.path);
  const detected = detectSupportedUpload(file, contents);
  if (!detected) return null;

  const currentExtension = path.extname(file.filename).toLowerCase();
  if (currentExtension !== detected.extension) {
    const currentBase = currentExtension
      ? file.filename.slice(0, -currentExtension.length)
      : file.filename;
    const normalizedFilename = `${currentBase}${detected.extension}`;
    const normalizedPath = path.join(uploadDir, normalizedFilename);
    fs.renameSync(file.path, normalizedPath);
    file.filename = normalizedFilename;
    file.path = normalizedPath;
  }
  file.mimetype = detected.mimeType;
  return detected;
}

const uploadDir = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// AES-256-GCM encryption at rest. The key is loaded from FILE_ENCRYPTION_KEY
// env var (64 hex chars = 32 bytes). When unset, files are stored unencrypted
// for backward compatibility — set the key before first production upload.
const ENCRYPTION_KEY: Buffer | null = (() => {
  const hex = process.env.FILE_ENCRYPTION_KEY;
  if (!hex) {
    console.warn("[NeuroPath] FILE_ENCRYPTION_KEY not set — uploads will NOT be encrypted at rest");
    return null;
  }
  if (hex.length !== 64) throw new Error("FILE_ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  return Buffer.from(hex, "hex");
})();

function encryptBuffer(plain: Buffer): Buffer {
  if (!ENCRYPTION_KEY) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Wire format: [12-byte IV][16-byte auth tag][ciphertext]
  return Buffer.concat([iv, tag, encrypted]);
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

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const safeOriginalName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${unique}-${safeOriginalName || "upload"}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
});

router.post("/upload", requireAuth, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file provided" });
  if (!validateAndNormalizeUpload(req.file)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({
      error: "This file could not be read. Upload a PDF, DOCX, JPG, PNG, GIF, WebP, or text file.",
    });
  }

  // Encrypt the file at rest
  if (ENCRYPTION_KEY) {
    try {
      const plain = fs.readFileSync(req.file.path);
      fs.writeFileSync(req.file.path, encryptBuffer(plain));
    } catch (e: any) {
      fs.unlinkSync(req.file.path);
      return res.status(500).json({ error: "Encryption failed" });
    }
  }

  const fileUrl = `/api/uploads/${req.file.filename}`;
  res.json({ file_url: fileUrl, file_name: req.file.originalname });
});

// ──────────────────────────────────────────────
// Client-session upload — parents can upload photos/docs with an invite_token
// ──────────────────────────────────────────────

router.post("/client-upload", upload.single("file"), async (req: any, res) => {
  const invite_token = req.body?.invite_token;
  if (!invite_token) return res.status(401).json({ error: "invite_token required" });

  const csession = await validateClientSession(invite_token);
  if (!csession) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  if (!req.file) return res.status(400).json({ error: "No file provided" });
  if (!validateAndNormalizeUpload(req.file)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({
      error: "This file could not be read. Upload a PDF, DOCX, JPG, PNG, GIF, WebP, or text file. Convert HEIC photos to JPG first.",
    });
  }

  // Verify child access
  const child_id = req.body?.child_id;
  if (child_id && !(await sessionMayAccessChild(csession.childId, child_id))) {
    fs.unlinkSync(req.file.path);
    return res.status(403).json({ error: "Access denied" });
  }

  // Encrypt at rest
  if (ENCRYPTION_KEY) {
    try {
      const plain = fs.readFileSync(req.file.path);
      fs.writeFileSync(req.file.path, encryptBuffer(plain));
    } catch {
      fs.unlinkSync(req.file.path);
      return res.status(500).json({ error: "Encryption failed" });
    }
  }

  const fileUrl = `/api/uploads/${req.file.filename}`;
  res.json({ file_url: fileUrl, file_name: req.file.originalname });
});

// Serve uploaded files (decrypts on the fly)
router.use("/uploads", (req, res, next) => {
  const safePath = path.normalize(req.path).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = path.join(uploadDir, safePath);
  if (!filePath.startsWith(uploadDir)) return res.status(400).json({ error: "Invalid path" });

  try {
    const encrypted = fs.readFileSync(filePath);
    const plain = decryptBuffer(encrypted);

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
    res.setHeader("Content-Length", plain.length);
    res.send(plain);
  } catch {
    res.status(404).json({ error: "File not found" });
  }
});

router.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "File too large. Maximum size is 20 MB." });
  }
  next(err);
});

export default router;
