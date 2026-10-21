import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, timestamp, uniqueIndex, varchar, text } from "drizzle-orm/pg-core";

export type DocumentExtractionCategory =
  | "profile_information"
  | "behavior"
  | "goal"
  | "support_strategy"
  | "safety_instruction"
  | "potential_home_activity";

export type DocumentExtractionItemStatus = "extracted" | "ambiguous" | "needs_review";
export type DocumentExtractionReviewStatus = "unreviewed" | "needs_review" | "approved" | "rejected";
export type DocumentExtractionScanStatus =
  | "processing"
  | "completed"
  | "partial"
  | "no_relevant_content"
  | "failed";

export type DocumentExtractionRecord = {
  id: string;
  category: DocumentExtractionCategory;
  childId: string;
  documentId: string;
  documentVersion: string;
  documentType: string;
  sourceSection: string | null;
  sourcePage: number | null;
  sourceExcerpt: string;
  sourceExcerptVerified: boolean;
  interpretation: Record<string, unknown>;
  extractionStatus: DocumentExtractionItemStatus;
  ambiguityReason: string | null;
  reviewStatus: DocumentExtractionReviewStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const documentExtractionRunsTable = pgTable(
  "document_extraction_runs",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    childId: varchar("child_id").notNull(),
    documentId: varchar("document_id").notNull(),
    documentVersion: varchar("document_version").notNull(),
    documentType: varchar("document_type").notNull(),
    scanStatus: varchar("scan_status").$type<DocumentExtractionScanStatus>().notNull(),
    records: jsonb("records").$type<DocumentExtractionRecord[]>().notNull().default([]),
    errorMessage: text("error_message"),
    scannedBy: varchar("scanned_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("document_extraction_runs_document_version_uq").on(table.documentId, table.documentVersion),
    index("document_extraction_runs_child_document_idx").on(table.childId, table.documentId),
  ],
);

export type DocumentExtractionRun = typeof documentExtractionRunsTable.$inferSelect;
export type NewDocumentExtractionRun = typeof documentExtractionRunsTable.$inferInsert;
