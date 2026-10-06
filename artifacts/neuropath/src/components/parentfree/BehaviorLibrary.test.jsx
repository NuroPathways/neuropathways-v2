import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import BehaviorLibrary from "./BehaviorLibrary";

const libraryMocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  refreshParent: vi.fn(),
  invalidateQueries: vi.fn(),
}));

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useGetStarterLibrary: () => ({
      data: [{
        key: "transition",
        name: "Transitions",
        description: "Support with changes between activities.",
        relatedGoals: ["Use a visual schedule"],
      }],
      isLoading: false,
      isError: false,
    }),
    useUpdateParentChild: () => ({
      mutate: libraryMocks.mutate,
      isPending: false,
    }),
  };
});

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: libraryMocks.invalidateQueries }),
}));

vi.mock("@/lib/AuthContext", () => ({
  useAuth: () => ({ refreshParent: libraryMocks.refreshParent }),
}));

vi.mock("@/lib/parentSession", () => ({
  parentRequest: () => ({}),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("BehaviorLibrary", () => {
  it("prefills an added behavior with the explicit goal found in an uploaded plan", () => {
    render(
      <BehaviorLibrary
        child={{ id: "child-1", behaviors: [] }}
        allCards={[{
          id: "plan-transition",
          behaviorKey: "transition",
          behaviorName: "Transitions",
          source: "parent_document",
          planGoal: "Move between activities with one reminder",
        }]}
        onEdit={() => {}}
      />,
    );

    fireEvent.click(screen.getByTestId("button-add-starter:transition"));

    expect(screen.getByTestId("input-add-goal-starter:transition").value)
      .toBe("Move between activities with one reminder");
  });

  it("does not invent a starting goal when a plan has no explicit plan goal", () => {
    render(
      <BehaviorLibrary
        child={{ id: "child-1", behaviors: [] }}
        allCards={[{
          id: "plan-transition",
          behaviorKey: "transition",
          behaviorName: "Transitions",
          source: "parent_document",
          goal: "Older plan guidance goal",
          planGoal: null,
        }]}
        onEdit={() => {}}
      />,
    );

    fireEvent.click(screen.getByTestId("button-add-starter:transition"));

    expect(screen.getByTestId("input-add-goal-starter:transition").value).toBe("");
  });
});
