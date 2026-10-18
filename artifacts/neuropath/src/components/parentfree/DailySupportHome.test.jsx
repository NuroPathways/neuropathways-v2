import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import DailySupportHome from "./DailySupportHome";
import { cardIdentity } from "./progress";

const homeMocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  log: vi.fn(),
  update: vi.fn(),
  busy: false,
}));

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getGetParentDashboardQueryKey: (childId) => ["parent-dashboard", childId],
    useLogParentDailyAction: () => ({ isPending: false, variables: null, mutate: homeMocks.log }),
    useUpdateParentDailyAction: () => ({ isPending: homeMocks.busy, variables: { actionId: "a1" }, mutate: homeMocks.update }),
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
  homeMocks.busy = false;
});

describe("DailySupportHome", () => {
  it("keeps weekly notes and preparation on Home without embedding the separate Practice page", () => {
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
    expect(screen.queryByRole("heading", { name: "Practice This Skill" })).toBeNull();
    expect(screen.queryByText("Ask for a break.")).toBeNull();
    expect(screen.getAllByText("Starter support").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Review support steps" }));
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
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
    expect(screen.queryByText("Starting a task")).toBeNull();
    expect(screen.queryByText(/○|✓/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try Today" }));
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "We struggled" })).toBeTruthy();
    expect(screen.getByText("Starting a task")).toBeTruthy();
    expect(screen.getByText(/If it gets hard: Make the step smaller/)).toBeTruthy();
  });
});

const savedAction = {
  id: "a1", childId: "child-a", kind: "task", title: "Saved activity",
  behaviorName: "Transitions", estimatedMinutes: 3, status: "not_started",
  sourceType: "starter_template", description: "Use the saved plan. Stop if unsafe.",
  steps: ["Skill practiced: Saved replacement skill", "An unchanged first step."],
  whyItMayHelp: "Existing explanation.",
};
const support = {
  id: "support-a", source: "starter", behaviorKey: "transitions",
  behaviorName: "Transitions", prevention: ["An unchanged preparation step."],
};
function renderHome(overrides = {}) {
  const props = {
    childId: "child-a", childName: "Sam", actions: [savedAction], cards: [support],
    logs: [], selectedId: cardIdentity(support),
    ...Object.fromEntries(["onSelectBehavior", "onOpenSteps", "onOpenLibrary", "onLog",
      "onUpload", "onAddBehavior", "onGoals", "onEditProfile", "onAsk"].map(key => [key, vi.fn()])),
    ...overrides,
  };
  render(<DailySupportHome {...props} />);
  return props;
}
const openActivity = () => fireEvent.click(screen.getByTestId("button-home-activity-a1"));

