import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";

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

// Store uploads in a local folder — swap for object storage in production
const uploadDir = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${unique}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

router.post("/upload", requireAuth, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file provided" });
  if (!ALLOWED_MIME_TYPES.has(req.file.mimetype)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: "File type not allowed. Accepted: PDF, PNG, JPG, DOCX" });
  }
  const fileUrl = `/api/uploads/${req.file.filename}`;
  res.json({ file_url: fileUrl, file_name: req.file.originalname });
});

// Serve uploaded files
router.use("/uploads", (req, res, next) => {
  // Basic path traversal protection
  const safePath = path.normalize(req.path).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = path.join(uploadDir, safePath);
  if (!filePath.startsWith(uploadDir)) return res.status(400).json({ error: "Invalid path" });
  res.sendFile(filePath, (err) => {
    if (err) res.status(404).json({ error: "File not found" });
  });
});

export default router;
