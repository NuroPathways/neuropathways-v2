import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  behaviorLogsTable,
  childrenTable,
  consentEventsTable,
  db,
  familiesTable,
  parentAccountsTable,
  parentChildSettingsTable,
  parentLogsTable,
  parentSessionsTable,
  userProfilesTable,
  usersTable,
} from "@workspace/db";
import { makeStarterCard, starterLibrary } from "../lib/parentStarterLibrary";
import { getParentSupportCards, listParentDocuments } from "../lib/parentDocuments";
import {
  hashParentPassword,
  hashParentSessionToken,
  normalizeParentEmail,
  ownedParentChild,
  performParentPasswordCheck,
  CURRENT_HEALTH_CONSENT_VERSION,
  CURRENT_PRIVACY_POLICY_VERSION,
  PARENT_SESSION_COOKIE,
  PARENT_SESSION_TTL,
  requireParent,
  revokeParentSession,
  serializeParentChild,
  validateParentPassword,
  verifyParentPassword,
  type ParentIdentity,
} from "../lib/parentAuth";

const router = Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many parent sign-in attempts. Please try again later." },
  skip: () => process.env.DISABLE_RATE_LIMIT === "true",
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function cleanText(value: unknown, maximum: number, allowEmpty = false): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  if (
    clean.length > maximum ||
    (!allowEmpty && clean.length === 0) ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(clean)
  ) return null;
  return clean;
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function getParentToken(req: Request): string | null {
  const header = req.headers["x-parent-token"];
  if (typeof header === "string" && header.trim()) return header.trim();
  const authorization = req.headers.authorization;
  if (typeof authorization === "string") {
    const match = authorization.match(/^Bearer\s+(\S+)$/i);
    if (match) return match[1];
  }
  const cookie = req.cookies?.[PARENT_SESSION_COOKIE];
  return typeof cookie === "string" && cookie ? cookie : null;
}

function getRouteChildId(req: Request): string | null {
  const raw = req.params.childId;
  const candidate = typeof raw === "string" ? raw : Array.isArray(raw) && raw.length === 1 ? raw[0] : null;
  if (typeof candidate !== "string" || !candidate.trim() || candidate.length > 128) return null;
  return candidate.trim();
}

function setParentCookie(res: Response, token: string): void {
  res.cookie(PARENT_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: PARENT_SESSION_TTL,
  });
}

function serializeParent(parent: ParentIdentity): ParentIdentity {
  return {
    id: parent.id,
    firstName: parent.firstName,
    email: parent.email,
    workspaceId: parent.workspaceId,
    accountType: "parent_free",
  };
}

async function listParentChildren(parentId: string) {
  const rows = await db
    .select({ child: childrenTable, settings: parentChildSettingsTable })
    .from(childrenTable)
    .innerJoin(
      parentChildSettingsTable,
      and(
        eq(parentChildSettingsTable.childId, childrenTable.id),
        eq(parentChildSettingsTable.parentId, parentId),
      ),
    )
    .where(eq(childrenTable.parentId, parentId));
  return rows.map(({ child, settings }) => serializeParentChild(child, settings));
}

function validBehaviorKey(value: string | null): boolean {
  return value === null ||
    value === "custom" ||
    starterLibrary.some((template) => template.key === value);
}

function validateBehaviorSelection(behaviorKey: string | null, customBehavior: string | null): boolean {
  if (!validBehaviorKey(behaviorKey)) return false;
  if (behaviorKey === "custom") return Boolean(customBehavior);
  if (behaviorKey && !starterLibrary.some((template) => template.key === behaviorKey)) return false;
  return true;
}

type ChildInput = {
  name?: string;
  age?: number | null;
  notes?: string;
  behaviorKey?: string | null;
  customBehavior?: string | null;
  goal?: string | null;
};

type ChildInputCheck =
  | { ok: true; input: ChildInput }
  | { ok: false; error: string };

