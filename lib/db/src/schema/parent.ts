import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const parentAccountsTable = pgTable(
  "parent_accounts",
  {
    id: varchar("id").primaryKey(),
    email: varchar("email").notNull(),
    firstName: varchar("first_name").notNull(),
    workspaceId: varchar("workspace_id").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("parent_accounts_email_unique").on(table.email),
    uniqueIndex("parent_accounts_workspace_id_unique").on(table.workspaceId),
  ],
);

export const parentSessionsTable = pgTable(
  "parent_sessions",
  {
    tokenHash: varchar("token_hash").primaryKey(),
    parentId: varchar("parent_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("parent_sessions_parent_id_idx").on(table.parentId)],
);

export const parentChildSettingsTable = pgTable("parent_child_settings", {
  childId: varchar("child_id").primaryKey(),
  parentId: varchar("parent_id").notNull(),
  workspaceId: varchar("workspace_id").notNull(),
  behaviorKey: varchar("behavior_key"),
  customBehavior: varchar("custom_behavior"),
  goal: text("goal"),
  behaviors: jsonb("behaviors").$type<{
    behaviorKey: string;
    customBehavior: string | null;
    behaviorName: string;
    goal: string | null;
  }[]>().notNull().default([]),
  supportCards: jsonb("support_cards").$type<Record<string, unknown>[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const parentLogsTable = pgTable(
  "parent_logs",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    parentId: varchar("parent_id").notNull(),
    childId: varchar("child_id").notNull(),
    workspaceId: varchar("workspace_id").notNull(),
    behaviorKey: varchar("behavior_key"),
    customBehavior: varchar("custom_behavior"),
    goal: text("goal"),
    happened: boolean("happened").notNull(),
    intensity: varchar("intensity").notNull(),
    duration: integer("duration").notNull(),
    trigger: text("trigger"),
    whatHelped: text("what_helped"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("parent_logs_parent_child_created_idx").on(table.parentId, table.childId, table.createdAt),
    index("parent_logs_workspace_child_idx").on(table.workspaceId, table.childId),
  ],
);

export type ParentAccount = typeof parentAccountsTable.$inferSelect;
export type ParentSession = typeof parentSessionsTable.$inferSelect;
export type ParentChildSettings = typeof parentChildSettingsTable.$inferSelect;
export type ParentLog = typeof parentLogsTable.$inferSelect;