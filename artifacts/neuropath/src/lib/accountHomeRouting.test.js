import { describe, expect, it } from "vitest";
import { getAccountHomeRedirect } from "./accountHomeRouting";

describe("getAccountHomeRedirect", () => {
  it.each([
    [{ account_type: "parent_free", app_role: "parent" }, "/ParentDashboard", "/ParentHome"],
    [{ account_type: "legacy_family", app_role: "parent", invite_token: "family-token" }, "/ClientHome", "/ParentHome"],
    [{ account_type: "family", invite_token: "family-token" }, "/ClientDashboard", "/ParentHome"],
    [{ account_type: "caregiver", role: "caregiver" }, "/ClientDashboard/", "/ParentHome"],
  ])("sends caregiver home aliases to the shared parent home", (user, path, destination) => {
    expect(getAccountHomeRedirect(user, path)).toBe(destination);
  });

  it("preserves the return query when a caregiver opens a dashboard alias", () => {
    expect(getAccountHomeRedirect(
      { account_type: "legacy_family", app_role: "parent" },
      "/ClientDashboard",
      "?child_id=child-1",
    )).toBe("/ParentHome?child_id=child-1");
  });

  it("keeps invited individual clients on their client home", () => {
    expect(getAccountHomeRedirect(
      { account_type: "individual", invite_token: "client-token" },
      "/ClientDashboard",
      "?tab=documents",
    )).toBe("/ClientHome?tab=documents");
    expect(getAccountHomeRedirect(
      { account_type: "individual", invite_token: "client-token" },
      "/ParentDashboard",
    )).toBe("/ClientHome");
  });

  it("sends self-managed individual clients to their own dashboard", () => {
    expect(getAccountHomeRedirect({ account_type: "individual" }, "/ClientDashboard"))
      .toBe("/ParentDashboard");
    expect(getAccountHomeRedirect({ account_type: "individual" }, "/ClientHome"))
      .toBe("/ParentDashboard");
  });

  it("does not rewrite clinician or unrelated routes", () => {
    expect(getAccountHomeRedirect({ account_type: "clinician", app_role: "clinician" }, "/ParentDashboard"))
      .toBeNull();
    expect(getAccountHomeRedirect({ account_type: "parent_free", app_role: "parent" }, "/Practice"))
      .toBeNull();
  });
});
