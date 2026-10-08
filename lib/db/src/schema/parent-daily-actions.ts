import { sql } from "drizzle-orm";
import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export type ParentDailyActionKind = "task" | "activity" | "practice";
export type ParentDailyActionSource =
  | "clinician_reviewed"
  | "clinician_uploaded_plan"
  | "parent_uploaded_plan"
  | "starter_template"
  | "recent_log_pattern"
  | "selected_behavior";
export type ParentDailyActionStatus =
  | "not_started"
  | "done"
  | "logged"
  | "skipped"
  | "saved_for_later"
  | "needs_review";
export type ParentDailyActionLogType = "completion" | "outcome";
export type ParentDailyActionRating = "helped" | "somewhat_helped" | "not_helped" | "not_sure";
export type ParentDailyActionOutcome = "used_skill" | "partially" | "not_yet" | "not_sure";

export const parentDailyActionsTable = pgTable(
  "parent_daily_actions",
  {
    id: varchar("id").primaryKey(),
    parentId: varchar("parent_id").notNull(),
    parentUserId: varchar("parent_user_id").notNull(),
    childId: varchar("child_id").notNull(),
    workspaceId: varchar("workspace_id").notNull(),
    actionDate: date("action_date").notNull(),
    actionKey: varchar("action_key", { length: 255 }).notNull(),
    kind: varchar("kind").$type<ParentDailyActionKind>().notNull(),
    behaviorKey: varchar("behavior_key"),
    behaviorName: varchar("behavior_name").notNull(),
    supportCardId: varchar("support_card_id"),
    sourceType: varchar("source_type").$type<ParentDailyActionSource>().notNull(),
    sourceDocumentId: varchar("source_document_id"),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description").notNull(),
    whyItMayHelp: text("why_it_may_help").notNull(),
    steps: jsonb("steps").$type<string[]>().notNull().default([]),
    estimatedMinutes: integer("estimated_minutes").notNull(),
    status: varchar("status").$type<ParentDailyActionStatus>().notNull().default("not_started"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    loggedAt: timestamp("logged_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("parent_daily_actions_parent_child_date_key_uq").on(
      table.parentId,
      table.childId,
      table.actionDate,
      table.actionKey,
    ),
    index("parent_daily_actions_parent_child_date_idx").on(table.parentId, table.childId, table.actionDate),
    index("parent_daily_actions_workspace_child_date_idx").on(table.workspaceId, table.childId, table.actionDate),
  ],
);

export const parentDailyActionLogsTable = pgTable(
  "parent_daily_action_logs",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    actionId: varchar("action_id").notNull(),
    taskId: varchar("task_id"),
    activityId: varchar("activity_id"),
    parentId: varchar("parent_id").notNull(),
    parentUserId: varchar("parent_user_id").notNull(),
    childId: varchar("child_id").notNull(),
    workspaceId: varchar("workspace_id").notNull(),
    eventType: varchar("event_type").$type<ParentDailyActionLogType>().notNull(),
    rating: varchar("rating").$type<ParentDailyActionRating>(),
    outcome: varchar("outcome").$type<ParentDailyActionOutcome>(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("parent_daily_action_logs_parent_child_created_idx").on(
      table.parentId,
      table.childId,
      table.createdAt,
    ),
    index("parent_daily_action_logs_action_idx").on(table.actionId, table.createdAt),
    index("parent_daily_action_logs_workspace_child_idx").on(table.workspaceId, table.childId),
  ],
);

export type ParentDailyAction = typeof parentDailyActionsTable.$inferSelect;
export type ParentDailyActionLog = typeof parentDailyActionLogsTable.$inferSelect;
