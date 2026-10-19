import { sql } from "drizzle-orm";
import { check, index, pgTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

export type PasswordResetAccountType = "parent" | "clinician";

export const passwordResetTokensTable = pgTable(
  "password_reset_tokens",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    accountType: varchar("account_type").$type<PasswordResetAccountType>().notNull(),
    accountId: varchar("account_id").notNull(),
    tokenHash: varchar("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("password_reset_tokens_hash_unique").on(table.tokenHash),
    index("password_reset_tokens_account_idx").on(table.accountType, table.accountId),
    index("password_reset_tokens_expiry_idx").on(table.expiresAt),
    check("password_reset_tokens_account_type_check", sql`${table.accountType} in ('parent', 'clinician')`),
  ],
);
