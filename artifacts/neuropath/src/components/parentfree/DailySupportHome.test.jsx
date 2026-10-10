import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import DailySupportHome from "./DailySupportHome";
import { cardIdentity } from "./progress";

const homeMocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  log: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getGetParentDashboardQueryKey: (childId) => ["parent-dashboard", childId],
    useLogParentDailyAction: () => ({ isPending: false, variables: null, mutate: homeMocks.log }),
    useUpdateParentDailyAction: () => ({ isPending: false, variables: null, mutate: homeMocks.update }),
  };
});

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: homeMocks.invalidateQueries }),
}));

vi.mock("@/lib/parentSession", () => ({
  parentRequest: () => ({}),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DailySupportHome", () => {
  it("shows direct-mode weekly notes, preparation and a sourced skill from starter support", () => {
    const card = {
      id: "starter-task-refusal",
      behaviorKey: "task_refusal",
      behaviorName: "Task refusal",
      source: "starter",
      prevention: ["Offer a small choice."],
      replacementSkill: "Ask for a break.",
      reinforcementIdea: "Notice the first attempt.",
    };
    const openSteps = vi.fn();
    render(
      <DailySupportHome
        childId="child-1"
        childName="Sam"
        cards={[card]}
        selectedId={cardIdentity(card)}
        logs={[{ happened: true, createdAt: new Date().toISOString() }]}
        onOpenSteps={openSteps}
        onLog={vi.fn()}
        onUpload={vi.fn()}
        onAsk={vi.fn()}
        onOpenLibrary={vi.fn()}
        onGoals={vi.fn()}
        onEditProfile={vi.fn()}
        onAddBehavior={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "This Week" })).toBeTruthy();
    expect(screen.getByText("1 logged")).toBeTruthy();
    expect(screen.getByText(/This is starter support based on the behavior you selected/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Prepare" })).toBeTruthy();
    expect(screen.getByText("Offer a small choice.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Practice This Skill" })).toBeTruthy();
    expect(screen.getByText("Ask for a break.")).toBeTruthy();
    expect(screen.getAllByText("Starter support").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Open skill steps" }));
    expect(openSteps).toHaveBeenCalledWith(card);
  });

  it("shows actionable daily activities with plain outcome labels and expandable steps", () => {
    const action = {
      id: "daily-action-1",
      childId: "child-1",
      kind: "task",
      status: "not_started",
      behaviorName: "Task refusal",
      title: "One-Step Start",
      description: "Choose one tiny part of a familiar task and notice any attempt.",
      whyItMayHelp: "Practices starting one manageable step.",
      steps: ["Skill practiced: Starting a task", "If it gets hard: Make the step smaller or offer a break."],
      estimatedMinutes: 3,
      sourceType: "starter_template",
      sourceDocumentId: null,
      logs: [],
    };
    render(
      <DailySupportHome
        childId="child-1"
        childName="Sam"
        actions={[action]}
        documents={[]}
        cards={[]}
        logs={[]}
      />,
    );

    expect(screen.getByRole("button", { name: "Try Today" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "We struggled" })).toBeTruthy();
    expect(screen.getByText("Starting a task")).toBeTruthy();
    expect(screen.queryByText(/○|✓/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try Today" }));
    expect(screen.getByText(/If it gets hard: Make the step smaller/)).toBeTruthy();
  });
});
