import test from "node:test";
import assert from "node:assert/strict";
import { extractParentDocumentText } from "./parentDocuments";
import {
  buildParentDocumentDiscoveryContent,
  buildParentDocumentGenerationContent,
} from "./parentDocumentPolicy";
import { classifyParentPdfReaderError } from "./parentPdfText";
import { canReuseParentScan } from "./parentDocumentScanCache";

function makeOnePagePdf(text: string): Buffer {
  const escaped = text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const stream = `BT\n/F1 12 Tf\n72 720 Td\n(${escaped}) Tj\nET\n`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let source = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index++) {
    offsets.push(Buffer.byteLength(source));
    source += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(source);
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    source += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(source);
}

test("text plans longer than the former 24,000-character cutoff are read through the end", async () => {
  const text = `${"support steps and goals\n".repeat(1_300)}LAST_SECTION_SENTINEL`;
  const extracted = await extractParentDocumentText("long-plan.txt", Buffer.from(text));
  assert.equal(extracted, text);
  assert.ok(extracted.includes("LAST_SECTION_SENTINEL"));
});

test("over-limit text fails explicitly instead of saving a silently truncated plan", async () => {
  await assert.rejects(
    extractParentDocumentText("over-limit.txt", Buffer.from("x".repeat(120_001))),
    /too long to read in one pass/i,
  );
});

test("packaged PDF.js reader extracts searchable text with no host PDF commands available", async () => {
  const previousPath = process.env.PATH;
  process.env.PATH = "";
  try {
    const extracted = await extractParentDocumentText(
      "plan.pdf",
      makeOnePagePdf("PDF_EXTRACTED_TEXT_SENTINEL"),
    );
    assert.match(extracted, /PDF_EXTRACTED_TEXT_SENTINEL/);
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
  }
});

test("PDF extraction distinguishes damaged, password-protected, and temporary reader failures", async () => {
  await assert.rejects(
    extractParentDocumentText("broken.pdf", Buffer.from("%PDF-1.4\nnot a PDF structure")),
    /damaged or unreadable/i,
  );
  await assert.rejects(
    extractParentDocumentText("image-only.pdf", makeOnePagePdf("")),
    /no searchable text/i,
  );
  assert.match(
    classifyParentPdfReaderError(Object.assign(new Error("encrypted"), { name: "PasswordException" })).message,
    /password-protected/i,
  );
  assert.match(
    classifyParentPdfReaderError(Object.assign(new Error("malformed"), { name: "InvalidPDFException" })).message,
    /damaged or unreadable/i,
  );
  assert.match(
    classifyParentPdfReaderError(new Error("unexpected reader failure")).message,
    /could not process this file right now/i,
  );
});

test("a failed parent PDF scan is not reused and remains eligible for a fresh successful retry", () => {
  const sharedContext = {
    extractionIsCurrent: true,
    hasMatchingScan: true,
    guidanceIsSafe: true,
  };
  assert.equal(canReuseParentScan({ ...sharedContext, scanStatus: "error" }), false);
  assert.equal(canReuseParentScan({ ...sharedContext, scanStatus: "processing" }), false);
  assert.equal(canReuseParentScan({ ...sharedContext, scanStatus: "done" }), true);
});

test("PDF text and original pages are preserved in discovery and generation requests", () => {
  const documents = [{
    id: "pdf-plan",
    title: "Support plan",
    content: [
      { type: "text" as const, text: "PDF_EXTRACTED_TEXT_SENTINEL" },
      {
        type: "document" as const,
        source: {
          type: "base64" as const,
          media_type: "application/pdf" as const,
          data: "encoded-pdf",
        },
      },
    ],
  }];
  const discovery = buildParentDocumentDiscoveryContent(documents, ["pdf-plan"]);
  const generation = buildParentDocumentGenerationContent(documents, "Transitions", null, ["pdf-plan"]);

  for (const content of [discovery, generation]) {
    assert.ok(content.some((part) => part.type === "text" && part.text.includes("PDF_EXTRACTED_TEXT_SENTINEL")));
    assert.ok(content.some((part) => part.type === "document"));
  }
});
