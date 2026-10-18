/** Development-only real-HTTP scanner regression. Synthetic records only. */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { db, pool, childrenTable, documentsTable, clientProfilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") throw new Error("Development verification only");
const fixture = JSON.parse(await fs.readFile("/tmp/np-parent-unification-fixtures.json", "utf8"));
const sessions = JSON.parse(await fs.readFile("/tmp/np-care-team-browser.json", "utf8"));
const headers = { Authorization: `Bearer ${sessions.clinicianToken}` };
const childId = crypto.randomUUID(), goodId = crypto.randomUUID(), badId = crypto.randomUUID();
const [child] = await db.insert(childrenTable).values({
  id: childId, childName: "Synthetic PDF scan verification", clinicianId: fixture.clinician.id, tenantId: fixture.clinician.id,
}).returning();
const url = "http://localhost:80/api";
async function upload(bytes: Buffer, name: string) {
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), name);
  const r = await fetch(`${url}/upload`, { method: "POST", headers, body: form });
  assert.equal(r.status, 200);
  return ((await r.json()) as { file_url: string }).file_url;
}
// Small, valid single-page clinical fixture; no patient data.
const text = "Synthetic plan: Practice asking for a break during a calm activity. Goal: ask for a break using a familiar signal.";
const stream = `BT /F1 12 Tf 40 700 Td (${text}) Tj ET`;
const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1200 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
];
let pdf = "%PDF-1.4\n";
const offsets = [0];
objects.forEach((o, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
try {
  const goodUrl = await upload(Buffer.from(pdf), "synthetic-readable.pdf");
  const badUrl = await upload(Buffer.from("%PDF-1.4\nnot a real PDF"), "synthetic-damaged.pdf");
  await db.insert(documentsTable).values([
    { id: goodId, childId, clinicianId: child.clinicianId, tenantId: child.tenantId, title: "Synthetic readable PDF", fileName: "synthetic-readable.pdf", fileUrl: goodUrl },
    { id: badId, childId, clinicianId: child.clinicianId, tenantId: child.tenantId, title: "Synthetic damaged PDF", fileName: "synthetic-damaged.pdf", fileUrl: badUrl },
  ]);
  async function scan(): Promise<{ status: number; body: any }> {
    const r = await fetch(`${url}/build-client-profile`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ child_id: childId, force_rebuild: true }) });
    return { status: r.status, body: await r.json() };
  }
  const first = await scan();
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.ok(first.body.failed.some((f: any) => f.id === badId && /re-export/i.test(f.reason)));
  let [good] = await db.select().from(documentsTable).where(eq(documentsTable.id, goodId));
  assert.equal(good.scanStatus, "done");
  const [before] = await db.select().from(clientProfilesTable).where(eq(clientProfilesTable.childId, childId));
  assert.deepEqual(before.sourceDocIds, [goodId]);
  console.log("PASS first scan: valid normalized PDF accepted by the live AI reader; damaged file identified separately");
  const second = await scan();
  assert.equal(second.status, 422);
  const [after] = await db.select().from(clientProfilesTable).where(eq(clientProfilesTable.childId, childId));
  assert.deepEqual(after, before);
  [good] = await db.select().from(documentsTable).where(eq(documentsTable.id, goodId));
  assert.equal(good.scanStatus, "done");
  console.log("PASS failed reread: prior successful profile and healthy document status preserved exactly");
  // Replace only the synthetic damaged fixture's bytes reference with a valid
  // synthetic upload, then exercise Retry on the same document record.
  await db.update(documentsTable).set({ fileUrl: goodUrl }).where(eq(documentsTable.id, badId));
  const retry = await scan();
  assert.equal(retry.status, 200, JSON.stringify(retry.body));
  const [repaired] = await db.select().from(documentsTable).where(eq(documentsTable.id, badId));
  assert.equal(repaired.scanStatus, "done"); assert.equal(repaired.scanError, null);
  assert.deepEqual(new Set(retry.body.profile.source_doc_ids), new Set([goodId, badId]));
  console.log("PASS retry: valid replacement scans successfully, same document ID retained and old error cleared");
} finally { await pool.end(); }
