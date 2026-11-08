import type { Request } from "express";
import { and, eq, gt, isNull, ne, or } from "drizzle-orm";
import { db, childrenTable, familiesTable, mobileTokensTable, clientSessionsTable, parentFamilyToolsTable, behaviorPlansTable, parentClinicConsentsTable, parentChildSettingsTable, userProfilesTable } from "@workspace/db";
import type { ParentIdentity } from "./parentAuth";
import { starterLibrary, makeStarterCard, type SupportCard } from "./parentStarterLibrary";

const PREFIX = "legacy-family:";
export const familyAccountTypes = new Set(["parent", "parent_family", "family", "caregiver", "independent"]);
export function classifyFamilyAccount(type: string | null | undefined): "family" | "individual" | "unknown" {
  if (familyAccountTypes.has(type ?? "")) return "family";
  return type === "individual" ? "individual" : "unknown";
}
export class FamilyAccessError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}
export const hasFamilyCredential = (req: Request) => req.headers["x-family-token"] !== undefined || req.headers["x-mobile-token"] !== undefined;
export const familyOwnerId = (familyId: string) => `${PREFIX}${familyId}`;
export const familyIdForOwner = (id: string) => id.startsWith(PREFIX) ? id.slice(PREFIX.length) : null;

async function revokeFamilyCredential(token: string, channel: "web" | "mobile"): Promise<void> {
  if (channel === "web") {
    await db.delete(clientSessionsTable).where(eq(clientSessionsTable.inviteToken, token));
  } else {
    await db.delete(mobileTokensTable).where(eq(mobileTokensTable.token, token));
  }
}

/** A capability derived exclusively from an unexpired server-backed credential. */
export async function resolveFamilyParent(req: Request): Promise<ParentIdentity> {
  const web = req.headers["x-family-token"];
  const mobile = req.headers["x-mobile-token"];
  if (web !== undefined && mobile !== undefined) throw new FamilyAccessError(400, "Use one family credential");
  const token = web ?? mobile;
  if (typeof token !== "string" || !token || token.length > 512) throw new FamilyAccessError(401, "Family session required");
  const now = new Date();
  const [session] = web !== undefined
    ? await db.select({ childId: clientSessionsTable.childId }).from(clientSessionsTable)
      .where(and(eq(clientSessionsTable.inviteToken, token), gt(clientSessionsTable.expiresAt, now)))
    : await db.select({ childId: mobileTokensTable.childId }).from(mobileTokensTable)
      .where(and(eq(mobileTokensTable.token, token), gt(mobileTokensTable.expiresAt, now)));
  if (!session?.childId) throw new FamilyAccessError(401, "Family session expired. Sign in again.");
  const [anchor] = await db.select().from(childrenTable).where(eq(childrenTable.id, session.childId));
  if (!anchor?.familyId || (anchor.status && anchor.status !== "active")) {
    await revokeFamilyCredential(token, web !== undefined ? "web" : "mobile");
    throw new FamilyAccessError(409, "This login has no active family relationship");
  }
  const [family] = await db.select().from(familiesTable).where(eq(familiesTable.id, anchor.familyId));
  if (!family || family.clinicianId !== anchor.clinicianId) {
    await revokeFamilyCredential(token, web !== undefined ? "web" : "mobile");
    throw new FamilyAccessError(403, "Family relationship is not authorized");
  }
  const classification = classifyFamilyAccount(family.accountType);
  if (classification !== "family" || anchor.accountType === "individual") {
    await revokeFamilyCredential(token, web !== undefined ? "web" : "mobile");
    throw new FamilyAccessError(409,
      classification === "individual" || anchor.accountType === "individual" ? "Individual clients use the client experience" : "Family account type needs correction by your clinic",
      classification === "individual" || anchor.accountType === "individual" ? "individual_client" : "unknown_account_type");
  }
  if (!(await familyChildrenForOwner(familyOwnerId(family.id))).some(c => c.id === anchor.id)) {
    await revokeFamilyCredential(token, web !== undefined ? "web" : "mobile");
    throw new FamilyAccessError(403, "Family membership or clinic consent is no longer valid");
  }
  return familyIdentity(family);
}
function familyIdentity(family: typeof familiesTable.$inferSelect): ParentIdentity {
  return {
    id: familyOwnerId(family.id), firstName: family.primaryContact || family.firstName || family.familyName || "Family",
    email: family.email || "", workspaceId: family.tenantId || family.clinicianId || family.id,
    accountType: "legacy_family",
  };
}
export async function resolveCookieFamilyParent(req: Request): Promise<ParentIdentity | null> {
  if (!req.user?.id) return null;
  const [profile] = await db.select().from(userProfilesTable).where(eq(userProfilesTable.id, req.user.id));
  if (!profile?.linkedFamilyId || !["parent", "caregiver"].includes(profile.appRole || "") || profile.accountType === "parent_free") return null;
  const [family] = await db.select().from(familiesTable).where(eq(familiesTable.id, profile.linkedFamilyId));
  if (!family) return null;
  const children = await db.select().from(childrenTable).where(eq(childrenTable.familyId, family.id));
  const bound = family.createdBy === req.user.id || children.some(c => c.parentId === req.user!.id);
  if (!bound) throw new FamilyAccessError(403, "Your account is not verified for this family");
  if (classifyFamilyAccount(family.accountType) !== "family") throw new FamilyAccessError(409, "This account does not have a verified parent-family role");
  return familyIdentity(family);
}

