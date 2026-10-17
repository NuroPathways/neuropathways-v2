import { beforeEach, expect, test } from "vitest";
import { clearClientSession, clearFamilyLoginRequirement, getClientSession, isFamilyLoginRequired, requireFamilyLogin, saveClientSession } from "./clientSession";
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
test("a rejected family login remains explicit after its expired credential is removed", () => {
  saveClientSession({ invite_token: "synthetic-token" });
  clearClientSession(); requireFamilyLogin();
  expect(getClientSession()).toBeNull();
  expect(isFamilyLoginRequired()).toBe(true);
});
test("a new explicit family login clears the failed-login marker", () => {
  requireFamilyLogin();
  saveClientSession({ invite_token: "synthetic-new-token" });
  expect(isFamilyLoginRequired()).toBe(false);
  expect(getClientSession().invite_token).toBe("synthetic-new-token");
});
test("an explicit parent or clinician login can clear the family-login requirement", () => {
  requireFamilyLogin(); clearFamilyLoginRequirement();
  expect(isFamilyLoginRequired()).toBe(false);
});
