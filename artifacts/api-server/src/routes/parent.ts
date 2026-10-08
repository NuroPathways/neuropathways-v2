import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  behaviorLogsTable,
  auditLogsTable,
  childrenTable,
  consentEventsTable,
  db,
  familiesTable,
  parentDailyActionLogsTable,
  parentDailyActionsTable,
  parentAccountsTable,
  parentChildSettingsTable,
  parentLogsTable,
  parentSessionsTable,
  userProfilesTable,
  usersTable,
} from "@workspace/db";
import {
  LogParentDailyActionBody,
  RecordParentGoalFeedbackBody,
  RecordParentGoalFeedbackResponse,
  UpdateParentDailyActionBody,
} from "@workspace/api-zod";
import { makeStarterCard, starterLibrary } from "../lib/parentStarterLibrary";
import {
  getOrCreateParentDailyActions,
  normalizeParentActionDate,
  serializeParentDailyAction,
  serializeParentDailyActionLog,
} from "../lib/parentDailyActions";
import {
  ACCOUNT_AUTHORITY_CONSENT_VERSION,
  accountAuthorityEvent,
  validateAccountAuthority,
  accountAuthorityInvalidStatus,
} from "../lib/accountAuthority";
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
  parentBehaviorIdentity,
  parentBehaviorsFromSettings,
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

function parentLocalDate(req: Request): string {
  return normalizeParentActionDate(req.get("x-parent-local-date"));
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
  behaviors?: Array<{ behaviorKey: string; customBehavior?: string | null; goal?: string | null }>;
};

type ChildInputCheck =
  | { ok: true; input: ChildInput }
  | { ok: false; error: string };

export function validateChildInput(
  value: unknown,
  mode: "create" | "patch",
): ChildInputCheck {
  if (!isRecord(value)) return { ok: false, error: "A JSON object is required" };
  const keys = ["name", "age", "notes", "behaviorKey", "customBehavior", "goal", "behaviors"];
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
      if (!behaviorKey || !validBehaviorKey(behaviorKey)) return { ok: false, error: "behaviorKey must be a known behavior key or null" };
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
  if (hasOwn(value, "behaviors")) {
    if (!Array.isArray(value.behaviors) || value.behaviors.length < 1 || value.behaviors.length > 20) {
      return { ok: false, error: "behaviors must contain between 1 and 20 selections" };
    }
    const selections: NonNullable<ChildInput["behaviors"]> = [];
    const identities = new Set<string>();
    for (const item of value.behaviors) {
      if (!isRecord(item) || !hasOnlyKeys(item, ["behaviorKey", "customBehavior", "goal"]) ||
        typeof item.behaviorKey !== "string") {
        return { ok: false, error: "Each behavior must include a supported behaviorKey" };
      }
      const behaviorKey = cleanText(item.behaviorKey, 100);
      if (!behaviorKey || !validBehaviorKey(behaviorKey)) {
        return { ok: false, error: "Each behavior must use a known starter key or custom" };
      }
      let customBehavior: string | null = null;
      if (hasOwn(item, "customBehavior")) {
        if (item.customBehavior === null) customBehavior = null;
        else {
          const cleaned = cleanText(item.customBehavior, 120);
          if (!cleaned) return { ok: false, error: "customBehavior must be a non-empty string of at most 120 characters or null" };
          customBehavior = cleaned;
        }
      }
      let goal: string | null = null;
      if (hasOwn(item, "goal")) {
        if (item.goal === null) goal = null;
        else {
          const cleaned = cleanText(item.goal, 500);
          if (!cleaned) return { ok: false, error: "goal must be a non-empty string of at most 500 characters or null" };
          goal = cleaned;
        }
      }
      if (!validateBehaviorSelection(behaviorKey, customBehavior)) {
        return { ok: false, error: "Choose a starter behavior or provide a custom behavior" };
      }
      const behaviorName = behaviorKey === "custom"
        ? customBehavior!
        : starterLibrary.find((template) => template.key === behaviorKey)!.name;
      const identity = parentBehaviorIdentity({ behaviorKey, customBehavior, behaviorName });
      if (identities.has(identity)) return { ok: false, error: "behaviors cannot contain duplicate selections" };
      identities.add(identity);
      selections.push({ behaviorKey, customBehavior, goal });
    }
    input.behaviors = selections;
  }
  return { ok: true, input };
}

