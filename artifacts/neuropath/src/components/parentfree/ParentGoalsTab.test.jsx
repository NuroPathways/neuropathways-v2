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

  it("shows goals and practice milestones discovered in plans even before a parent selects them", () => {
    render(
      <ParentGoalsTab
        child={{ id: "child-1", name: "John" }}
        behaviors={[]}
        cards={[]}
        allCards={[{
          id: "plan-break-goal",
          behaviorKey: "custom",
          behaviorName: "Requesting breaks",
          source: "parent_document",
          planGoal: "John will request a break independently during homework.",
          planGoalSourceReferences: [{ documentId: "plan-1", title: "Behavior plan" }],
          dailyActivities: [{
            title: "Practice requesting a break",
            routineContext: "During homework",
            skill: "Ask for a break before prompting",
            reinforcement: "Provide the planned break",
          }],
        }]}
        dailyActions={[]}
      />,
    );

    expect(screen.getByTestId("goals-found-in-plan")).toBeTruthy();
    expect(screen.getByText("John will request a break independently during homework.")).toBeTruthy();
    expect(screen.getByText("Practice requesting a break")).toBeTruthy();
    expect(screen.getByText(/Provide the planned break/)).toBeTruthy();
    expect(screen.getByText(/Behavior plan/)).toBeTruthy();
  });

  it("shows clinician-report goals and their extracted milestones without treating them as progress", () => {
    render(
      <ParentGoalsTab
        child={{ id: "child-1", name: "John" }}
        behaviors={[]}
        cards={[]}
        allCards={[]}
        planGoals={[{
          id: "report-goal-1",
          title: "Request a break during homework",
          description: "Ask to pause before leaving the work area.",
          milestones: [
            "Use the break card before the first homework task.",
            "Return to the next task after the planned break.",
          ],
          sourceType: "clinician_uploaded_plan",
        }]}
        dailyActions={[{
          id: "daily-report-goal-1",
          kind: "task",
          supportCardId: null,
          sourceType: "clinician_uploaded_plan",
          behaviorName: "Request a break during homework",
          title: "Practice: Use the break card",
          description: "This is a milestone read from the plan.",
        }]}
      />,
    );

    expect(screen.getByTestId("plan-goal-report-goal-1")).toBeTruthy();
    expect(screen.getByText("From a clinician-uploaded document")).toBeTruthy();
    expect(screen.getByText("Use the break card before the first homework task.")).toBeTruthy();
    expect(screen.getByText("Return to the next task after the planned break.")).toBeTruthy();
    expect(screen.getByText("Practice: Use the break card")).toBeTruthy();
  });
});
