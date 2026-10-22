import assert from "node:assert/strict";
import test from "node:test";
import { prepareSupportPdf } from "./supportPdf";
import { parentPdfReaderMessages, readParentPdfText } from "./parentPdfText";
import { makePdfFixture } from "../test-utils/pdfFixture";

const fixture = () => makePdfFixture(["FIRST_PAGE_SUPPORT_SENTINEL", "LAST_PAGE_SUPPORT_SENTINEL"]);

test("shared account reader extracts both pages and preserves stored original bytes", async () => {
  const input = fixture(), original = Buffer.from(input);
  const result = await prepareSupportPdf(input);
  assert.deepEqual(input, original);
  assert.match(result.searchableText, /FIRST_PAGE_SUPPORT_SENTINEL/);
  assert.match(result.searchableText, /LAST_PAGE_SUPPORT_SENTINEL/);
  assert.match((await readParentPdfText(result.pdf)).replace(/\s/g, ""), /LAST_PAGE_SUPPORT_SENTINEL/);
});

for (const failure of [
  parentPdfReaderMessages.unavailable,
  parentPdfReaderMessages.processingUnavailable,
  "No searchable text was found in this PDF.",
]) {
  test(`full-page reader remains available when text extraction reports: ${failure}`, async () => {
    const result = await prepareSupportPdf(fixture(), async () => { throw new Error(failure); });
    assert.equal(result.searchableText, "", "never invent searchable text");
    const actualPages = (await readParentPdfText(result.pdf)).replace(/\s/g, "");
    assert.match(actualPages, /FIRST_PAGE_SUPPORT_SENTINEL/);
    assert.match(actualPages, /LAST_PAGE_SUPPORT_SENTINEL/);
  });
}

test("valid image-only/blank-text PDF can reach the visual reader", async () => {
  const result = await prepareSupportPdf(makePdfFixture(["", ""]));
  assert.equal(result.searchableText, "");
  assert.ok(result.pdf.length > 100);
});

test("damaged input is not passed to visual AI and file/limit errors are not swallowed", async () => {
  let textCalled = false;
  await assert.rejects(prepareSupportPdf(Buffer.from("%PDF-1.4\nbroken"), async () => {
    textCalled = true;
    return "must not be used";
  }), /damaged|incomplete/);
  assert.equal(textCalled, false);
  for (const message of [
    "This PDF is password-protected. Upload an unlocked PDF copy.",
    "This PDF has too many pages to read in one pass.",
    "This plan is too long to read in one pass. Split it into smaller files and retry.",
  ]) {
    await assert.rejects(prepareSupportPdf(fixture(), async () => { throw new Error(message); }), { message });
  }
});