function validateChildInput(
  value: unknown,
  mode: "create" | "patch",
): ChildInputCheck {
  if (!isRecord(value)) return { ok: false, error: "A JSON object is required" };
  const keys = ["name", "age", "notes", "behaviorKey", "customBehavior", "goal"];
  if (!hasOnlyKeys(value, keys)) return { ok: false, error: "The request contains unsupported fields" };
  if (mode === "create" && !hasOwn(value, "name")) return { ok: false, error: "name is required" };
  if (mode === "patch" && Object.keys(value).length === 0) return { ok: false, error: "At least one field is required" };

  const input: ChildInput = {};
  if (hasOwn(value, "name")) {
    const name = cleanText(value.name, 100);
    if (!name) return { ok: false, error: "name must be a non-empty string of at most 100 characters" };
    input.name = name;
  }
  if (hasOwn(value, "age")) {
    const age = value.age;
    if (age !== null && (!Number.isInteger(age) || typeof age !== "number" || age < 0 || age > 120)) {
      return { ok: false, error: "age must be a whole number from 0 to 120 or null" };
    }
    input.age = age as number | null;
  }
  if (hasOwn(value, "notes")) {
    if (value.notes === null) input.notes = "";
    else {
      const notes = cleanText(value.notes, 5000, true);
      if (notes === null) return { ok: false, error: "notes must be a string of at most 5000 characters" };
      input.notes = notes;
    }
  }
  if (hasOwn(value, "behaviorKey")) {
    if (value.behaviorKey === null) input.behaviorKey = null;
    else {
      const behaviorKey = cleanText(value.behaviorKey, 100);
      if (!behaviorKey) return { ok: false, error: "behaviorKey must be a known behavior key or null" };
      input.behaviorKey = behaviorKey;
    }
  }
  if (hasOwn(value, "customBehavior")) {
    if (value.customBehavior === null) input.customBehavior = null;
    else {
      const customBehavior = cleanText(value.customBehavior, 120);
      if (!customBehavior) return { ok: false, error: "customBehavior must be a non-empty string of at most 120 characters or null" };
      input.customBehavior = customBehavior;
    }
  }
  if (hasOwn(value, "goal")) {
    if (value.goal === null) input.goal = null;
    else {
      const goal = cleanText(value.goal, 500);
      if (!goal) return { ok: false, error: "goal must be a non-empty string of at most 500 characters or null" };
      input.goal = goal;
    }
  }
  return { ok: true, input };
}

function starterCardsAfterEdit(
  current: unknown,
  behaviorKey: string | null,
  customBehavior: string | null,
  goal: string | null,
): Record<string, unknown>[] {
  const existing = Array.isArray(current)
    ? current.filter((card): card is Record<string, unknown> =>
        isRecord(card) && card.source !== "starter")
    : [];
  if (!behaviorKey && !customBehavior) return existing;
  const starterCard = makeStarterCard(behaviorKey, customBehavior, goal);
  return [...existing, starterCard as unknown as Record<string, unknown>];
}

function serializeParentLog(log: typeof parentLogsTable.$inferSelect) {
  return {
    id: log.id,
    childId: log.childId,
    behaviorKey: log.behaviorKey ?? null,
    goal: log.goal ?? null,
    happened: log.happened,
    intensity: log.intensity,
    duration: log.duration,
    trigger: log.trigger ?? null,
    whatHelped: log.whatHelped ?? null,
    notes: log.notes ?? null,
    createdAt: log.createdAt.toISOString(),
  };
}

export async function getParentDashboardData(parentId: string, childId: string) {
  const owned = await ownedParentChild(parentId, childId);
  if (!owned) return null;
  const [supportCards, documents, storedLogs] = await Promise.all([
    getParentSupportCards(parentId, childId),
    listParentDocuments(parentId, childId),
    db
      .select()
      .from(parentLogsTable)
      .where(and(eq(parentLogsTable.parentId, parentId), eq(parentLogsTable.childId, childId)))
      .orderBy(desc(parentLogsTable.createdAt)),
  ]);
  return {
    child: serializeParentChild(owned, owned.settings),
    supportCards,
    documents,
    logs: storedLogs.map(serializeParentLog),
  };
}

