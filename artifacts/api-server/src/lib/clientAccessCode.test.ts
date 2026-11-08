import assert from "node:assert/strict";
import { test } from "node:test";
import { hashClientAccessCode, verifyClientAccessCode } from "./clientAccessCode";

test("client access-code hashes verify without exposing the original code", async () => {
  const encoded = await hashClientAccessCode("Ab12Cd");
  assert.notEqual(encoded, "Ab12Cd");
  assert.equal(await verifyClientAccessCode("aB12cD", encoded), true);
  assert.equal(await verifyClientAccessCode("wrong-code", encoded), false);
});

test("legacy plaintext access codes remain usable until rotated", async () => {
  assert.equal(await verifyClientAccessCode("OLD-CODE", "old-code"), true);
  assert.equal(await verifyClientAccessCode("wrong", "old-code"), false);
  assert.equal(await verifyClientAccessCode("anything", "malformed:hash"), false);
});
