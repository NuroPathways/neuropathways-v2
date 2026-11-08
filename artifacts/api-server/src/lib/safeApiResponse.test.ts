import assert from "node:assert/strict";
import { test } from "node:test";
import { serializeApiResponse, stripCredentialMaterial } from "./safeApiResponse";

test("credential fields are removed recursively regardless of naming convention", () => {
  const source = {
    accessCode: "salt:hash",
    password_hash: "stored-hash",
    children: [{
      passwordHash: "another-hash",
      access_code: "legacy-hash",
      access_code_set: true,
      name: "Child",
    }],
  };

  assert.deepEqual(stripCredentialMaterial(source), {
    children: [{
      access_code_set: true,
      name: "Child",
    }],
  });
});

test("credential stripping preserves dates and non-credential values", () => {
  const createdAt = new Date("2026-01-01T00:00:00.000Z");
  const result = stripCredentialMaterial({ createdAt, id: "record", token: "session-token" });
  assert.equal(result.createdAt, createdAt);
  assert.equal(result.id, "record");
  assert.equal(result.token, "session-token");
});

test("database serialization cannot expose access-code or password hashes", () => {
  const result = serializeApiResponse({
    accessCode: "salt:hash",
    displayName: "Family",
    nestedRecords: [{ passwordHash: "stored-hash", accessCodeSet: true }],
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  });
  assert.deepEqual(result, {
    display_name: "Family",
    nested_records: [{ access_code_set: true }],
    created_at: "2026-01-01T00:00:00.000Z",
  });
});
