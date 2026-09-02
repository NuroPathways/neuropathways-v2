import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable, userProfilesTable,
  familiesTable, childrenTable, behaviorPlansTable, documentsTable,
  interventionPlansTable, behaviorLogsTable, rewardTokensTable, messagesTable,
  aiConversationsTable, dailyCheckInsTable, winLogsTable, engagementEventsTable,
  clientProfilesTable,
} from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

// Auth guard
function requireAuth(req: any, res: any, next: any) {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  next();
}

// ── Field mapping: Base44 snake_case → our DB camelCase columns ──────────────

function snakeToCamel(str: string) {
  return str.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function normalizeRecord(raw: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = snakeToCamel(k.trim());
    // Skip empty strings → null
    out[key] = v === "" || v === undefined ? null : v;
  }
  return out;
}

// Strip fields that aren't columns in our table (Drizzle will reject unknown keys)
function pick(obj: Record<string, any>, keys: string[]): Record<string, any> {
  return Object.fromEntries(keys.filter(k => obj[k] !== undefined && obj[k] !== null).map(k => [k, obj[k]]));
}

// ── Per-entity import handlers ────────────────────────────────────────────────

type ImportResult = { imported: number; skipped: number; errors: number; errorDetails: string[] };

async function importRecords(
  records: Record<string, any>[],
  insertFn: (rec: Record<string, any>) => Promise<void>
): Promise<ImportResult> {
  let imported = 0, skipped = 0, errors = 0;
  const errorDetails: string[] = [];
  for (const raw of records) {
    try {
      await insertFn(raw);
      imported++;
    } catch (e: any) {
      // Unique constraint violation = duplicate → skip
      if (e.code === "23505" || e.message?.includes("duplicate") || e.message?.includes("unique")) {
        skipped++;
      } else {
        errors++;
        errorDetails.push(e.message);
      }
    }
  }
  return { imported, skipped, errors, errorDetails };
}

// ── Route ─────────────────────────────────────────────────────────────────────

