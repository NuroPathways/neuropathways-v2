import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import ClinicalGoals, { CareTeamGoalCard } from "./ClinicalGoals";

const api = vi.hoisted(() => ({
  goals: [], loading: false, error: false, care: { goals: [], assignments: [], recentPractice: [] },
  create: vi.fn(), update: vi.fn(), remove: vi.fn(), invalidate: vi.fn(),
}));
vi.mock("@workspace/api-client-react", async (original) => ({
  ...await original(),
  getGetParentGoalsQueryKey: (id) => ["parent-goals", id],
  getGetParentCareTeamQueryKey: (id) => ["care", id],
  useGetParentGoals: () => ({ data: api.goals, isLoading: api.loading, isError: api.error, error: new Error("Goals could not load."), refetch: vi.fn() }),
  useGetParentCareTeam: () => ({ data: api.care, isError: false }),
  useCreateParentGoal: () => ({ mutate: api.create, isPending: false }),
  useUpdateParentGoal: () => ({ mutate: api.update, isPending: false }),
  useDeleteParentGoal: () => ({ mutate: api.remove, isPending: false }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: api.invalidate }),
}));
vi.mock("@/lib/parentSession", () => ({ parentRequest: () => ({}) }));

const family = {
  id: "family-a", childId: "child-a", title: "Familiar break request",
  description: "Use the existing familiar signal.", progress: 2, target: 5,
  createdByClinician: false, source: "parent", canEdit: true, canDelete: true,
};
const published = {
  id: "care-a", childId: "child-a", title: "Ask for help", description: "Saved clinical description.",
  status: "published", skill: "Communication", milestones: ["First saved milestone"],
  measurement: "frequency", target: 10, progress: 3, linkedActivityIds: ["assignment-a"],
};
const mount = () => render(<ClinicalGoals childId="child-a" childName="Sam" presentation="phase5" />);
function openGoal(testId) {
  const card = screen.getByTestId(testId);
  let root = card;
  while (root && !root.querySelector("button[aria-expanded]")) root = root.parentElement;
  const trigger = root?.querySelector("button[aria-expanded]");
  expect(trigger).toBeTruthy();
  if (trigger.getAttribute("aria-expanded") !== "true") fireEvent.click(trigger);
  return { card, trigger };
}
beforeEach(() => {
  vi.clearAllMocks();
  api.goals = [{ ...family }];
  api.loading = false; api.error = false;
  api.care = { goals: [], assignments: [], recentPractice: [] };
});
afterEach(cleanup);

