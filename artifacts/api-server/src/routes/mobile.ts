import { Router } from "express";
import { legacyVisibleDocuments } from "../lib/documentVisibility";
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
  familiesTable,
} from "@workspace/db";
import { classifyFamilyAccount, familyChildrenForOwner, familyOwnerId } from "../lib/familyParentAuth";
import { eq, and, gt, isNull } from "drizzle-orm";

function scryptHash(input: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(input, salt, 64, (err, key) => {
      if (err) reject(err);
      else resolve(key.toString("hex"));
    });
  });
}

async function verifyAccessCode(code: string, stored: string): Promise<boolean> {
  if (!stored || !stored.includes(":")) return code.toUpperCase() === stored?.toUpperCase();
  const [salt, storedHash] = stored.split(":");
  const inputHash = await scryptHash(code.toUpperCase(), salt);
  return inputHash === storedHash;
}

const router = Router();

// ──────────────────────────────────────────────
// Mobile token auth middleware
// ──────────────────────────────────────────────

export async function requireMobileAuth(req: any, res: any, next: any) {
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
    const [anchor] = await db.select().from(childrenTable).where(eq(childrenTable.id, row.childId));
    if (!anchor) return res.status(401).json({ error: "Account no longer available" });
    const [family] = anchor.familyId ? await db.select().from(familiesTable).where(eq(familiesTable.id, anchor.familyId)) : [];
    const classification = anchor.accountType === "individual" ? "individual" : classifyFamilyAccount(family?.accountType);
    if (classification === "unknown") return res.status(409).json({ error: "Your clinic needs to correct this account's family type" });
    if (!family || family.clinicianId !== anchor.clinicianId) return res.status(403).json({ error: "Family relationship is not authorized" });
    const familyChildren = classification === "family" ? await familyChildrenForOwner(familyOwnerId(family.id)) : [anchor];
    if (!familyChildren.some(c => c.id === anchor.id)) return res.status(403).json({ error: "Family membership or clinic consent is no longer valid" });
    // Selection changes the record being used, never the token's authenticated identity.
    // Lists and logout must remain accessible if a previously selected sibling was reassigned.
    const requested = ["/mobile/children", "/mobile/auth/logout", "/mobile/session"].includes(req.path)
      ? undefined : req.headers["x-mobile-child-id"];
    let selected = anchor;
    if (requested !== undefined) {
      if (typeof requested !== "string" || !requested) return res.status(400).json({ error: "Invalid child selection" });
      if (requested !== anchor.id) {
        if (classification !== "family") return res.status(403).json({ error: "Individual accounts cannot select another client" });
        const [target] = await db.select().from(childrenTable).where(eq(childrenTable.id, requested));
        if (!target || !familyChildren.some(c => c.id === target.id)) {
          return res.status(403).json({ error: "This child is not available to your account" });
        }
        selected = target;
      }
    }
    req.mobileUser = { childId: selected.id, authenticatedChildId: anchor.id, experience: classification === "family" ? "parent" : "client" };
    next();
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
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
  const cleanUsername = username.trim().toLowerCase();
  try {
    const [child] = await db
      .select()
      .from(childrenTable)
      .where(eq(childrenTable.username, cleanUsername));
    if (!child || !child.accessCode) {
      return res.status(401).json({ error: "Invalid username or access code" });
    }
    const valid = await verifyAccessCode(access_code, child.accessCode);
    if (!valid) {
      return res.status(401).json({ error: "Invalid username or access code" });
    }
    const [family] = child.familyId ? await db.select().from(familiesTable).where(eq(familiesTable.id, child.familyId)) : [];
    const classification = child.accountType === "individual" ? "individual" : classifyFamilyAccount(family?.accountType);
    if (classification === "unknown") return res.status(409).json({ error: "Your clinic needs to correct this account's family type" });
    if (!family || family.clinicianId !== child.clinicianId) return res.status(403).json({ error: "Family relationship is not authorized" });
    if (classification === "family" && !(await familyChildrenForOwner(familyOwnerId(family.id))).some(c => c.id === child.id)) return res.status(403).json({ error: "Family membership or clinic consent is no longer valid" });
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    await db.insert(mobileTokensTable).values({ token, childId: child.id, expiresAt });
    return res.json({
      token,
      experience: classification === "family" ? "parent" : "client",
      child: {
        id: child.id,
        child_name: child.childName,
        username: child.username,
      },
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

router.delete("/mobile/auth/logout", requireMobileAuth, async (req: any, res) => {
  const token = req.headers["x-mobile-token"] as string;
  try {
    await db.delete(mobileTokensTable).where(eq(mobileTokensTable.token, token));
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});
router.get("/mobile/session", requireMobileAuth, async (req: any, res) => {
  const [child] = await db.select().from(childrenTable).where(eq(childrenTable.id, req.mobileUser.authenticatedChildId));
  return res.json({ experience: req.mobileUser.experience, child: { id: child.id, child_name: child.childName, username: child.username } });
});

router.post("/mobile/auth/change-access-code", requireMobileAuth, async (req: any, res) => {
  const { current_access_code, new_access_code } = req.body ?? {};
  if (typeof current_access_code !== "string" || typeof new_access_code !== "string" ||
      new_access_code.trim().length < 4 || new_access_code.length > 128) {
    return res.status(400).json({ error: "Enter the current code and a new code of 4–128 characters." });
  }
  try {
    const [child] = await db.select().from(childrenTable).where(eq(childrenTable.id, req.mobileUser.authenticatedChildId));
    if (!child?.accessCode || !(await verifyAccessCode(current_access_code.trim(), child.accessCode))) {
      return res.status(401).json({ error: "Current access code is incorrect." });
    }
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = await scryptHash(new_access_code.trim().toUpperCase(), salt);
    const accessCode = `${salt}:${hash}`;
    if (child.familyId) {
      await db.update(childrenTable).set({ accessCode }).where(and(
        eq(childrenTable.familyId, child.familyId),
        child.clinicianId ? eq(childrenTable.clinicianId, child.clinicianId) : isNull(childrenTable.clinicianId),
      ));
    } else {
      await db.update(childrenTable).set({ accessCode }).where(eq(childrenTable.id, child.id));
    }
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
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
      .where(eq(childrenTable.id, req.mobileUser.authenticatedChildId));
    if (!child) return res.json([]);
    const siblings = child.familyId && req.mobileUser.experience === "parent"
      ? await familyChildrenForOwner(familyOwnerId(child.familyId))
      : [child];
    siblings.sort((a, b) => a.id === child.id ? -1 : b.id === child.id ? 1 : (a.childName ?? "").localeCompare(b.childName ?? ""));
    return res.json(siblings.map(({ accessCode: _accessCode, ...publicChild }) => publicChild));
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
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

router.post("/mobile/behavior-logs", requireMobileAuth, async (req: any, res): Promise<any> => {
  try {
    const data = bodyToCamel(req.body);
    const [child] = await db.select().from(childrenTable).where(eq(childrenTable.id, req.mobileUser.childId));
    if (!child) return res.status(403).json({ error: "The selected client is no longer available." });
    for (const key of ["id", "childId", "clinicianId", "tenantId", "parentId", "createdBy"]) delete data[key];
    const clinicianId = child.clinicianId ?? null;
    const [row] = await db
      .insert(behaviorLogsTable)
      .values({
        ...data, childId: req.mobileUser.childId, clinicianId,
        tenantId: child.tenantId || clinicianId, parentId: req.mobileUser.childId,
      })
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

router.post("/mobile/messages", requireMobileAuth, async (req: any, res): Promise<any> => {
  try {
    const data = bodyToCamel(req.body);
    const [child] = await db.select().from(childrenTable).where(eq(childrenTable.id, req.mobileUser.childId));
    if (!child) return res.status(403).json({ error: "The selected client is no longer available." });
    for (const key of ["id", "childId", "clinicianId", "tenantId", "parentId", "createdBy", "fromUserId", "toUserId", "senderRole"]) delete data[key];
    const clinicianId = child.clinicianId ?? null;
    const [row] = await db
      .insert(messagesTable)
      .values({
        ...data, childId: req.mobileUser.childId, tenantId: child.tenantId || clinicianId,
        fromUserId: req.mobileUser.childId, toUserId: clinicianId, senderRole: "client",
      })
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
    const [child] = await db.select().from(childrenTable).where(eq(childrenTable.id, req.mobileUser.childId));
    res.json(await legacyVisibleDocuments(rows, child?.clinicianId ?? null));
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
    res.json(rows.filter(g => !g.createdByClinician || g.publicationStatus === "published")
      .map(({ goalVersions: _versions, ...g }) => g));
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

router.post("/mobile/win-logs", requireMobileAuth, async (req: any, res): Promise<any> => {
  try {
    const data = bodyToCamel(req.body);
    const [child] = await db.select().from(childrenTable).where(eq(childrenTable.id, req.mobileUser.childId));
    if (!child) return res.status(403).json({ error: "The selected client is no longer available." });
    for (const key of ["id", "childId", "clinicianId", "tenantId", "parentId", "createdBy"]) delete data[key];
    const clinicianId = child.clinicianId ?? null;
    const [row] = await db
      .insert(winLogsTable)
      .values({
        ...data, childId: req.mobileUser.childId, tenantId: child.tenantId || clinicianId,
        parentId: req.mobileUser.childId,
      })
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

router.post("/mobile/daily-check-ins", requireMobileAuth, async (req: any, res): Promise<any> => {
  try {
    const data = bodyToCamel(req.body);
    const [child] = await db.select().from(childrenTable).where(eq(childrenTable.id, req.mobileUser.childId));
    if (!child) return res.status(403).json({ error: "The selected client is no longer available." });
    for (const key of ["id", "childId", "clinicianId", "tenantId", "parentId", "createdBy"]) delete data[key];
    const clinicianId = child.clinicianId ?? null;
    const [row] = await db
      .insert(dailyCheckInsTable)
      .values({
        ...data, childId: req.mobileUser.childId, tenantId: child.tenantId || clinicianId,
        parentId: req.mobileUser.childId,
      })
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