export function starterCardsAfterEdit(
  current: unknown,
  behaviors: ReturnType<typeof parentBehaviorsFromSettings>,
): Record<string, unknown>[] {
  const existing = Array.isArray(current)
    ? current.filter((card): card is Record<string, unknown> =>
        isRecord(card) && card.source !== "starter")
    : [];
  return [
    ...existing,
    ...behaviors.map((behavior) => makeStarterCard(
      behavior.behaviorKey,
      behavior.customBehavior,
      behavior.goal,
    ) as unknown as Record<string, unknown>),
  ];
}

export function completeBehaviorSelections(
  selections: NonNullable<ChildInput["behaviors"]> | undefined,
): ReturnType<typeof parentBehaviorsFromSettings> {
  return (selections || []).map((selection) => {
    const behaviorKey = selection.behaviorKey;
    const customBehavior = selection.customBehavior ?? null;
    return {
      behaviorKey,
      customBehavior,
      behaviorName: behaviorKey === "custom"
        ? customBehavior!
        : starterLibrary.find((template) => template.key === behaviorKey)!.name,
      goal: selection.goal ?? null,
      goalRating: null,
      goalRatingAt: null,
    };
  });
}

function preserveGoalFeedback(
  current: ReturnType<typeof parentBehaviorsFromSettings>,
  next: ReturnType<typeof parentBehaviorsFromSettings>,
): ReturnType<typeof parentBehaviorsFromSettings> {
  return next.map((behavior) => {
    const previous = current.find((candidate) =>
      parentBehaviorIdentity(candidate) === parentBehaviorIdentity(behavior),
    );
    if (!previous || previous.goal !== behavior.goal) {
      return { ...behavior, goalRating: null, goalRatingAt: null };
    }
    return {
      ...behavior,
      goalRating: previous.goalRating ?? null,
      goalRatingAt: previous.goalRatingAt ?? null,
    };
  });
}

export function applyLegacyBehaviorEdits(
  current: ReturnType<typeof parentBehaviorsFromSettings>,
  input: ChildInput,
  body: Record<string, unknown>,
): ReturnType<typeof parentBehaviorsFromSettings> {
  const behaviors = hasOwn(body, "behaviors")
    ? completeBehaviorSelections(input.behaviors)
    : current.map((behavior) => ({ ...behavior }));
  const hasLegacyBehaviorEdit = ["behaviorKey", "customBehavior", "goal"].some((key) => hasOwn(body, key));
  if (!hasLegacyBehaviorEdit) return preserveGoalFeedback(current, behaviors);

  let primary = behaviors[0];
  if (hasOwn(body, "behaviorKey") && input.behaviorKey === null) {
    behaviors.shift();
    primary = behaviors[0];
  } else if (hasOwn(body, "behaviorKey")) {
    const behaviorKey = input.behaviorKey!;
    if (!primary) {
      primary = {
        behaviorKey,
        customBehavior: null,
        behaviorName: behaviorKey === "custom"
          ? ""
          : starterLibrary.find((template) => template.key === behaviorKey)?.name || behaviorKey,
        goal: null,
      };
      behaviors.push(primary);
    } else {
      primary.behaviorKey = behaviorKey;
      if (behaviorKey !== current[0]?.behaviorKey || behaviorKey !== "custom") primary.customBehavior = null;
      primary.behaviorName = behaviorKey === "custom"
        ? primary.customBehavior || ""
        : starterLibrary.find((template) => template.key === behaviorKey)?.name || behaviorKey;
    }
  }
  if (hasOwn(body, "customBehavior")) {
    const customBehavior = input.customBehavior ?? null;
    if (!primary && customBehavior) {
      primary = { behaviorKey: "custom", customBehavior, behaviorName: customBehavior, goal: null };
      behaviors.push(primary);
    } else if (primary) {
      if (customBehavior && primary.behaviorKey !== "custom") primary.behaviorKey = "custom";
      primary.customBehavior = customBehavior;
      primary.behaviorName = primary.behaviorKey === "custom"
        ? customBehavior || ""
        : starterLibrary.find((template) => template.key === primary.behaviorKey)?.name || primary.behaviorKey;
    }
  }
  if (hasOwn(body, "goal")) {
    if (primary) primary.goal = input.goal ?? null;
  }
  return preserveGoalFeedback(current, behaviors);
}