export { ownedParentChild, serializeParentChild };

router.get("/parent/starter-library", (_req, res) => {
  res.json(starterLibrary);
});

router.post("/parent/auth/register", authLimiter, async (req: Request, res: Response) => {
  const body = req.body;
  if (!isRecord(body) || !hasOnlyKeys(body, ["firstName", "email", "password", "confirmPassword", "privacyConsent", "healthConsent"])) {
    res.status(400).json({ error: "Invalid registration request" });
    return;
  }
  const firstName = cleanText(body.firstName, 80);
  const email = normalizeParentEmail(body.email);
  if (!firstName) {
    res.status(400).json({ error: "firstName must be a non-empty string of at most 80 characters" });
    return;
  }
  if (!email) {
    res.status(400).json({ error: "Enter a valid email address" });
    return;
  }
  if (!validateParentPassword(body.password)) {
    res.status(400).json({ error: "Password must be 8 to 128 characters" });
    return;
  }
  if (!validateParentPassword(body.confirmPassword) || body.password !== body.confirmPassword) {
    res.status(400).json({ error: "Password confirmation does not match" });
    return;
  }
  if (body.privacyConsent !== true || body.healthConsent !== true) {
    res.status(400).json({ error: "Privacy and health-information consent are required" });
    return;
  }

  try {
    const passwordHash = await hashParentPassword(body.password);
    const parentId = crypto.randomUUID();
    const workspaceId = crypto.randomUUID();
    const now = new Date();
    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(now.getTime() + PARENT_SESSION_TTL);

    const created = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`parent-register:${email}`}))`);
      const [existingAccount] = await tx
        .select({ id: parentAccountsTable.id })
        .from(parentAccountsTable)
        .where(eq(parentAccountsTable.email, email));
      const [existingUser] = await tx
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(sql`lower(${usersTable.email}) = ${email}`);
      if (existingAccount || existingUser) return false;

      await tx.insert(usersTable).values({ id: parentId, email, firstName, lastName: null });
      await tx.insert(userProfilesTable).values({
        id: parentId,
        tenantId: workspaceId,
        appRole: "parent",
        accountType: "parent_free",
        displayName: firstName,
        firstName,
        linkedFamilyId: workspaceId,
      });
      await tx.insert(familiesTable).values({
        id: workspaceId,
        tenantId: workspaceId,
        familyName: `${firstName} Family`,
        firstName,
        primaryContact: firstName,
        email,
        accountType: "parent_free",
        createdBy: parentId,
      });
      await tx.insert(parentAccountsTable).values({
        id: parentId,
        email,
        firstName,
        workspaceId,
        passwordHash,
      });
      await tx.insert(parentSessionsTable).values({
        tokenHash: hashParentSessionToken(token),
        parentId,
        expiresAt,
      });
      await tx.insert(consentEventsTable).values([
        {
          subjectId: parentId,
          familyId: workspaceId,
          eventType: "PRIVACY_POLICY_ACCEPTED",
          policyType: "consumer_health_privacy",
          version: CURRENT_PRIVACY_POLICY_VERSION,
          acceptanceMethod: "signup_checkbox",
          source: "signup",
          actorType: "user",
        },
        {
          subjectId: parentId,
          familyId: workspaceId,
          eventType: "HEALTH_INFORMATION_PROCESSING_ACCEPTED",
          policyType: "health_information_processing",
          version: CURRENT_HEALTH_CONSENT_VERSION,
          acceptanceMethod: "signup_checkbox",
          source: "signup",
          actorType: "user",
        },
        {
          subjectId: parentId,
          familyId: workspaceId,
          eventType: "HEALTH_INFORMATION_SECURITY_RISK_ACKNOWLEDGED",
          policyType: "health_information_security_risk",
          version: CURRENT_HEALTH_CONSENT_VERSION,
          acceptanceMethod: "signup_checkbox",
          source: "signup",
          actorType: "user",
        },
      ]);
      return true;
    });

    if (!created) {
      res.status(409).json({ error: "An account with this email already exists. Please sign in." });
      return;
    }
    const parent: ParentIdentity = { id: parentId, firstName, email, workspaceId, accountType: "parent_free" };
    setParentCookie(res, token);
    res.status(201).json({ token, parent: serializeParent(parent), children: [] });
  } catch (error: any) {
    if (error?.code === "23505") {
      res.status(409).json({ error: "An account with this email already exists. Please sign in." });
      return;
    }
    res.status(500).json({ error: "Unable to create parent account" });
  }
});

router.post("/parent/auth/login", authLimiter, async (req: Request, res: Response) => {
  const body = req.body;
  if (!isRecord(body) || !hasOnlyKeys(body, ["email", "password"])) {
    res.status(400).json({ error: "Invalid login request" });
    return;
  }
  const email = normalizeParentEmail(body.email);
  if (!email || !validateParentPassword(body.password)) {
    res.status(400).json({ error: "Enter a valid email and a password of 8 to 128 characters" });
    return;
  }
  try {
    const [account] = await db.select().from(parentAccountsTable).where(eq(parentAccountsTable.email, email));
    if (!account) {
      await performParentPasswordCheck(body.password);
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
    if (!await verifyParentPassword(body.password, account.passwordHash)) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
    const parent: ParentIdentity = {
      id: account.id,
      firstName: account.firstName,
      email: account.email,
      workspaceId: account.workspaceId,
      accountType: "parent_free",
    };
    const session = await db.transaction(async (tx) => {
      const token = crypto.randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + PARENT_SESSION_TTL);
      await tx.insert(parentSessionsTable).values({
        tokenHash: hashParentSessionToken(token),
        parentId: account.id,
        expiresAt,
      });
      return { token, expiresAt };
    });
    setParentCookie(res, session.token);
    res.json({
      token: session.token,
      parent: serializeParent(parent),
      children: await listParentChildren(parent.id),
    });
  } catch {
    res.status(500).json({ error: "Unable to sign in" });
  }
});

router.post("/parent/auth/logout", async (req: Request, res: Response) => {
  try {
    await revokeParentSession(getParentToken(req));
    res.clearCookie(PARENT_SESSION_COOKIE, { path: "/" });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Unable to sign out" });
  }
});

router.get("/parent/session", requireParent, async (req: Request, res: Response) => {
  try {
    const parent = req.parentAccount!;
    res.json({ parent: serializeParent(parent), children: await listParentChildren(parent.id) });
  } catch {
    res.status(500).json({ error: "Unable to load parent session" });
  }
});

router.post("/parent/children", requireParent, async (req: Request, res: Response) => {
  const checked = validateChildInput(req.body, "create");
  if (!checked.ok) {
    res.status(400).json({ error: checked.error });
    return;
  }
  const input = checked.input;
  const behaviorKey = input.behaviorKey ?? null;
  const customBehavior = input.customBehavior ?? null;
  const goal = input.goal ?? null;
  if (!validateBehaviorSelection(behaviorKey, customBehavior)) {
    res.status(400).json({ error: "Choose a starter behavior or provide a custom behavior" });
    return;
  }
  try {
    const parent = req.parentAccount!;
    const childId = crypto.randomUUID();
    const child = await db.transaction(async (tx) => {
      const [createdChild] = await tx.insert(childrenTable).values({
        id: childId,
        tenantId: parent.workspaceId,
        familyId: parent.workspaceId,
        parentId: parent.id,
        parentEmail: parent.email,
        firstName: input.name!,
        childName: input.name!,
        age: input.age ?? null,
        notes: input.notes ?? "",
        accountType: "parent_free",
        status: "active",
        createdBy: parent.id,
      }).returning();
      const supportCards = starterCardsAfterEdit([], behaviorKey, customBehavior, goal);
      const [settings] = await tx.insert(parentChildSettingsTable).values({
        childId,
        parentId: parent.id,
        workspaceId: parent.workspaceId,
        behaviorKey,
        customBehavior,
        goal,
        supportCards,
      }).returning();
      return { child: createdChild, settings };
    });
    res.status(201).json(serializeParentChild(child.child, child.settings));
  } catch {
    res.status(500).json({ error: "Unable to create child profile" });
  }
});

router.patch("/parent/children/:childId", requireParent, async (req: Request, res: Response) => {
  const childId = getRouteChildId(req);
  if (!childId) {
    res.status(400).json({ error: "A valid childId is required" });
    return;
  }
  const checked = validateChildInput(req.body, "patch");
  if (!checked.ok) {
    res.status(400).json({ error: checked.error });
    return;
  }
  try {
    const parent = req.parentAccount!;
    const owned = await ownedParentChild(parent.id, childId);
    if (!owned) {
      res.status(404).json({ error: "Child not found" });
      return;
    }
    const input = checked.input;
    const behaviorKey = hasOwn(req.body, "behaviorKey") ? input.behaviorKey! : owned.settings.behaviorKey;
    const customBehavior = hasOwn(req.body, "customBehavior")
      ? input.customBehavior!
      : hasOwn(req.body, "behaviorKey")
        ? null
        : owned.settings.customBehavior;
    const goal = hasOwn(req.body, "goal") ? input.goal! : owned.settings.goal;
    if (!validateBehaviorSelection(behaviorKey, customBehavior)) {
      res.status(400).json({ error: "Choose a starter behavior or provide a custom behavior" });
      return;
    }

    const updated = await db.transaction(async (tx) => {
      const childChanges: Partial<typeof childrenTable.$inferInsert> = {};
      if (hasOwn(req.body, "name")) {
        childChanges.firstName = input.name!;
        childChanges.childName = input.name!;
      }
      if (hasOwn(req.body, "age")) childChanges.age = input.age ?? null;
      if (hasOwn(req.body, "notes")) childChanges.notes = input.notes ?? "";
      let child: typeof childrenTable.$inferSelect = owned;
      if (Object.keys(childChanges).length > 0) {
        const [nextChild] = await tx
          .update(childrenTable)
          .set({ ...childChanges, updatedAt: new Date() })
          .where(and(eq(childrenTable.id, child.id), eq(childrenTable.parentId, parent.id)))
          .returning();
        child = nextChild;
      }

      const settingsChanged =
        hasOwn(req.body, "behaviorKey") ||
        hasOwn(req.body, "customBehavior") ||
        hasOwn(req.body, "goal");
      let settings = owned.settings;
      if (settingsChanged) {
        const [currentSettings] = await tx
          .select()
          .from(parentChildSettingsTable)
          .where(and(
            eq(parentChildSettingsTable.childId, child.id),
            eq(parentChildSettingsTable.parentId, parent.id),
          ))
          .for("update");
        const sourceSettings = currentSettings ?? owned.settings;
        const supportCards = starterCardsAfterEdit(
          sourceSettings.supportCards,
          behaviorKey,
          customBehavior,
          goal,
        );
        const [nextSettings] = await tx
          .update(parentChildSettingsTable)
          .set({
            behaviorKey,
            customBehavior,
            goal,
            supportCards,
            updatedAt: new Date(),
          })
          .where(and(
            eq(parentChildSettingsTable.childId, child.id),
            eq(parentChildSettingsTable.parentId, parent.id),
          ))
          .returning();
        settings = nextSettings;
      }
      return { child, settings };
    });
    res.json(serializeParentChild(updated.child, updated.settings));
  } catch {
    res.status(500).json({ error: "Unable to update child profile" });
  }
});

router.get("/parent/children/:childId/dashboard", requireParent, async (req: Request, res: Response) => {
  const childId = getRouteChildId(req);
  if (!childId) {
    res.status(400).json({ error: "A valid childId is required" });
    return;
  }
  try {
    const dashboard = await getParentDashboardData(req.parentAccount!.id, childId);
    if (!dashboard) {
      res.status(404).json({ error: "Child not found" });
      return;
    }
    res.json(dashboard);
  } catch {
    res.status(500).json({ error: "Unable to load child dashboard" });
  }
});

router.post("/parent/children/:childId/logs", requireParent, async (req: Request, res: Response) => {
  const body = req.body;
  const allowed = ["happened", "intensity", "duration", "trigger", "whatHelped", "notes"];
  if (!isRecord(body) || !hasOnlyKeys(body, allowed)) {
    res.status(400).json({ error: "Invalid behavior log request" });
    return;
  }
  if (typeof body.happened !== "boolean") {
    res.status(400).json({ error: "happened must be true or false" });
    return;
  }
  if (body.intensity !== "low" && body.intensity !== "medium" && body.intensity !== "high") {
    res.status(400).json({ error: "intensity must be low, medium, or high" });
    return;
  }
  if (!Number.isInteger(body.duration) || typeof body.duration !== "number" || body.duration < 0 || body.duration > 1440) {
    res.status(400).json({ error: "duration must be a whole number from 0 to 1440" });
    return;
  }
  const intensity = body.intensity as "low" | "medium" | "high";
  const duration = body.duration as number;
  const happened = body.happened as boolean;
  const optional: Record<string, string | null> = {};
  for (const [key, maximum] of [["trigger", 1000], ["whatHelped", 1000], ["notes", 5000]] as const) {
    if (hasOwn(body, key)) {
      if (body[key] === null) {
        optional[key] = null;
      } else {
        const clean = cleanText(body[key], maximum, true);
        if (clean === null) {
          res.status(400).json({ error: `${key} must be a string of at most ${maximum} characters or null` });
          return;
        }
        optional[key] = clean || null;
      }
    } else optional[key] = null;
  }

  try {
    const parent = req.parentAccount!;
    const childId = getRouteChildId(req);
    if (!childId) {
      res.status(400).json({ error: "A valid childId is required" });
      return;
    }
    const owned = await ownedParentChild(parent.id, childId);
    if (!owned) {
      res.status(404).json({ error: "Child not found" });
      return;
    }
    const id = crypto.randomUUID();
    const createdAt = new Date();
    const [log] = await db.transaction(async (tx) => {
      const [created] = await tx.insert(parentLogsTable).values({
        id,
        parentId: parent.id,
        childId: owned.id,
        workspaceId: owned.settings.workspaceId,
        behaviorKey: owned.settings.behaviorKey,
        goal: owned.settings.goal,
        happened,
        intensity,
        duration,
        trigger: optional.trigger,
        whatHelped: optional.whatHelped,
        notes: optional.notes,
        createdAt,
      }).returning();
      await tx.insert(behaviorLogsTable).values({
        id,
        tenantId: owned.clinicianId ?? owned.settings.workspaceId,
        childId: owned.id,
        parentId: parent.id,
        clinicianId: owned.clinicianId,
        eventCategory: "behavior",
        behaviorType: owned.settings.behaviorKey ?? (owned.settings.customBehavior ? "custom" : "parent_check_in"),
        intensity,
        context: optional.trigger,
        parentFeedback: happened ? "Behavior happened" : "Behavior did not happen",
        strategyUsed: optional.whatHelped,
        notes: optional.notes,
        createdDate: createdAt,
      });
      return [created];
    });
    res.status(201).json(serializeParentLog(log));
  } catch {
    res.status(500).json({ error: "Unable to save behavior log" });
  }
});

export default router;