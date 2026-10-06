import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ParentGoalsTab from "./ParentGoalsTab";

const goalMocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  refreshParent: vi.fn(),
  invalidateQueries: vi.fn(),
}));

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getGetParentDashboardQueryKey: (childId) => ["parent-dashboard", childId],
    useRecordParentGoalFeedback: () => ({
      isPending: false,
      mutate: goalMocks.mutate,
    }),
  };
});

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: goalMocks.invalidateQueries }),
}));

vi.mock("@/lib/AuthContext", () => ({
  useAuth: () => ({ refreshParent: goalMocks.refreshParent }),
}));

vi.mock("@/lib/parentSession", () => ({
  parentRequest: () => ({}),
}));

vi.mock("./BehaviorLibrary", () => ({
  default: () => <div data-testid="behavior-library-placeholder" />,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ParentGoalsTab", () => {
  it("shows per-goal thumbs check-ins and records the selected caregiver rating", () => {
    render(
      <ParentGoalsTab
        child={{ id: "child-1", name: "Sam" }}
        behaviors={[{
          behaviorKey: "elopement",
          customBehavior: null,
          behaviorName: "Leaving the area",
          goal: "Stay near an adult",
          goalRating: null,
          goalRatingAt: null,
        }]}
        cards={[]}
        allCards={[]}
      />,
    );

    expect(screen.getByText("Stay near an adult")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Going well for Leaving the area" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Needs support for Leaving the area" })).toBeTruthy();
    expect(screen.getByTestId("button-add-goal")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Going well for Leaving the area" }));

    expect(goalMocks.mutate.mock.calls[0][0]).toEqual({
      childId: "child-1",
      data: {
        behaviorKey: "elopement",
        goal: "Stay near an adult",
        rating: "positive",
      },
    });
  });
});
