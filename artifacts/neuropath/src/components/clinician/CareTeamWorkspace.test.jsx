import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const ws = { current: null };
vi.mock("@workspace/api-client-react", () => ({
  useGetClinicianGoalsActivities: () => ({ data: ws.current, isLoading: false, isError: false }),
  getGetClinicianGoalsActivitiesQueryKey: (id) => ["ws", id],
  useGetCareTeamActivityLibrary: () => ({ data: [], isLoading: false }),
  getGetCareTeamActivityLibraryQueryKey: () => ["lib"],
  createCareTeamGoal: vi.fn(), updateCareTeamGoal: vi.fn(), createCareTeamAssignment: vi.fn(), updateCareTeamAssignment: vi.fn(),
  useGetParentGoals: () => ({}), getGetParentGoalsQueryKey: () => [], useCreateParentGoal: () => ({}), useUpdateParentGoal: () => ({}), useDeleteParentGoal: () => ({}),
  useGetParentCareTeam: () => ({}), getGetParentCareTeamQueryKey: () => [],
  getGetParentDashboardQueryKey: () => [], logParentDailyAction: vi.fn(), updateParentPracticeProgress: vi.fn(),
  getGetParentFamilyToolsQueryKey: () => [], saveParentFamilyTools: vi.fn(), useGetParentFamilyTools: () => ({}),
}));
const { default: CareTeamWorkspace, GoalForm, AssignActivityForm, goalPayload, friendlyError } = await import("./CareTeamWorkspace");
const api = await import("@workspace/api-client-react");
const { ActivityGuide } = await import("@/components/parentfree/PracticePage");
afterEach(cleanup);
const wrap = (node) => render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);

