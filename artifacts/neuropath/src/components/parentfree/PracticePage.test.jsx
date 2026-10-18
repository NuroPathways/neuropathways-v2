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

    expect(screen.getByText("Practice With Sam")).toBeTruthy();
    expect(screen.queryByText("Learn Why")).toBeNull();
    fireEvent.click(screen.getByTestId("button-start-action-a"));
    for (const name of ["Understand", "See an Example", "Try Together", "Reflect"]) expect(screen.queryByText(name)).toBeNull();
    expect(screen.getByText("Show the saved visual.")).toBeTruthy();
    expect(screen.queryByText("Wait for the child to respond.")).toBeNull();
    expect(screen.getByText("Step 1 of 2")).toBeTruthy();
    expect(screen.getByText(/Related goal:/)).toBeTruthy();
    expect(screen.getByTestId("details-why").textContent).toContain("A preview can make the next step more predictable.");
    fireEvent.click(screen.getByTestId("button-step-next"));
    expect(screen.getByText("Wait for the child to respond.")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-step-back"));
    expect(screen.getByText("Show the saved visual.")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-exit-practice"));
    fireEvent.click(screen.getByTestId("practice-view-my-routines"));
    expect(screen.getByText("Create a visual routine")).toBeTruthy();
    expect(screen.getByText("No routines saved")).toBeTruthy();
  });
  it("shows a closed activity as read-only review without saving progress", async () => {
    const api = await import("@workspace/api-client-react");
    api.updateParentPracticeProgress.mockClear();
    const action = { id: "a1", title: "Calm corner", description: "d", whyItMayHelp: "w", steps: ["one", "two"], status: "done", currentStep: 4, estimatedMinutes: 5, sourceType: "starter_template", behaviorName: "Transitions", bookmarked: false };
    renderPractice(<PracticePage childId="c1" childName="River" actions={[action]} initialActionId="a1" />);
    expect(screen.getByTestId("practice-closed-review")).toBeTruthy();
    expect(screen.queryByTestId("button-pause-practice")).toBeNull();
    fireEvent.click(screen.getByTestId("button-back-closed-practice"));
    expect(api.updateParentPracticeProgress).not.toHaveBeenCalled();
    expect(screen.getByTestId("practice-activity-a1")).toBeTruthy();
  });

  it("makes feedback optional after Finish and saves the selected update", async () => {
    const api = await import("@workspace/api-client-react");
    api.logParentDailyAction.mockClear(); api.updateParentPracticeProgress.mockClear();
    const action = { id: "a2", title: "First-Then", description: "d", steps: ["Only step"], status: "not_started", currentStep: 0, estimatedMinutes: 3, behaviorName: "Transitions" };
    renderPractice(<PracticePage childId="c1" childName="River" actions={[action]} />);
    fireEvent.click(screen.getByTestId("button-start-a2"));
    fireEvent.click(screen.getByTestId("button-step-finish"));
    expect(screen.getByText("How did it go?")).toBeTruthy();
    expect(screen.getByTestId("button-save-update").disabled).toBe(true);
    fireEvent.click(screen.getByTestId("button-outcome-partially"));
    expect(screen.getByText("We needed support")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-save-update"));
    await vi.waitFor(() => expect(api.logParentDailyAction).toHaveBeenCalledWith("c1", "a2", { eventType: "outcome", outcome: "partially" }, expect.anything()));
  });

  it("hides generic why-text and the care team section when there are no published assignments", () => {
    const action = { id: "a3", title: "Play", description: "d", whyItMayHelp: "This activity helps improve this skill.", steps: ["x"], status: "not_started" };
    renderPractice(<PracticePage childId="c1" childName="River" actions={[action]} assignedActivities={[{ id: "d1", childId: "c1", title: "Draft only", status: "draft", steps: [] }]} />);
    expect(screen.queryByTestId("section-care-team")).toBeNull();
    expect(screen.queryByText(/No care team/i)).toBeNull();
    fireEvent.click(screen.getByTestId("button-start-a3"));
    expect(screen.queryByTestId("details-why")).toBeNull();
  });

  it("shows only this child's published assignments and records outcome with contract mapping", async () => {
    const onRecord = vi.fn(async () => {});
    const assigned = [
      { id: "as1", childId: "c1", title: "AAC Break Request Practice", description: "Practice a break request.", skill: "Communication", estimatedMinutes: 5, steps: ["Make the device available.", "Model the request."], status: "published", version: 2, goalTitle: "Ask for a Break" },
      { id: "as2", childId: "c2", title: "Other child", steps: [], status: "published", version: 1 },
      { id: "as3", childId: "c1", title: "Paused one", steps: [], status: "paused", version: 1 },
    ];
    renderPractice(<PracticePage childId="c1" childName="John" actions={[]} assignedActivities={assigned} onRecordAssignedPractice={onRecord} feedbackVisibility="Visible only with sharing on." />);
    expect(screen.getByTestId("section-care-team")).toBeTruthy();
    expect(screen.getByText("Activities your care team has selected for John.")).toBeTruthy();
    expect(screen.queryByText("Other child")).toBeNull();
    expect(screen.queryByText("Paused one")).toBeNull();
    fireEvent.click(screen.getByTestId("button-start-as1"));
    expect(screen.getByTestId("badge-care-team")).toBeTruthy();
    expect(screen.getByText("Make the device available.")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-step-next"));
    fireEvent.click(screen.getByTestId("button-step-finish"));
    expect(screen.getByTestId("text-feedback-visibility").textContent).toBe("Visible only with sharing on.");
    fireEvent.click(screen.getByTestId("button-outcome-used_skill"));
    fireEvent.click(screen.getByTestId("button-save-update"));
    await vi.waitFor(() => expect(onRecord).toHaveBeenCalledWith(expect.objectContaining({ id: "as1" }), { outcome: "used_skill", note: "" }));
  });

  it("leaves the visible page title to the host header when hideTitle is set", () => {
    renderPractice(<PracticePage childId="c1" childName="River" actions={[]} hideTitle />);
    expect(screen.getByTestId("text-practice-title").className).toContain("sr-only");
    expect(screen.queryByText("Simple activities and routines you can try together.")).toBeNull();
  });

  it("only offers the six practice categories that have content", () => {
    const mk = (id, title) => ({ id, title, steps: ["x"], status: "not_started" });
    renderPractice(<PracticePage childId="c1" childName="River" actions={[mk("1", "a"), mk("2", "b"), mk("3", "c"), mk("4", "Morning routine"), mk("5", "Turn-taking game")]} />);
    expect(screen.getByTestId("filter-category-daily-routines")).toBeTruthy();
    expect(screen.getByTestId("filter-category-playing-together")).toBeTruthy();
    expect(screen.queryByTestId("filter-category-safety-skills")).toBeNull();
    fireEvent.click(screen.getByTestId("filter-category-daily-routines"));
    expect(screen.queryByTestId("practice-activity-5")).toBeNull();
    expect(screen.getByTestId("practice-activity-4")).toBeTruthy();
  });

  it("lists bookmarked care-team activities in Saved Activities once and resumes the same assignment", () => {
    const item = { id: "as1", childId: "c1", title: "AAC Break Request Practice", steps: ["One", "Two", "Three"], status: "published", version: 4, currentStep: 1, bookmarked: true };
    renderPractice(<PracticePage childId="c1" childName="John" actions={[]} assignedActivities={[item]} onSaveAssigned={vi.fn()} />);
    fireEvent.click(screen.getByTestId("practice-view-saved-activities"));
    expect(screen.getAllByTestId("practice-activity-as1")).toHaveLength(1);
    fireEvent.click(screen.getByTestId("button-start-as1"));
    expect(screen.getByTestId("text-current-step").textContent).toBe("Two");
    expect(screen.getByTestId("badge-care-team")).toBeTruthy();
  });

  it("saves an assigned activity for later at the current step, not the stale opened position", async () => {
    const onSave = vi.fn(async () => {});
    const onProgress = vi.fn(async () => {});
    const item = { id: "as1", childId: "c1", title: "AAC", steps: ["One", "Two", "Three"], status: "published", version: 4, currentStep: 0, bookmarked: false };
    const { rerender } = renderPractice(<PracticePage childId="c1" childName="John" actions={[]} assignedActivities={[item]} onSaveAssigned={onSave} onAssignedProgress={onProgress} />);
    fireEvent.click(screen.getByTestId("button-start-as1"));
    fireEvent.click(screen.getByTestId("button-step-next"));
    fireEvent.click(screen.getByTestId("button-step-next"));
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ id: "as1", version: 4, currentStep: 2 }), 2);
    // A background refetch with older data must not reset the open activity.
    rerender(<QueryClientProvider client={new QueryClient()}><PracticePage childId="c1" childName="John" actions={[]} assignedActivities={[{ ...item, currentStep: 0, bookmarked: true }]} onSaveAssigned={onSave} onAssignedProgress={onProgress} /></QueryClientProvider>);
    expect(screen.getByTestId("text-current-step").textContent).toBe("Three");
    fireEvent.click(screen.getByTestId("button-pause-practice"));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: "as1", version: 4, currentStep: 2, bookmarked: true }), { currentStep: 2, bookmarked: true }));
  });

  it("shows a retryable error instead of hiding care-team activities when loading fails", () => {
    const onRetry = vi.fn();
    renderPractice(<PracticePage childId="c1" childName="John" actions={[]} careError="Care team activities could not load." onRetryCare={onRetry} />);
    expect(screen.getByTestId("section-care-team-error")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-retry"));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("opens Preferences directly when requested", () => {
    renderPractice(<PracticePage childId="c1" childName="River" actions={[]} initialView="My Routines" />);
    expect(screen.getByText("River's preferences")).toBeTruthy();
  });
});
