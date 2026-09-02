import { pgTable, text, varchar, timestamp, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const id = () => varchar("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp("created_date", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date());
const tenantId = () => varchar("tenant_id");

export const userProfilesTable = pgTable("user_profiles", {
  id: varchar("id").primaryKey(),
  tenantId: tenantId(),
  appRole: varchar("app_role"),
  accountType: varchar("account_type"),
  displayName: varchar("display_name"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  phone: varchar("phone"),
  linkedFamilyId: varchar("linked_family_id"),
  clinicianId: varchar("clinician_id"),
  accountDeletionRequested: boolean("account_deletion_requested").default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const familiesTable = pgTable("families", {
  id: id(),
  tenantId: tenantId(),
  clinicianId: varchar("clinician_id"),
  familyName: varchar("family_name"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  primaryContact: varchar("primary_contact"),
  email: varchar("email"),
  phone: varchar("phone"),
  address: text("address"),
  notes: text("notes"),
  inviteToken: varchar("invite_token"),
  inviteStatus: varchar("invite_status"),
  accountType: varchar("account_type"),
  createdBy: varchar("created_by"),
  createdDate: createdAt(),
  updatedAt: updatedAt(),
});

export const childrenTable = pgTable("children", {
  id: id(),
  tenantId: tenantId(),
  clinicianId: varchar("clinician_id"),
  familyId: varchar("family_id"),
  parentId: varchar("parent_id"),
  parentEmail: varchar("parent_email"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  childName: varchar("child_name"),
  age: integer("age"),
  dateOfBirth: varchar("date_of_birth"),
  gender: varchar("gender"),
  diagnosis: varchar("diagnosis"),
  triggers: text("triggers"),
  notes: text("notes"),
  isPatient: boolean("is_patient").default(false),
  accountType: varchar("account_type"),
  status: varchar("status").default("active"),
  username: varchar("username"),
  accessCode: varchar("access_code"),
  createdBy: varchar("created_by"),
  createdDate: createdAt(),
  updatedAt: updatedAt(),
});

export const behaviorPlansTable = pgTable("behavior_plans", {
  id: id(),
  tenantId: tenantId(),
  childId: varchar("child_id"),
  clinicianId: varchar("clinician_id"),
  parentId: varchar("parent_id"),
  behaviorName: varchar("behavior_name"),
  behaviorDescription: text("behavior_description"),
  behaviorFunction: text("behavior_function"),
  commonTriggers: text("common_triggers"),
  strategyTitle: varchar("strategy_title"),
  strategySteps: text("strategy_steps"),
  reinforcementMethod: text("reinforcement_method"),
  deescalationSteps: text("deescalation_steps"),
  avoidActions: text("avoid_actions"),
  createdDate: createdAt(),
  updatedAt: updatedAt(),
});

export const documentsTable = pgTable("documents", {
  id: id(),
  tenantId: tenantId(),
  childId: varchar("child_id"),
  clinicianId: varchar("clinician_id"),
  parentId: varchar("parent_id"),
  title: varchar("title"),
  category: varchar("category"),
  fileName: varchar("file_name"),
  fileUrl: varchar("file_url"),
  notes: text("notes"),
  scanStatus: varchar("scan_status").default("pending"),
  scanError: text("scan_error"),
  scannedAt: timestamp("scanned_at", { withTimezone: true }),
  uploadedBy: varchar("uploaded_by"),
  accessRoles: text("access_roles"),
  createdDate: createdAt(),
});

export const interventionPlansTable = pgTable("intervention_plans", {
  id: id(),
  tenantId: tenantId(),
  childId: varchar("child_id"),
  clinicianId: varchar("clinician_id"),
  title: varchar("title"),
  behaviorCategory: varchar("behavior_category"),
  description: text("description"),
  immediateSteps: text("immediate_steps"),
  deescalationSteps: text("deescalation_steps"),
  reinforcementSteps: text("reinforcement_steps"),
  preventionTips: text("prevention_tips"),
  thingsToAvoid: text("things_to_avoid"),
  createdDate: createdAt(),
});

export const behaviorLogsTable = pgTable("behavior_logs", {
  id: id(),
  tenantId: tenantId(),
  childId: varchar("child_id"),
  parentId: varchar("parent_id"),
  clinicianId: varchar("clinician_id"),
  eventCategory: varchar("event_category").default("behavior"),
  behaviorType: varchar("behavior_type"),
  intensity: varchar("intensity"),
  context: text("context"),
  possibleFunction: varchar("possible_function"),
  parentFeedback: varchar("parent_feedback"),
  strategyUsed: text("strategy_used"),
  notes: text("notes"),
  createdDate: createdAt(),
});

export const rewardTokensTable = pgTable("reward_tokens", {
  id: id(),
  tenantId: tenantId(),
  childId: varchar("child_id"),
  parentId: varchar("parent_id"),
  clinicianId: varchar("clinician_id"),
  goalName: varchar("goal_name"),
  tokensEarned: integer("tokens_earned").default(0),
  tokensGoal: integer("tokens_goal").default(10),
  reward: varchar("reward"),
  notes: text("notes"),
  goalTitle: varchar("goal_title"),
  goalDescription: text("goal_description"),
  progress: integer("progress").default(0),
  target: integer("target").default(10),
  source: varchar("source").default("manual"),
  milestoneNotes: text("milestone_notes"),
  createdByClinician: boolean("created_by_clinician").default(false),
  createdDate: createdAt(),
});

export const messagesTable = pgTable("messages", {
  id: id(),
  tenantId: tenantId(),
  childId: varchar("child_id"),
  fromUserId: varchar("from_user_id"),
  toUserId: varchar("to_user_id"),
  senderRole: varchar("sender_role"),
  content: text("content"),
  isRead: boolean("is_read").default(false),
  createdDate: createdAt(),
});

export const aiConversationsTable = pgTable("ai_conversations", {
  id: id(),
  tenantId: tenantId(),
  parentId: varchar("parent_id"),
  childId: varchar("child_id"),
  childName: varchar("child_name"),
  question: text("question"),
  aiResponse: text("ai_response"),
  createdDate: createdAt(),
});

export const dailyCheckInsTable = pgTable("daily_check_ins", {
  id: id(),
  tenantId: tenantId(),
  parentId: varchar("parent_id"),
  childId: varchar("child_id"),
  mood: varchar("mood"),
  notes: text("notes"),
  createdDate: createdAt(),
});

export const winLogsTable = pgTable("win_logs", {
  id: id(),
  tenantId: tenantId(),
  childId: varchar("child_id"),
  parentId: varchar("parent_id"),
  winType: varchar("win_type"),
  description: text("description"),
  createdDate: createdAt(),
});

export const engagementEventsTable = pgTable("engagement_events", {
  id: id(),
  tenantId: tenantId(),
  childId: varchar("child_id"),
  clinicianId: varchar("clinician_id"),
  parentId: varchar("parent_id"),
  eventCategory: varchar("event_category").default("information"),
  eventType: varchar("event_type"),
  topic: text("topic"),
  metadata: jsonb("metadata"),
  createdDate: createdAt(),
});

export const clientProfilesTable = pgTable("client_profiles", {
  id: id(),
  tenantId: tenantId(),
  childId: varchar("child_id"),
  clinicianId: varchar("clinician_id"),
  strengths: text("strengths"),
  challenges: text("challenges"),
  communicationStyle: text("communication_style"),
  sensoryNeeds: text("sensory_needs"),
  preferredStrategies: text("preferred_strategies"),
  notes: text("notes"),
  behaviors: jsonb("behaviors"),
  goals: jsonb("goals"),
  diagnoses: jsonb("diagnoses"),
  objectives: jsonb("objectives"),
  safetyProcedures: jsonb("safety_procedures"),
  sourceDocIds: jsonb("source_doc_ids"),
  createdDate: createdAt(),
});

export const clientSessionsTable = pgTable("client_sessions", {
  id: id(),
  childId: varchar("child_id"),
  inviteToken: varchar("invite_token").unique(),
  username: varchar("username"),
  accessCode: varchar("access_code"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdDate: createdAt(),
});

export const mobileTokensTable = pgTable("mobile_tokens", {
  token: varchar("token").primaryKey(),
  childId: varchar("child_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const clinicianCredentialsTable = pgTable("clinician_credentials", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  email: varchar("email").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const invitationsTable = pgTable("invitations", {
  id: id(),
  tenantId: tenantId(),
  clinicianId: varchar("clinician_id"),
  familyId: varchar("family_id"),
  clientId: varchar("client_id"),
  accountType: varchar("account_type"),
  role: varchar("role"),
  invitedEmail: varchar("invited_email"),
  invitedUsername: varchar("invited_username"),
  inviteToken: varchar("invite_token").unique(),
  inviteStatus: varchar("invite_status").default("pending"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdBy: varchar("created_by"),
  createdDate: createdAt(),
  updatedAt: updatedAt(),
});

export const auditLogsTable = pgTable("audit_logs", {
  id: id(),
  tenantId: tenantId(),
  userId: varchar("user_id"),
  userRole: varchar("user_role"),
  action: varchar("action").notNull(),
  targetType: varchar("target_type"),
  targetId: varchar("target_id"),
  success: boolean("success").default(true),
  reason: text("reason"),
  metadata: jsonb("metadata"),
  ipAddress: varchar("ip_address"),
  createdDate: createdAt(),
});