/** Rechecks membership and classification for every child operation, including writes. */
export async function familyChildrenForOwner(owner: string) {
  const id = familyIdForOwner(owner);
  if (!id) return [];
  const [family] = await db.select().from(familiesTable).where(eq(familiesTable.id, id));
  if (!family || classifyFamilyAccount(family.accountType) !== "family") return [];
  const rows = await db.select().from(childrenTable).where(and(
    eq(childrenTable.familyId, id),
    family.clinicianId ? eq(childrenTable.clinicianId, family.clinicianId) : isNull(childrenTable.clinicianId),
    or(isNull(childrenTable.status), ne(childrenTable.status, "merged")),
  ));
  const allowed = [];
  const expectedTenant = family.tenantId || family.clinicianId || family.id;
  for (const child of rows) {
    if (child.accountType === "individual") continue;
    if (!child.tenantId || child.tenantId === expectedTenant) { allowed.push(child); continue; }
    // Linking deliberately keeps the independent parent's workspace. Require
    // an active explicit clinic link before admitting that exceptional case.
    if (!child.parentId || !child.clinicianId) continue;
    const [consent] = await db.select().from(parentClinicConsentsTable).where(and(
      eq(parentClinicConsentsTable.parentId, child.parentId), eq(parentClinicConsentsTable.childId, child.id),
      eq(parentClinicConsentsTable.clinicianId, child.clinicianId), isNull(parentClinicConsentsTable.revokedAt),
    ));
    const [settings] = consent ? await db.select().from(parentChildSettingsTable).where(and(
      eq(parentChildSettingsTable.childId, child.id), eq(parentChildSettingsTable.parentId, child.parentId),
      eq(parentChildSettingsTable.workspaceId, child.tenantId),
    )) : [];
    if (settings) allowed.push(child);
  }
  return allowed;
}

