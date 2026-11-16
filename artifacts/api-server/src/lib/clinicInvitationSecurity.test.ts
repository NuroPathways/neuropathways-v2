import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createClinicInvitationLink,
  createClinicInvitationToken,
  hashClinicInvitationToken,
  normalizeInvitationEmail,
} from "./clinicInvitationSecurity";

test("clinic invitation tokens are high entropy and only a one-way hash is needed for storage", () => {
  const token = createClinicInvitationToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(hashClinicInvitationToken(token).length, 64);
  assert.notEqual(hashClinicInvitationToken(token), token);
  assert.notEqual(hashClinicInvitationToken(token), hashClinicInvitationToken(createClinicInvitationToken()));
});

test("clinic invitation email comparison normalizes case and whitespace", () => {
  assert.equal(normalizeInvitationEmail("  STAFF@Example.Test "), "staff@example.test");
  assert.equal(normalizeInvitationEmail("not-an-email"), null);
  assert.equal(normalizeInvitationEmail("x".repeat(250) + "@example.test"), null);
});

test("invitation links carry the bearer token only in the URL fragment", () => {
  const link = createClinicInvitationLink("https://app.example.test/ClinicInvitation", "fictional-token-value");
  const url = new URL(link);
  assert.equal(url.search, "");
  assert.equal(url.hash, "#token=fictional-token-value");
});
