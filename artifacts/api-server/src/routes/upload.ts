import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  next();
}

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

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
    cb(null, `${unique}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
});

router.post("/upload", requireAuth, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file provided" });
  if (!ALLOWED_MIME_TYPES.has(req.file.mimetype)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: "File type not allowed. Accepted: PDF, PNG, JPG, DOCX" });
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
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
    const contentType = mimeMap[ext] || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", plain.length);
    res.send(plain);
  } catch {
    res.status(404).json({ error: "File not found" });
  }
});

export default router;
