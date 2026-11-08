import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidFileEncryptionKey } from "./documentEncryptionPolicy";

test("file encryption is configured only for a complete 32-byte hex key", () => {
  assert.equal(isValidFileEncryptionKey("a".repeat(64)), true);
  assert.equal(isValidFileEncryptionKey("A".repeat(64)), true);
  assert.equal(isValidFileEncryptionKey(undefined), false);
  assert.equal(isValidFileEncryptionKey("a".repeat(63)), false);
  assert.equal(isValidFileEncryptionKey("z".repeat(64)), false);
});
