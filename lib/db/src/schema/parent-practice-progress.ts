import { boolean, index, integer, pgTable, primaryKey, timestamp, varchar } from "drizzle-orm/pg-core";

export const parentPracticeProgressTable = pgTable(
  "parent_practice_progress",
  {
    parentId: varchar("parent_id").notNull(),
    childId: varchar("child_id").notNull(),
    actionKey: varchar("action_key", { length: 255 }).notNull(),
    currentStep: integer("current_step").notNull().default(0),
    bookmarked: boolean("bookmarked").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    primaryKey({ name: "parent_practice_progress_pk", columns: [table.parentId, table.childId, table.actionKey] }),
    index("parent_practice_progress_child_idx").on(table.parentId, table.childId, table.updatedAt),
  ],
);

export type ParentPracticeProgress = typeof parentPracticeProgressTable.$inferSelect;
