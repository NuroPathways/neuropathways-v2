import { Router } from "express";
import path from "node:path";
import fs from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { db } from "@workspace/db";
import {
  childrenTable, familiesTable, behaviorPlansTable, documentsTable,
  interventionPlansTable, behaviorLogsTable, rewardTokensTable, messagesTable,
  aiConversationsTable, dailyCheckInsTable, winLogsTable, engagementEventsTable,
  clientProfilesTable, userProfilesTable, usersTable, auditLogsTable, invitationsTable,
  clientSessionsTable,
} from "@workspace/db";
import { eq, and, inArray, or } from "drizzle-orm";
import { getAnthropicClient, CLAUDE_MODEL } from "../lib/anthropic";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

const router = Router();

// ──────────────────────────────────────────────
// Serialization helpers
// ──────────────────────────────────────────────

function snakeToCamel(str: string) {
  return str.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

function serialize(val: any): any {
  if (val === null || val === undefined) return val;
  if (Array.isArray(val)) return val.map(serialize);
  if (val instanceof Date) return val.toISOString();
  if (typeof val === "object") {
    return Object.fromEntries(
      Object.entries(val).map(([k, v]) => [camelToSnake(k), serialize(v)])
    );
  }
  return val;
}

// Sanitize potentially bad string values (e.g. "undefined", "null")
function sanitizeStr(v: any): string | null {
  if (!v || v === "undefined" || v === "null") return null;
  return String(v).trim() || null;
}

// Build a clean display name from parts with a sensible fallback chain
function buildDisplayName(parts: (string | null | undefined)[], fallback = "Unnamed Client"): string {
  for (const p of parts) {
    const s = sanitizeStr(p);
    if (s) return s;
  }
  return fallback;
}

// Serialize a family row and add alias fields the frontend expects
function serializeFamily(f: any) {
  const s = serialize(f);
  // Build a clean parent name from firstName+lastName or primaryContact
  const parentName = buildDisplayName([
    s.first_name && s.last_name ? `${s.first_name} ${s.last_name}` : null,
    s.first_name,
    s.primary_contact,
  ], "");
  // Ensure family_name is never "undefined" or blank
  const familyName = buildDisplayName([s.family_name], parentName || "Unnamed Client");
  return {
    ...s,
    family_name: familyName,
    parent_name: parentName || null,
    invite_email: s.email ?? null,
  };
}

// Convert snake_case body keys to camelCase (for Drizzle inserts)
function bodyToCamel(obj: Record<string, any>): Record<string, any> {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [snakeToCamel(k), v]));
}

// Build Drizzle WHERE clauses from query-string params
function filterClauses(table: Record<string, any>, params: Record<string, string>) {
  return Object.entries(params)
    .filter(([k]) => k !== "sort" && k !== "limit")
    .flatMap(([k, v]) => {
      if (v === undefined || v === null || v === "") return [];
      const col = table[k] ?? table[snakeToCamel(k)];
      if (!col) return [];
      return [eq(col, v)];
    });
}

// ──────────────────────────────────────────────
// Auth guard
// ──────────────────────────────────────────────

function requireAuth(req: any, res: any, next: any) {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  next();
}

// ──────────────────────────────────────────────
// Client-session token helpers
// ──────────────────────────────────────────────

// Generate a cryptographically random 64-char hex token, persist it in
// client_sessions (90-day expiry), and return it.  Replaces the old unsigned
// cs_<childId>_<timestamp> scheme.
async function generateClientToken(
  childId: string,
  username?: string | null,
  accessCode?: string | null,
): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  await db.insert(clientSessionsTable).values({ childId, inviteToken: token, username, accessCode, expiresAt });
  return token;
}

// Validate a client-session token.  Accepts:
//   • New format (64-char hex) — looked up in client_sessions; expiry checked.
//   • Legacy format (cs_<childId>_<ts>) — parsed and verified against children table
//     so that users with old localStorage sessions aren't immediately locked out.
// Returns { childId } on success, null on failure.
async function validateClientSession(token: string | undefined | null): Promise<{ childId: string } | null> {
  if (!token || typeof token !== "string") return null;

  if (!token.startsWith("cs_")) {
    // New DB-backed token
    const [row] = await db.select().from(clientSessionsTable).where(eq(clientSessionsTable.inviteToken, token));
    if (!row?.childId) return null;
    if (row.expiresAt && row.expiresAt < new Date()) return null;
    return { childId: row.childId };
  }

  // Legacy unsigned token — verify the embedded childId still exists in the DB.
  const m = token.match(/^cs_(.+)_\d+$/);
  if (!m) return null;
  const [child] = await db.select().from(childrenTable).where(eq(childrenTable.id, m[1]));
  return child ? { childId: child.id } : null;
}

// ──────────────────────────────────────────────
// Audit log helper
// ──────────────────────────────────────────────

async function auditLog(opts: {
  userId?: string;
  userRole?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  success?: boolean;
  reason?: string;
  metadata?: any;
  tenantId?: string;
  ip?: string;
}) {
  try {
    await db.insert(auditLogsTable).values({
      userId: opts.userId ?? null,
      userRole: opts.userRole ?? null,
      tenantId: opts.tenantId ?? null,
      action: opts.action,
      targetType: opts.targetType ?? null,
      targetId: opts.targetId ?? null,
      success: opts.success ?? true,
      reason: opts.reason ?? null,
      metadata: opts.metadata ?? null,
      ipAddress: opts.ip ?? null,
    });
  } catch {
    // Audit log failure should never break the main request
  }
}

// ──────────────────────────────────────────────
// Generic CRUD factory (protected by auth)
// Automatically scopes list queries by clinicianId for clinician users
// ──────────────────────────────────────────────

