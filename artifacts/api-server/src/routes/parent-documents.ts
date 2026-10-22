import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import path from "node:path";
import { db, documentsTable, parentDocumentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireParent, resolveParentActor } from "../lib/parentAuth";
import { FamilyAccessError } from "../lib/familyParentAuth";
import { requireMobileAuth } from "./mobile";
import { starterLibrary } from "../lib/parentStarterLibrary";
import {
  canReadParentDocument,
  createParentDocument,
  getParentSharedSupport,
  listParentDocuments,
  parentChat,
  readParentDocumentBytes,
  reviewOrAssignParentActivity,
  reviewParentSupport,
  scanParentDocument,
  setParentDocumentSharing,
} from "../lib/parentDocuments";
import { parentPdfReaderMessages } from "../lib/parentPdfText";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, fieldSize: 2048, fields: 12, files: 1, parts: 14 },
});

function parentId(req: any): string {
  return req.parentAccount.id;
}

function safeFilename(value: string): string {
  return path.basename(value.replace(/\\/g, "/"))
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"|?*]/g, "_")
    .trim()
    .slice(0, 255) || "document";
}

function disposition(filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\;]/g, "_").replace(/[\r\n]/g, "_");
  const encoded = encodeURIComponent(filename).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `inline; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

router.get("/parent/starter-library", (_req, res) => res.json(starterLibrary));

router.get("/parent/children/:childId/documents", requireParent, async (req: any, res: Response) => {
  try {
    return res.json(await listParentDocuments(parentId(req), req.params.childId));
  } catch {
    return res.status(404).json({ error: "Child not found" });
  }
});

router.post(
  "/parent/children/:childId/documents",
  requireParent,
  upload.single("file"),
  async (req: any, res: Response) => {
    const file = req.file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ error: "Choose a document to upload" });
    if (req.body?.authorizedUploader !== "true") {
      return res.status(400).json({ error: 'authorizedUploader must be "true"' });
    }
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : undefined;
    const documentType = typeof req.body?.documentType === "string" ? req.body.documentType.trim() : undefined;
    if (
      (title && (title.length > 255 || /[\u0000-\u001f\u007f]/.test(title))) ||
      (documentType && (documentType.length > 100 || /[\u0000-\u001f\u007f]/.test(documentType)))
    ) return res.status(400).json({ error: "Invalid document title or type" });

    try {
      const result = await createParentDocument({
        parentId: parentId(req),
        childId: req.params.childId,
        workspaceId: req.parentAccount.workspaceId,
        fileName: safeFilename(file.originalname),
        title,
        documentType,
        declaredMimeType: file.mimetype,
        bytes: file.buffer,
      });
      return res.status(result.duplicate ? 200 : 201).json(result.document);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Document upload failed";
      if (message.startsWith("Unsupported file")) return res.status(415).json({ error: message });
      if (message === "Child not found") return res.status(404).json({ error: message });
      if (message.includes("Encrypted parent document storage")) return res.status(503).json({ error: message });
      if (message.includes("Private document storage")) return res.status(503).json({ error: message });
      return res.status(500).json({ error: "The document could not be saved. Please try again." });
    }
  },
);

async function sendParentDocumentContent(req: any, res: Response) {
  try {
    const [metadata] = await db.select().from(parentDocumentsTable)
      .where(eq(parentDocumentsTable.documentId, req.params.documentId));
    if (!metadata) {
      if (!req.parentAccount) return res.status(404).json({ error: "Document not found" });
      const [legacy] = await db.select().from(documentsTable).where(eq(documentsTable.id, String(req.params.documentId)));
      if (!legacy?.childId) return res.status(404).json({ error: "Document not found" });
      const visible = await listParentDocuments(req.parentAccount.id, legacy.childId);
      if (!visible.some(d => d.id === legacy.id)) return res.status(403).json({ error: "Access denied" });
      const bytes = await readParentDocumentBytes(legacy.id);
      const ext = path.extname(legacy.fileName || "").toLowerCase();
      const mime: Record<string, string> = { ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".txt": "text/plain; charset=utf-8", ".doc": "application/msword", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
      res.setHeader("Content-Type", mime[ext] || "application/octet-stream");
      res.setHeader("Content-Disposition", disposition(safeFilename(legacy.fileName || "document")));
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      return res.send(bytes);
    }
    if (!(await canReadParentDocument(req, metadata))) {
      return res.status(req.parentAccount || req.user || req.mobileUser || req.headers["x-client-token"] ? 403 : 401)
        .json({ error: "Access denied" });
    }
    const [document] = await db.select().from(documentsTable).where(eq(documentsTable.id, metadata.documentId));
    if (!document) return res.status(404).json({ error: "Document content not found" });
    const bytes = await readParentDocumentBytes(metadata.documentId);
    res.setHeader("Content-Type", metadata.mimeType);
    res.setHeader("Content-Disposition", disposition(safeFilename(document.fileName || "document")));
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Length", bytes.length);
    return res.send(bytes);
  } catch {
    return res.status(500).json({ error: "Document content could not be loaded" });
  }
}

router.get("/parent/documents/:documentId/content", async (req: any, res: Response) => {
  try {
    req.parentAccount = await resolveParentActor(req);
  } catch (error) {
    if (error instanceof FamilyAccessError) return res.status(error.status).json({ error: error.message });
    return res.status(500).json({ error: "Document content could not be loaded" });
  }
  if (
    !req.parentAccount &&
    !req.user?.id &&
    typeof req.headers["x-mobile-token"] === "string"
  ) {
    return requireMobileAuth(req, res, () => {
      void sendParentDocumentContent(req, res);
    });
  }
  return sendParentDocumentContent(req, res);
});

router.post(
  "/parent/children/:childId/documents/:documentId/scan",
  requireParent,
  async (req: any, res: Response) => {
    try {
      return res.json(await scanParentDocument(parentId(req), req.params.childId, req.params.documentId));
    } catch (error) {
      const message = error instanceof Error ? error.message : "The document scan failed. Please try again.";
      if (message === "Parent document not found" || message === "Child not found") {
        return res.status(404).json({ error: message });
      }
      if (message.includes("AI service") || message.includes("AI returned") || message.includes("scan failed")) {
        return res.status(502).json({ error: message });
      }
      if (message === parentPdfReaderMessages.unavailable ||
          message === parentPdfReaderMessages.processingUnavailable) {
        return res.status(503).json({ error: message });
      }
      return res.status(422).json({ error: message });
    }
  },
);

router.patch(
  "/parent/children/:childId/documents/:documentId/sharing",
  requireParent,
  async (req: any, res: Response) => {
    if (typeof req.body?.shared !== "boolean") {
      return res.status(400).json({ error: "shared must be a boolean" });
    }
    try {
      return res.json(await setParentDocumentSharing(
        parentId(req),
        req.params.childId,
        req.params.documentId,
        req.body.shared,
      ));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Document sharing could not be updated";
      if (message === "Parent document not found" || message === "Child not found") {
        return res.status(404).json({ error: message });
      }
      if (message.includes("Connect this child") || message.includes("shared with another clinician")) {
        return res.status(409).json({ error: message });
      }
      return res.status(500).json({ error: "Document sharing could not be updated" });
    }
  },
);

router.post("/parent/children/:childId/chat", requireParent, async (req: any, res: Response) => {
  if (typeof req.body?.message !== "string" || !req.body.message.trim() || req.body.message.length > 4000) {
    return res.status(400).json({ error: "message must be a non-empty string of at most 4000 characters" });
  }
  try {
    return res.json(await parentChat(parentId(req), req.params.childId, req.body.message, req.get("x-parent-local-date")));
  } catch (error) {
    const message = error instanceof Error ? error.message : "The support assistant could not answer";
    return res.status(message === "Child not found" ? 404 : 502).json({ error: message });
  }
});

router.post("/parent/children/:childId/support-review", async (req: any, res: Response) => {
  if (!req.user?.id) return res.status(401).json({ error: "Clinician authentication required" });
  if (typeof req.body?.approved !== "boolean") return res.status(400).json({ error: "approved must be a boolean" });
  try {
    return res.json(await reviewParentSupport(req.user.id, req.params.childId, req.body.approved));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Support could not be reviewed";
    if (message.includes("not linked")) return res.status(403).json({ error: message });
    if (message.includes("Only support")) return res.status(409).json({ error: message });
    return res.status(500).json({ error: "Support could not be reviewed" });
  }
});

router.get("/parent/children/:childId/shared-support", async (req: any, res: Response) => {
  if (!req.user?.id) return res.status(401).json({ error: "Clinician authentication required" });
  try {
    return res.json(await getParentSharedSupport(req.user.id, req.params.childId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Shared support could not be loaded";
    if (message.includes("not linked")) return res.status(403).json({ error: message });
    if (message === "Child not found") return res.status(404).json({ error: message });
    if (message.includes("Clinician authentication")) return res.status(403).json({ error: message });
    return res.status(500).json({ error: "Shared support could not be loaded" });
  }
});

router.post("/parent/children/:childId/shared-support/:cardId/activities/:activityIndex", async (req: any, res: Response) => {
  if (!req.user?.id) return res.status(401).json({ error: "Clinician authentication required" });
  const activityIndex = Number(req.params.activityIndex);
  const { contentVersion, action } = req.body || {};
  if (!Number.isInteger(activityIndex) || activityIndex < 0 ||
      typeof contentVersion !== "string" || !/^[a-f0-9]{64}$/.test(contentVersion) ||
      !["review", "assign", "unassign"].includes(action)) {
    return res.status(400).json({ error: "Invalid activity review request" });
  }
  try {
    return res.json(await reviewOrAssignParentActivity(
      req.user.id,
      req.params.childId,
      req.params.cardId,
      activityIndex,
      contentVersion,
      action,
    ));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Activity action could not be saved";
    if (message.includes("not linked")) return res.status(403).json({ error: message });
    if (message.includes("changed") || message.includes("not available") || message.includes("Review this")) {
      return res.status(409).json({ error: message });
    }
    return res.status(500).json({ error: "Activity action could not be saved" });
  }
});

router.use((error: any, _req: Request, res: Response, next: NextFunction) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "File too large. Maximum size is 20 MB." });
  }
  return next(error);
});

export default router;