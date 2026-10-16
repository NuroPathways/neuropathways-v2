import { jsonb, pgTable, primaryKey, timestamp, varchar } from "drizzle-orm/pg-core";

export const parentClinicConsentsTable = pgTable("parent_clinic_consents", {
  parentId: varchar("parent_id").notNull(),
  childId: varchar("child_id").notNull(),
  clinicianId: varchar("clinician_id").notNull(),
  scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
  consentedAt: timestamp("consented_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (table) => [primaryKey({ columns: [table.parentId, table.childId] })]);
