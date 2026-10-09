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
});