describe("Goals & Milestones action preservation", () => {
  it("creates a family goal with the existing trimmed payload and target", () => {
    mount();
    fireEvent.click(screen.getByTestId("button-new-family-goal"));
    fireEvent.change(screen.getByTestId("input-new-goal-title"), { target: { value: "  Existing objective  " } });
    fireEvent.change(screen.getByTestId("input-new-goal-description"), { target: { value: "  Details  " } });
    fireEvent.change(screen.getByTestId("input-new-goal-target"), { target: { value: "7" } });
    fireEvent.submit(screen.getByTestId("input-new-goal-title").closest("form"));
    expect(api.create.mock.calls[0][0]).toEqual({
      childId: "child-a", data: { title: "Existing objective", description: "Details", target: 7 },
    });
  });

  it("edits without changing progress and preserves the draft across detail close/reopen", () => {
    mount();
    const { trigger } = openGoal("goal-item-family-a");
    fireEvent.click(screen.getByTestId("button-goal-edit-family-a"));
    fireEvent.change(screen.getByTestId("input-edit-goal-family-a-title"), { target: { value: "Edited title" } });
    fireEvent.change(screen.getByTestId("input-edit-goal-family-a-description"), { target: { value: "Unsaved details" } });
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(screen.getByTestId("input-edit-goal-family-a-description").value).toBe("Unsaved details");
    fireEvent.submit(screen.getByTestId("input-edit-goal-family-a-title").closest("form"));
    expect(api.update.mock.calls[0][0]).toEqual({
      childId: "child-a", goalId: "family-a",
      data: { title: "Edited title", description: "Unsaved details", target: 5 },
    });
  });

  it("records one family practice using the same numeric update, not a clinical assessment", () => {
    mount();
    openGoal("goal-item-family-a");
    fireEvent.click(screen.getByTestId("button-goal-plus-family-a"));
    expect(api.update.mock.calls[0][0]).toEqual({
      childId: "child-a", goalId: "family-a", data: { progress: 3 },
    });
    expect(screen.getByTestId("text-goal-progress-family-a").textContent).toContain("Practice recorded: 2 of 5");
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("40");
  });

  it("requires confirmation and keeps the existing remove contract", () => {
    mount();
    const { card } = openGoal("goal-item-family-a");
    fireEvent.click(screen.getByTestId("button-goal-delete-family-a"));
    expect(api.remove).not.toHaveBeenCalled();
    fireEvent.click(within(card).getByRole("button", { name: "Keep" }));
    expect(screen.queryByTestId("button-goal-confirm-delete-family-a")).toBeNull();
    fireEvent.click(screen.getByTestId("button-goal-delete-family-a"));
    fireEvent.click(screen.getByTestId("button-goal-confirm-delete-family-a"));
    expect(api.remove.mock.calls[0][0]).toEqual({ childId: "child-a", goalId: "family-a" });
  });

  it("honors edit/delete permissions rather than inferring permissions from grouping", () => {
    api.goals = [
      { ...family, canEdit: false, canDelete: false },
      { ...family, id: "legacy-clinical", createdByClinician: true },
    ];
    mount();
    openGoal("goal-item-family-a");
    expect(screen.queryByTestId("button-goal-edit-family-a")).toBeNull();
    expect(screen.queryByTestId("button-goal-delete-family-a")).toBeNull();
    openGoal("goal-item-legacy-clinical");
    expect(screen.getByTestId("button-goal-edit-legacy-clinical")).toBeTruthy();
    expect(screen.queryByTestId("button-goal-plus-legacy-clinical")).toBeNull();
  });

  it("shows only published care-team records once, with milestones and linked assignments", () => {
    api.goals.push({ ...family, id: "care-a", source: "care_team" });
    api.care = {
      goals: [published, { ...published, id: "draft", title: "Unpublished title", status: "draft" }],
      assignments: [
        { id: "assignment-a", goalId: "care-a", title: "Published practice", status: "published" },
        { id: "paused", goalId: "care-a", title: "Paused practice", status: "paused" },
      ],
      recentPractice: [{ id: "record-a", goalId: "care-a", assignmentId: "assignment-a", title: "Published practice", outcome: "tried", createdAt: "2026-10-17T12:00:00Z", version: 1 }],
    };
    mount();
    expect(screen.getAllByTestId("care-goal-care-a")).toHaveLength(1);
    expect(screen.queryByTestId("goal-item-care-a")).toBeNull();
    expect(screen.queryByText("Unpublished title")).toBeNull();
    openGoal("care-goal-care-a");
    expect(screen.getByText("First saved milestone")).toBeTruthy();
    expect(screen.getByTestId("text-care-goal-participation-care-a").textContent).toBe("1 time");
    expect(screen.getByText("3 of 10 (recorded by your care team)")).toBeTruthy();
    expect(screen.getByTestId("link-start-assignment-assignment-a").getAttribute("href")).toBe("/ParentHome?tab=practice&assignment_id=assignment-a&child_id=child-a");
    expect(screen.queryByText("Paused practice")).toBeNull();
    expect(screen.queryByTestId("button-goal-edit-care-a")).toBeNull();
    expect(screen.queryByTestId("button-goal-delete-care-a")).toBeNull();
  });

  it("retains clinician preview's existing fully visible read-only presentation", () => {
    render(<CareTeamGoalCard goal={published} childId="child-a" />);
    expect(screen.getByText("First saved milestone")).toBeTruthy();
    expect(screen.getByText("Saved clinical description.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /view goal/i })).toBeNull();
    expect(api.update).not.toHaveBeenCalled();
  });

  it("keeps an unsuccessful edit and refreshes the same goal query after success", () => {
    mount();
    openGoal("goal-item-family-a");
    fireEvent.click(screen.getByTestId("button-goal-edit-family-a"));
    const title = screen.getByTestId("input-edit-goal-family-a-title");
    fireEvent.change(title, { target: { value: "Keep this draft" } });
    fireEvent.submit(title.closest("form"));
    const callbacks = api.update.mock.calls[0][1];
    act(() => callbacks.onError(new Error("The edit could not be saved.")));
    expect(screen.getByText("The edit could not be saved.")).toBeTruthy();
    expect(screen.getByTestId("input-edit-goal-family-a-title").value).toBe("Keep this draft");
    act(() => callbacks.onSuccess());
    expect(api.invalidate).toHaveBeenCalledWith({ queryKey: ["parent-goals", "child-a"] });
    expect(screen.queryByTestId("input-edit-goal-family-a-title")).toBeNull();
  });

  it("keeps the existing practice-target limit and capped participation bar", () => {
    api.goals = [{ ...family, progress: 6 }];
    mount();
    openGoal("goal-item-family-a");
    expect(screen.getByTestId("button-goal-plus-family-a").disabled).toBe(true);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
    expect(api.update).not.toHaveBeenCalled();
  });

  it("flags a technical title for source review without rewriting its saved record", () => {
    api.goals = [{ ...family, title: "F4 retest", description: "A saved description is available." }];
    mount();
    const { card } = openGoal("goal-item-family-a");
    expect(card.textContent).toMatch(/source.{0,30}review|review.{0,30}source/i);
    expect(card.textContent).toContain("F4 retest");
    expect(api.goals[0].title).toBe("F4 retest");
    expect(api.update).not.toHaveBeenCalled();
  });

  it.each(["loading", "error"])("keeps known behavior goals available when the separate goal query is %s", (state) => {
    api[state] = true;
    render(<ClinicalGoals childId="child-a" presentation="phase5" familyExtrasCount={1}
      familyExtras={<p>Existing parent-saved behavior goal</p>} />);
    expect(screen.getByText("Existing parent-saved behavior goal")).toBeTruthy();
    expect(screen.queryByTestId("empty-family-goals")).toBeNull();
    expect(screen.queryByTestId("button-new-family-goal")).toBeNull();
  });

  it("keeps published care-team goals visible when the independent family-goal query fails", () => {
    api.error = true;
    api.care = { goals: [published], assignments: [], recentPractice: [] };
    mount();
    expect(screen.getByTestId("group-clinical-goals")).toBeTruthy();
  });

  it("shows one practice prefix without changing the linked activity destination", () => {
    render(<ClinicalGoals childId="child-a" presentation="phase5"
      dailyActions={[{ id: "practice-a", goalId: family.id, title: "Practice: Familiar break request" }]} />);
    openGoal("goal-item-family-a");
    const link = screen.getByTestId("goal-activity-link-practice-a");
    expect(link.textContent).toBe("Practice: Familiar break request");
    expect(link.getAttribute("href")).toContain("activity_id=practice-a&child_id=child-a");
  });
});
