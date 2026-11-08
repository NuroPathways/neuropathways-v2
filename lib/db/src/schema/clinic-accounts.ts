import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";
import { childrenTable } from "./entities";

export const CLINIC_MEMBERSHIP_ROLES = [
  "clinic_admin",
  "clinical_supervisor",
  "treating_clinician",
] as const;
export type ClinicMembershipRole = (typeof CLINIC_MEMBERSHIP_ROLES)[number];

export const CLINICAL_ASSIGNMENT_ROLES = [
  "treating_clinician",
  "clinical_supervisor",
] as const;
export type ClinicalAssignmentRole = (typeof CLINICAL_ASSIGNMENT_ROLES)[number];

export const clinicsTable = pgTable("clinics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  displayName: varchar("display_name", { length: 200 }).notNull(),
  // Maps older tenant_id values without rewriting clinical records.
  legacyTenantId: varchar("legacy_tenant_id"),
  status: varchar("status").notNull().default("pending"),
  createdBy: varchar("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("clinics_legacy_tenant_uq").on(table.legacyTenantId),
  check("clinics_status_check", sql`${table.status} in ('pending', 'active', 'suspended', 'archived')`),
]);

export const clinicMembershipsTable = pgTable("clinic_memberships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clinicId: varchar("clinic_id").notNull().references(() => clinicsTable.id),
  userId: varchar("user_id").notNull().references(() => usersTable.id),
  role: varchar("role").notNull(),
  status: varchar("status").notNull().default("pending"),
  createdBy: varchar("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("clinic_membership_role_uq").on(table.clinicId, table.userId, table.role),
  index("clinic_membership_user_status_idx").on(table.userId, table.status),
  index("clinic_membership_clinic_role_idx").on(table.clinicId, table.role, table.status),
  check(
    "clinic_membership_role_check",
    sql`${table.role} in ('clinic_admin', 'clinical_supervisor', 'treating_clinician')`,
  ),
  check(
    "clinic_membership_status_check",
    sql`${table.status} in ('pending', 'active', 'suspended', 'revoked')`,
  ),
]);

export const clinicalAssignmentsTable = pgTable("clinical_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clinicId: varchar("clinic_id").notNull().references(() => clinicsTable.id),
  clientId: varchar("client_id").notNull().references(() => childrenTable.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => usersTable.id),
  role: varchar("role").notNull(),
  status: varchar("status").notNull().default("pending"),
  assignedBy: varchar("assigned_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("clinical_assignment_scope_uq").on(table.clinicId, table.clientId, table.userId, table.role),
  index("clinical_assignment_user_scope_idx").on(table.userId, table.clinicId, table.status),
  index("clinical_assignment_client_scope_idx").on(table.clientId, table.clinicId, table.status),
  check(
    "clinical_assignment_role_check",
    sql`${table.role} in ('treating_clinician', 'clinical_supervisor')`,
  ),
  check(
    "clinical_assignment_status_check",
    sql`${table.status} in ('pending', 'active', 'suspended', 'revoked')`,
  ),
]);

export const platformAdministratorGrantsTable = pgTable("platform_administrator_grants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => usersTable.id),
  status: varchar("status").notNull().default("pending"),
  grantedBy: varchar("granted_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (table) => [
  index("platform_admin_user_status_idx").on(table.userId, table.status),
  check(
    "platform_admin_grant_status_check",
    sql`${table.status} in ('pending', 'active', 'revoked')`,
  ),
]);

export const insertClinicSchema = createInsertSchema(clinicsTable).omit({
  id: true,
  legacyTenantId: true,
  status: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertClinic = z.infer<typeof insertClinicSchema>;
export type Clinic = typeof clinicsTable.$inferSelect;

export const insertClinicMembershipSchema = createInsertSchema(clinicMembershipsTable).omit({
  id: true,
  status: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertClinicMembership = z.infer<typeof insertClinicMembershipSchema>;
export type ClinicMembership = typeof clinicMembershipsTable.$inferSelect;

export const insertClinicalAssignmentSchema = createInsertSchema(clinicalAssignmentsTable).omit({
  id: true,
  status: true,
  assignedBy: true,
  createdAt: true,
  updatedAt: true,
  revokedAt: true,
});
export type InsertClinicalAssignment = z.infer<typeof insertClinicalAssignmentSchema>;
export type ClinicalAssignment = typeof clinicalAssignmentsTable.$inferSelect;

export const insertPlatformAdministratorGrantSchema = createInsertSchema(platformAdministratorGrantsTable).omit({
  id: true,
  status: true,
  grantedBy: true,
  createdAt: true,
  revokedAt: true,
});
export type InsertPlatformAdministratorGrant = z.infer<typeof insertPlatformAdministratorGrantSchema>;
export type PlatformAdministratorGrant = typeof platformAdministratorGrantsTable.$inferSelect;
