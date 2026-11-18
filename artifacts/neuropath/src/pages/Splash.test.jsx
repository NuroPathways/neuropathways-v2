import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  it("shows one accessible sign-in control with the existing role destinations", async () => {
    render(<MemoryRouter><Splash /></MemoryRouter>);

    const signInButton = screen.getByTestId("button-sign-in");
    expect(signInButton.textContent).toMatch(/sign in/i);
    expect(screen.getAllByRole("button", { name: /sign in/i })).toHaveLength(1);
    fireEvent.pointerDown(signInButton, { button: 0, pointerType: "mouse" });

    await screen.findByRole("menu");
    expect(screen.getByTestId("link-sign-in-caregiver").getAttribute("href")).toBe("/ParentLogin");
    expect(screen.getByTestId("link-sign-in-family-code").getAttribute("href")).toBe("/UsernameLogin");
    expect(screen.getByTestId("link-sign-in-clinician").getAttribute("href")).toBe("/ClinicianLogin?workspace=clinician");
    expect(screen.getByTestId("link-sign-in-clinic-admin").getAttribute("href")).toBe("/ClinicianLogin?workspace=clinic-admin");
    expect(screen.getByText(/does not assign a role or grant access/i)).toBeTruthy();
  });

  it("keeps caregiver signup and clinic request separate from the sign-in menu", async () => {
    render(<MemoryRouter><Splash /></MemoryRouter>);

    expect(screen.getByTestId("link-create-caregiver").getAttribute("href")).toBe("/ParentSignup");
    expect(screen.getByTestId("link-register-clinic").getAttribute("href")).toBe("/ClinicRequest");
    expect(screen.getByText(/a request does not create a clinic, administrator account, or access/i)).toBeTruthy();
    expect(screen.getByTestId("section-security").compareDocumentPosition(screen.getByTestId("section-how-it-works")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps operator sign-in discreetly in the footer", async () => {
    render(<MemoryRouter><Splash /></MemoryRouter>);

    const operatorLink = screen.getByTestId("link-operator-sign-in");
    expect(operatorLink.getAttribute("href")).toBe("/OperatorLogin");
    expect(operatorLink.textContent).toBe("NeuroPathways operator sign in");
    expect(operatorLink.closest("footer")).toBeTruthy();
  });
});
