import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ParentHome from "./ParentHome";

vi.mock("framer-motion", async () => {
  const React = await import("react");
  const motion = new Proxy({}, {
    get: (_target, tag) => function MotionElement({ children, initial, animate, exit, transition, ...props }) {
      const initialStyle = initial && typeof initial === "object" ? initial : {};
      return React.createElement(tag, {
        ...props,
        style: { ...props.style, ...initialStyle },
      }, children);
    },
  });
  return {
    motion,
    AnimatePresence: ({ children }) => children,
    useReducedMotion: () => false,
  };
});

const mocks = vi.hoisted(() => ({
  user: { id: "support-parent", account_type: "parent_free", first_name: "Riley" },
  child: { id: "support-child", name: "Sam", child_name: "Sam", clinician_id: null },
  dashboard: {
    child: { id: "support-child", name: "Sam", child_name: "Sam" },
    supportCards: [],
    documentSupportCards: [],
    dailyActions: [],
    documents: [],
    logs: [],
    planGoals: [],
  },
  getParentDashboard: vi.fn(),
}));

vi.mock("@/lib/AuthContext", () => ({
  useAuth: () => ({ user: mocks.user, isAuthenticated: true, logout: vi.fn() }),
}));

vi.mock("@/components/parentfree/useParent", () => ({
  isSetupComplete: () => true,
  useSelectedChild: () => ({
    children: [mocks.child],
    selected: mocks.child,
    select: vi.fn(),
  }),
}));

vi.mock("@workspace/api-client-react", () => ({
  getParentBehaviors: () => [],
  getParentDashboard: mocks.getParentDashboard,
  getStarterLibrary: vi.fn().mockResolvedValue([]),
  parentBehaviorIdentity: (behavior) => behavior?.behaviorName || behavior?.name || "",
  useGetParentDashboard: () => ({ data: mocks.dashboard, isLoading: false, isError: false }),
  getGetParentDashboardQueryKey: () => ["parent-dashboard", mocks.child.id],
  useGetStarterLibrary: () => ({ data: [], isLoading: false }),
  useGetParentCareTeam: () => ({ data: { assignments: [] }, isError: false }),
  getGetParentCareTeamQueryKey: () => ["parent-care-team", mocks.child.id],
  saveCareTeamPracticeProgress: vi.fn(),
  recordCareTeamPractice: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/components/navigation/RoleAwareShell", () => ({
  default: ({ children }) => <div data-testid="role-aware-shell">{children}</div>,
}));

vi.mock("@/components/parentfree/DailySupportHome", () => ({
  default: () => <div>Today’s support</div>,
}));

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.clearAllMocks();
});

describe("Parent Home Help Now entry", () => {
  it("opens, closes, and reopens the support dialog from the visible Home button", async () => {
    mocks.getParentDashboard.mockResolvedValue({
      ...mocks.dashboard,
      safetyPlan: null,
    });

    render(
      <MemoryRouter initialEntries={["/ParentHome"]}>
        <ParentHome />
      </MemoryRouter>,
    );

    const expectVisibleSupportMenu = async () => {
      const heading = await screen.findByRole("heading", { name: "Need support right now?" });
      const dialog = heading.closest('[role="dialog"]');
      expect(dialog?.getAttribute("aria-modal")).toBe("true");
      await waitFor(() => {
        expect(Number(getComputedStyle(dialog).opacity)).toBeGreaterThan(0.05);
      });
      return dialog;
    };

    await expectVisibleSupportMenu();
    fireEvent.click(screen.getByTestId("button-help-dashboard"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const helpButton = screen.getByTestId("button-dashboard-help-now");
    fireEvent.click(helpButton);

    await expectVisibleSupportMenu();
    expect(screen.getByRole("button", { name: /Help With a Behavior/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close support" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(helpButton);
    await expectVisibleSupportMenu();
  });
});
