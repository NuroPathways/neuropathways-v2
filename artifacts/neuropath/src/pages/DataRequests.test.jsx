import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import DataRequests from "./DataRequests";
import PublicLegalRoutes from "@/components/legal/PublicLegalRoutes";

vi.mock("@/lib/AuthContext", () => ({
  useAuth: () => ({ user: { account_type: "parent_free" }, isLoadingAuth: false }),
}));
vi.mock("@/lib/parentSession", () => ({ parentRequest: () => ({}) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Data requests back navigation", () => {
  it("provides a visible back arrow and returns to parent home from a direct account-form link", () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ requests: [] }) })));
    render(<MemoryRouter initialEntries={["/DataRequests"]}><Routes>
      <Route path="/DataRequests" element={<DataRequests />} />
      <Route path="/ParentHome" element={<p>Parent home</p>} />
    </Routes></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(screen.getByText("Parent home")).toBeTruthy();
  });

  it("returns from the public data-request notice to the page the user came from", () => {
    render(<MemoryRouter initialEntries={["/ParentHome", "/data-requests"]} initialIndex={1}>
      <PublicLegalRoutes><p>Parent home</p></PublicLegalRoutes>
    </MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(screen.getByText("Parent home")).toBeTruthy();
  });
});
