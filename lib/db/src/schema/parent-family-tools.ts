import { jsonb, pgTable, primaryKey, timestamp, varchar } from "drizzle-orm/pg-core";

export const parentFamilyToolsTable = pgTable(
  "parent_family_tools",
  {
    parentId: varchar("parent_id").notNull(),
    childId: varchar("child_id").notNull(),
    state: jsonb("state").$type<Record<string, unknown>>().notNull().default({
      routines: [],
      routineRuns: [],
      preferences: {},
      reminders: [],
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [primaryKey({ name: "parent_family_tools_pk", columns: [table.parentId, table.childId] })],
);