router.post("/import/:entity", requireAuth, async (req: any, res) => {
  const { entity } = req.params;
  const { records } = req.body as { records: Record<string, any>[] };

  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: "records array required" });
  }

  let result: ImportResult;

  try {
    switch (entity) {
      case "User":
        result = await importRecords(records, async (raw) => {
          const r = normalizeRecord(raw);
          const userId = r.id || r.sub;
          if (!userId) return;

          // Upsert into auth users table
          await db.insert(usersTable).values({
            id: userId,
            email: r.email || null,
            firstName: r.firstName || r.first_name || null,
            lastName: r.lastName || r.last_name || null,
            profileImageUrl: r.profileImageUrl || r.profileImage || null,
          }).onConflictDoNothing();

          // Upsert profile fields
          const profileData = pick(r, ["appRole", "accountType", "displayName", "phone", "linkedFamilyId"]);
          if (Object.keys(profileData).length > 0) {
            await db.insert(userProfilesTable).values({ id: userId, ...profileData })
              .onConflictDoUpdate({ target: userProfilesTable.id, set: profileData });
          }
        });
        break;

      case "Family":
        result = await importRecords(records, async (raw) => {
          const r = normalizeRecord(raw);
          await db.insert(familiesTable).values(pick(r, [
            "id", "clinicianId", "familyName", "primaryContact", "email", "phone",
            "address", "notes", "inviteToken", "inviteStatus", "accountType",
          ])).onConflictDoNothing();
        });
        break;

      case "Child":
        result = await importRecords(records, async (raw) => {
          const r = normalizeRecord(raw);
          await db.insert(childrenTable).values(pick(r, [
            "id", "clinicianId", "familyId", "parentId", "parentEmail",
            "childName", "age", "diagnosis", "notes", "isPatient",
            "status", "username", "accessCode",
          ])).onConflictDoNothing();
        });
        break;

      case "BehaviorPlan":
        result = await importRecords(records, async (raw) => {
          const r = normalizeRecord(raw);
          await db.insert(behaviorPlansTable).values(pick(r, [
            "id", "childId", "clinicianId", "parentId", "behaviorName",
            "behaviorDescription", "behaviorFunction", "commonTriggers",
            "strategyTitle", "strategySteps", "reinforcementMethod",
            "deescalationSteps", "avoidActions",
          ])).onConflictDoNothing();
        });
        break;

      case "InterventionPlan":
        result = await importRecords(records, async (raw) => {
          const r = normalizeRecord(raw);
          await db.insert(interventionPlansTable).values(pick(r, [
            "id", "childId", "clinicianId", "title", "behaviorCategory",
            "description", "immediateSteps", "deescalationSteps",
            "reinforcementSteps", "preventionTips", "thingsToAvoid",
          ])).onConflictDoNothing();
        });
        break;

      case "Document":
        result = await importRecords(records, async (raw) => {
          const r = normalizeRecord(raw);
          await db.insert(documentsTable).values(pick(r, [
            "id", "childId", "clinicianId", "parentId", "title",
            "category", "fileName", "fileUrl", "notes", "scanStatus",
          ])).onConflictDoNothing();
        });
        break;

      case "ClientProfile":
        result = await importRecords(records, async (raw) => {
          const r = normalizeRecord(raw);
          await db.insert(clientProfilesTable).values(pick(r, [
            "id", "childId", "clinicianId", "strengths", "challenges",
            "communicationStyle", "sensoryNeeds", "preferredStrategies", "notes",
          ])).onConflictDoNothing();
        });
        break;

      case "BehaviorLog":
        result = await importRecords(records, async (raw) => {
          const r = normalizeRecord(raw);
          await db.insert(behaviorLogsTable).values(pick(r, [
            "id", "childId", "parentId", "clinicianId", "behaviorType",
            "intensity", "context", "possibleFunction", "parentFeedback", "notes",
          ])).onConflictDoNothing();
        });
        break;

      case "RewardToken":
        result = await importRecords(records, async (raw) => {
          const r = normalizeRecord(raw);
          await db.insert(rewardTokensTable).values(pick(r, [
            "id", "childId", "parentId", "clinicianId", "goalName",
            "tokensEarned", "tokensGoal", "reward", "notes",
          ])).onConflictDoNothing();
        });
        break;

      case "Message":
        result = await importRecords(records, async (raw) => {
          const r = normalizeRecord(raw);
          await db.insert(messagesTable).values(pick(r, [
            "id", "childId", "fromUserId", "toUserId", "senderRole",
            "content", "isRead",
          ])).onConflictDoNothing();
        });
        break;

      case "AIConversation":
        result = await importRecords(records, async (raw) => {
          const r = normalizeRecord(raw);
          await db.insert(aiConversationsTable).values(pick(r, [
            "id", "parentId", "childId", "childName", "question", "aiResponse",
          ])).onConflictDoNothing();
        });
        break;

      case "DailyCheckIn":
        result = await importRecords(records, async (raw) => {
          const r = normalizeRecord(raw);
          await db.insert(dailyCheckInsTable).values(pick(r, [
            "id", "parentId", "childId", "mood", "notes",
          ])).onConflictDoNothing();
        });
        break;

      case "WinLog":
        result = await importRecords(records, async (raw) => {
          const r = normalizeRecord(raw);
          await db.insert(winLogsTable).values(pick(r, [
            "id", "childId", "parentId", "winType", "description",
          ])).onConflictDoNothing();
        });
        break;

      case "EngagementEvent":
        result = await importRecords(records, async (raw) => {
          const r = normalizeRecord(raw);
          await db.insert(engagementEventsTable).values(pick(r, [
            "id", "childId", "clinicianId", "parentId", "eventType", "topic",
          ])).onConflictDoNothing();
        });
        break;

      default:
        return res.status(400).json({ error: `Unknown entity type: ${entity}` });
    }

    res.json(result!);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
