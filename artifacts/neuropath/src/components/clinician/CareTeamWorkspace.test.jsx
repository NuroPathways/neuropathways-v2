import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const ws = { current: null };
vi.mock("@workspace/api-client-react", () => ({
  useGetClinicianGoalsActivities: () => ({ data: ws.current, isLoading: false, isError: false }),
  getGetClinicianGoalsActivitiesQueryKey: (id) => ["ws", id],
  useGetCareTeamActivityLibrary: () => ({ data: [], isLoading: false }),
  getGetCareTeamActivityLibraryQueryKey: () => ["lib"],
  createCareTeamGoal: vi.fn(), updateCareTeamGoal: vi.fn(), createCareTeamAssignment: vi.fn(), updateCareTeamAssignment: vi.fn(),
  reviewCareTeamActivityRecommendation: vi.fn(),
  useGetParentGoals: () => ({}), getGetParentGoalsQueryKey: () => [], useCreateParentGoal: () => ({}), useUpdateParentGoal: () => ({}), useDeleteParentGoal: () => ({}),
  useGetParentCareTeam: () => ({}), getGetParentCareTeamQueryKey: () => [],
  getGetParentDashboardQueryKey: () => [], logParentDailyAction: vi.fn(), updateParentPracticeProgress: vi.fn(),
  getGetParentFamilyToolsQueryKey: () => [], saveParentFamilyTools: vi.fn(), useGetParentFamilyTools: () => ({}),
}));
const { default: CareTeamWorkspace, GoalForm, AssignActivityForm, goalPayload, friendlyError } = await import("./CareTeamWorkspace");
const api = await import("@workspace/api-client-react");
const { ActivityGuide } = await import("@/components/parentfree/PracticePage");
afterEach(() => { cleanup(); ws.current = null; });
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
  it("shows library selection guidance and requires confirmation for a plan-required activity", () => {
    const onSubmit = vi.fn();
    const library = [{
      id: "safety-rehearsal", title: "Safety Rehearsal", skill: "Safety Skills", skillDomain: "transitions",
      description: "Only use when a current authorized plan supports it.", estimatedMinutes: 5,
      source: "NeuroPathways starter library", steps: ["Follow the current plan."],
      appropriateContexts: ["A calm, safe setting."], requiredInformation: ["Confirm the current authorized plan."],
      materials: "The plan's familiar cue.", caregiverPhrases: [], stopConditions: ["Stop if unsafe."],
      riskTier: "requires_authorized_plan", evidenceReferences: [{
        key: "safety", title: "Safety source", url: "https://example.org/research", publishedYear: 2024,
        evidenceType: "review", designImplication: "Use context carefully.", limitation: "Not a template efficacy study.",
      }],
      exclusionCriteria: ["Never use in a crisis."], sourceClassification: "general_starter",
      personalizationFields: ["child's current plan"], requiresClinicianConfirmation: true,
    }];
    wrap(<AssignActivityForm library={library} onSubmit={onSubmit} onPreview={() => {}} />);
    expect(screen.getByText(/not RUBI, Triple P, Project ImPACT, or TEACCH materials/i)).toBeTruthy();
    fireEvent.click(screen.getByTestId("library-activity-safety-rehearsal"));
    fireEvent.click(screen.getByText("Contexts, safety, steps, and research"));
    expect(screen.getByText("Research design references")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Safety source (2024)" })).toBeTruthy();
    expect(screen.getByTestId("button-publish-parent").disabled).toBe(true);
    fireEvent.click(screen.getByTestId("checkbox-activity-plan-confirmation"));
    expect(screen.getByTestId("button-publish-parent").disabled).toBe(false);
    fireEvent.click(screen.getByTestId("button-publish-parent"));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      libraryId: "safety-rehearsal", planConfirmed: true, status: "published",
    }));
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
  it("shows clinician-only suggestions with source evidence and gated review actions", () => {
    ws.current = {
      goals: [], assignments: [], recentPractice: [], observations: [],
      activityRecommendationStatus: "ready",
      activityRecommendationMessage: "These are reviewable suggestions, not assignments.",
      activityRecommendations: [{
        id: "library:familiar-aac-choice",
        priorityTier: "document_grounded_library",
        status: "suggestion_only",
        title: "Familiar AAC choice",
        description: "Use the child's existing communication method.",
        skill: "Communication",
        estimatedMinutes: 5,
        materials: ["AAC device"],
        startAction: "",
        steps: ["Offer one familiar choice."],
        ending: "",
        pauseConditions: ["Pause if the child is finished."],
        matchReasons: ["The child's existing AAC method is explicitly documented."],
        evidence: [{
          recordId: "record-aac", category: "profile_information", documentId: "doc-a",
          documentTitle: "Communication plan", sourceSection: "Communication", sourcePage: 3,
          sourceExcerpt: "Uses an AAC device to make familiar choices.", reviewStatus: "unreviewed",
        }],
        sourceClassification: "research_informed_general_starter",
        researchReferences: [],
        safetyReviewRequired: false,
      }],
    };
    wrap(<CareTeamWorkspace childId="c1" childName="John" />);
    expect(screen.getByText("Child-specific activity suggestions")).toBeTruthy();
    expect(screen.getByText("These are reviewable suggestions, not assignments.")).toBeTruthy();
    expect(screen.getByText(/existing AAC method is explicitly documented/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Source records/ }));
    expect(screen.getByText("Communication plan · Communication · page 3 · not yet reviewed")).toBeTruthy();
    expect(screen.getByText("Uses an AAC device to make familiar choices.")).toBeTruthy();
    expect(screen.queryByTestId("button-publish-suggestion")).toBeNull();
    expect(screen.getByTestId("button-review-suggestion-library:familiar-aac-choice")).toBeTruthy();
    expect(screen.getByTestId("button-approve-suggestion-library:familiar-aac-choice")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-approve-suggestion-library:familiar-aac-choice"));
    expect(screen.getByText(/Approval is recorded for the clinician team/i)).toBeTruthy();
    expect(screen.getByTestId("button-submit-review-action").disabled).toBe(true);
    fireEvent.click(screen.getByTestId("checkbox-confirm-suggestion-fit-safety"));
    expect(screen.getByTestId("button-submit-review-action").disabled).toBe(false);
    fireEvent.click(screen.getByTestId("button-submit-review-action"));
    expect(api.reviewCareTeamActivityRecommendation).toHaveBeenCalledWith(
      "c1",
      "library:familiar-aac-choice",
      { action: "approve", fitSafetyConfirmed: true },
    );
  });

  it("explains when goals did not produce child-specific suggestions", () => {
    ws.current = {
      goals: [], assignments: [], recentPractice: [], observations: [],
      activityRecommendationStatus: "no_verified_matches",
      activityRecommendationMessage: "No child-specific activity suggestion matched the current source-verified records. Goals alone do not create activities.",
      activityRecommendations: [],
    };
    wrap(<CareTeamWorkspace childId="c1" childName="John" />);
    expect(screen.getByTestId("activity-recommendation-message").textContent).toMatch(/Goals alone do not create activities/);
    expect(screen.queryByText("Familiar AAC choice")).toBeNull();
  });
  it("keeps reviewed drafts out of assigned activities and publishes an approved item separately", async () => {
    const reviewed = {
      id: "review-1", childId: "c1", recommendationId: "document:act-1",
      title: "Music choice", description: "Offer a familiar choice.", skill: "Communication",
      estimatedMinutes: 5, materials: "Music player", steps: ["Offer one song.", "Pause for a response."],
      ifDifficult: "Pause if the child is finished.", status: "approved", version: 0,
      sourceEvidence: [{
        recordId: "record-1", documentId: "doc-1", documentTitle: "Support plan",
        sourceExcerpt: "Offer a familiar music choice.", reviewStatus: "approved",
      }],
      missingInformation: [], riskClassification: "Clinician-reviewed source activity",
      planConfirmed: true, reviewNote: "",
    };
    ws.current = {
      goals: [], assignments: [reviewed], activityReviews: [reviewed],
      recentPractice: [], observations: [], activityRecommendations: [],
    };
    wrap(<CareTeamWorkspace childId="c1" childName="John" />);
    expect(screen.getByTestId("activity-review-review-1")).toBeTruthy();
    expect(screen.queryByTestId("row-assignment-review-1")).toBeNull();
    fireEvent.click(screen.getByTestId("button-publish-review-review-1"));
    await waitFor(() => expect(api.updateCareTeamAssignment).toHaveBeenCalledWith(
      "c1",
      "review-1",
      expect.objectContaining({ status: "published", expectedVersion: 0, planConfirmed: true }),
    ));
  });
  it("shows the server message for 409 validation errors", () => {
    expect(friendlyError({ message: "HTTP 409: x", data: { error: "Target is required for this measurement." } })).toBe("Target is required for this measurement.");
    expect(friendlyError({ message: "HTTP 409" })).toMatch(/changed or conflicts/);
  });
});
