import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PracticePage from "./PracticePage";

vi.mock("@workspace/api-client-react", () => ({
  getGetParentDashboardQueryKey: (id) => ["dashboard", id],
  logParentDailyAction: vi.fn(async () => ({})),
  updateParentPracticeProgress: vi.fn(async () => ({})),
  getGetParentFamilyToolsQueryKey: (id) => ["family-tools", id],
  saveParentFamilyTools: vi.fn(async (_id, data) => data),
  useGetParentFamilyTools: () => ({
    data: { routines: [], routineRuns: [], preferences: { favoriteActivities: [], favoriteThings: [], communicationMethods: [], comfortSensoryPreferences: [], dislikes: [] }, reminders: [], reminderDelivery: "unavailable" },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

afterEach(cleanup);
const renderPractice = (node) => render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);

describe("PracticePage", () => {
  it("shows the selected child's saved skill and opens its steps", () => {
    const onOpenSteps = vi.fn();
    const card = {
      id: "card-1",
      source: "starter",
      behaviorName: "Transitions",
      replacementSkill: "Ask for a short break",
      reinforcementIdea: "Offer a preferred book",
    };

    renderPractice(
      <PracticePage childName="Sam" card={card} onOpenSteps={onOpenSteps} onAddBehavior={() => {}} />,
    );

    expect(screen.getByTestId("panel-practice")).toBeTruthy();
    expect(screen.getByText("Ask for a short break")).toBeTruthy();
    expect(screen.getByText("Offer a preferred book")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open skill steps" }));
    expect(onOpenSteps).toHaveBeenCalledWith(card);
  });

  it("offers a path to add a behavior when the child has no practice card", () => {
    const onAddBehavior = vi.fn();

    renderPractice(
      <PracticePage childName="Sam" card={null} onOpenSteps={() => {}} onAddBehavior={onAddBehavior} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add a behavior" }));
    expect(onAddBehavior).toHaveBeenCalledOnce();
  });

  it("shows saved activity steps and a real empty routine editor", () => {
    const action = {
      id: "action-a",
      childId: "child-a",
      behaviorKey: "transitions",
      behaviorName: "Transitions",
      sourceType: "starter_template",
      sourceDocumentId: null,
      title: "A saved activity",
      description: "Use a familiar transition.",
      whyItMayHelp: "A preview can make the next step more predictable.",
      steps: ["Show the saved visual.", "Wait for the child to respond."],
      estimatedMinutes: 4,
      status: "not_started",
    };
    renderPractice(<PracticePage childId="child-a" childName="Sam" child={{ behaviors: [{ behaviorKey: "transitions", goal: "Move between activities" }] }} actions={[action]} />);

    fireEvent.click(screen.getByTestId("practice-activity-action-a"));
    expect(screen.getByText("A preview can make the next step more predictable.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try" }));
    expect(screen.getByText("Show the saved visual.")).toBeTruthy();
    expect(screen.getByText(/Goal: Move between activities/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("practice-view-my-routines"));
    expect(screen.getByText("Create a visual routine")).toBeTruthy();
    expect(screen.getByText("No routines saved")).toBeTruthy();
  });
});