function serializeParentLog(log: typeof parentLogsTable.$inferSelect) {
  return {
    id: log.id,
    childId: log.childId,
    behaviorKey: log.behaviorKey ?? null,
    customBehavior: log.customBehavior ?? null,
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

export async function getParentDashboardData(parentId: string, childId: string, actionDate = new Date().toISOString().slice(0, 10)) {
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
  const selectedBehaviors = parentBehaviorsFromSettings(owned.settings);
  const dailyActions = await getOrCreateParentDailyActions({
    parentId,
    parentUserId: parentId,
    childId,
    workspaceId: owned.settings.workspaceId,
    date: actionDate,
    selectedBehaviors,
    supportCards,
    logs: storedLogs.slice(0, 100).map((log) => ({
      behaviorKey: log.behaviorKey,
      customBehavior: log.customBehavior,
      whatHelped: log.whatHelped,
      createdAt: log.createdAt,
    })),
  });
  return {
    child: serializeParentChild(owned, owned.settings),
    supportCards,
    documents,
    logs: storedLogs.map(serializeParentLog),
    dailyActions,
  };
}

export { ownedParentChild, serializeParentChild };

router.get("/parent/starter-library", (_req, res) => {
  res.json(starterLibrary);
});

router.post("/parent/auth/register", authLimiter, async (req: Request, res: Response) => {
  const body = req.body;
  if (!isRecord(body) || !hasOnlyKeys(body, ["firstName", "email", "password", "confirmPassword", "privacyConsent", "healthConsent", "accountHolderType", "accountHolderAgeGroup", "adultOrGuardianConfirmed", "parentGuardianAuthorityConfirmed"])) {
    res.status(400).json({ error: "Invalid registration request" });
    return;
  }
  const accountAuthority = validateAccountAuthority(body, "parent_guardian", true);
  if (!accountAuthority.ok) {
    res.status(accountAuthorityInvalidStatus(accountAuthority.error)).json({ error: accountAuthority.error });
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
        {
          subjectId: parentId,
          familyId: workspaceId,
          ...accountAuthorityEvent("parent_guardian", accountAuthority.ageGroup, true, false),
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

const PARENT_DATA_REQUEST_TYPES = new Set([
  "data_export",
  "account_deletion",
  "child_profile_deletion",
  "document_deletion",
  "behavior_log_deletion",
]);

router.get("/parent/data-requests", requireParent, async (req: any, res: Response) => {
  try {
    const rows = await db.select({ id: auditLogsTable.id, createdDate: auditLogsTable.createdDate, metadata: auditLogsTable.metadata })
      .from(auditLogsTable)
      .where(and(
        eq(auditLogsTable.userId, req.parentAccount.id),
        eq(auditLogsTable.tenantId, req.parentAccount.workspaceId),
        eq(auditLogsTable.targetType, "parent_data_request"),
      ))
      .orderBy(desc(auditLogsTable.createdDate))
      .limit(20);
    return res.json({ requests: rows.map((row) => ({
      request_id: row.id,
      requested_at: row.createdDate,
      ...(typeof row.metadata === "object" && row.metadata !== null ? row.metadata : {}),
    })) });
  } catch {
    return res.status(500).json({ error: "Unable to load your data requests." });
  }
});

router.post("/parent/data-requests", requireParent, async (req: any, res: Response) => {
  const requestType = req.body?.requestType;
  if (typeof requestType !== "string" || !PARENT_DATA_REQUEST_TYPES.has(requestType)) {
    return res.status(400).json({ error: "Choose a valid data request type." });
  }
  const requestId = crypto.randomUUID();
  const requestedAt = new Date();
  try {
    await db.insert(auditLogsTable).values({
      id: requestId,
      userId: req.parentAccount.id,
      userRole: "parent",
      tenantId: req.parentAccount.workspaceId,
      action: "parent_data_request_received",
      targetType: "parent_data_request",
      targetId: requestId,
      success: true,
      reason: "Authenticated account holder submitted a data request.",
      metadata: {
        request_id: requestId,
        account_type: "parent_free",
        request_type: requestType,
        requested_at: requestedAt.toISOString(),
        status: "received",
        verification_status: "pending",
        admin_notes: null,
        completed_at: null,
      },
    });
    return res.status(201).json({
      request_id: requestId,
      requested_at: requestedAt.toISOString(),
      status: "received",
      verification_status: "pending",
      message: "Your request has been received. Some records may need review before deletion is completed.",
      clinicNotice: "Some records may need to be retained by your clinician or clinic according to their policies.",
    });
  } catch {
    return res.status(500).json({ error: "Your request could not be recorded. Please try again or email the public support address." });
  }
});

router.post("/parent/children", requireParent, async (req: Request, res: Response) => {
  const checked = validateChildInput(req.body, "create");
  if (!checked.ok) {
    res.status(400).json({ error: checked.error });
    return;
  }
  const input = checked.input;
  let behaviors = input.behaviors
    ? completeBehaviorSelections(input.behaviors)
    : input.behaviorKey || input.customBehavior
      ? completeBehaviorSelections([{
          behaviorKey: input.behaviorKey || "custom",
          customBehavior: input.customBehavior,
          goal: input.goal,
        }])
      : [];
  if (input.behaviors && ["behaviorKey", "customBehavior", "goal"].some((key) => hasOwn(req.body, key))) {
    behaviors = applyLegacyBehaviorEdits(behaviors, input, req.body);
  }
  const identities = new Set<string>();
  if (behaviors.some((behavior) => {
    const identity = parentBehaviorIdentity(behavior);
    if (identities.has(identity)) return true;
    identities.add(identity);
    return false;
  })) {
    res.status(400).json({ error: "behaviors cannot contain duplicate selections" });
    return;
  }
  const primary = behaviors[0];
  if (behaviors.some((behavior) => !validateBehaviorSelection(behavior.behaviorKey, behavior.customBehavior))) {
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
      const supportCards = starterCardsAfterEdit([], behaviors);
      const [settings] = await tx.insert(parentChildSettingsTable).values({
        childId,
        parentId: parent.id,
        workspaceId: parent.workspaceId,
        behaviorKey: primary?.behaviorKey ?? null,
        customBehavior: primary?.customBehavior ?? null,
        goal: primary?.goal ?? input.goal ?? null,
        behaviors,
        supportCards,
      }).returning();
      await tx.insert(consentEventsTable).values({
        subjectId: childId,
        familyId: parent.workspaceId,
        eventType: "CHILD_PROFILE_CREATED_BY_AUTHORIZED_ADULT",
        policyType: "account_holder_authority",
        version: ACCOUNT_AUTHORITY_CONSENT_VERSION,
        acceptanceMethod: "parent_authority_at_signup",
        source: "parent_child_profile_creation",
        actorType: "parent",
        metadata: {
          account_holder_type: "parent_guardian",
          parent_guardian_authority_confirmed: true,
          child_profile_created_by_adult: true,
        },
      });
      return { child: createdChild, settings };
    });
    res.status(201).json(serializeParentChild(child.child, child.settings));
  } catch {
    res.status(500).json({ error: "Unable to create child profile" });
  }
});

router.patch("/parent/children/:childId/goal-feedback", requireParent, async (req: Request, res: Response) => {
  const childId = getRouteChildId(req);
  if (!childId) {
    res.status(400).json({ error: "A valid childId is required" });
    return;
  }
  const checked = RecordParentGoalFeedbackBody.safeParse(req.body);
  if (!checked.success) {
    res.status(400).json({ error: "Invalid goal check-in" });
    return;
  }

  const behaviorKey = cleanText(checked.data.behaviorKey, 100);
  const customBehavior = checked.data.customBehavior == null
    ? null
    : cleanText(checked.data.customBehavior, 120);
  const goal = cleanText(checked.data.goal, 500);
  if (
    !behaviorKey ||
    !goal ||
    (checked.data.behaviorKey === "custom" && !customBehavior) ||
    (checked.data.behaviorKey !== "custom" && customBehavior) ||
    !validateBehaviorSelection(behaviorKey, customBehavior)
  ) {
    res.status(400).json({ error: "Choose a valid active behavior and goal" });
    return;
  }

  try {
    const parent = req.parentAccount!;
    const owned = await ownedParentChild(parent.id, childId);
    if (!owned) {
      res.status(404).json({ error: "Child not found" });
      return;
    }

    const identity = parentBehaviorIdentity({
      behaviorKey,
      customBehavior,
      behaviorName: customBehavior || behaviorKey,
    });
    const result = await db.transaction(async (tx) => {
      const [settings] = await tx
        .select()
        .from(parentChildSettingsTable)
        .where(and(
          eq(parentChildSettingsTable.childId, owned.id),
          eq(parentChildSettingsTable.parentId, parent.id),
        ))
        .for("update");
      if (!settings) return { kind: "child_not_found" as const };

      const behaviors = parentBehaviorsFromSettings(settings);
      const index = behaviors.findIndex((behavior) =>
        parentBehaviorIdentity(behavior) === identity,
      );
      if (index < 0) return { kind: "behavior_not_selected" as const };
      if (behaviors[index].goal !== goal) return { kind: "goal_changed" as const };

      behaviors[index] = {
        ...behaviors[index],
        goalRating: checked.data.rating,
        goalRatingAt: new Date().toISOString(),
      };
      const [updated] = await tx
        .update(parentChildSettingsTable)
        .set({ behaviors, updatedAt: new Date() })
        .where(and(
          eq(parentChildSettingsTable.childId, owned.id),
          eq(parentChildSettingsTable.parentId, parent.id),
        ))
        .returning();
      if (!updated) return { kind: "child_not_found" as const };
      const updatedBehavior = parentBehaviorsFromSettings(updated).find((behavior) =>
        parentBehaviorIdentity(behavior) === identity,
      );
      return updatedBehavior
        ? { kind: "ok" as const, behavior: updatedBehavior }
        : { kind: "child_not_found" as const };
    });

    if (result.kind === "child_not_found") {
      res.status(404).json({ error: "Child not found" });
      return;
    }
    if (result.kind === "behavior_not_selected") {
      res.status(400).json({ error: "Choose one of this child's active behaviors" });
      return;
    }
    if (result.kind === "goal_changed") {
      res.status(409).json({ error: "This goal changed. Reload the page before checking in." });
      return;
    }
    res.json(RecordParentGoalFeedbackResponse.parse(result.behavior));
  } catch (error) {
    req.log.error({ err: error }, "Unable to save parent goal feedback");
    res.status(500).json({ error: "Unable to save goal check-in" });
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
    const nextBehaviors = applyLegacyBehaviorEdits(
      parentBehaviorsFromSettings(owned.settings),
      input,
      req.body,
    );
    const identities = new Set<string>();
    if (nextBehaviors.some((behavior) => {
      const identity = parentBehaviorIdentity(behavior);
      if (identities.has(identity)) return true;
      identities.add(identity);
      return false;
    })) {
      res.status(400).json({ error: "behaviors cannot contain duplicate selections" });
      return;
    }
    if (nextBehaviors.some((behavior) => !validateBehaviorSelection(behavior.behaviorKey, behavior.customBehavior))) {
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
        hasOwn(req.body, "behaviors") ||
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
        const selections = applyLegacyBehaviorEdits(
          parentBehaviorsFromSettings(sourceSettings),
          input,
          req.body,
        );
        const primary = selections[0];
        const supportCards = starterCardsAfterEdit(
          sourceSettings.supportCards,
          selections,
        );
        const [nextSettings] = await tx
          .update(parentChildSettingsTable)
          .set({
            behaviorKey: primary?.behaviorKey ?? null,
            customBehavior: primary?.customBehavior ?? null,
            goal: primary?.goal ?? (!selections.length && hasOwn(req.body, "goal") ? input.goal ?? null : null),
            behaviors: selections,
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
    const dashboard = await getParentDashboardData(req.parentAccount!.id, childId, parentLocalDate(req));
    if (!dashboard) {
      res.status(404).json({ error: "Child not found" });
      return;
    }
    res.json(dashboard);
  } catch {
    res.status(500).json({ error: "Unable to load child dashboard" });
  }
});

router.patch("/parent/children/:childId/daily-actions/:actionId", requireParent, async (req: Request, res: Response) => {
  const childId = getRouteChildId(req);
  const actionId = typeof req.params.actionId === "string" ? req.params.actionId : "";
  const parsed = UpdateParentDailyActionBody.safeParse(req.body);
  if (!childId || !actionId || !parsed.success) {
    res.status(400).json({ error: "Invalid daily action status request" });
    return;
  }
  try {
    const parentId = req.parentAccount!.id;
    const owned = await ownedParentChild(parentId, childId);
    if (!owned) {
      res.status(404).json({ error: "Child not found" });
      return;
    }
    const [action] = await db.select().from(parentDailyActionsTable).where(and(
      eq(parentDailyActionsTable.id, actionId),
      eq(parentDailyActionsTable.parentId, parentId),
      eq(parentDailyActionsTable.childId, childId),
    )).limit(1);
    if (!action) {
      res.status(404).json({ error: "Daily action not found" });
      return;
    }
    if (action.status === "done" || action.status === "logged" || action.status === "needs_review" || action.status === "skipped") {
      res.status(409).json({ error: "This action can no longer be changed" });
      return;
    }
    if (parsed.data.status === "not_started" && action.status !== "saved_for_later") {
      res.status(409).json({ error: "Only an action saved for later can be moved back to today's list" });
      return;
    }
    const [updated] = await db.update(parentDailyActionsTable)
      .set({ status: parsed.data.status, updatedAt: new Date() })
      .where(and(
        eq(parentDailyActionsTable.id, actionId),
        eq(parentDailyActionsTable.parentId, parentId),
        eq(parentDailyActionsTable.childId, childId),
      ))
      .returning();
    res.json(serializeParentDailyAction(updated, []));
  } catch {
    res.status(500).json({ error: "Unable to update daily action" });
  }
});

router.post("/parent/children/:childId/daily-actions/:actionId/logs", requireParent, async (req: Request, res: Response) => {
  const childId = getRouteChildId(req);
  const actionId = typeof req.params.actionId === "string" ? req.params.actionId : "";
  const parsed = LogParentDailyActionBody.safeParse(req.body);
  if (!childId || !actionId || !parsed.success) {
    res.status(400).json({ error: "Invalid daily action feedback" });
    return;
  }
  const body = parsed.data;
  if (
    (body.eventType === "completion" && (!body.rating || body.outcome !== undefined)) ||
    (body.eventType === "outcome" && (!body.outcome || body.rating !== undefined))
  ) {
    res.status(400).json({ error: "Choose a completion rating or an outcome, not both" });
    return;
  }
  const note = body.note === undefined ? null : cleanText(body.note, 2000, true);
  if (body.note !== undefined && note === null) {
    res.status(400).json({ error: "Note must be at most 2000 characters" });
    return;
  }
  try {
    const parent = req.parentAccount!;
    const owned = await ownedParentChild(parent.id, childId);
    if (!owned) {
      res.status(404).json({ error: "Child not found" });
      return;
    }
    const [action] = await db.select().from(parentDailyActionsTable).where(and(
      eq(parentDailyActionsTable.id, actionId),
      eq(parentDailyActionsTable.parentId, parent.id),
      eq(parentDailyActionsTable.childId, childId),
    )).limit(1);
    if (!action) {
      res.status(404).json({ error: "Daily action not found" });
      return;
    }
    if (action.status === "done" || action.status === "logged" || action.status === "skipped" || action.status === "needs_review") {
      res.status(409).json({ error: "This action has already been completed or closed" });
      return;
    }
    const createdAt = new Date();
    const logId = crypto.randomUUID();
    const taskId = action.kind === "task" ? action.id : null;
    const activityId = action.kind === "task" ? null : action.id;
    const nextStatus = body.eventType === "completion" ? "done" : "logged";
    const [updatedAction, savedLog] = await db.transaction(async (tx) => {
      const [log] = await tx.insert(parentDailyActionLogsTable).values({
        id: logId,
        actionId: action.id,
        taskId,
        activityId,
        parentId: parent.id,
        parentUserId: parent.id,
        childId: owned.id,
        workspaceId: owned.settings.workspaceId,
        eventType: body.eventType,
        rating: body.eventType === "completion" ? body.rating! : null,
        outcome: body.eventType === "outcome" ? body.outcome! : null,
        note,
        createdAt,
      }).returning();
      const [updated] = await tx.update(parentDailyActionsTable)
        .set({
          status: nextStatus,
          completedAt: body.eventType === "completion" ? createdAt : null,
          loggedAt: body.eventType === "outcome" ? createdAt : null,
          updatedAt: createdAt,
        })
        .where(and(
          eq(parentDailyActionsTable.id, action.id),
          eq(parentDailyActionsTable.parentId, parent.id),
          eq(parentDailyActionsTable.childId, childId),
          inArray(parentDailyActionsTable.status, ["not_started", "saved_for_later"]),
        ))
        .returning();
      if (!updated) throw new Error("DAILY_ACTION_ALREADY_CLOSED");

      await tx.insert(behaviorLogsTable).values({
        id: crypto.randomUUID(),
        tenantId: owned.clinicianId ?? owned.settings.workspaceId,
        childId: owned.id,
        parentId: parent.id,
        clinicianId: owned.clinicianId,
        eventCategory: "support_practice",
        behaviorType: action.behaviorKey || action.kind,
        intensity: null,
        context: `${action.kind}: ${action.title}`,
        parentFeedback: body.eventType === "completion" ? String(body.rating!) : body.outcome!,
        strategyUsed: action.title,
        notes: note,
        createdDate: createdAt,
      });
      return [updated, log];
    });
    res.status(201).json({
      action: serializeParentDailyAction(updatedAction, [savedLog]),
      log: serializeParentDailyActionLog(savedLog),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "DAILY_ACTION_ALREADY_CLOSED") {
      res.status(409).json({ error: "This action has already been completed or closed" });
      return;
    }
    res.status(500).json({ error: "Unable to save daily action feedback" });
  }
});

router.post("/parent/children/:childId/logs", requireParent, async (req: Request, res: Response) => {
  const body = req.body;
  const allowed = ["happened", "intensity", "duration", "trigger", "whatHelped", "notes", "behaviorKey", "customBehavior", "goal"];
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
  let requestedBehaviorKey: string | null | undefined;
  let requestedCustomBehavior: string | null | undefined;
  let requestedGoal: string | null | undefined;
  if (hasOwn(body, "behaviorKey")) {
    if (body.behaviorKey === null) requestedBehaviorKey = null;
    else {
      requestedBehaviorKey = cleanText(body.behaviorKey, 100) || undefined;
      if (!requestedBehaviorKey) {
        res.status(400).json({ error: "behaviorKey must be a non-empty string of at most 100 characters or null" });
        return;
      }
    }
  }
  if (hasOwn(body, "customBehavior")) {
    if (body.customBehavior === null) requestedCustomBehavior = null;
    else {
      requestedCustomBehavior = cleanText(body.customBehavior, 120) || undefined;
      if (!requestedCustomBehavior) {
        res.status(400).json({ error: "customBehavior must be a non-empty string of at most 120 characters or null" });
        return;
      }
    }
  }
  if (hasOwn(body, "goal")) {
    if (body.goal === null) requestedGoal = null;
    else {
      requestedGoal = cleanText(body.goal, 500) || undefined;
      if (!requestedGoal) {
        res.status(400).json({ error: "goal must be a non-empty string of at most 500 characters or null" });
        return;
      }
    }
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
    const selectedBehaviors = parentBehaviorsFromSettings(owned.settings);
    if (requestedBehaviorKey === null && selectedBehaviors.length) {
      res.status(400).json({ error: "Choose one of the selected behaviors for this log" });
      return;
    }
    const candidateKey = requestedBehaviorKey === undefined
      ? requestedCustomBehavior
        ? "custom"
        : selectedBehaviors[0]?.behaviorKey ?? null
      : requestedBehaviorKey;
    let selectedBehavior = candidateKey
      ? selectedBehaviors.find((behavior) => behavior.behaviorKey === candidateKey &&
          (!requestedCustomBehavior || parentBehaviorIdentity(behavior) === parentBehaviorIdentity({
            behaviorKey: candidateKey,
            customBehavior: requestedCustomBehavior,
            behaviorName: requestedCustomBehavior,
          })))
      : undefined;
    if (candidateKey === "custom" && !requestedCustomBehavior) {
      const customSelections = selectedBehaviors.filter((behavior) => behavior.behaviorKey === "custom");
      selectedBehavior = customSelections.length === 1 ? customSelections[0] : undefined;
    }
    if (candidateKey && !selectedBehavior) {
      res.status(400).json({ error: "Choose a behavior currently selected for this child" });
      return;
    }
    if (requestedCustomBehavior && selectedBehavior?.behaviorKey !== "custom") {
      res.status(400).json({ error: "customBehavior must identify a selected custom behavior" });
      return;
    }
    if (hasOwn(body, "goal") && selectedBehavior &&
      (requestedGoal ?? null) !== (selectedBehavior.goal ?? null)) {
      res.status(400).json({ error: "goal must match the selected behavior's current goal" });
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
        behaviorKey: selectedBehavior?.behaviorKey ?? null,
        customBehavior: selectedBehavior?.customBehavior ?? null,
        goal: hasOwn(body, "goal") ? requestedGoal ?? null : selectedBehavior?.goal ?? null,
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
        behaviorType: selectedBehavior?.behaviorKey ?? "parent_check_in",
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