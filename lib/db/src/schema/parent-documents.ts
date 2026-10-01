import { index, jsonb, pgTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

export const parentDocumentsTable = pgTable(
  "parent_documents",
  {
    documentId: varchar("document_id").primaryKey(),
    parentId: varchar("parent_id").notNull(),
    childId: varchar("child_id").notNull(),
    workspaceId: varchar("workspace_id").notNull(),
    storagePath: varchar("storage_path").notNull(),
    mimeType: varchar("mime_type").notNull(),
    sha256: varchar("sha256").notNull(),
    sharedClinicianId: varchar("shared_clinician_id"),
    reviewedBy: varchar("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    extractedSupport: jsonb("extracted_support"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("parent_documents_parent_child_idx").on(table.parentId, table.childId),
    index("parent_documents_shared_clinician_idx").on(table.sharedClinicianId),
    index("parent_documents_sha256_child_idx").on(table.childId, table.sha256),
    uniqueIndex("parent_documents_owner_child_sha256_uq").on(table.parentId, table.childId, table.sha256),
  ],
);

export type ParentDocumentMetadata = typeof parentDocumentsTable.$inferSelect;
export type NewParentDocumentMetadata = typeof parentDocumentsTable.$inferInsert;