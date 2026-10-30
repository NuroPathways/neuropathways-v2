import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { prepareClinicalPdf, clinicalScanServiceError } from "./clinicalPdf";
import { DocumentProcessingError } from "./documentAi";

export function pdfFixture(): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ...["Synthetic first page", "Synthetic second page"].map(text => {
      const stream = `BT /F1 18 Tf 72 700 Td (${text}) Tj ET\n1 0 0 rg 72 600 100 50 re f\n`;
      return `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`;
    }),
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const start = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  return Buffer.from(`${pdf}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`);
}

test("PDF preparation preserves both original visual pages and text without modifying original bytes", async () => {
  const original = pdfFixture(), copy = Buffer.from(original);
  const output = await prepareClinicalPdf(original);
  assert.deepEqual(original, copy);
  assert.match(spawnSync("pdfinfo", ["-"], { input: output }).stdout.toString(), /Pages:\s+2/);
  const text = spawnSync("pdftotext", ["-", "-"], { input: output }).stdout.toString();
  assert.match(text.replace(/\s/g, ""), /Syntheticfirstpage/); assert.match(text.replace(/\s/g, ""), /Syntheticsecondpage/);
  assert.notDeepEqual(output, original);
});
test("readable PDF with broken cross-reference offset is repaired, not silently converted to text-only", async () => {
  const broken = Buffer.from(pdfFixture().toString().replace(/startxref\n\d+/, "startxref\n0"));
  const output = await prepareClinicalPdf(broken);
  assert.match(spawnSync("pdfinfo", ["-"], { input: output }).stdout.toString(), /Pages:\s+2/);
});
test("header-only fake PDF is rejected locally with an actionable file error", async () => {
  await assert.rejects(prepareClinicalPdf(Buffer.from("%PDF-1.4\nnot an actual document")), /damaged or incomplete/);
  await assert.rejects(prepareClinicalPdf(Buffer.from("not a PDF")), /invalid/);
});
test("invalid PDF service rejection is distinguished from temporary service failure", () => {
  assert.deepEqual(clinicalScanServiceError({ status: 400, message: "The PDF specified was not valid." }).status, 422);
  assert.match(clinicalScanServiceError({ status: 400, message: "invalid PDF" }).message, /re-exported/i);
  const unavailable = clinicalScanServiceError({ status: 503, message: "unavailable" });
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.code, "document_ai_unavailable");
  assert.match(unavailable.message, /temporarily unavailable/i);
  assert.match(unavailable.message, /previously extracted information has been preserved/i);

  const limited = clinicalScanServiceError(new DocumentProcessingError(
    "The reader reached its page limit.",
    "document_ai_limit",
    422,
    false,
    413,
  ));
  assert.equal(limited.status, 422);
  assert.equal(limited.code, "document_ai_limit");
  assert.equal(limited.invalidDocument, true);
});
