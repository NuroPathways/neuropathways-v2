import { sql } from "drizzle-orm";
import { check, index, pgTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";
import { clinicsTable } from "./clinic-accounts";

export const CLINIC_INVITATION_ROLES = ["clinic_admin", "treating_clinician"] as const;
export type ClinicInvitationRole = (typeof CLINIC_INVITATION_ROLES)[number];

export const clinicInvitationsTable = pgTable(
  "clinic_invitations",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    clinicId: varchar("clinic_id").notNull().references(() => clinicsTable.id),
    invitedEmail: varchar("invited_email").notNull(),
    role: varchar("role").notNull(),
    status: varchar("status").notNull().default("pending"),
    tokenHash: varchar("token_hash").notNull().unique(),
    requestKey: varchar("request_key").unique(),
    createdBy: varchar("created_by").notNull().references(() => usersTable.id),
    acceptedBy: varchar("accepted_by").references(() => usersTable.id),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedBy: varchar("revoked_by").references(() => usersTable.id),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    deliveryStatus: varchar("delivery_status").notNull().default("not_sent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("clinic_invitations_clinic_status_idx").on(table.clinicId, table.status, table.createdAt),
    index("clinic_invitations_email_status_idx").on(table.invitedEmail, table.status),
    uniqueIndex("clinic_invitations_one_pending_uq")
      .on(table.clinicId, table.invitedEmail, table.role)
      .where(sql`${table.status} = 'pending'`),
    check(
      "clinic_invitations_role_check",
      sql`${table.role} in ('clinic_admin', 'treating_clinician')`,
    ),
    check(
      "clinic_invitations_status_check",
      sql`${table.status} in ('pending', 'accepted', 'revoked', 'superseded', 'expired')`,
    ),
    check(
      "clinic_invitations_delivery_status_check",
      sql`${table.deliveryStatus} in ('not_sent', 'test_sink_accepted', 'provider_accepted', 'failed')`,
    ),
  ],
);

export type ClinicInvitation = typeof clinicInvitationsTable.$inferSelect;
export type InsertClinicInvitation = typeof clinicInvitationsTable.$inferInsert;
