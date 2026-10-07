import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PublicLegalRoutes from "./PublicLegalRoutes";
import { legalContent } from "./legalContent";

afterEach(cleanup);

function BlockingAccountGate() {
  throw new Error("An account gate must not run for a public legal page.");
}

describe("public legal notices without changes to account workflows", () => {
  it.each(Object.entries(legalContent))("opens %s independently of account gates", (path, content) => {
    render(<MemoryRouter initialEntries={[path]}><PublicLegalRoutes><BlockingAccountGate /></PublicLegalRoutes></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1, name: content.title })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Legal information" })).toBeTruthy();
    expect(document.title).toBe(`${content.title} | NeuroPathways`);
    for (const label of ["Privacy policy", "Terms of use", "Contact", "Copyright", "Data requests"]) {
      expect(screen.getByRole("link", { name: label })).toBeTruthy();
    }
  });

  it("keeps the existing accepted privacy policy version and effective date", () => {
    render(<MemoryRouter initialEntries={["/privacy"]}><PublicLegalRoutes><BlockingAccountGate /></PublicLegalRoutes></MemoryRouter>);
    expect(screen.getByText("Privacy Policy · Version 1.0")).toBeTruthy();
    expect(screen.getByText("Effective September 23, 2026 · Last updated September 23, 2026")).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(15);
  });

  it.each(["/", "/ParentHome", "/ClientHome", "/ClinicianDashboard", "/ParentSignup", "/Settings"])("leaves %s with the existing application", (path) => {
    render(<MemoryRouter initialEntries={[path]}><PublicLegalRoutes><p>Existing account application</p></PublicLegalRoutes></MemoryRouter>);
    expect(screen.getByText("Existing account application")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Legal information" })).toBeNull();
  });

  it("restores page metadata when the notice unmounts", () => {
    const title = document.title;
    const originalDescription = document.head.querySelector('meta[name="description"]')?.getAttribute("content");
    const view = render(<MemoryRouter initialEntries={["/terms"]}><PublicLegalRoutes><p>Existing account application</p></PublicLegalRoutes></MemoryRouter>);
    view.unmount();
    expect(document.title).toBe(title);
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(originalDescription);
  });
});