// Only new parent choices/support metadata are stored here. Clinical records remain
// in their original tables, with their original IDs and ownership.
export async function readFamilySettings(owner: string, childId: string, workspaceId: string) {
  const [family] = await db.select().from(familiesTable).where(eq(familiesTable.id, familyIdForOwner(owner)!));
  workspaceId = family?.tenantId || family?.clinicianId || family?.id || workspaceId;
  const [tools] = await db.select().from(parentFamilyToolsTable).where(and(
    eq(parentFamilyToolsTable.parentId, owner), eq(parentFamilyToolsTable.childId, childId),
  ));
  const saved = (tools?.state?.legacyParentSettings ?? {}) as Record<string, any>;
  const plans = await db.select().from(behaviorPlansTable).where(and(
    eq(behaviorPlansTable.childId, childId),
    family?.clinicianId ? eq(behaviorPlansTable.clinicianId, family.clinicianId) : isNull(behaviorPlansTable.clinicianId),
  ));
  const derived = plans.filter((plan) => plan.behaviorName?.trim()).map((plan) => {
    const name = plan.behaviorName!;
    const template = starterLibrary.find((item) =>
      item.name.toLowerCase() === name.toLowerCase() ||
      name.toLowerCase().includes(item.key) ||
      (item.key === "elopement" && /running away|bolting|wandering/i.test(name)),
    );
    return {
      behaviorKey: template?.key || "custom",
      customBehavior: template ? null : name,
      behaviorName: template?.name || name,
      goal: null,
      selectionSource: "clinician_plan_discovery",
    };
  });
  const derivedUnique = [...new Map(derived.map((behavior) => [`${behavior.behaviorKey}:${behavior.customBehavior || ""}`, behavior])).values()];
  const selections = Array.isArray(saved.behaviors)
    ? saved.behaviors
    : saved.behaviorKey || saved.customBehavior
      ? [{
          behaviorKey: saved.behaviorKey || "custom",
          customBehavior: saved.customBehavior || null,
          behaviorName: saved.behaviorName || saved.customBehavior || null,
          goal: saved.goal || null,
        }]
      : derivedUnique;
  return {
    childId, parentId: owner, workspaceId, behaviorKey: saved.behaviorKey ?? null,
    customBehavior: saved.customBehavior ?? null, goal: saved.goal ?? null,
    behaviors: selections, supportCards: saved.supportCards ?? [],
    profileNotes: typeof saved.profileNotes === "string" ? saved.profileNotes : undefined,
    updatedAt: tools?.updatedAt ?? new Date(),
  };
}
export async function familySupportCards(owner: string, childId: string): Promise<SupportCard[]> {
  const child = (await familyChildrenForOwner(owner)).find(c => c.id === childId);
  if (!child) throw new FamilyAccessError(403, "Child is not authorized");
  const settings = await readFamilySettings(owner, childId, child.tenantId || child.familyId!);
  // Clinical plan text is read from its original record, never persisted as a
  // fabricated reviewed document or copied into parent-owned settings.
  const plans = await db.select().from(behaviorPlansTable).where(eq(behaviorPlansTable.childId, childId));
  const cards: SupportCard[] = settings.behaviors.map((b: any) => makeStarterCard(b.behaviorKey, b.customBehavior, b.goal));
  const { isSafeParentGuidance, sourcePriority } = await import("./parentDocumentPolicy");
  for (const plan of plans.filter(p => p.clinicianId === child.clinicianId && p.behaviorName)) {
    const base = cards.find(c => c.behaviorName.toLowerCase() === plan.behaviorName!.toLowerCase())
      || makeStarterCard("custom", plan.behaviorName, null);
    const lines = (text: string | null) => text?.split(/\n+/).map(x => x.trim()).filter(Boolean) || [];
    const candidate = {
      ...base, id: `clinical-plan:${plan.id}`, source: "clinician_document" as const,
      whatMayBeHappening: plan.behaviorDescription || base.whatMayBeHappening,
      rightNow: lines(plan.deescalationSteps).length ? lines(plan.deescalationSteps) : base.rightNow,
      prevention: lines(plan.strategySteps).length ? lines(plan.strategySteps) : base.prevention,
      avoid: lines(plan.avoidActions).length ? lines(plan.avoidActions) : base.avoid,
      reinforcementIdea: plan.reinforcementMethod || base.reinforcementIdea,
    };
    if (isSafeParentGuidance(candidate)) {
      const i = cards.findIndex(c => c.behaviorKey === base.behaviorKey && c.behaviorName === base.behaviorName);
      if (i >= 0) cards[i] = candidate; else cards.push(candidate);
    }
  }
  for (const saved of settings.supportCards) {
    if (isSafeParentGuidance(saved)) {
      const index = cards.findIndex(c => c.behaviorKey === saved.behaviorKey && c.behaviorName === saved.behaviorName);
      if (index >= 0) {
        // Do not downgrade clinical guidance when saving a personal note or
        // behavior selection generates a starter card for the same behavior.
        if (sourcePriority(saved.source) > sourcePriority(cards[index].source)) cards[index] = saved;
      } else cards.push(saved);
    }
  }
  return cards.length ? cards : starterLibrary.map((item) => makeStarterCard(item.key, null, null));
}
export async function saveFamilySettings(owner: string, childId: string, values: Record<string, unknown>) {
  const child = (await familyChildrenForOwner(owner)).find(c => c.id === childId);
  if (!child) throw new FamilyAccessError(403, "This child is not available to this family");
  await db.transaction(async tx => {
    await tx.insert(parentFamilyToolsTable).values({ parentId: owner, childId }).onConflictDoNothing();
    const [current] = await tx.select().from(parentFamilyToolsTable).where(and(
      eq(parentFamilyToolsTable.parentId, owner), eq(parentFamilyToolsTable.childId, childId),
    )).for("update");
    await tx.update(parentFamilyToolsTable).set({ state: {
      ...current.state, legacyParentSettings: { ...(current.state.legacyParentSettings as object ?? {}), ...values },
    } }).where(and(eq(parentFamilyToolsTable.parentId, owner), eq(parentFamilyToolsTable.childId, childId)));
  });
}
export async function parentGoalOwnerIds(owner: string): Promise<string[]> {
  return familyIdForOwner(owner) ? [owner, ...(await familyChildrenForOwner(owner)).map(c => c.id)] : [owner];
}
