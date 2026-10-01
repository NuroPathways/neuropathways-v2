import { sql } from "drizzle-orm";
import { index, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

export const parentClinicInvitesTable = pgTable(
  "parent_clinic_invites",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    tokenHash: varchar("token_hash").notNull().unique(),
    familyId: varchar("family_id").notNull(),
    clinicianId: varchar("clinician_id").notNull(),
    invitedEmail: varchar("invited_email").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("parent_clinic_invites_family_idx").on(table.familyId)],
);

export type ParentClinicInvite = typeof parentClinicInvitesTable.$inferSelect;
export type InsertParentClinicInvite = typeof parentClinicInvitesTable.$inferInsert;