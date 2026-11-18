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
  it("restores the earlier workspace-card layout with the existing sign-in destinations", () => {
    render(<MemoryRouter><Splash /></MemoryRouter>);

    expect(screen.getByTestId("link-nav-clinicians").getAttribute("href")).toBe("#access");
    expect(screen.getByTestId("link-parent-login").getAttribute("href")).toBe("/ParentLogin");
    expect(screen.getByTestId("link-caregiver-sign-in").getAttribute("href")).toBe("/ParentLogin");
    expect(screen.getByTestId("link-caregiver-create").getAttribute("href")).toBe("/ParentSignup");
    expect(screen.getByTestId("link-family-access-code").getAttribute("href")).toBe("/UsernameLogin");
    expect(screen.getByTestId("link-clinician-entry").getAttribute("href")).toBe("/ClinicianLogin?workspace=clinician");
    expect(screen.getByTestId("link-clinic-admin-entry").getAttribute("href")).toBe("/ClinicianLogin?workspace=clinic-admin");
    expect(screen.queryByTestId("button-sign-in")).toBeNull();
    expect(screen.getByTestId("card-caregiver-entry")).toBeTruthy();
    expect(screen.getByTestId("card-clinician-entry")).toBeTruthy();
    expect(screen.getByTestId("card-clinic-admin-entry")).toBeTruthy();
  });

  it("keeps clinic requests separate and explains invitation-based staff access", () => {
    render(<MemoryRouter><Splash /></MemoryRouter>);

    expect(screen.getByTestId("link-caregiver-create").getAttribute("href")).toBe("/ParentSignup");
    expect(screen.getByTestId("link-register-clinic").getAttribute("href")).toBe("/ClinicRequest");
    expect(screen.getByText(/a request does not create a clinic, administrator account, or access/i)).toBeTruthy();
    expect(screen.getByText(/new clinician access remains locked until an authorized clinic approves it/i)).toBeTruthy();
    expect(screen.getByText(/administrator access is issued through an authorized clinic invitation/i)).toBeTruthy();
    expect(screen.getByText(/access still follows each account’s approved permissions/i)).toBeTruthy();
  });

  it("keeps the restricted operator sign-in link in the footer", () => {
    render(<MemoryRouter><Splash /></MemoryRouter>);

    const operatorLink = screen.getByTestId("link-operator-sign-in");
    expect(operatorLink.getAttribute("href")).toBe("/OperatorLogin");
    expect(operatorLink.textContent).toBe("NeuroPathways operator sign in");
    expect(operatorLink.closest("footer")).toBeTruthy();
  });
});
