/** Build-time smoke check of the actual bundled reader; no DB, files or AI calls. */
import assert from "node:assert/strict";
import { prepareSupportPdf } from "../lib/supportPdf";
import { readParentPdfText } from "../lib/parentPdfText";
import { makePdfFixture } from "../test-utils/pdfFixture";

const bytes = makePdfFixture(["PDF_RUNTIME_FIRST_PAGE", "PDF_RUNTIME_LAST_PAGE"]);
const result = await prepareSupportPdf(bytes);
assert.match(result.searchableText, /PDF_RUNTIME_FIRST_PAGE/);
assert.match(result.searchableText, /PDF_RUNTIME_LAST_PAGE/);
const visualText = (await readParentPdfText(result.pdf)).replace(/\s/g, "");
assert.match(visualText, /PDF_RUNTIME_FIRST_PAGE/);
assert.match(visualText, /PDF_RUNTIME_LAST_PAGE/);
process.stdout.write("PDF runtime check passed: searchable text and complete visual pages.\n");
