import { describe, expect, it } from "vitest";
import {
  getAuthorizedWorkspaces,
  getPostLoginPath,
  resolveActiveWorkspace,
} from "./workspaceRouting";

const account = (authorizedWorkspaces, defaultWorkspaceId = null) => ({
  appRole: "clinician",
  accountType: "clinician",
  authorizedWorkspaces,
  defaultWorkspaceId,
});

describe("server-authorized workspace routing", () => {
  it("uses only known destinations for authorized workspace IDs", () => {
    expect(getAuthorizedWorkspaces(account([
      { id: "clinic-administration", type: "clinic_admin", label: "North Clinic administration", homePath: "https://evil.invalid" },
      { id: "elevated", type: "platform_admin", label: "Injected", homePath: "/PlatformAdminClinics" },
    ]))).toEqual([{
      id: "clinic-administration",
      type: "clinic_admin",
      label: "North Clinic administration",
      homePath: "/ClinicianUsers",
    }]);
  });

  it("routes the public entry intent only when the server granted that workspace", () => {
    const user = account([
      { id: "clinical-workspace", type: "clinician", label: "Clinician workspace" },
    ]);
    expect(getPostLoginPath(user, "clinic-admin")).toBe("/ClinicianDashboard");
    expect(getPostLoginPath(user, "clinician")).toBe("/ClinicianDashboard");
  });

  it("shows a workspace chooser when multiple server-authorized roles exist", () => {
    const user = account([
      { id: "platform-administration", type: "platform_admin", label: "Platform" },
      { id: "clinic-administration", type: "clinic_admin", label: "Clinic" },
    ], "platform-administration");
    expect(getPostLoginPath(user)).toBe("/WorkspaceSelect");
    expect(getPostLoginPath(user, "clinic-admin")).toBe("/ClinicianUsers");
  });

  it("does not let a URL query create an unauthorized role", () => {
    const user = account([
      { id: "clinical-workspace", type: "clinician", label: "Clinical" },
    ]);
    expect(resolveActiveWorkspace(user, "/PlatformAdminClinics", "?workspace=platform-administration")?.id)
      .toBe("clinical-workspace");
  });

  it("keeps pending clinician access in the locked setup path", () => {
    expect(getPostLoginPath({ appRole: "pending_clinician", authorizedWorkspaces: [] })).toBe("/RoleSetup?role=clinician");
  });
});
