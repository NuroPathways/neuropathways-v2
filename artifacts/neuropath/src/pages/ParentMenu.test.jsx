import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import ParentMenu from "./ParentMenu";

const auth = vi.hoisted(() => ({ user: { accountType: "parent_free" } }));
vi.mock("@/lib/AuthContext", () => ({ useAuth: () => auth }));

const shortcuts = [
  ["History", "/History", "/History"],
  ["Support library", "/HelpNow", "/ParentHome?tab=today&section=library"],
  ["Care plan & documents", "/DocumentCenter", "/ParentHome?tab=docs"],
  ["Upload a plan", "/ParentUpload", "/ParentHome?tab=docs"],
  ["AI Chat", "/AIChat", "/ParentHome?tab=ask"],
  ["Enjoyment & preferences", "/ChildProfile", "/ParentHome?tab=practice&section=preferences"],
  ["Clinic connection", "/ParentHome?tab=clinic", "/ParentHome?tab=clinic"],
  ["Settings", "/Settings", "/Settings"],
  ["Messages", "/Messages", "/ParentHome?tab=messages"],
];
const testId = (title) => `menu-link-${title.toLowerCase().replaceAll(/[^a-z]+/g, "-")}`;
const modes = ["accountType", "account_type"].flatMap((field) =>
  ["parent_free", "legacy_family"].map((type) => ({ field, type })),
);

function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return <>
    <output data-testid="location">{location.pathname}{location.search}</output>
    <button onClick={() => navigate(-1)}>Browser back</button>
  </>;
}
function mount(entry = "/Menu?child_id=child-1") {
  return render(<MemoryRouter initialEntries={[entry]}>
    <ParentMenu /><LocationProbe />
  </MemoryRouter>);
}
afterEach(() => {
  cleanup();
  auth.user = { accountType: "parent_free" };
});

describe("Parent Menu shortcut preservation", () => {
  it.each(modes.flatMap((mode) => shortcuts
    .filter(([title]) => !(mode.type === "legacy_family" && title === "Clinic connection"))
    .map(([title, , mapped]) => ({ ...mode, title, mapped }))))(
    "$field=$type keeps $title and its child-specific destination",
    ({ field, type, title, mapped }) => {
      auth.user = { [field]: type };
      mount();
      fireEvent.click(screen.getByTestId(testId(title)));
      expect(screen.getByTestId("location").textContent)
        .toBe(`${mapped}${mapped.includes("?") ? "&" : "?"}child_id=child-1`);
    },
  );

  it.each(modes)("$field=$type retains exactly its authorized original shortcuts", ({ field, type }) => {
    auth.user = { [field]: type };
    mount();
    const expected = shortcuts.filter(([title]) => !(type === "legacy_family" && title === "Clinic connection"))
      .map(([title]) => testId(title)).sort();
    expect(screen.getAllByTestId(/^menu-link-/).map((node) => node.dataset.testid).sort()).toEqual(expected);
    expect(screen.queryByTestId(testId("Clinic connection")) !== null).toBe(type !== "legacy_family");
  });

  it.each(shortcuts)("preserves the original non-unified destination for %s", (title, original) => {
    auth.user = { accountType: "other_existing_account" };
    mount("/Menu");
    fireEvent.click(screen.getByTestId(testId(title)));
    expect(screen.getByTestId("location").textContent).toBe(original);
  });

  it("does not append an empty child identifier", () => {
    mount("/Menu");
    fireEvent.click(screen.getByTestId(testId("Messages")));
    expect(screen.getByTestId("location").textContent).toBe("/ParentHome?tab=messages");
  });

  it("encodes the existing child identifier without forwarding unrelated menu parameters", () => {
    mount(`/Menu?child_id=${encodeURIComponent("child/a & b")}&unrelated=value`);
    fireEvent.click(screen.getByTestId(testId("Messages")));
    expect(screen.getByTestId("location").textContent)
      .toBe("/ParentHome?tab=messages&child_id=child%2Fa+%26+b");
  });

  it("preserves browser back to the menu and its selected child", () => {
    mount();
    fireEvent.click(screen.getByTestId(testId("History")));
    fireEvent.click(screen.getByRole("button", { name: "Browser back" }));
    expect(screen.getByTestId("location").textContent).toBe("/Menu?child_id=child-1");
  });
});
