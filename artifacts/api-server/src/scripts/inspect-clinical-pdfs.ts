// Read-only structural diagnostic: no document names, clinical text or credentials
// are printed, and originals / database rows are never modified.
import { db, documentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import path from "node:path";
import fs from "node:fs/promises";
import { decryptBuffer } from "../routes/upload";
import { isParentDocument, readParentDocumentBytes } from "../lib/parentDocuments";
import { prepareClinicalPdf } from "../lib/clinicalPdf";
const childId = process.argv[2];
if (!childId) throw new Error("Pass a child ID to inspect its PDFs.");
const docs = await db.select().from(documentsTable).where(eq(documentsTable.childId, childId));
let count = 0;
for (const doc of docs) {
  if (!/\.pdf(?:$|\?)/i.test(doc.fileUrl || "") && !/\.pdf$/i.test(doc.fileName || "")) continue;
  count++;
  try {
    const metadata = await isParentDocument(doc.id);
    const name = path.basename(String(doc.fileUrl).split("?")[0]);
    const original = metadata ? await readParentDocumentBytes(doc.id) : decryptBuffer(await fs.readFile(path.resolve("uploads", name)));
    const prepared = await prepareClinicalPdf(original);
    console.log(JSON.stringify({ documentNumber: count, originalBytes: original.length, preparedBytes: prepared.length, prepared: true }));
  } catch (e) {
    console.log(JSON.stringify({ documentNumber: count, prepared: false, reason: e instanceof Error ? e.message : "Unreadable" }));
  }
}
console.log(JSON.stringify({ pdfCount: count, mode: "read-only; originals unchanged" }));
process.exit(0);
