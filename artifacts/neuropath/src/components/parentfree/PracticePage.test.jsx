import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PracticePage, { ActivityGuide } from "./PracticePage";

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
  it("guides a parent through concise starter-activity steps and shows its finish, safety, and research context", async () => {
    const api = await import("@workspace/api-client-react");
    api.updateParentPracticeProgress.mockReset().mockResolvedValue({});
    const action = {
      id: "general-activity-1",
      childId: "child-a",
      actionKey: "task:general-starter:starter-practice-v1-puzzle-together",
      behaviorKey: null,
      behaviorName: "General activity",
      sourceType: "starter_template",
      sourceDocumentId: null,
      title: "Puzzle Together",
      description: "Optional general activity. Use a familiar puzzle.",
      steps: [
        "Start: Choose a familiar puzzle.",
        "Activity step 1: Invite your child to choose a piece.",
        "Activity step 2: Work on one piece together.",
        "Activity step 3: Pause when your child is done.",
        "Skill practiced: Shared play",
        "Finish: Finish after a few pieces.",
        "Pause or stop if: Stop if the activity is uncomfortable.",
        "Materials: A familiar puzzle.",
      ],
      activityDetails: {
        category: "Playing Together",
        skill: "Shared play",
        relatedGoal: null,
        startAction: "Choose a familiar puzzle and place it within easy reach.",
        materials: ["A familiar puzzle with safe pieces."],
        steps: [
          "Invite your child to choose a piece.",
          "Work on one piece together, or watch if they prefer.",
          "Pause when your child changes activities or signals they are done.",
        ],
        ending: "Finish after a few pieces or whenever your child is ready.",
        ifDifficult: "Pause or put the puzzle away if it becomes uncomfortable.",
        researchNote: "Research informs activity design, not treatment effectiveness.",
        evidenceReferences: [{
          key: "play-review",
          title: "A review of play-based activities",
          url: "https://example.org/review",
          publishedYear: 2021,
          evidenceType: "Scoping review",
          designImplication: "Keep activities accessible and child-led.",
          limitation: "The review does not establish that this template is effective treatment.",
        }],
      },
      estimatedMinutes: 5,
      status: "not_started",
      currentStep: 0,
    };
    renderPractice(<PracticePage childId="child-a" childName="Sam" actions={[action]} />);

    expect(screen.getByText("General starter support — not individualized")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-start-general-activity-1"));
    expect(screen.getByText("Related skill: Shared play")).toBeTruthy();
    expect(screen.getByText("Choose a familiar puzzle and place it within easy reach.")).toBeTruthy();
    expect(screen.getByText("A familiar puzzle with safe pieces.")).toBeTruthy();
    expect(screen.getByText("Step 1 of 3")).toBeTruthy();
    expect(screen.getByText("Invite your child to choose a piece.")).toBeTruthy();
    expect(screen.queryByText("Activity step 1: Invite your child to choose a piece.")).toBeNull();
    expect(screen.getByTestId("details-if-difficult").textContent).toContain("Pause or put the puzzle away");

    fireEvent.click(screen.getByTestId("button-step-next"));
    fireEvent.click(screen.getByTestId("button-step-next"));
    expect(screen.getByText("Step 3 of 3")).toBeTruthy();
    expect(screen.getByTestId("activity-ending").textContent).toContain("Finish after a few pieces");
    await vi.waitFor(() => expect(api.updateParentPracticeProgress).toHaveBeenLastCalledWith(
      "child-a", "general-activity-1", { currentStep: 4, bookmarked: false }, expect.anything(),
    ));
    fireEvent.click(screen.getByText("Research background"));
    expect(screen.getByText(/does not establish that this template is effective treatment/i)).toBeTruthy();
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

  it("shows the accurate source label on a practice card before it is opened", () => {
    const action = {
      id: "source-card", title: "Practice a transition", description: "Use the saved visual.",
      sourceType: "parent_uploaded_plan", sourceDocumentId: "plan-1",
      steps: ["Show the visual."], status: "not_started", estimatedMinutes: 4,
    };
    renderPractice(<PracticePage childId="c1" actions={[action]} documents={[{ id: "plan-1", title: "Family transition plan" }]} />);
    expect(screen.getByTestId("practice-source-source-card").textContent)
      .toBe("Based on your uploaded plan · not clinician-reviewed · Family transition plan");
    expect(screen.getByTestId("practice-activity-source-card").textContent).toContain("4 minutes");
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

describe("Practice presentation and persistence preservation", () => {
  const action = {
    id: "practice-preservation", childId: "child-a", title: "Familiar practice",
    description: "Keep the existing safety description visible.",
    steps: ["First saved step", "Second saved step", "Third saved step"],
    behaviorKey: "transitions", behaviorName: "Transitions", sourceType: "parent_uploaded_plan",
    sourceDocumentId: "doc-a", status: "not_started", currentStep: 0,
    ifDifficult: "Stop if this is unsafe.", estimatedMinutes: 4,
  };
  beforeEach(async () => {
    const api = await import("@workspace/api-client-react");
    api.updateParentPracticeProgress.mockReset().mockResolvedValue({});
    api.logParentDailyAction.mockReset().mockResolvedValue({});
  });

  it("saves the current daily step rather than the stale position supplied when opened", async () => {
    const api = await import("@workspace/api-client-react");
    renderPractice(<PracticePage childId="child-a" actions={[action]} />);
    fireEvent.click(screen.getByTestId(`button-start-${action.id}`));
    fireEvent.click(screen.getByTestId("button-step-next"));
    fireEvent.click(screen.getByTestId("button-step-next"));
    fireEvent.click(screen.getByTestId("button-pause-practice"));
    await vi.waitFor(() => expect(api.updateParentPracticeProgress).toHaveBeenLastCalledWith(
      "child-a", action.id, { currentStep: 4, bookmarked: true }, expect.anything(),
    ));
    expect(screen.queryByTestId(`practice-detail-${action.id}`)).toBeNull();
  });

  it("waits for older step writes before sending Save for later", async () => {
    const api = await import("@workspace/api-client-react");
    let release;
    api.updateParentPracticeProgress.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    renderPractice(<PracticePage childId="child-a" actions={[action]} />);
    fireEvent.click(screen.getByTestId(`button-start-${action.id}`));
    fireEvent.click(screen.getByTestId("button-step-next"));
    await vi.waitFor(() => expect(api.updateParentPracticeProgress).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByTestId("button-step-next"));
    fireEvent.click(screen.getByTestId("button-pause-practice"));
    expect(api.updateParentPracticeProgress).toHaveBeenCalledOnce();
    expect(screen.getByTestId("button-pause-practice").disabled).toBe(true);
    release({});
    await vi.waitFor(() => expect(api.updateParentPracticeProgress).toHaveBeenCalledTimes(3));
    expect(api.updateParentPracticeProgress.mock.calls.map((call) => call[2])).toEqual([
      { currentStep: 3, bookmarked: false },
      { currentStep: 4, bookmarked: false },
      { currentStep: 4, bookmarked: true },
    ]);
  });

  it.each(["used_skill", "partially", "not_yet"])("retains the %s outcome and trimmed notes contract", async (outcome) => {
    const api = await import("@workspace/api-client-react");
    renderPractice(<PracticePage childId="child-a" actions={[{ ...action, steps: ["One"] }]} />);
    fireEvent.click(screen.getByTestId(`button-start-${action.id}`));
    fireEvent.click(screen.getByTestId("button-step-finish"));
    fireEvent.click(screen.getByTestId(`button-outcome-${outcome}`));
    fireEvent.change(screen.getByTestId("input-practice-note"), { target: { value: "  Existing note  " } });
    fireEvent.click(screen.getByTestId("button-save-update"));
    await vi.waitFor(() => expect(api.logParentDailyAction).toHaveBeenCalledWith(
      "child-a", action.id, { eventType: "outcome", outcome, note: "Existing note" }, expect.anything(),
    ));
  });

  it("keeps failed feedback and notes on screen instead of leaving the guide", async () => {
    const api = await import("@workspace/api-client-react");
    api.logParentDailyAction.mockRejectedValueOnce(new Error("Could not save the update."));
    renderPractice(<PracticePage childId="child-a" actions={[{ ...action, steps: ["One"] }]} />);
    fireEvent.click(screen.getByTestId(`button-start-${action.id}`));
    fireEvent.click(screen.getByTestId("button-step-finish"));
    fireEvent.change(screen.getByTestId("input-practice-note"), { target: { value: "Keep this note" } });
    fireEvent.click(screen.getByTestId("button-save-update"));
    await screen.findByText("Could not save the update.");
    expect(screen.getByTestId("input-practice-note").value).toBe("Keep this note");
    expect(screen.getByTestId("practice-feedback")).toBeTruthy();
    expect(screen.getByTestId("button-save-update").disabled).toBe(false);
  });

  it("preserves source documents, related goal and history destinations and visible safety text", () => {
    const goal = vi.fn(), history = vi.fn();
    renderPractice(<PracticePage childId="child-a" actions={[action]} onGoals={goal} onHistory={history}
      child={{ behaviors: [{ behaviorKey: "transitions", goal: "Existing goal" }] }}
      documents={[{ id: "doc-a", title: "Existing uploaded plan" }]} />);
    fireEvent.click(screen.getByTestId(`button-start-${action.id}`));
    expect(screen.getByText(/Based on your uploaded plan · not clinician-reviewed · Existing uploaded plan/)).toBeTruthy();
    expect(screen.getByTestId("details-if-difficult").tagName).not.toBe("DETAILS");
    expect(screen.getByText("Stop if this is unsafe.")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-related-goal"));
    fireEvent.click(screen.getByRole("button", { name: "Practice history" }));
    expect(goal).toHaveBeenCalledOnce();
    expect(history).toHaveBeenCalledOnce();
  });

  it("keeps clinician preview outside the new parent-only presentation and disables saving", () => {
    const save = vi.fn();
    render(<ActivityGuide activity={action} childName="Sam" preview initialFinished onSaveUpdate={save} onSaveForLater={save} />);
    expect(screen.getByTestId(`practice-detail-${action.id}`).className).not.toContain("np-practice-guide-v4");
    expect(screen.queryByTestId("button-pause-practice")).toBeNull();
    expect(screen.getByTestId("button-save-update").disabled).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  it("keeps focus on the current instruction when Back disappears at the first step", () => {
    renderPractice(<PracticePage childId="child-a" actions={[action]} />);
    fireEvent.click(screen.getByTestId(`button-start-${action.id}`));
    expect(document.activeElement).toBe(screen.getByTestId("text-current-step"));
    fireEvent.click(screen.getByTestId("button-step-next"));
    const back = screen.getByTestId("button-step-back");
    back.focus();
    fireEvent.click(back);
    expect(screen.queryByTestId("button-step-back")).toBeNull();
    const instruction = screen.getByTestId("text-current-step");
    expect(document.activeElement).toBe(instruction);
    expect(document.getElementById(instruction.getAttribute("aria-describedby")).textContent).toBe("Step 1 of 3");
  });

  it("focuses feedback after Finish, returns to the instruction and does not steal note focus", () => {
    renderPractice(<PracticePage childId="child-a" actions={[{ ...action, steps: ["One"] }]} />);
    fireEvent.click(screen.getByTestId(`button-start-${action.id}`));
    fireEvent.click(screen.getByTestId("button-step-finish"));
    expect(document.activeElement).toBe(screen.getByText("How did it go?"));
    const notes = screen.getByTestId("input-practice-note");
    notes.focus();
    fireEvent.change(notes, { target: { value: "Still typing" } });
    expect(document.activeElement).toBe(notes);
    fireEvent.click(screen.getByTestId("button-feedback-back"));
    expect(document.activeElement).toBe(screen.getByTestId("text-current-step"));
  });
});
