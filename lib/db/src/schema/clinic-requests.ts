import { sql } from "drizzle-orm";
import { check, index, pgTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";
import { clinicsTable } from "./clinic-accounts";

export const clinicRequestsTable = pgTable("clinic_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clinicName: varchar("clinic_name", { length: 200 }).notNull(),
  contactName: varchar("contact_name", { length: 160 }).notNull(),
  workEmail: varchar("work_email", { length: 254 }).notNull(),
  website: varchar("website", { length: 500 }),
  requestKey: varchar("request_key", { length: 80 }).notNull(),
  status: varchar("status", { length: 24 }).notNull().default("pending"),
  reviewedBy: varchar("reviewed_by").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  clinicId: varchar("clinic_id").references(() => clinicsTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("clinic_requests_request_key_uq").on(table.requestKey),
  index("clinic_requests_status_created_idx").on(table.status, table.createdAt),
  index("clinic_requests_email_status_idx").on(table.workEmail, table.status),
  check("clinic_requests_status_check", sql`${table.status} in ('pending', 'approved', 'declined')`),
]);

export type ClinicRequest = typeof clinicRequestsTable.$inferSelect;