describe("Home redesign preservation", () => {
  it.each(["used_skill", "not_yet", "partially"])("keeps the %s request contract", outcome => {
    renderHome(); openActivity();
    fireEvent.click(screen.getByTestId(`button-outcome-a1-${outcome}`));
    expect(homeMocks.log).toHaveBeenCalledWith({
      childId: "child-a", actionId: "a1", data: { eventType: "outcome", outcome },
    }, expect.objectContaining({ onError: expect.any(Function), onSuccess: expect.any(Function) }));
  });

  it.each([
    ["not_started", "Save for Later", "saved_for_later"],
    ["saved_for_later", "Move to Today", "not_started"],
  ])("keeps status changes from %s", (status, label, next) => {
    renderHome({ actions: [{ ...savedAction, status }] }); openActivity();
    fireEvent.click(screen.getByRole("button", { name: label, exact: true }));
    expect(homeMocks.update).toHaveBeenCalledWith({
      childId: "child-a", actionId: "a1", data: { status: next },
    }, expect.any(Object));
  });

  it("refreshes the same child's dashboard after saving", async () => {
    renderHome(); openActivity();
    fireEvent.click(screen.getByRole("button", { name: "Save for Later", exact: true }));
    await homeMocks.update.mock.calls[0][1].onSuccess({});
    expect(homeMocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["parent-dashboard", "child-a"] });
  });

  it("keeps safety/review notes visible without opening and blocks review outcomes", () => {
    renderHome({ actions: [{ ...savedAction, status: "needs_review" }] });
    expect(screen.getByText(savedAction.description)).toBeTruthy();
    expect(screen.getByText(/Only try activities that feel safe/)).toBeTruthy();
    expect(screen.getByText(/Ask your clinician which plan step/)).toBeTruthy();
    openActivity();
    expect(screen.queryByTestId("button-outcome-a1-used_skill")).toBeNull();
  });

  it("preserves feedback and notes in the compact preview", () => {
    renderHome({ actions: [{ ...savedAction, status: "done", logs: [{ outcome: "used_skill", note: "Existing observation" }] }] });
    expect(screen.getByTestId("text-action-feedback-a1").textContent).toContain("Existing observation");
    expect(screen.queryByTestId("button-outcome-a1-used_skill")).toBeNull();
  });

  it("shows save errors and disables duplicate save clicks", () => {
    homeMocks.update.mockImplementationOnce((_variables, options) => options.onError(new Error("Could not save this action")));
    renderHome(); openActivity();
    fireEvent.click(screen.getByRole("button", { name: "Save for Later", exact: true }));
    expect(screen.getByText("Could not save this action")).toBeTruthy();
    cleanup(); homeMocks.busy = true; renderHome(); openActivity();
    expect(screen.getByRole("button", { name: "Save for Later", exact: true }).disabled).toBe(true);
    expect(screen.getByTestId("button-outcome-a1-used_skill").disabled).toBe(true);
  });

  it("retains all Home shortcut callbacks and preparation instructions", () => {
    const props = renderHome();
    for (const [label, callback] of [
      ["Quick Log", "onLog"], ["Upload a Plan", "onUpload"], ["Ask NeuroPathways", "onAsk"],
      ["Support Library", "onOpenLibrary"], ["Manage Goals", "onGoals"],
      ["Edit Child Profile", "onEditProfile"], ["Add a Behavior", "onAddBehavior"],
    ]) {
      fireEvent.click(screen.getAllByRole("button", { name: label, exact: true })[0]);
      expect(props[callback]).toHaveBeenCalledOnce();
    }
    fireEvent.click(screen.getByRole("button", { name: "Review support steps" }));
    expect(props.onOpenSteps).toHaveBeenCalledWith(support);
    fireEvent.click(screen.getByRole("button", { name: "Open support steps" }));
    expect(props.onOpenSteps).toHaveBeenCalledTimes(2);
    expect(screen.getByText("An unchanged preparation step.")).toBeTruthy();
  });

  it("preserves separate behavior selection and all saved activity previews", () => {
    const second = { ...support, id: "support-b", behaviorKey: "communication", behaviorName: "Communication" };
    const props = renderHome({
      cards: [support, second],
      actions: [1, 2, 3, 4].map(n => ({ ...savedAction, id: `a${n}`, title: `Activity ${n}` })),
    });
    fireEvent.click(screen.getByRole("button", { name: "Set focus" }));
    expect(props.onSelectBehavior).toHaveBeenCalledWith(cardIdentity(second));
    expect(screen.getByRole("heading", { name: "Transitions" })).toBeTruthy();
    expect(screen.queryByText("Activity 4")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "See More Activities" }));
    expect(screen.getByText("Activity 4")).toBeTruthy();
  });

  it("keeps empty-state destinations and does not fabricate progress", () => {
    const props = renderHome({ actions: [], cards: [] });
    fireEvent.click(screen.getByRole("button", { name: "Choose a Goal" }));
    fireEvent.click(screen.getByRole("button", { name: "Read a Plan" }));
    expect(props.onGoals).toHaveBeenCalledOnce();
    expect(props.onUpload).toHaveBeenCalledOnce();
    expect(screen.getByText(/Your notes are optional observations, not clinical findings/)).toBeTruthy();
  });

  it("puts Prepare before This Week in reading order", () => {
    renderHome();
    const prepare = screen.getByRole("heading", { name: "Prepare", exact: true });
    const week = screen.getByRole("heading", { name: "This Week", exact: true });
    expect(prepare.compareDocumentPosition(week) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
