import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import ClientHome from "./ClientHome";

const fixture = vi.hoisted(() => ({
  invoke: vi.fn(),
  user: {
    id: "family-fixture",
    invite_token: "fixture-token",
    display_name: "Demo Caregiver",
    account_type: "family",
    children: [
      { id: "child-a", child_name: "First child", age: 12 },
      { id: "child-b", child_name: "Second child", age: 9 },
    ],
  },
}));
vi.mock("@/api/entities", () => ({ base44: { functions: { invoke: fixture.invoke } } }));
vi.mock("@/lib/AuthContext", () => ({
  useAuth: () => ({ user: fixture.user, isAuthenticated: true, logout: vi.fn() }),
}));

function Location() {
  const location = useLocation();
  return <output data-testid="destination">{location.pathname}{location.search}</output>;
}

function openHome(onSupportNow = vi.fn(), initialEntry = "/ClientHome") {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/ClientHome" element={<ClientHome onSupportNow={onSupportNow} />} />
        <Route path="/LogBehavior" element={<Location />} />
      </Routes>
    </MemoryRouter>,
  );
  return onSupportNow;
}

beforeEach(() => {
  fixture.invoke.mockReset();
  fixture.invoke.mockImplementation(async (_name, request) => ({
    data: {
      child: fixture.user.children.find((child) => child.id === request.child_id),
      siblings: fixture.user.children,
      plans: [{ id: "plan-a", behavior_name: "A saved behavior", strategy_steps: "Saved plan steps" }],
      profile: { goals: ["A real saved goal"] },
      behaviorLogs: [{ id: "log-a", behavior_type: "A real observation", created_date: new Date().toISOString() }],
      documents: [],
      messages: [],
    },
  }));
});
afterEach(cleanup);

describe("restored client dashboard", () => {
  it("uses the existing portal data and opens the existing urgent-support callback", async () => {
    const onSupportNow = openHome();
    await screen.findByRole("heading", { name: "My Children" });
    expect(fixture.invoke).toHaveBeenCalledWith("getClientPortalData", {
      child_id: "child-a",
      account_id: "family-fixture",
      invite_token: "fixture-token",
    });
    expect(screen.getByRole("heading", { name: "Demo" })).toBeTruthy();
    expect(within(screen.getByLabelText("Dashboard summary")).getByText("2")).toBeTruthy();
    expect(screen.getByText("A real observation")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-client-help-now"));
    expect(onSupportNow).toHaveBeenCalledTimes(1);
  });

  it("shows the separate Practice page for the selected family child", async () => {
    openHome(vi.fn(), "/ClientHome?view=practice&child_id=child-a");
    expect(await screen.findByTestId("panel-practice")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Practice" })).toBeTruthy();
    expect(screen.getByText("Saved plan steps")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "My Children" })).toBeNull();
  });

  it("keeps sibling selection connected to the authorized portal request", async () => {
    openHome();
    await screen.findByRole("heading", { name: "My Children" });
    fireEvent.click(screen.getByTestId("button-navigation-child-child-b"));
    await waitFor(() => expect(fixture.invoke).toHaveBeenLastCalledWith("getClientPortalData", {
      child_id: "child-b",
      account_id: "family-fixture",
      invite_token: "fixture-token",
    }));
    expect(screen.getByTestId("button-navigation-child-child-b").getAttribute("aria-pressed")).toBe("true");
  });

  it("passes the right child's identifier to the restored Log action", async () => {
    openHome();
    await screen.findByRole("heading", { name: "My Children" });
    fireEvent.click(screen.getAllByRole("button", { name: "Log", exact: true })[1]);
    expect(screen.getByTestId("destination").textContent).toBe("/LogBehavior?child_id=child-b");
  });
});
