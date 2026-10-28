import assert from "node:assert/strict";
import test from "node:test";
import { splitDocumentTextForAi } from "./documentTextChunks.js";

test("splits long source text without losing or rewriting any characters", () => {
  const source = `${"Paragraph one with documented details.\n\n".repeat(700)}Final note from the last page.`;
  const chunks = splitDocumentTextForAi(source, 1_000);

  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 1_000));
  assert.equal(chunks.join(""), source);
  assert.match(chunks.at(-1) || "", /Final note from the last page\./);
});

test("keeps short text intact and rejects invalid chunk sizes", () => {
  assert.deepEqual(splitDocumentTextForAi("Short source text."), ["Short source text."]);
  assert.deepEqual(splitDocumentTextForAi(""), []);
  assert.throws(() => splitDocumentTextForAi("text", 0), /positive integer/);
});
