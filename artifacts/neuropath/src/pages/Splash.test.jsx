import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Splash from "./Splash";

vi.mock("@/api/entities", () => ({
  base44: {
    auth: {
      isAuthenticated: vi.fn().mockResolvedValue(false),
      me: vi.fn(),
    },
  },
}));

afterEach(() => cleanup());

describe("public workspace entry points", () => {
  it("shows distinct caregiver, clinician, clinic-admin and clinic-request routes", async () => {
    render(<MemoryRouter><Splash /></MemoryRouter>);
    expect((await screen.findByTestId("link-caregiver-sign-in")).getAttribute("href")).toBe("/ParentLogin");
    expect(screen.getByTestId("link-caregiver-create").getAttribute("href")).toBe("/ParentSignup");
    expect(screen.getByTestId("link-clinician-entry").getAttribute("href")).toBe("/ClinicianLogin?workspace=clinician");
    expect(screen.getByTestId("link-clinic-admin-entry").getAttribute("href")).toBe("/ClinicianLogin?workspace=clinic-admin");
    expect(screen.getByTestId("link-register-clinic").getAttribute("href")).toBe("/ClinicRequest");
    expect(screen.getByTestId("link-family-access-code").getAttribute("href")).toBe("/UsernameLogin");
  });

  it("does not expose a platform-administrator login from public workspace cards", async () => {
    render(<MemoryRouter><Splash /></MemoryRouter>);
    await screen.findByTestId("section-workspace-entry");
    expect(screen.queryByRole("link", { name: /platform administrator sign in/i })).toBeNull();
    expect(screen.getByTestId("link-operator-login").getAttribute("href")).toBe("/OperatorLogin");
    expect(screen.getByTestId("link-operator-login").textContent).toBe("NeuroPathways operator sign in");
  });
});
