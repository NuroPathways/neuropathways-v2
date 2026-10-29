/**
 * Real upload + AI scan checks using isolated development fixtures from
 * verify-parent-family-bridge.ts. Never reads or changes customer records.
 * Temporary synthetic source files stay outside the workspace.
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { db, documentsTable, parentDocumentsTable, pool } from "@workspace/db";

if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") {
  throw new Error("Development verification only");
}
const fixture = JSON.parse(await fs.readFile("/tmp/np-parent-unification-fixtures.json", "utf8"));
assert.match(fixture.run, /^[0-9a-f-]{36}$/i);
const base = "http://localhost:80/api";
const headers = { "X-Parent-Token": fixture.direct.token };
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "np-format-check-"));
const exec = promisify(execFile);
const lines = [
  "Behavior support plan: Homework frustration.",
  "During difficult homework, Sam sometimes raises their voice.",
  "Goal: Ask for a break before raising their voice.",
  "Try now: Point to the familiar break card and offer a short pause.",
  "If upset: Stop repeating the question. Speak calmly and give space.",
  "Avoid: Repeating demands quickly or taking the break card away.",
  "Prevent: Break homework into small parts with a short pause.",
  "Practice: During calm time, point to the break card and pause.",
];
function pdf(objects: Buffer[]): Buffer {
  const parts = [Buffer.from("%PDF-1.4\n")];
  const offsets = [0];
  let length = parts[0].length;
  objects.forEach((object, index) => {
    offsets.push(length);
    const entry = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), object, Buffer.from("\nendobj\n")]);
    parts.push(entry); length += entry.length;
  });
  parts.push(Buffer.from(`xref\n0 ${offsets.length}\n0000000000 65535 f \n` +
    offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("") +
    `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`));
  return Buffer.concat(parts);
}
const b = (text: string) => Buffer.from(text);
const stream = b(`BT /F1 12 Tf 40 720 Td ${lines.map((line, index) =>
  `${index ? "0 -24 Td " : ""}(${line.replace(/[\\()]/g, "\\$&")}) Tj`).join("\n")} ET`);
const originalPdf = pdf([
  b("<< /Type /Catalog /Pages 2 0 R >>"),
  b("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
  b("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>"),
  b("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
  Buffer.concat([b(`<< /Length ${stream.length} >>\nstream\n`), stream, b("\nendstream")]),
]);
async function uploadAndScan(name: string, mime: string, bytes: Buffer) {
  const selected = process.argv.find(value => value.startsWith("--only="))?.slice(7);
  if (selected && !new RegExp(selected, "i").test(name)) return;
  const route = `/parent/children/${fixture.direct.childId}/documents`;
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(bytes)], { type: mime }), name);
  form.set("authorizedUploader", "true");
  form.set("title", `Synthetic format verification: ${name}`);
  const upload = await fetch(`${base}${route}`, { method: "POST", headers, body: form });
  assert.equal(upload.status, 201, `${name}: upload HTTP ${upload.status}`);
  const document = await upload.json() as { id: string };
  const scan = await fetch(`${base}${route}/${document.id}/scan`, {
    method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: "{}",
  });
  const result = await scan.json() as any;
  assert.equal(scan.status, 200, `${name}: scan failed: ${result.error || scan.status}`);
  const [saved] = await db.select().from(documentsTable).where(eq(documentsTable.id, document.id));
  assert.equal(saved?.scanStatus, "done", `${name}: successful reading must persist`);
  const [metadata] = await db.select().from(parentDocumentsTable)
    .where(eq(parentDocumentsTable.documentId, document.id));
  const extracted = metadata?.extractedSupport as any;
  const cards = [...(result.supportCards || []), ...(extracted?.cards || []), ...(extracted?.supportConcernCards || [])];
  assert.ok(cards.some(card => card.sourceDocumentIds?.includes(document.id) ||
    card.sourceReferences?.some((reference: any) => reference.documentId === document.id)),
  `${name}: scan must persist document-linked support or drafts, not just mark the file read`);
  console.log(`PASS ${name}: authorized upload, real AI scan, persisted reading and document-linked support`);
}
try {
  await fs.writeFile(path.join(temp, "source.pdf"), originalPdf);
  await exec("pdftoppm", ["-r", "72", "-singlefile", "-png", path.join(temp, "source.pdf"), path.join(temp, "source")]);
  await exec("pdftoppm", ["-r", "72", "-singlefile", "-jpeg", path.join(temp, "source.pdf"), path.join(temp, "source")]);
  const png = await fs.readFile(path.join(temp, "source.png"));
  const jpeg = await fs.readFile(path.join(temp, "source.jpg"));
  const imageStream = b("q 612 0 0 792 0 0 cm /Im1 Do Q");
  const scannedPdf = pdf([
    b("<< /Type /Catalog /Pages 2 0 R >>"),
    b("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    b("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>"),
    Buffer.concat([b(`<< /Type /XObject /Subtype /Image /Width 612 /Height 792 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`), jpeg, b("\nendstream")]),
    Buffer.concat([b(`<< /Length ${imageStream.length} >>\nstream\n`), imageStream, b("\nendstream")]),
  ]);
  await fs.mkdir(path.join(temp, "word"));
  await fs.writeFile(path.join(temp, "[Content_Types].xml"),
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  await fs.writeFile(path.join(temp, "word/document.xml"),
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${lines.map(line => `<w:p><w:r><w:t>${line}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`);
  await exec("zip", ["-q", "source.docx", "[Content_Types].xml", "word/document.xml"], { cwd: temp });
  await uploadAndScan("image-plan.png", "image/png", png);
  await uploadAndScan("photo-plan.jpg", "image/jpeg", jpeg);
  await uploadAndScan("scanned-image-plan.pdf", "application/pdf", scannedPdf);
  await uploadAndScan("word-plan.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", await fs.readFile(path.join(temp, "source.docx")));
} finally {
  await fs.rm(temp, { recursive: true, force: true });
  await pool.end();
}