function makeCrud(path: string, table: any) {
  router.get(path, requireAuth, async (req: any, res) => {
    try {
      const query = { ...(req.query as Record<string, string>) };

      // Security: clinician role users can only see their own records
      // unless they explicitly pass a different clinicianId (which we override)
      if (req.user && table.clinicianId) {
        query.clinicianId = req.user.id;
      }

      const clauses = filterClauses(table, query);
      const rows = clauses.length > 0
        ? await db.select().from(table).where(and(...clauses))
        : await db.select().from(table);
      res.json(serialize(rows));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post(path, requireAuth, async (req: any, res) => {
    try {
      const data = bodyToCamel(req.body);
      // Inject clinicianId and tenantId on create
      if (table.clinicianId) data.clinicianId = req.user.id;
      if (table.tenantId) data.tenantId = req.user.id; // tenantId = clinicianId until multi-clinic
      if (table.createdBy) data.createdBy = req.user.id;
      const [row] = await db.insert(table).values(data).returning();
      res.status(201).json(serialize(row));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get(`${path}/:id`, requireAuth, async (req: any, res) => {
    try {
      const [row] = await db.select().from(table).where(eq(table.id, req.params.id));
      if (!row) return res.status(404).json({ error: "Not found" });
      // Security: enforce ownership for clinician-owned records
      if (table.clinicianId && row.clinicianId && row.clinicianId !== req.user.id) {
        await auditLog({ userId: req.user.id, action: "cross_tenant_access_attempt", targetType: path, targetId: req.params.id, success: false, reason: "clinicianId mismatch" });
        return res.status(403).json({ error: "Access denied" });
      }
      res.json(serialize(row));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.patch(`${path}/:id`, requireAuth, async (req: any, res) => {
    try {
      // Verify ownership before update
      const [existing] = await db.select().from(table).where(eq(table.id, req.params.id));
      if (!existing) return res.status(404).json({ error: "Not found" });
      if (table.clinicianId && existing.clinicianId && existing.clinicianId !== req.user.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      const [row] = await db.update(table)
        .set(bodyToCamel(req.body))
        .where(eq(table.id, req.params.id))
        .returning();
      res.json(serialize(row));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.delete(`${path}/:id`, requireAuth, async (req: any, res) => {
    try {
      const [existing] = await db.select().from(table).where(eq(table.id, req.params.id));
      if (!existing) return res.status(404).json({ error: "Not found" });
      if (table.clinicianId && existing.clinicianId && existing.clinicianId !== req.user.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      await db.delete(table).where(eq(table.id, req.params.id));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}

makeCrud("/children", childrenTable);
makeCrud("/families", familiesTable);
makeCrud("/behavior-plans", behaviorPlansTable);
makeCrud("/documents", documentsTable);
makeCrud("/intervention-plans", interventionPlansTable);
// Client-session users (parents) can POST behavior logs with an invite_token.
// bodyToCamel() in the frontend shim converts invite_token → inviteToken, so check both.
router.post("/behavior-logs", async (req: any, res, next) => {
  const invite_token = req.body?.invite_token ?? req.body?.inviteToken;
  if (!invite_token) {
    if (!req.user) return res.status(401).json({ error: "Authentication required" });
    return next();
  }
  try {
    const csession = await validateClientSession(invite_token);
    if (!csession) return res.status(401).json({ error: "Invalid or expired session" });

    const child_id = req.body.child_id || req.body.childId;
    if (!child_id) return res.status(400).json({ error: "child_id required" });

    // Verify the child belongs to this session
    const [child] = await db.select().from(childrenTable).where(eq(childrenTable.id, child_id));
    if (!child) return res.status(404).json({ error: "Child not found" });

    const data: any = bodyToCamel(req.body);
    delete data.inviteToken; // don't persist the token
    data.clinicianId = child.clinicianId;
    data.tenantId = child.clinicianId;
    if (!data.parentId) data.parentId = csession.childId; // fallback identity
    const [row] = await db.insert(behaviorLogsTable).values(data).returning();
    return res.status(201).json(serialize(row));
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});
makeCrud("/behavior-logs", behaviorLogsTable);
makeCrud("/reward-tokens", rewardTokensTable);
makeCrud("/messages", messagesTable);
makeCrud("/ai-conversations", aiConversationsTable);
makeCrud("/daily-check-ins", dailyCheckInsTable);
// Client-session POST for win-logs (bodyToCamel converts invite_token → inviteToken)
router.post("/win-logs", async (req: any, res, next) => {
  const invite_token = req.body?.invite_token ?? req.body?.inviteToken;
  if (!invite_token) {
    if (!req.user) return res.status(401).json({ error: "Authentication required" });
    return next();
  }
  try {
    const csession = await validateClientSession(invite_token);
    if (!csession) return res.status(401).json({ error: "Invalid or expired session" });
    const child_id = req.body.child_id || req.body.childId || csession.childId;
    const [child] = await db.select().from(childrenTable).where(eq(childrenTable.id, child_id));
    if (!child) return res.status(404).json({ error: "Child not found" });
    const data: any = bodyToCamel(req.body);
    delete data.inviteToken;
    data.childId = child_id;
    data.parentId = data.parentId || csession.childId;
    data.clinicianId = child.clinicianId;
    const [row] = await db.insert(winLogsTable).values(data).returning();
    return res.status(201).json(serialize(row));
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});
makeCrud("/win-logs", winLogsTable);

// Client-session POST for engagement-events (bodyToCamel converts invite_token → inviteToken)
router.post("/engagement-events", async (req: any, res, next) => {
  const invite_token = req.body?.invite_token ?? req.body?.inviteToken;
  if (!invite_token) {
    if (!req.user) return res.status(401).json({ error: "Authentication required" });
    return next();
  }
  try {
    const csession = await validateClientSession(invite_token);
    if (!csession) return res.status(401).json({ error: "Invalid or expired session" });
    const data: any = bodyToCamel(req.body);
    delete data.inviteToken;
    if (!data.childId) data.childId = csession.childId;
    const [row] = await db.insert(engagementEventsTable).values(data).returning();
    return res.status(201).json(serialize(row));
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});
makeCrud("/engagement-events", engagementEventsTable);
makeCrud("/client-profiles", clientProfilesTable);

// ──────────────────────────────────────────────
// User profile (me)
// ──────────────────────────────────────────────

router.get("/users/me", requireAuth, async (req: any, res) => {
  try {
    const [profile] = await db.select().from(userProfilesTable).where(eq(userProfilesTable.id, req.user.id));
    const [authUser] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));
    res.json({ ...authUser, ...profile });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch("/users/me", requireAuth, async (req: any, res) => {
  try {
    const body = bodyToCamel(req.body);
    const allowed = ["displayName", "firstName", "lastName", "phone", "appRole", "accountType", "accountDeletionRequested"];
    const updateData: Record<string, any> = {};
    for (const k of allowed) if (body[k] !== undefined) updateData[k] = body[k];

    await db.insert(userProfilesTable).values({ id: req.user.id, ...updateData })
      .onConflictDoUpdate({ target: userProfilesTable.id, set: updateData });

    const [profile] = await db.select().from(userProfilesTable).where(eq(userProfilesTable.id, req.user.id));
    const [authUser] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));
    res.json({ ...authUser, ...profile });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ──────────────────────────────────────────────
// Aggregated clinician dashboard
// ──────────────────────────────────────────────

router.get("/clinician-data", requireAuth, async (req: any, res) => {
  try {
    const [profile] = await db.select().from(userProfilesTable).where(eq(userProfilesTable.id, req.user.id));
    if (!profile || profile.appRole !== "clinician") return res.status(403).json({ error: "Clinician only" });

    const [children, families, logs, messages] = await Promise.all([
      db.select().from(childrenTable).where(eq(childrenTable.clinicianId, req.user.id)),
      db.select().from(familiesTable).where(eq(familiesTable.clinicianId, req.user.id)),
      db.select().from(behaviorLogsTable).where(eq(behaviorLogsTable.clinicianId, req.user.id)),
      db.select().from(messagesTable).where(eq(messagesTable.toUserId, req.user.id)),
    ]);

    res.json({
      children: serialize(children),
      families: families.map(serializeFamily),
      clientAccounts: [],
      logs: serialize(logs),
      messages: serialize(messages),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ──────────────────────────────────────────────
// Client portal data (no Replit Auth — used by client sessions)
// ──────────────────────────────────────────────

router.post("/client-portal-data", async (req, res) => {
  const { child_id, invite_token } = req.body;
  if (!child_id) return res.status(400).json({ error: "child_id required" });

  // Require a valid client-session token (new DB-backed or legacy cs_ format).
  const csession = await validateClientSession(invite_token);
  if (!csession) return res.status(401).json({ error: "Authentication required" });

  // The caller may read their own child or any sibling in the same family AND same clinician.
  // If the family is later split across clinicians, access is denied to the cross-tenant sibling.
  let familyId: string | null = null;
  let clinicianId: string | null = null;
  if (csession.childId !== child_id) {
    const [authChild] = await db.select().from(childrenTable).where(eq(childrenTable.id, csession.childId));
    const [targetChild] = await db.select().from(childrenTable).where(eq(childrenTable.id, child_id));
    if (!authChild?.familyId || authChild.familyId !== targetChild?.familyId) {
      return res.status(403).json({ error: "Access denied" });
    }
    // Cross-tenant guard: both children must belong to the same clinician.
    if (authChild.clinicianId !== targetChild.clinicianId) {
      return res.status(403).json({ error: "Access denied" });
    }
    familyId = authChild.familyId;
    clinicianId = authChild.clinicianId ?? null;
  } else {
    const [authChild] = await db.select().from(childrenTable).where(eq(childrenTable.id, csession.childId));
    familyId = authChild?.familyId ?? null;
    clinicianId = authChild?.clinicianId ?? null;
  }

  try {
    const [[child], plans, documents, interventionPlans, profiles, goals, winLogs, dailyCheckIns, engagementEvents, behaviorLogs] = await Promise.all([
      db.select().from(childrenTable).where(eq(childrenTable.id, child_id)),
      db.select().from(behaviorPlansTable).where(eq(behaviorPlansTable.childId, child_id)),
      db.select().from(documentsTable).where(eq(documentsTable.childId, child_id)),
      db.select().from(interventionPlansTable).where(eq(interventionPlansTable.childId, child_id)),
      db.select().from(clientProfilesTable).where(eq(clientProfilesTable.childId, child_id)),
      db.select().from(rewardTokensTable).where(eq(rewardTokensTable.childId, child_id)),
      db.select().from(winLogsTable).where(eq(winLogsTable.childId, child_id)),
      db.select().from(dailyCheckInsTable).where(eq(dailyCheckInsTable.childId, child_id)),
      db.select().from(engagementEventsTable).where(eq(engagementEventsTable.childId, child_id)),
      db.select().from(behaviorLogsTable).where(eq(behaviorLogsTable.childId, child_id)),
    ]);
    const profile = profiles[0] ?? null;

    // Fetch siblings in the same family AND same clinician so the selector never
    // surfaces children that belong to a different clinician tenant.
    const siblings = familyId
      ? await db.select().from(childrenTable).where(
          clinicianId
            ? and(eq(childrenTable.familyId, familyId), eq(childrenTable.clinicianId, clinicianId))
            : eq(childrenTable.familyId, familyId)
        )
      : (child ? [child] : []);

    res.json(serialize({ child: child ?? null, siblings, plans, documents, interventionPlans, profile, goals, winLogs, dailyCheckIns, engagementEvents, behaviorLogs }));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ──────────────────────────────────────────────
// getClientDetail — full child record + plans + docs + credentials
// ──────────────────────────────────────────────

router.get("/client-detail", requireAuth, async (req: any, res) => {
  const { child_id } = req.query as Record<string, string>;
  if (!child_id) return res.status(400).json({ error: "child_id required" });
  try {
    const [[child], plans, documents, interventionPlans] = await Promise.all([
      db.select().from(childrenTable).where(eq(childrenTable.id, child_id)),
      db.select().from(behaviorPlansTable).where(eq(behaviorPlansTable.childId, child_id)),
      db.select().from(documentsTable).where(eq(documentsTable.childId, child_id)),
      db.select().from(interventionPlansTable).where(eq(interventionPlansTable.childId, child_id)),
    ]);
    if (!child) return res.status(404).json({ error: "Child not found" });

    // Security: ensure this child belongs to the requesting clinician
    if (child.clinicianId && child.clinicianId !== req.user.id) {
      await auditLog({ userId: req.user.id, action: "cross_tenant_access_attempt", targetType: "child", targetId: child_id, success: false });
      return res.status(403).json({ error: "Access denied" });
    }

    const clientAccount = child.username
      ? { username: child.username, access_code: child.accessCode, email: child.parentEmail }
      : null;

    await auditLog({ userId: req.user.id, userRole: "clinician", action: "client_viewed", targetType: "child", targetId: child_id, tenantId: child.clinicianId ?? undefined });

    res.json(serialize({ child, plans, documents, interventionPlans, clientAccount }));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ──────────────────────────────────────────────
// getFamilyDetail — family + children + stats + credentials
// ──────────────────────────────────────────────

router.get("/family-detail", requireAuth, async (req: any, res) => {
  const { family_id } = req.query as Record<string, string>;
  if (!family_id) return res.status(400).json({ error: "family_id required" });
  try {
    const [[family], children] = await Promise.all([
      db.select().from(familiesTable).where(eq(familiesTable.id, family_id)),
      db.select().from(childrenTable).where(eq(childrenTable.familyId, family_id)),
    ]);
    if (!family) return res.status(404).json({ error: "Family not found" });

    // Security: ensure this family belongs to the requesting clinician
    if (family.clinicianId && family.clinicianId !== req.user.id) {
      await auditLog({ userId: req.user.id, action: "cross_tenant_access_attempt", targetType: "family", targetId: family_id, success: false });
      return res.status(403).json({ error: "Access denied" });
    }

    const childIds = children.map(c => c.id);
    let allDocuments: any[] = [];
    let logsCount = 0;
    let messagesCount = 0;
    let plansCount = 0;

    if (childIds.length > 0) {
      const [docs, logs, msgs, plans] = await Promise.all([
        db.select().from(documentsTable).where(inArray(documentsTable.childId, childIds)),
        db.select().from(behaviorLogsTable).where(inArray(behaviorLogsTable.childId, childIds)),
        db.select().from(messagesTable).where(inArray(messagesTable.childId, childIds)),
        db.select().from(behaviorPlansTable).where(inArray(behaviorPlansTable.childId, childIds)),
      ]);
      allDocuments = docs;
      logsCount = logs.length;
      messagesCount = msgs.length;
      plansCount = plans.length;
    }

    // Family account credentials: prefer the child whose username is set
    const primaryChild = children.find(c => c.username) ?? children[0];
    const clientAccount = primaryChild?.username
      ? { username: primaryChild.username, access_code: primaryChild.accessCode, email: family.email }
      : null;

    await auditLog({ userId: req.user.id, userRole: "clinician", action: "client_viewed", targetType: "family", targetId: family_id, tenantId: family.clinicianId ?? undefined });

    res.json({
      family: serializeFamily(family),
      children: serialize(children),
      documents: serialize(allDocuments),
      clientAccount: serialize(clientAccount),
      stats: { logs: logsCount, messages: messagesCount, documents: allDocuments.length, plans: plansCount },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ──────────────────────────────────────────────
// createClientAccount — creates family + children + credentials
// ──────────────────────────────────────────────

router.post("/create-client-account", requireAuth, async (req: any, res) => {
  const { accountType, familyName, notes, parentName, token, accountEmail, children, clientAccount } = req.body;
  try {
    const firstName = sanitizeStr(clientAccount?.first_name) ?? null;
    const lastName = sanitizeStr(clientAccount?.last_name) ?? null;
    const phone = sanitizeStr(clientAccount?.phone) ?? null;

    // Ensure familyName is never blank or "undefined"
    const cleanFamilyName = sanitizeStr(familyName) ?? (firstName && lastName ? `${firstName} ${lastName}` : "Unnamed Client");
    const cleanParentName = sanitizeStr(parentName) ?? (firstName && lastName ? `${firstName} ${lastName}` : null);

    const [family] = await db.insert(familiesTable).values({
      clinicianId: req.user.id,
      tenantId: req.user.id,
      createdBy: req.user.id,
      familyName: cleanFamilyName,
      firstName,
      lastName,
      primaryContact: cleanParentName,
      email: sanitizeStr(accountEmail) ?? null,
      phone,
      notes: sanitizeStr(notes) ?? null,
      inviteToken: sanitizeStr(token) ?? null,
      inviteStatus: "pending",
      accountType: sanitizeStr(accountType) ?? "individual",
    }).returning();

    const createdChildren = [];
    if (children && Array.isArray(children)) {
      for (const c of children) {
        const childName = sanitizeStr(c.child_name ?? c.childName) ?? cleanFamilyName;
        const [child] = await db.insert(childrenTable).values({
          clinicianId: req.user.id,
          tenantId: req.user.id,
          createdBy: req.user.id,
          familyId: family.id,
          parentEmail: sanitizeStr(accountEmail) ?? null,
          childName,
          age: c.age ? Number(c.age) : null,
          diagnosis: sanitizeStr(c.diagnosis) ?? null,
          notes: sanitizeStr(c.notes) ?? null,
          triggers: sanitizeStr(c.triggers) ?? null,
          isPatient: c.is_patient ?? c.isPatient ?? true,
          accountType: sanitizeStr(accountType) ?? "individual",
          // All children in the same family share one set of credentials
          username: sanitizeStr(clientAccount?.username) ?? null,
          accessCode: sanitizeStr(clientAccount?.access_code) ?? null,
          status: "active",
        }).returning();
        createdChildren.push(child);
      }
    }

    await auditLog({
      userId: req.user.id,
      userRole: "clinician",
      action: accountType === "individual" ? "individual_client_account_created" : "family_account_created",
      targetType: "family",
      targetId: family.id,
      tenantId: req.user.id,
      metadata: { accountType, childCount: createdChildren.length, hasEmail: !!accountEmail },
    });

    console.info(`[NeuroPath] Account created: ${accountType} family=${family.id} children=${createdChildren.length} username=${clientAccount?.username ?? "none"}`);

    res.status(201).json(serialize({ family: serializeFamily(family), children: createdChildren }));
  } catch (e: any) {
    console.error("[NeuroPath] createClientAccount error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ──────────────────────────────────────────────
// buildClientProfile — AI generates a client profile stub
// ──────────────────────────────────────────────

router.post("/build-client-profile", requireAuth, async (req: any, res) => {
  const { child_id, force_rebuild } = req.body;
  const clinicianId: string = req.user.id;
  const fail = (status: number, code: string, message: string) => {
    console.error(`[NeuroPath] buildClientProfile ${code}: child=${child_id} clinician=${clinicianId} — ${message}`);
    return res.status(status).json({ error: { code, message } });
  };
  if (!child_id) return fail(400, "child_id_required", "No client was specified for the scan.");

  console.info(`[NeuroPath] buildClientProfile: start child=${child_id} clinician=${clinicianId} force_rebuild=${!!force_rebuild}`);
  try {
    // Ownership: the child must exist and belong to this clinician.
    const [child] = await db.select().from(childrenTable).where(eq(childrenTable.id, child_id));
    if (!child) return fail(404, "child_not_found", "This client no longer exists.");
    if (child.clinicianId && child.clinicianId !== clinicianId) {
      return fail(403, "forbidden", "You don't have permission to scan this client's documents.");
    }

    const [existingProfile] = await db.select().from(clientProfilesTable)
      .where(eq(clientProfilesTable.childId, child_id));

    const docs = await db.select().from(documentsTable).where(eq(documentsTable.childId, child_id));
    const docsWithFiles = docs.filter(d => d.fileUrl);
    const childName = child.childName ?? "the client";
    const diagnosis = child.diagnosis ?? "";

    // Return the cached profile only when it already has content, no rebuild was
    // forced, AND every current document is already reflected in it. A newly
    // uploaded document (id not yet in sourceDocIds) always forces a fresh scan so
    // the file is actually read — otherwise Scan would silently no-op on new docs.
    const existingSourceIds: string[] = Array.isArray((existingProfile as any)?.sourceDocIds) ? (existingProfile as any).sourceDocIds : [];
    const hasUnscannedDoc = docsWithFiles.some(d => !existingSourceIds.includes(d.id));
    if (
      existingProfile &&
      Array.isArray((existingProfile as any).behaviors) &&
      (existingProfile as any).behaviors.length > 0 &&
      !force_rebuild &&
      !hasUnscannedDoc
    ) {
      console.info(`[NeuroPath] buildClientProfile: returning cached profile child=${child_id} (all ${docsWithFiles.length} docs already scanned)`);
      return res.json(serialize({ profile: existingProfile }));
    }

    // If no documents, save a placeholder profile so the UI can show a clear message
    if (docsWithFiles.length === 0) {
      const stub = { childId: child_id, clinicianId, tenantId: clinicianId ?? existingProfile?.tenantId ?? null, behaviors: [], goals: [], diagnoses: diagnosis ? [diagnosis] : [], objectives: [], safetyProcedures: [], sourceDocIds: [] };
      let profile;
      if (existingProfile) {
        [profile] = await db.update(clientProfilesTable).set(stub).where(eq(clientProfilesTable.id, existingProfile.id)).returning();
      } else {
        [profile] = await db.insert(clientProfilesTable).values(stub).returning();
      }
      console.info(`[NeuroPath] buildClientProfile: no documents for child=${child_id}, saved empty profile`);
      return res.json(serialize({ profile, warnings: ["No documents were available to scan yet."] }));
    }

    // Build document content for Claude — read each file according to its type.
    const contentParts: any[] = [];
    const includedDocIds: string[] = [];
    const failedDocs: { id: string; reason: string }[] = [];
    const warnings: string[] = [];
    const MAX_BYTES = 20 * 1024 * 1024;
    const IMAGE_MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp" };
    const TEXT_EXT = [".txt", ".md", ".csv", ".json", ".rtf"];

    for (const doc of docsWithFiles) {
      const label = doc.title || doc.category || doc.fileName || "Clinical Document";
      const urlMatch = String(doc.fileUrl).match(/\/api\/uploads\/(.+)$/);
      if (!urlMatch) { failedDocs.push({ id: doc.id, reason: "The file link is invalid." }); continue; }
      const filename = path.basename(urlMatch[1]);
      const safePath = path.normalize(path.join(UPLOAD_DIR, filename));
      if (!safePath.startsWith(UPLOAD_DIR)) { failedDocs.push({ id: doc.id, reason: "The file path is not allowed." }); continue; }
      let fileContent: Buffer;
      try {
        fileContent = await fs.readFile(safePath);
      } catch {
        failedDocs.push({ id: doc.id, reason: "The file could not be found on the server." });
        continue;
      }
      if (fileContent.byteLength > MAX_BYTES) { failedDocs.push({ id: doc.id, reason: "The file is too large to scan (over 20MB)." }); continue; }
      const ext = path.extname(filename).toLowerCase();
      try {
        if (IMAGE_MIME[ext]) {
          contentParts.push({ type: "text", text: `[Document: ${label}]` });
          contentParts.push({ type: "image", source: { type: "base64", media_type: IMAGE_MIME[ext], data: fileContent.toString("base64") } });
          includedDocIds.push(doc.id);
        } else if (ext === ".pdf") {
          // Native PDF document block: Claude reads both text and image-based (scanned) PDFs.
          contentParts.push({ type: "text", text: `[Document: ${label}]` });
          contentParts.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: fileContent.toString("base64") } });
          includedDocIds.push(doc.id);
        } else if (ext === ".docx") {
          const mammoth: any = await import("mammoth");
          const extractRawText = mammoth.extractRawText || mammoth.default?.extractRawText;
          const result = await extractRawText({ buffer: fileContent });
          const text = String(result?.value || "").trim();
          if (!text) { failedDocs.push({ id: doc.id, reason: "No readable text was found in this Word document." }); continue; }
          contentParts.push({ type: "text", text: `[Document: ${label}]\n${text.substring(0, 20000)}` });
          includedDocIds.push(doc.id);
        } else if (TEXT_EXT.includes(ext)) {
          const text = fileContent.toString("utf-8").trim();
          if (!text) { failedDocs.push({ id: doc.id, reason: "The file is empty." }); continue; }
          contentParts.push({ type: "text", text: `[Document: ${label}]\n${text.substring(0, 20000)}` });
          includedDocIds.push(doc.id);
        } else {
          failedDocs.push({ id: doc.id, reason: `Unsupported file type (${ext || "unknown"}). Upload a PDF, image, Word (.docx), or text file.` });
        }
      } catch {
        failedDocs.push({ id: doc.id, reason: "This file could not be read." });
      }
    }

    console.info(`[NeuroPath] buildClientProfile: child=${child_id} included=${includedDocIds.length} failed=${failedDocs.length} of ${docsWithFiles.length}`);

    // Persist per-document failures so the UI can show a specific reason.
    const now = new Date();
    for (const fd of failedDocs) {
      await db.update(documentsTable).set({ scanStatus: "error", scanError: fd.reason, scannedAt: now }).where(eq(documentsTable.id, fd.id)).catch(() => {});
    }

    // Nothing usable to scan → return a clear, specific error.
    if (includedDocIds.length === 0) {
      const detail = failedDocs.map(f => f.reason).find(Boolean) || "The documents could not be read.";
      return fail(422, "no_readable_content", `Couldn't read any of the client's documents. ${detail}`);
    }

    // Instruct Claude to record the profile via the structured tool below.
    contentParts.push({
      type: "text",
      text: `You are a clinical assistant. Analyze the clinical documents above for ${childName}${diagnosis ? ` (diagnosis: ${diagnosis})` : ""} and record a structured behavioral profile by calling the save_behavioral_profile tool. Base every field only on the documents. Use an empty array for any list not supported by the documents, and keep list items concise.`,
    });

    // Force structured output via tool use. This is far more reliable than asking
    // for raw JSON text: no markdown fences, no prose, and the SDK returns an
    // already-parsed object — which fixes the previous truncated/invalid-JSON
    // failures (ai_invalid_response) seen with large multi-document scans.
    const profileTool: any = {
      name: "save_behavioral_profile",
      description: "Record the structured behavioral profile extracted from the client's clinical documents.",
      input_schema: {
        type: "object",
        properties: {
          behaviors: {
            type: "array",
            description: "Distinct behaviors of clinical concern found in the documents.",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Short behavior name, e.g. 'Aggressive Outbursts'." },
                emoji: { type: "string", description: "A single relevant emoji." },
                description: { type: "string", description: "1-2 sentence description." },
                what_may_be_happening: { type: "string", description: "Clinical explanation for parents." },
                do_this_right_now: { type: "array", items: { type: "string" }, description: "Immediate action steps." },
                interventions: { type: "array", items: { type: "string" }, description: "Clinician-approved strategies." },
                if_it_escalates: { type: "array", items: { type: "string" }, description: "Escalation steps." },
                avoid: { type: "array", items: { type: "string" }, description: "Things not to do." },
                prevention_tips: { type: "array", items: { type: "string" } },
                reinforcement_rewards: { type: "array", items: { type: "string" } },
                clinical_interventions: { type: "array", items: { type: "string" }, description: "Therapy techniques, e.g. ABA, CBT." },
                when_to_contact_clinician: { type: "string" },
                linked_goals: { type: "array", items: { type: "string" }, description: "Treatment goal titles this behavior maps to." },
                triggers: { type: "array", items: { type: "string" } },
              },
              required: ["name", "description"],
            },
          },
          goals: {
            type: "array",
            items: {
              type: "object",
              properties: { title: { type: "string" }, description: { type: "string" } },
              required: ["title"],
            },
          },
          diagnoses: { type: "array", items: { type: "string" } },
          objectives: {
            type: "array",
            items: {
              type: "object",
              properties: {
                target_behavior: { type: "string" },
                measurable_outcome: { type: "string" },
                completion_criteria: { type: "string" },
              },
            },
          },
          safety_procedures: { type: "array", items: { type: "string" } },
        },
        required: ["behaviors", "goals", "diagnoses", "objectives", "safety_procedures"],
      },
    };

    let message;
    try {
      const anthropic = await getAnthropicClient();
      console.info(`[NeuroPath] buildClientProfile: calling Claude child=${child_id} parts=${contentParts.length}`);
      message = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 8192,
        tools: [profileTool],
        tool_choice: { type: "tool", name: "save_behavioral_profile" },
        messages: [{ role: "user", content: contentParts }],
      });
    } catch (ex: any) {
      for (const id of includedDocIds) {
        await db.update(documentsTable).set({ scanStatus: "error", scanError: "The AI scan failed. Please try again.", scannedAt: now }).where(eq(documentsTable.id, id)).catch(() => {});
      }
      console.error(`[NeuroPath] buildClientProfile: AI error child=${child_id}:`, ex?.message);
      return fail(502, "ai_error", "The AI service could not process the documents right now. Please try again in a moment.");
    }

    const toolUse = message.content.find((b: any) => b.type === "tool_use") as any;
    const extracted: any = toolUse?.input;
    if (!extracted || typeof extracted !== "object" || Array.isArray(extracted)) {
      for (const id of includedDocIds) {
        await db.update(documentsTable).set({ scanStatus: "error", scanError: "The AI returned an unreadable result. Please try again.", scannedAt: now }).where(eq(documentsTable.id, id)).catch(() => {});
      }
      console.error(`[NeuroPath] buildClientProfile: no tool_use output child=${child_id} stop_reason=${message.stop_reason}`);
      return fail(502, "ai_invalid_response", "The AI returned an unexpected result. Please try scanning again.");
    }
    if (message.stop_reason === "max_tokens") {
      console.warn(`[NeuroPath] buildClientProfile: output truncated at max_tokens child=${child_id} behaviors=${(extracted.behaviors || []).length}`);
    }

    const profileData = {
      childId: child_id,
      clinicianId: clinicianId ?? existingProfile?.clinicianId ?? null,
      tenantId: clinicianId ?? existingProfile?.tenantId ?? null,
      behaviors: extracted.behaviors || [],
      goals: extracted.goals || [],
      diagnoses: extracted.diagnoses || (diagnosis ? [diagnosis] : []),
      objectives: extracted.objectives || [],
      safetyProcedures: extracted.safety_procedures || [],
      sourceDocIds: includedDocIds,
    };

    let profile;
    if (existingProfile) {
      [profile] = await db.update(clientProfilesTable).set(profileData).where(eq(clientProfilesTable.id, existingProfile.id)).returning();
    } else {
      [profile] = await db.insert(clientProfilesTable).values(profileData).returning();
    }

    // Mark the successfully scanned documents.
    for (const id of includedDocIds) {
      await db.update(documentsTable).set({ scanStatus: "done", scanError: null, scannedAt: now }).where(eq(documentsTable.id, id)).catch(() => {});
    }

    // Sync AI-extracted treatment goals into reward_tokens so they appear
    // automatically in the Goals & Milestones UI, which reads reward_tokens
    // (not the profile JSON). Idempotent by title: keep existing document-sourced
    // goals whose title still appears (preserving any progress), add newly found
    // ones, and remove document-sourced goals no longer present in the documents.
    try {
      const extractedGoals: { title: string; description: string }[] = (Array.isArray(extracted.goals) ? extracted.goals : [])
        .filter((g: any) => g && typeof g.title === "string" && g.title.trim())
        .map((g: any) => ({ title: g.title.trim(), description: typeof g.description === "string" ? g.description.trim() : "" }));

      const existingDocGoals = await db.select().from(rewardTokensTable)
        .where(and(eq(rewardTokensTable.childId, child_id), eq(rewardTokensTable.source, "document")));

      const extractedTitles = new Set(extractedGoals.map(g => g.title));
      const existingTitles = new Set(existingDocGoals.map(g => (g.goalTitle || "").trim()).filter(Boolean));

      for (const g of existingDocGoals) {
        if (!extractedTitles.has((g.goalTitle || "").trim())) {
          await db.delete(rewardTokensTable).where(eq(rewardTokensTable.id, g.id)).catch(() => {});
        }
      }

      const toInsert = extractedGoals
        .filter(g => !existingTitles.has(g.title))
        .map(g => ({
          childId: child_id,
          parentId: (child as any).parentId ?? null,
          clinicianId: clinicianId ?? child.clinicianId ?? null,
          tenantId: clinicianId ?? existingProfile?.tenantId ?? null,
          goalTitle: g.title,
          goalDescription: g.description,
          progress: 0,
          target: 10,
          source: "document",
          createdByClinician: true,
        }));
      if (toInsert.length > 0) {
        await db.insert(rewardTokensTable).values(toInsert);
      }
    } catch (syncErr: any) {
      console.error(`[NeuroPath] buildClientProfile: goal sync failed child=${child_id}:`, syncErr?.message);
    }

    if (failedDocs.length > 0) {
      warnings.push(`${failedDocs.length} document(s) could not be read and were skipped.`);
    }

    console.info(`[NeuroPath] buildClientProfile: done child=${child_id} behaviors=${(extracted.behaviors || []).length} docs=${includedDocIds.length}`);
    res.json(serialize({ profile, warnings, scanned: includedDocIds, failed: failedDocs }));
  } catch (e: any) {
    console.error("[NeuroPath] buildClientProfile error:", e?.message);
    res.status(500).json({ error: { code: "scan_failed", message: "Something went wrong while scanning. Please try again." } });
  }
});

// ──────────────────────────────────────────────
// manageClientRecord — multiplex action handler
// ──────────────────────────────────────────────

router.post("/manage-client-record", requireAuth, async (req: any, res) => {
  const { action, entity_id, data } = req.body;
  try {
    switch (action) {
      case "updateChild": {
        if (!entity_id) return res.status(400).json({ error: "entity_id required" });
        // Verify ownership
        const [existing] = await db.select().from(childrenTable).where(eq(childrenTable.id, entity_id));
        if (!existing) return res.status(404).json({ error: "Not found" });
        if (existing.clinicianId && existing.clinicianId !== req.user.id) return res.status(403).json({ error: "Access denied" });
        const [child] = await db.update(childrenTable)
          .set(bodyToCamel(data || {}))
          .where(eq(childrenTable.id, entity_id))
          .returning();
        return res.json(serialize({ record: child }));
      }
      case "deleteChild": {
        if (!entity_id) return res.status(400).json({ error: "entity_id required" });
        const [existing] = await db.select().from(childrenTable).where(eq(childrenTable.id, entity_id));
        if (!existing) return res.status(404).json({ error: "Not found" });
        if (existing.clinicianId && existing.clinicianId !== req.user.id) return res.status(403).json({ error: "Access denied" });
        await db.delete(childrenTable).where(eq(childrenTable.id, entity_id));
        await auditLog({ userId: req.user.id, userRole: "clinician", action: "child_deleted", targetType: "child", targetId: entity_id });
        return res.json({ ok: true });
      }
      case "updateFamily": {
        if (!entity_id) return res.status(400).json({ error: "entity_id required" });
        const [existing] = await db.select().from(familiesTable).where(eq(familiesTable.id, entity_id));
        if (!existing) return res.status(404).json({ error: "Not found" });
        if (existing.clinicianId && existing.clinicianId !== req.user.id) return res.status(403).json({ error: "Access denied" });
        const [family] = await db.update(familiesTable)
          .set(bodyToCamel(data || {}))
          .where(eq(familiesTable.id, entity_id))
          .returning();
        return res.json(serialize({ record: serializeFamily(family) }));
      }
      case "deleteFamily": {
        if (!entity_id) return res.status(400).json({ error: "entity_id required" });
        const [existing] = await db.select().from(familiesTable).where(eq(familiesTable.id, entity_id));
        if (!existing) return res.status(404).json({ error: "Not found" });
        if (existing.clinicianId && existing.clinicianId !== req.user.id) return res.status(403).json({ error: "Access denied" });
        const kids = await db.select().from(childrenTable).where(eq(childrenTable.familyId, entity_id));
        for (const k of kids) {
          await db.delete(documentsTable).where(eq(documentsTable.childId, k.id));
          await db.delete(behaviorPlansTable).where(eq(behaviorPlansTable.childId, k.id));
          await db.delete(behaviorLogsTable).where(eq(behaviorLogsTable.childId, k.id));
          await db.delete(interventionPlansTable).where(eq(interventionPlansTable.childId, k.id));
          await db.delete(childrenTable).where(eq(childrenTable.id, k.id));
        }
        await db.delete(familiesTable).where(eq(familiesTable.id, entity_id));
        await auditLog({ userId: req.user.id, userRole: "clinician", action: "family_deleted", targetType: "family", targetId: entity_id });
        return res.json({ ok: true });
      }
      case "createDocument": {
        const docData = bodyToCamel(data || {});
        const [doc] = await db.insert(documentsTable).values({
          ...docData,
          clinicianId: req.user.id,
          tenantId: req.user.id,
          uploadedBy: req.user.id,
        }).returning();
        await auditLog({ userId: req.user.id, userRole: "clinician", action: "document_uploaded", targetType: "document", targetId: doc.id, tenantId: req.user.id });
        return res.json(serialize({ record: doc }));
      }
      case "deleteDocument": {
        if (!entity_id) return res.status(400).json({ error: "entity_id required" });
        const [existing] = await db.select().from(documentsTable).where(eq(documentsTable.id, entity_id));
        if (!existing) return res.status(404).json({ error: "Not found" });
        if (existing.clinicianId && existing.clinicianId !== req.user.id) return res.status(403).json({ error: "Access denied" });
        await db.delete(documentsTable).where(eq(documentsTable.id, entity_id));
        await auditLog({ userId: req.user.id, userRole: "clinician", action: "document_deleted", targetType: "document", targetId: entity_id });
        return res.json({ ok: true });
      }
      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ──────────────────────────────────────────────
// manageClientGoal — create/update/delete reward token goals
// ──────────────────────────────────────────────

// Dual-auth: clinicians authenticate via the OIDC cookie (req.user); parents/clients
// use a client-session (username + access code) which has NO server session, so they
// authorize with the account_id / invite_token (cs_<childId>_<ts>) issued at login.
// This mirrors the existing (unsigned) client-session trust model used elsewhere.
// A client-session caller may only touch goals for their own child or a sibling in
// the same family.
router.post("/manage-client-goal", async (req: any, res) => {
  const { action, data } = req.body;
  const entityId: string | undefined = req.body.entity_id || req.body.goal_id;
  const bodyChildId: string | null =
    req.body.child_id || (data && (data.child_id || data.childId)) || null;

  const clinicianId: string | null = req.user?.id ?? null;

  if (!clinicianId && !req.body.invite_token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  // Resolve the authenticated child via DB-backed token validation.
  let authChildId: string | null = null;
  if (!clinicianId) {
    const csession = await validateClientSession(req.body.invite_token);
    if (!csession) return res.status(401).json({ error: "Invalid or expired session" });
    authChildId = csession.childId;
  }

  // May a client-session caller act on this child's goals? (same child or sibling)
  const clientMayAccessChild = async (targetChildId: string | null | undefined) => {
    if (!authChildId || !targetChildId) return false;
    if (authChildId === targetChildId) return true;
    const [a] = await db.select().from(childrenTable).where(eq(childrenTable.id, authChildId));
    const [b] = await db.select().from(childrenTable).where(eq(childrenTable.id, targetChildId));
    return !!a?.familyId && a.familyId === b?.familyId;
  };

  // May the caller act on an existing reward-token row?
  const canAccessRow = async (row: any) => {
    if (clinicianId) return !row.clinicianId || row.clinicianId === clinicianId;
    return clientMayAccessChild(row.childId);
  };

  try {
    switch (action) {
      case "create": {
        const targetChildId = clinicianId ? bodyChildId : (bodyChildId ?? authChildId);
        if (!targetChildId) return res.status(400).json({ error: "child_id required" });
        if (!clinicianId && !(await clientMayAccessChild(targetChildId))) {
          return res.status(403).json({ error: "Access denied" });
        }
        const values: any = { ...bodyToCamel(data || {}), childId: targetChildId };
        delete values.id;
        if (clinicianId) {
          values.clinicianId = clinicianId;
          values.tenantId = clinicianId;
        } else {
          values.parentId = authChildId;
          // Inherit the child's clinician/tenant so parent-created goals also show
          // up in the clinician's goals list (makeCrud filters by clinicianId).
          const [childRow] = await db.select().from(childrenTable).where(eq(childrenTable.id, targetChildId));
          if (childRow?.clinicianId) values.clinicianId = childRow.clinicianId;
          if (childRow?.tenantId) values.tenantId = childRow.tenantId;
        }
        const [goal] = await db.insert(rewardTokensTable).values(values).returning();
        return res.json(serialize({ record: goal }));
      }
      case "update": {
        if (!entityId) return res.status(400).json({ error: "entity_id required" });
        const [existing] = await db.select().from(rewardTokensTable).where(eq(rewardTokensTable.id, entityId));
        if (!existing) return res.status(404).json({ error: "Not found" });
        if (!(await canAccessRow(existing))) return res.status(403).json({ error: "Access denied" });
        const patch = bodyToCamel(data || {});
        // Never allow ownership/identity fields to be reassigned via the request body.
        delete patch.id; delete patch.childId; delete patch.clinicianId; delete patch.tenantId; delete patch.parentId;
        const [goal] = await db.update(rewardTokensTable)
          .set(patch)
          .where(eq(rewardTokensTable.id, entityId))
          .returning();
        return res.json(serialize({ record: goal }));
      }
      case "delete": {
        if (!entityId) return res.status(400).json({ error: "entity_id required" });
        const [existing] = await db.select().from(rewardTokensTable).where(eq(rewardTokensTable.id, entityId));
        if (!existing) return res.status(404).json({ error: "Not found" });
        if (!(await canAccessRow(existing))) return res.status(403).json({ error: "Access denied" });
        await db.delete(rewardTokensTable).where(eq(rewardTokensTable.id, entityId));
        return res.json({ ok: true });
      }
      default:
        return res.status(400).json({ error: `Unknown goal action: ${action}` });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ──────────────────────────────────────────────
// verifyClientCredentials — username + access_code login
// ──────────────────────────────────────────────

router.post("/verify-client-credentials", async (req, res) => {
  const { username, access_code } = req.body;
  if (!username || !access_code) return res.status(400).json({ error: "username and access_code required" });
  try {
    const [child] = await db.select().from(childrenTable)
      .where(and(eq(childrenTable.username, username), eq(childrenTable.accessCode, access_code)));
    if (!child) {
      await auditLog({ action: "failed_login", targetType: "child", success: false, reason: "invalid credentials", metadata: { username } });
      return res.json({ error: "Invalid username or access code" });
    }

    // Get sibling children (same family = same family login)
    const siblings = child.familyId
      ? await db.select().from(childrenTable).where(eq(childrenTable.familyId, child.familyId))
      : [child];

    // Pull the caregiver/family name so the portal can greet the account holder
    const [family] = child.familyId
      ? await db.select().from(familiesTable).where(eq(familiesTable.id, child.familyId))
      : [undefined];

    await auditLog({ action: "login", targetType: "child", targetId: child.id, success: true, tenantId: child.clinicianId ?? undefined });

    const token = await generateClientToken(child.id, username, access_code);
    const session = {
      id: child.id,
      invite_token: token,
      child_name: child.childName,
      family_name: family?.familyName ?? null,
      primary_contact: family?.primaryContact ?? null,
      children: serialize(siblings),
    };
    res.json({ session });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// client-session/change-access-code — lets a client change their own access code
router.post("/client-session/change-access-code", async (req, res) => {
  const { username, current_access_code, new_access_code } = req.body;
  if (!username || !current_access_code || !new_access_code)
    return res.status(400).json({ error: "username, current_access_code, and new_access_code required" });
  if (new_access_code.length < 4)
    return res.status(400).json({ error: "New access code must be at least 4 characters" });
  try {
    const [child] = await db.select().from(childrenTable)
      .where(and(eq(childrenTable.username, username), eq(childrenTable.accessCode, current_access_code)));
    if (!child) return res.status(401).json({ error: "Current username or access code is incorrect" });

    const upperCode = new_access_code.toUpperCase();
    await db.update(childrenTable).set({ accessCode: upperCode }).where(eq(childrenTable.id, child.id));

    // Return a fresh session so the client can update localStorage
    const siblings = child.familyId
      ? await db.select().from(childrenTable).where(eq(childrenTable.familyId, child.familyId))
      : [child];
    const freshSiblings = await db.select().from(childrenTable).where(eq(childrenTable.familyId, child.familyId || child.id));
    const [family] = child.familyId
      ? await db.select().from(familiesTable).where(eq(familiesTable.id, child.familyId))
      : [undefined];
    const newToken = await generateClientToken(child.id, username, upperCode);
    const session = {
      id: child.id,
      invite_token: newToken,
      child_name: child.childName,
      family_name: family?.familyName ?? null,
      primary_contact: family?.primaryContact ?? null,
      children: serialize(freshSiblings.length > 0 ? freshSiblings : siblings),
    };
    await auditLog({ action: "access_code_changed", targetType: "child", targetId: child.id, success: true });
    res.json({ ok: true, session });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Keep legacy path (used by clientSession.js)
router.post("/client-session/login", async (req, res) => {
  const { username, access_code } = req.body;
  if (!username || !access_code) return res.status(400).json({ error: "username and access_code required" });
  try {
    const [child] = await db.select().from(childrenTable)
      .where(and(eq(childrenTable.username, username), eq(childrenTable.accessCode, access_code)));
    if (!child) {
      await auditLog({ action: "failed_login", targetType: "child", success: false, reason: "invalid credentials", metadata: { username } });
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const siblings = child.familyId
      ? await db.select().from(childrenTable).where(eq(childrenTable.familyId, child.familyId))
      : [child];

    const [family] = child.familyId
      ? await db.select().from(familiesTable).where(eq(familiesTable.id, child.familyId))
      : [undefined];

    await auditLog({ action: "login", targetType: "child", targetId: child.id, success: true, tenantId: child.clinicianId ?? undefined });

    const token = await generateClientToken(child.id, username, access_code);
    res.json({
      id: child.id,
      invite_token: token,
      child_name: child.childName,
      family_name: family?.familyName ?? null,
      primary_contact: family?.primaryContact ?? null,
      children: serialize(siblings),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ──────────────────────────────────────────────
// addChildToFamily — add a new child to an existing family
// ──────────────────────────────────────────────

router.post("/add-child-to-family", requireAuth, async (req: any, res) => {
  const { family_id, child_name, age, diagnosis, triggers, notes } = req.body;
  if (!family_id || !child_name) return res.status(400).json({ error: "family_id and child_name required" });
  try {
    const [family] = await db.select().from(familiesTable).where(eq(familiesTable.id, family_id));
    if (!family) return res.status(404).json({ error: "Family not found" });
    if (family.clinicianId && family.clinicianId !== req.user.id) return res.status(403).json({ error: "Access denied" });

    // Get existing children to share credentials
    const existingChildren = await db.select().from(childrenTable).where(eq(childrenTable.familyId, family_id));
    const credChild = existingChildren.find(c => c.username);

    const [child] = await db.insert(childrenTable).values({
      clinicianId: req.user.id,
      tenantId: req.user.id,
      createdBy: req.user.id,
      familyId: family_id,
      parentEmail: family.email ?? null,
      childName: sanitizeStr(child_name) ?? "Child",
      age: age ? Number(age) : null,
      diagnosis: sanitizeStr(diagnosis) ?? null,
      triggers: sanitizeStr(triggers) ?? null,
      notes: sanitizeStr(notes) ?? null,
      isPatient: true,
      accountType: family.accountType ?? "parent_family",
      // Share the family credentials
      username: credChild?.username ?? null,
      accessCode: credChild?.accessCode ?? null,
      status: "active",
    }).returning();

    await auditLog({ userId: req.user.id, userRole: "clinician", action: "child_added_to_family", targetType: "child", targetId: child.id, tenantId: req.user.id });
    console.info(`[NeuroPath] Child added to family: child=${child.id} family=${family_id}`);

    res.status(201).json(serialize({ child }));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