describe("Care team forms", () => {
  it("requires title and description and saves new goals as draft", () => {
    const onSubmit = vi.fn();
    wrap(<GoalForm onSubmit={onSubmit} onPreview={() => {}} />);
    expect(screen.getByTestId("button-save-draft").disabled).toBe(true);
    fireEvent.change(screen.getByTestId("input-care-goal-title"), { target: { value: "Ask for a Break" } });
    fireEvent.change(screen.getByTestId("input-care-goal-description"), { target: { value: "John will request a break." } });
    fireEvent.change(screen.getByTestId("input-care-goal-milestone-0"), { target: { value: "Uses card once" } });
    fireEvent.click(screen.getByTestId("button-save-draft"));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: "Ask for a Break", status: "draft", milestones: ["Uses card once"], target: null }));
  });
  it("requires a target for frequency measurement", () => {
    wrap(<GoalForm onSubmit={() => {}} onPreview={() => {}} />);
    fireEvent.change(screen.getByTestId("input-care-goal-title"), { target: { value: "T" } });
    fireEvent.change(screen.getByTestId("input-care-goal-description"), { target: { value: "D" } });
    fireEvent.change(screen.getByTestId("select-care-goal-measurement"), { target: { value: "frequency" } });
    expect(screen.getByTestId("button-publish-parent").disabled).toBe(true);
  });
  it("assigns a library activity by reference without copying steps", () => {
    const onSubmit = vi.fn();
    const library = [{ id: "lib1", title: "First-Then Practice", skill: "Transitions", description: "d", estimatedMinutes: 5, source: "NeuroPathways library", steps: ["a", "b"] }];
    wrap(<AssignActivityForm library={library} goals={[{ id: "g1", title: "Ask for a Break", status: "published" }]} onSubmit={onSubmit} onPreview={() => {}} />);
    fireEvent.click(screen.getByTestId("library-activity-lib1"));
    fireEvent.change(screen.getByTestId("select-activity-goal"), { target: { value: "g1" } });
    fireEvent.click(screen.getByTestId("button-publish-parent"));
    const body = onSubmit.mock.calls[0][0];
    expect(body).toMatchObject({ libraryId: "lib1", goalId: "g1", status: "published" });
    expect(body.steps).toBeUndefined();
  });
  it("renders the parent preview with a preview label and no saving", () => {
    wrap(<div className="np-practice"><ActivityGuide preview assigned requireOutcome childName="John" activity={{ id: "p", title: "AAC Break Request Practice", steps: ["Step one"], skill: "Communication" }} onExit={() => {}} onSkip={() => {}} /></div>);
    expect(screen.getByTestId("label-preview")).toBeTruthy();
    expect(screen.queryByTestId("button-pause-practice")).toBeNull();
    fireEvent.click(screen.getByTestId("button-step-finish"));
    fireEvent.click(screen.getByTestId("button-outcome-used_skill"));
    expect(screen.getByTestId("button-save-update").disabled).toBe(true);
  });

  it("edits a legacy clinician goal in place without inventing skill or measurement and keeps its target", () => {
    const onSubmit = vi.fn();
    const legacy = { id: "rt1", childId: "c1", title: "F4 goal 13:32:51", description: "Use a break card.", target: 10, progress: 4, milestones: ["Week 1"], status: "published", version: 3, source: "document", canEdit: true };
    wrap(<GoalForm initial={legacy} onSubmit={onSubmit} onPreview={() => {}} />);
    expect(screen.getByText(/kept as is/)).toBeTruthy();
    fireEvent.change(screen.getByTestId("input-care-goal-title"), { target: { value: "Ask for a Break" } });
    fireEvent.click(screen.getByTestId("button-publish-parent"));
    const body = onSubmit.mock.calls[0][0];
    expect(body).toMatchObject({ title: "Ask for a Break", description: "Use a break card.", target: 10, milestones: ["Week 1"], status: "published", expectedVersion: 3 });
    expect(body).not.toHaveProperty("skill");
    expect(body).not.toHaveProperty("measurement");
    expect(body).not.toHaveProperty("progress");
  });
  it("builds a full goal form for status-only changes", () => {
    expect(goalPayload({ title: "T", description: "D", skill: "Safety", measurement: "observation", target: "", milestones: [""], notes: "" }, "paused", 5))
      .toEqual({ title: "T", description: "D", skill: "Safety", measurement: "observation", target: null, milestones: [], notes: "", status: "paused", expectedVersion: 5 });
  });
  it("lists every workspace goal once, shows original progress, and hides edit controls when canEdit is false", () => {
    ws.current = { goals: [
      { id: "rt1", childId: "c1", title: "Legacy goal", description: "d", progress: 3, target: 10, status: "published", version: 1, source: "manual", canEdit: false },
      { id: "g2", childId: "c1", title: "Ask for a Break", description: "d", status: "draft", version: 1, source: "care_team", canEdit: true },
    ], assignments: [], recentPractice: [], observations: [] };
    wrap(<CareTeamWorkspace childId="c1" childName="John" />);
    expect(screen.getAllByTestId(/^row-care-goal-/)).toHaveLength(2);
    expect(screen.getByTestId("progress-goal-rt1").textContent).toContain("3/10 steps");
    expect(screen.getByText(/only while the family is sharing observations/)).toBeTruthy();
    expect(api.updateCareTeamGoal).not.toHaveBeenCalled();
    ws.current = null;
  });

  it("requires a target for completed steps", () => {
    wrap(<GoalForm onSubmit={() => {}} onPreview={() => {}} />);
    fireEvent.change(screen.getByTestId("input-care-goal-title"), { target: { value: "T" } });
    fireEvent.change(screen.getByTestId("input-care-goal-description"), { target: { value: "D" } });
    fireEvent.change(screen.getByTestId("select-care-goal-measurement"), { target: { value: "completed_steps" } });
    expect(screen.getByTestId("button-publish-parent").disabled).toBe(true);
  });
  it("shows the server message for 409 validation errors", () => {
    expect(friendlyError({ message: "HTTP 409: x", data: { error: "Target is required for this measurement." } })).toBe("Target is required for this measurement.");
    expect(friendlyError({ message: "HTTP 409" })).toMatch(/changed or conflicts/);
  });
});
