import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import RoleAwareShell from "./RoleAwareShell";
import SupportNowOverlay from "../support/SupportNowOverlay";
import {
  activateNavigationItem,
  canChooseNavigationChild,
  createClientHomeNavigation,
  createFreeCaregiverNavigation,
  createRoleNavigation,
  getMobileNavigationItems,
  mobilePrimaryKeysForRole,
  resolveNavigationRole,
} from "./navigationModels";

vi.mock("framer-motion", async () => {
  const React = await import("react");
  const motion = new Proxy({}, {
    get: (_target, tag) => function MotionElement({ children, initial, animate, exit, transition, ...props }) {
      return React.createElement(tag, props, children);
    },
  });
  return {
    motion,
    AnimatePresence: ({ children }) => children,
  };
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

const allItems = (groups) => groups.flatMap((group) => group.items);
const itemByKey = (groups, key) => allItems(groups).find((item) => item.key === key);

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="current-location">{`${location.pathname}${location.search}`}</output>;
}

function renderShell({
  role = "caregiver",
  roleLabel = "Caregiver workspace",
  navGroups,
  mobilePrimaryKeys = mobilePrimaryKeysForRole(role),
  selectedChild,
  childrenOptions = [],
  onChildSelect,
  onLogout,
}) {
  return render(
    <MemoryRouter initialEntries={["/ClientHome"]}>
      <>
        <RoleAwareShell
          role={role}
          roleLabel={roleLabel}
          currentLabel="Home"
          activeKey="home"
          navGroups={navGroups}
          mobilePrimaryKeys={mobilePrimaryKeys}
          accountName="Riley’s family"
          accountMeta="Family account"
          selectedChild={selectedChild}
          childrenOptions={childrenOptions}
          contextLabel="Viewing support for"
          onChildSelect={onChildSelect}
          onLogout={onLogout}
        >
          <div>Dashboard content</div>
        </RoleAwareShell>
        <LocationProbe />
      </>
    </MemoryRouter>,
  );
}

describe("navigation role and menu models", () => {
  it("recognizes clinician and individual accounts without treating a missing role as individual", () => {
    expect(resolveNavigationRole({ app_role: "clinician" })).toBe("clinician");
    expect(resolveNavigationRole({ role: "admin", account_type: "individual" })).toBe("clinician");
    expect(resolveNavigationRole({ app_role: "parent", account_type: "individual" })).toBe("individual");
    expect(resolveNavigationRole({ app_role: "parent" })).toBe("caregiver");
    expect(resolveNavigationRole({ app_role: "parent" }, true)).toBe("individual");
  });

  it("keeps the clinician navigation focused on clinical workspace routes", () => {
    const groups = createRoleNavigation("clinician", "/ClinicianDashboard");
    const items = allItems(groups);
    expect(groups.map((group) => group.label)).toEqual(["Workspace", "Clinical", "Account"]);
    expect(items.map((item) => item.key)).toEqual([
      "dashboard", "clients", "documents", "plans", "reports", "ai-review", "messages", "settings",
    ]);
    expect(items.some((item) => item.key === "support" || item.key === "profiles")).toBe(false);
    expect(items.every((item) => item.to.startsWith("/"))).toBe(true);
  });

  it("shows caregiver family tools and only adds plan upload when the account supports it", () => {
    const standard = allItems(createRoleNavigation("caregiver", "/ParentDashboard", false));
    const free = allItems(createRoleNavigation("caregiver", "/ParentDashboard", true));
    expect(standard.find((item) => item.key === "home").to).toBe("/ParentDashboard");
    expect(standard.some((item) => item.key === "profiles")).toBe(true);
    expect(standard.some((item) => item.key === "upload-plan")).toBe(false);
    expect(free.find((item) => item.key === "upload-plan").to).toBe("/UploadBehaviorPlan");
  });

  it("builds individual navigation without family-only labels and carries a selected profile in caregiver routes", () => {
    const individual = allItems(createRoleNavigation("individual", "/ClientHome"));
    expect(individual.some((item) => item.key === "rewards" && item.icon)).toBe(true);
    expect(individual.some((item) => item.label === "Child Profiles")).toBe(false);

    const caregiverGroups = createClientHomeNavigation({
      isIndividualClient: false,
      selectedId: "child 2&",
      onSupportNow: vi.fn(),
    });
    expect(itemByKey(caregiverGroups, "goals").to).toBe("/GoalsMilestones?child_id=child%202%26");
    expect(itemByKey(caregiverGroups, "profiles").to).toBe("/ChildProfile?child_id=child%202%26");
    expect(itemByKey(caregiverGroups, "profiles").label).toBe("Child Profiles");

    const individualHome = createClientHomeNavigation({
      isIndividualClient: true,
      selectedId: "self-1",
      onSupportNow: vi.fn(),
    });
    expect(individualHome.map((group) => group.label)).toEqual(["Your space", "Your plan", "Account"]);
    expect(allItems(individualHome).some((item) => item.label === "Child Profiles")).toBe(false);
    expect(itemByKey(individualHome, "goals").to).toBe("/GoalsMilestones?child_id=self-1");
  });

  it("maps each role's mobile quick links to existing menu items", () => {
    const cases = [
      ["clinician", "/ClinicianDashboard", ["dashboard", "clients", "reports"]],
      ["caregiver", "/ParentDashboard", ["home", "support", "logs"]],
      ["individual", "/ClientHome", ["home", "support", "progress"]],
    ];

    for (const [role, homePath, expectedKeys] of cases) {
      const groups = createRoleNavigation(role, homePath, true);
      const keys = mobilePrimaryKeysForRole(role);
      expect(keys).toEqual(expectedKeys);
      expect(getMobileNavigationItems(groups, keys).map((item) => item.key)).toEqual(expectedKeys);
    }
  });

  it("keeps free-caregiver dashboard sections and support actions mapped to their existing destinations", () => {
    const goToTab = vi.fn();
    const onSupportNow = vi.fn();
    const onAddChild = vi.fn();
    const groups = createFreeCaregiverNavigation({
      activeTab: "edit",
      activeSection: "goals",
      goToTab,
      onSupportNow,
      onAddChild,
    });

    expect(itemByKey(groups, "goals").active).toBe(true);
    expect(itemByKey(groups, "profiles").active).toBe(false);
    itemByKey(groups, "library").onSelect();
    expect(goToTab).toHaveBeenCalledWith("today", "library");
    itemByKey(groups, "goals").onSelect();
    expect(goToTab).toHaveBeenCalledWith("edit", "goals");
    itemByKey(groups, "practice").onSelect();
    expect(goToTab).toHaveBeenCalledWith("practice");
    itemByKey(groups, "support").onSelect();
    expect(onSupportNow).toHaveBeenCalledOnce();
    itemByKey(groups, "add-child").onSelect();
    expect(onAddChild).toHaveBeenCalledOnce();
  });

  it("does not activate or close the menu for a disabled item", () => {
    const onSelect = vi.fn();
    const closeMenu = vi.fn();
    expect(activateNavigationItem({ disabled: true, onSelect }, closeMenu)).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();
    expect(closeMenu).not.toHaveBeenCalled();
    expect(activateNavigationItem({ onSelect }, closeMenu)).toBe(true);
    expect(onSelect).toHaveBeenCalledOnce();
    expect(closeMenu).toHaveBeenCalledOnce();
  });

  it("offers child selection only when there is more than one profile and a handler", () => {
    expect(canChooseNavigationChild([{ id: "one" }], vi.fn())).toBe(false);
    expect(canChooseNavigationChild([{ id: "one" }, { id: "two" }], undefined)).toBe(false);
    expect(canChooseNavigationChild([{ id: "one" }, { id: "two" }], vi.fn())).toBe(true);
  });
});

describe("role-aware shell interactions", () => {
  it.each([
    ["clinician", "/ClinicianDashboard", ["dashboard", "clients", "reports"]],
    ["caregiver", "/ParentDashboard", ["home", "support", "logs"]],
    ["individual", "/ClientHome", ["home", "support", "progress"]],
  ])("renders %s quick links and expandable menu", (role, homePath, primaryKeys) => {
    const groups = createRoleNavigation(role, homePath, true);
    const roleLabel = role === "clinician"
      ? "Clinician workspace"
      : role === "individual"
        ? "Your personal space"
        : "Caregiver workspace";
    renderShell({ role, roleLabel, navGroups: groups });

    for (const key of primaryKeys) expect(screen.getByTestId(`nav-${key}-bottom`)).toBeTruthy();
    const menuButton = screen.getByTestId("button-navigation-menu");
    expect(menuButton.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(menuButton);
    expect(menuButton.getAttribute("aria-expanded")).toBe("true");

    const drawer = screen.getByRole("complementary", { name: `${roleLabel} navigation` });
    for (const group of groups) {
      expect(within(drawer).getByRole("heading", { name: group.label })).toBeTruthy();
      for (const item of group.items) {
        expect(within(drawer).getByTestId(`nav-${item.key}-mobile`)).toBeTruthy();
      }
    }
    if (role === "individual") expect(screen.queryByTestId("select-navigation-child-desktop")).toBeNull();

    const destinationKey = role === "clinician" ? "clients" : "goals";
    const destination = itemByKey(groups, destinationKey);
    fireEvent.click(within(drawer).getByRole("link", { name: destination.label }));
    expect(screen.getByTestId("current-location").textContent).toBe(destination.to);
    expect(menuButton.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens the existing child-first support flow from the mobile quick link", () => {
    const onSupportNow = vi.fn();
    const groups = createClientHomeNavigation({
      isIndividualClient: false,
      selectedId: "child-1",
      onSupportNow,
    });
    renderShell({ navGroups: groups, mobilePrimaryKeys: ["home", "support", "logs"] });

    fireEvent.click(screen.getByTestId("nav-support-bottom"));
    expect(onSupportNow).toHaveBeenCalledOnce();
  });

  it("preserves caregiver child context and follows drawer links to the selected child's route", () => {
    const onChildSelect = vi.fn();
    const groups = createClientHomeNavigation({
      isIndividualClient: false,
      selectedId: "child-1",
      onSupportNow: vi.fn(),
    });
    renderShell({
      navGroups: groups,
      selectedChild: { id: "child-1", child_name: "Riley" },
      childrenOptions: [
        { id: "child-1", child_name: "Riley" },
        { id: "child-2", child_name: "Jordan" },
      ],
      onChildSelect,
    });

    fireEvent.change(screen.getByTestId("select-navigation-child-desktop"), { target: { value: "child-2" } });
    expect(onChildSelect).toHaveBeenCalledWith("child-2");

    fireEvent.click(screen.getByTestId("button-navigation-menu"));
    const drawer = screen.getByRole("complementary", { name: "Caregiver workspace navigation" });
    fireEvent.click(within(drawer).getByRole("link", { name: "Goals" }));
    expect(screen.getByTestId("current-location").textContent).toBe("/GoalsMilestones?child_id=child-1");
    expect(screen.getByTestId("button-navigation-menu").getAttribute("aria-expanded")).toBe("false");
  });

  it("reopens Support Now at child selection after the overlay was dismissed", () => {
    const user = { id: "parent-1", role: "parent", invite_token: "invite-1" };
    const children = [
      { id: "child-1", child_name: "Riley" },
      { id: "child-2", child_name: "Jordan" },
    ];
    const loadProfileForChild = vi.fn().mockResolvedValue(null);
    const renderOverlay = (openRequest) => (
      <SupportNowOverlay
        user={user}
        children={children}
        isIndividual={false}
        loadProfileForChild={loadProfileForChild}
        logEngagement={false}
        autoOpen={false}
        openRequest={openRequest}
      />
    );
    const view = render(renderOverlay(1));

    expect(screen.getByRole("heading", { name: "Who do you need help with?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Riley/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue to support options" }));
    expect(screen.getByRole("heading", { name: "Need support right now?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close support" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    view.rerender(renderOverlay(2));
    expect(screen.getByRole("heading", { name: "Who do you need help with?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Riley/ }).getAttribute("aria-pressed")).toBe("false");
  });

  it("keeps the child-selection step for a single-child caregiver account", () => {
    render(
      <SupportNowOverlay
        user={{ id: "parent-1", role: "parent", invite_token: "invite-1" }}
        children={[{ id: "child-1", child_name: "Riley" }]}
        isIndividual={false}
        loadProfileForChild={vi.fn().mockResolvedValue(null)}
        logEngagement={false}
        autoOpen={false}
        openRequest={1}
      />,
    );

    expect(screen.getByRole("heading", { name: "Who do you need help with?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Riley/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Continue to support options" }).hasAttribute("disabled")).toBe(false);
  });
});
