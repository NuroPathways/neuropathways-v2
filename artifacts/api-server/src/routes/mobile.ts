import { Router } from "express";
import crypto from "node:crypto";
import { db } from "@workspace/db";
import {
  childrenTable,
  behaviorPlansTable,
  behaviorLogsTable,
  messagesTable,
  documentsTable,
  rewardTokensTable,
  winLogsTable,
  dailyCheckInsTable,
  aiConversationsTable,
  mobileTokensTable,
} from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";

const router = Router();

// ──────────────────────────────────────────────
// Mobile token auth middleware
// ──────────────────────────────────────────────

async function requireMobileAuth(req: any, res: any, next: any) {
  const token = req.headers["x-mobile-token"];
  if (!token || typeof token !== "string") {
    return res.status(401).json({ error: "Mobile token required" });
  }
  try {
    const now = new Date();
    const [row] = await db
      .select()
      .from(mobileTokensTable)
      .where(
        and(
          eq(mobileTokensTable.token, token),
          gt(mobileTokensTable.expiresAt, now)
        )
      );
    if (!row) return res.status(401).json({ error: "Invalid or expired token" });
    req.mobileUser = { childId: row.childId };
    next();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

// ──────────────────────────────────────────────
// Auth — login / logout
// ──────────────────────────────────────────────

router.post("/mobile/auth/login", async (req, res) => {
  const { username, access_code } = req.body;
  if (!username || !access_code) {
    return res.status(400).json({ error: "username and access_code required" });
  }
  try {
    const [child] = await db
      .select()
      .from(childrenTable)
      .where(
        and(
          eq(childrenTable.username, username),
          eq(childrenTable.accessCode, access_code)
        )
      );
    if (!child) {
      return res.status(401).json({ error: "Invalid username or access code" });
    }
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    await db.insert(mobileTokensTable).values({ token, childId: child.id, expiresAt });
    res.json({
      token,
      child: {
        id: child.id,
        child_name: child.childName,
        username: child.username,
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/mobile/auth/logout", requireMobileAuth, async (req: any, res) => {
  const token = req.headers["x-mobile-token"] as string;
  try {
    await db.delete(mobileTokensTable).where(eq(mobileTokensTable.token, token));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ──────────────────────────────────────────────
// Helper
// ──────────────────────────────────────────────

function snakeToCamel(str: string) {
  return str.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function bodyToCamel(obj: Record<string, any>): Record<string, any> {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [snakeToCamel(k), v])
  );
}

// ──────────────────────────────────────────────
// Child profile
// ──────────────────────────────────────────────

router.get("/mobile/children", requireMobileAuth, async (req: any, res) => {
  try {
    const [child] = await db
      .select()
      .from(childrenTable)
      .where(eq(childrenTable.id, req.mobileUser.childId));
    res.json(child ? [child] : []);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ──────────────────────────────────────────────
// Behavior plans (read-only for clients)
// ──────────────────────────────────────────────

router.get("/mobile/behavior-plans", requireMobileAuth, async (req: any, res) => {
  try {
    const rows = await db
      .select()
      .from(behaviorPlansTable)
      .where(eq(behaviorPlansTable.childId, req.mobileUser.childId));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ──────────────────────────────────────────────
// Behavior logs (read + create for clients)
// ──────────────────────────────────────────────

router.get("/mobile/behavior-logs", requireMobileAuth, async (req: any, res) => {
  try {
    const rows = await db
      .select()
      .from(behaviorLogsTable)
      .where(eq(behaviorLogsTable.childId, req.mobileUser.childId));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/mobile/behavior-logs", requireMobileAuth, async (req: any, res) => {
  try {
    const data = bodyToCamel(req.body);
    const [row] = await db
      .insert(behaviorLogsTable)
      .values({ ...data, childId: req.mobileUser.childId })
      .returning();
    res.status(201).json(row);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ──────────────────────────────────────────────
// Messages (read + create for clients)
// ──────────────────────────────────────────────

router.get("/mobile/messages", requireMobileAuth, async (req: any, res) => {
  try {
    const rows = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.childId, req.mobileUser.childId));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/mobile/messages", requireMobileAuth, async (req: any, res) => {
  try {
    const data = bodyToCamel(req.body);
    const [row] = await db
      .insert(messagesTable)
      .values({ ...data, childId: req.mobileUser.childId, senderRole: "client" })
      .returning();
    res.status(201).json(row);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ──────────────────────────────────────────────
// Documents (read-only for clients)
// ──────────────────────────────────────────────

router.get("/mobile/documents", requireMobileAuth, async (req: any, res) => {
  try {
    const rows = await db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.childId, req.mobileUser.childId));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ──────────────────────────────────────────────
// Reward tokens / goals (read-only for clients)
// ──────────────────────────────────────────────

router.get("/mobile/reward-tokens", requireMobileAuth, async (req: any, res) => {
  try {
    const rows = await db
      .select()
      .from(rewardTokensTable)
      .where(eq(rewardTokensTable.childId, req.mobileUser.childId));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ──────────────────────────────────────────────
// Win logs (read + create for clients)
// ──────────────────────────────────────────────

router.get("/mobile/win-logs", requireMobileAuth, async (req: any, res) => {
  try {
    const rows = await db
      .select()
      .from(winLogsTable)
      .where(eq(winLogsTable.childId, req.mobileUser.childId));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/mobile/win-logs", requireMobileAuth, async (req: any, res) => {
  try {
    const data = bodyToCamel(req.body);
    const [row] = await db
      .insert(winLogsTable)
      .values({ ...data, childId: req.mobileUser.childId })
      .returning();
    res.status(201).json(row);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ──────────────────────────────────────────────
// Daily check-ins (read + create for clients)
// ──────────────────────────────────────────────

router.get("/mobile/daily-check-ins", requireMobileAuth, async (req: any, res) => {
  try {
    const rows = await db
      .select()
      .from(dailyCheckInsTable)
      .where(eq(dailyCheckInsTable.childId, req.mobileUser.childId));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/mobile/daily-check-ins", requireMobileAuth, async (req: any, res) => {
  try {
    const data = bodyToCamel(req.body);
    const [row] = await db
      .insert(dailyCheckInsTable)
      .values({ ...data, childId: req.mobileUser.childId })
      .returning();
    res.status(201).json(row);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ──────────────────────────────────────────────
// AI conversations (read + create for clients)
// ──────────────────────────────────────────────

router.get("/mobile/ai-conversations", requireMobileAuth, async (req: any, res) => {
  try {
    const rows = await db
      .select()
      .from(aiConversationsTable)
      .where(eq(aiConversationsTable.childId, req.mobileUser.childId));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
