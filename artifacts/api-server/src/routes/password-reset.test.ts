import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/password-reset-tests";
process.env.PASSWORD_RESET_BASE_URL = "https://app.example.test/neuropath";
const { passwordResetUrl } = await import("./password-reset.js");

test("password reset links keep the one-time token in the URL fragment", () => {
  const url = new URL(passwordResetUrl("r4nd0m-url-safe-token", "parent"));

  assert.equal(url.origin, "https://app.example.test");
  assert.equal(url.pathname, "/neuropath/ResetPassword");
  assert.equal(url.search, "");
  assert.equal(new URLSearchParams(url.hash.slice(1)).get("token"), "r4nd0m-url-safe-token");
  assert.equal(new URLSearchParams(url.hash.slice(1)).get("accountType"), "parent");
});

test("default reset links target the NeuroPathways artifact at the configured origin", () => {
  const originalBase = process.env.PASSWORD_RESET_BASE_URL;
  const originalOrigin = process.env.CORS_ORIGIN;
  delete process.env.PASSWORD_RESET_BASE_URL;
  process.env.CORS_ORIGIN = "https://app.example.test";

  try {
    const url = new URL(passwordResetUrl("another-url-safe-token", "clinician"));
    assert.equal(url.origin, "https://app.example.test");
    assert.equal(url.pathname, "/ResetPassword");
    assert.equal(new URLSearchParams(url.hash.slice(1)).get("accountType"), "clinician");
  } finally {
    if (originalBase === undefined) delete process.env.PASSWORD_RESET_BASE_URL;
    else process.env.PASSWORD_RESET_BASE_URL = originalBase;
    if (originalOrigin === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = originalOrigin;
  }
});
