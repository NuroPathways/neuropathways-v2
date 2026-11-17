import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ClinicianLogin from "./ClinicianLogin";

const mocks = vi.hoisted(() => ({
  auth: {
    user: null,
    isAuthenticated: false,
    isLoadingAuth: false,
    checkUserAuth: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock("@/lib/AuthContext", () => ({
  useAuth: () => mocks.auth,
}));

vi.mock("@/api/entities", () => ({
  base44: { auth: { isAuthenticated: vi.fn(), me: vi.fn() } },
}));

vi.mock("@/components/parentfree/common", () => ({
  Shell: ({ children, right }) => <div>{right}{children}</div>,
}));

const platformAdmin = {
  id: "fictional-operator",
  authorizedWorkspaces: [{
    id: "platform-administration",
    type: "platform_admin",
    label: "Clinic management",
    homePath: "/PlatformAdminClinics",
  }],
};

const clinicAdmin = {
  id: "fictional-clinic-admin",
  authorizedWorkspaces: [{
    id: "clinic-administration",
    type: "clinic_admin",
    label: "Clinic administration",
    homePath: "/ClinicianUsers",
  }],
};

function renderOperator(entry = "/OperatorLogin") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/OperatorLogin" element={<ClinicianLogin operatorMode />} />
        <Route path="/PlatformAdminClinics" element={<p data-testid="platform-management-page">Clinic management</p>} />
        <Route path="/ClinicianUsers" element={<p data-testid="clinic-admin-page">Clinic staff workspace</p>} />
        <Route path="/ParentHome" element={<p data-testid="caregiver-home">Caregiver Home</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  mocks.auth.user = null;
  mocks.auth.isAuthenticated = false;
  mocks.auth.isLoadingAuth = false;
  mocks.auth.checkUserAuth.mockReset();
  mocks.auth.logout.mockReset();
  window.history.replaceState(null, "", "/");
});

describe("NeuroPathways operator sign-in", () => {
  it("uses the shared sign-in screen without role selection or registration", () => {
    renderOperator("/OperatorLogin?workspace=clinic-admin");

    expect(screen.getByRole("heading", { name: "NeuroPathways Operator Sign In" })).toBeTruthy();
    expect(screen.getByText("For authorized NeuroPathways platform administrators.")).toBeTruthy();
    expect(screen.getByTestId("button-email-login")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /request clinician access/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /client sign in/i })).toBeNull();
  });

  it("sends an already-authenticated platform administrator to Clinic Management", async () => {
    mocks.auth.user = platformAdmin;
    mocks.auth.isAuthenticated = true;
    renderOperator();

    expect(await screen.findByTestId("platform-management-page")).toBeTruthy();
  });

  it("shows a denial and only the clinic administrator's authorized destination", async () => {
    mocks.auth.user = clinicAdmin;
    mocks.auth.isAuthenticated = true;
    renderOperator();

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("This account does not have operator access.")).toBeTruthy();
    expect(screen.getByTestId("link-authorized-workspace").getAttribute("href")).toBe("/ClinicianUsers");
    fireEvent.click(screen.getByRole("button", { name: "Sign out and use another account" }));
    expect(mocks.auth.logout).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("platform-management-page")).toBeNull();
  });

  it("denies a pending clinician without linking to an inactive workspace", async () => {
    mocks.auth.user = { app_role: "pending_clinician" };
    mocks.auth.isAuthenticated = true;
    renderOperator();

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("This clinician account is still waiting for approval from an authorized clinic administrator.")).toBeTruthy();
    expect(screen.queryByTestId("link-authorized-workspace")).toBeNull();
    expect(screen.getByRole("button", { name: "Sign out and use another account" })).toBeTruthy();
  });

  it("routes a successful login only when server-provided workspaces include platform administration", async () => {
    mocks.auth.checkUserAuth.mockResolvedValue(platformAdmin);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ redirect: "/ClinicianDashboard" }),
    }));
    renderOperator();

    fireEvent.click(screen.getByTestId("button-email-login"));
    fireEvent.change(await screen.findByLabelText("Email"), { target: { value: "operator@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "fictional-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    expect(await screen.findByTestId("platform-management-page")).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith("/api/clinician/login", expect.objectContaining({
      credentials: "include",
      method: "POST",
    }));
  });

  it("does not honor a platform redirect for an account without server-authorized operator access", async () => {
    mocks.auth.checkUserAuth.mockResolvedValue(clinicAdmin);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ redirect: "/PlatformAdminClinics" }),
    }));
    renderOperator();

    fireEvent.click(screen.getByTestId("button-email-login"));
    fireEvent.change(await screen.findByLabelText("Email"), { target: { value: "clinic-admin@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "fictional-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    expect(await screen.findByText("This account does not have operator access.")).toBeTruthy();
    expect(screen.getByTestId("link-authorized-workspace").getAttribute("href")).toBe("/ClinicianUsers");
    expect(screen.queryByTestId("platform-management-page")).toBeNull();
  });
});
