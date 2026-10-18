import { sql } from "drizzle-orm";
import { pgTable, varchar, integer, jsonb, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// Goals remain reward_tokens. These are assignments, not another goal/library system.
export const careTeamAssignmentsTable = pgTable("care_team_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  childId: varchar("child_id").notNull(),
  clinicianId: varchar("clinician_id").notNull(),
  tenantId: varchar("tenant_id").notNull(),
  goalId: varchar("goal_id"),
  libraryId: varchar("library_id"),
  definition: jsonb("definition").$type<Record<string, unknown>>().notNull().default({}),
  status: varchar("status").notNull().default("draft"),
  version: integer("version").notNull().default(0),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("care_assignments_child_idx").on(t.childId, t.clinicianId)]);

export const careTeamVersionsTable = pgTable("care_team_assignment_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assignmentId: varchar("assignment_id").notNull().references(() => careTeamAssignmentsTable.id),
  version: integer("version").notNull(),
  // Library assignments store a stable library reference/version, not copied definitions.
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("care_assignment_version_uq").on(t.assignmentId, t.version)]);

export const careTeamPracticeTable = pgTable("care_team_practice", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assignmentId: varchar("assignment_id").notNull().references(() => careTeamAssignmentsTable.id),
  version: integer("version").notNull(),
  childId: varchar("child_id").notNull(),
  parentId: varchar("parent_id").notNull(),
  requestId: varchar("request_id").notNull(),
  outcome: varchar("outcome").notNull(),
  note: varchar("note", { length: 4000 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex("care_practice_request_uq").on(t.parentId, t.requestId),
  index("care_practice_child_idx").on(t.childId, t.createdAt),
]);
export const insertCareTeamAssignmentSchema = createInsertSchema(careTeamAssignmentsTable);
export type CareTeamAssignment = typeof careTeamAssignmentsTable.$inferSelect;
