import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import BehaviorSelector from "./BehaviorSelector";
import CrisisPlan from "./CrisisPlan";
import SupportNowOverlay from "./SupportNowOverlay";

const supportMocks = vi.hoisted(() => ({
  createEngagementEvent: vi.fn(() => Promise.resolve()),
  invokePortal: vi.fn(),
  filterProfiles: vi.fn(),
  getParentDashboard: vi.fn(),
  updateParentDocumentSupportCard: vi.fn(),
}));

const currentApproval = {
  reviewStatus: "approved",
  reviewer: "Qualified reviewer",
  reviewerCredentials: "Licensed clinician",
  reviewedAt: "2026-10-01",
  approvalScope: "urgent behavior support",
  renewalDate: "2099-01-01",
  version: "1.0",
  publishable: true,
  productionEligible: true,
};

vi.mock("@/api/entities", () => ({
  base44: {
    functions: {
      invoke: supportMocks.invokePortal,
    },
    entities: {
      EngagementEvent: {
        create: supportMocks.createEngagementEvent,
      },
      ClientProfile: {
        filter: supportMocks.filterProfiles,
      },
    },
  },
}));

vi.mock("@workspace/api-client-react", () => ({
  getParentDashboard: supportMocks.getParentDashboard,
  updateParentDocumentSupportCard: supportMocks.updateParentDocumentSupportCard,
}));

const documentConcern = {
  id: "document-concern:aaaaaaaaaaaaaaaaaaaaaaaa",
  childId: "child-1",
  behaviorName: "Difficulty With Verbal Instructions",
  displayName: "Difficulty With Verbal Instructions",
  parentDisplayName: null,
  description: "Several spoken directions may be difficult to follow.",
  contexts: ["schoolwork"],
  observations: ["Frustration during multi-step assignments"],
  uncertainty: ["The source does not state why this occurs."],
  generalSupportSuggestions: ["Offer one short direction at a time."],
  supportSections: {
    tryOneSteps: ["Give one short direction, then wait.", "Offer the next step after a response."],
    simplerStep: "Pause and offer one clear choice.",
    thingsToAvoid: ["Avoid stacking several spoken directions at once."],
    whatMayBeHappening: ["Several spoken directions may be harder to follow at once."],
    preventionIdeas: ["Share one direction at a time."],
    encouragement: ["Notice the effort when Sam responds."],
    practiceSkill: ["Practice asking for one direction at a time during a calm moment."],
    whatToNotice: ["Whether one direction at a time reduces frustration."],
  },
  missingClinicalInformation: ["This is a document-informed suggestion, not clinician-approved treatment."],
  safetySensitiveTopic: false,
  sourceReviewRequired: false,
  reviewStatus: "unreviewed",
  generationStatus: "generated",
  clinicianApproved: false,
  dismissed: false,
  sourceReferences: [{
    documentId: "document-1",
    title: "Intake Assessment",
    excerpt: "Difficulty following several spoken instructions at once.",
    excerptVerified: true,
    section: "Observations",
    page: 2,
  }],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("support guidance", () => {
  it("opens a caregiver popup behavior without sending disabled engagement tracking", async () => {
    render(
      <SupportNowOverlay
        user={{ id: "parent-1" }}
        children={[{ id: "child-1", child_name: "Sam" }]}
        loadProfileForChild={async () => ({
          behaviors: [{ ...currentApproval, name: "Transition difficulty", do_this_right_now: ["Give a brief advance notice"] }],
        })}
        logEngagement={false}
        openRequest={1}
        autoOpen={false}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Continue to support options" }));
    fireEvent.click(await screen.findByRole("button", { name: /Help With a Behavior/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Transition difficulty/ }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Give a brief advance notice")).toBeTruthy();
    expect(supportMocks.createEngagementEvent).not.toHaveBeenCalled();
  });

  it("shows active parent-direct behaviors without requiring clinician-approval metadata", async () => {
    render(
      <SupportNowOverlay
        user={{ id: "parent-free-1", account_type: "parent_free" }}
        children={[{ id: "child-1", child_name: "Sam" }]}
        loadProfileForChild={async () => ({
          behaviors: [{
            id: "behavior-1",
            name: "Transition difficulty",
            parentDirectEligible: true,
            sourceLabel: "Starter support",
            do_this_right_now: ["Offer one familiar choice"],
          }],
        })}
        logEngagement={false}
        openRequest={1}
        autoOpen={false}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Continue to support options" }));
    fireEvent.click(await screen.findByRole("button", { name: /Help With a Behavior/ }));
    expect(await screen.findByRole("button", { name: /Transition difficulty/ })).toBeTruthy();
  });

  it("normalizes a single-object behavior profile and opens its support card", () => {
    render(
      <BehaviorSelector
        child={{ id: "child-1", child_name: "Sam" }}
        profile={{
          behaviors: {
            elopement: {
              ...currentApproval,
              planId: "plan-1",
              childId: "child-1",
              planStatus: "approved",
              name: "Leaving the area",
              do_this_right_now: ["Move to a safer place", "Offer a clear choice"],
            },
          },
        }}
        onBack={() => {}}
        onDismiss={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Leaving the area/ }));

    expect(screen.getByText(/Try one step/)).toBeTruthy();
    expect(screen.getByText("Move to a safer place")).toBeTruthy();
    expect(screen.queryByText("Offer a clear choice")).toBeNull();
    expect(screen.getByRole("button", { name: "Back" }).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Offer a clear choice")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back" }).disabled).toBe(false);
    expect(screen.getByRole("button", { name: "Next" }).disabled).toBe(true);
  });

  it("shows available plan sections and does not fabricate missing source guidance", () => {
    render(
      <BehaviorSelector
        child={{ id: "child-1", child_name: "Sam" }}
        parentDirect
        profile={{
          behaviors: [{
            name: "Transition difficulty",
            parentDirectEligible: true,
            sourceLabel: "Source: Behavior plan",
            do_this_right_now: ["Give a calm warning"],
            prevention_tips: ["Use the familiar visual schedule"],
          }],
        }}
        onBack={() => {}}
        onDismiss={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Transition difficulty/ }));
    fireEvent.click(screen.getByRole("button", { name: /Prevention Ideas/ }));
    expect(screen.getByText("Use the familiar visual schedule")).toBeTruthy();
    expect(screen.getByText(/Only 1 source-grounded item is available/)).toBeTruthy();
  });

  it("shows an empty state instead of crashing on a malformed behavior value", () => {
    render(
      <BehaviorSelector
        child={{ id: "child-1", child_name: "Sam" }}
        profile={{ behaviors: "not valid JSON" }}
        onBack={() => {}}
        onDismiss={() => {}}
      />,
    );

    expect(screen.getByText("No current approved behavior steps are available.")).toBeTruthy();
  });

  it("does not show unreviewed behavior guidance in Help Now", () => {
    render(
      <BehaviorSelector
        child={{ id: "child-1", child_name: "Sam" }}
        profile={{ behaviors: [{ name: "Hitting", do_this_right_now: ["Use a generic hold"] }] }}
        onBack={() => {}}
        onDismiss={() => {}}
      />,
    );

    expect(screen.queryByText("Use a generic hold")).toBeNull();
    expect(screen.getByRole("button", { name: "Open safety plan" })).toBeTruthy();
  });

  it("shows source-linked document suggestions separately from approved behavior guidance", async () => {
    render(
      <BehaviorSelector
        child={{ id: "child-1", child_name: "Sam" }}
        profile={{
          documentSupportCards: [documentConcern],
          sourceDocuments: [{ id: "document-1", uploadedBy: "parent" }],
        }}
        parentDirect
        onBack={() => {}}
        onOpenSafety={() => {}}
        onDismiss={() => {}}
      />,
    );

    expect(screen.getByRole("heading", { name: "Document support cards" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Difficulty With Verbal Instructions/ }));
    expect(screen.getByText("Client-uploaded")).toBeTruthy();
    expect(screen.getByTestId("label-document-informed-status").textContent).toContain("Not clinician-reviewed");
    expect(screen.getByTestId("section-active-step")).toBeTruthy();
    expect(screen.getByText(/Try one step/)).toBeTruthy();
    expect(screen.getByText("Give one short direction, then wait.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back" }).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Next" }).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Offer the next step after a response.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back" }).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Give one short direction, then wait.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "This isn't working" }));
    expect(screen.getByText("Pause and offer one clear choice.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Return to saved step" }));
    expect(screen.getByText("Give one short direction, then wait.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Things to Avoid" })).toBeTruthy();
    for (const title of [
      "What may be happening",
      "Prevention Ideas",
      "Encouragement",
      "Practice a helpful skill",
      "What to notice",
    ]) {
      expect(screen.getByRole("button", { name: title })).toBeTruthy();
    }
    expect(screen.getByText("Avoid stacking several spoken directions at once.")).toBeTruthy();
    expect(screen.getByTestId("label-ai-generated-guidance")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "What may be happening" }));
    expect(screen.getByText("Several spoken directions may be harder to follow at once.")).toBeTruthy();
    expect(screen.getByText("Several spoken directions may be difficult to follow.")).toBeTruthy();
    expect(screen.getByText("Documented context: schoolwork")).toBeTruthy();
    expect(screen.queryByText("The source does not state why this occurs.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "What to notice" }));
    expect(screen.getByText("Whether one direction at a time reduces frustration.")).toBeTruthy();
    expect(screen.getByText("Frustration during multi-step assignments")).toBeTruthy();
    expect(screen.getByText("Difficulty following several spoken instructions at once.")).toBeTruthy();
    expect(screen.getByTestId("label-ai-generated-guidance").textContent).toContain("not clinician-reviewed");
    fireEvent.click(screen.getByRole("button", { name: "Prevention Ideas" }));
    fireEvent.click(screen.getByRole("button", { name: "Encouragement" }));
    fireEvent.click(screen.getByRole("button", { name: "Practice a helpful skill" }));
    for (const expected of [
      "Share one direction at a time.",
      "Notice the effort when Sam responds.",
      "Practice asking for one direction at a time during a calm moment.",
    ]) {
      expect(screen.getByText(expected)).toBeTruthy();
    }
  });

  it("shows document-derived facts without empty-section or generation-error messages", () => {
    render(
      <BehaviorSelector
        child={{ id: "child-1", child_name: "Sam" }}
        profile={{
          documentSupportCards: [{
            ...documentConcern,
            generationStatus: "extraction_only",
            generalSupportSuggestions: [],
            supportSections: {
              tryOneSteps: [],
              simplerStep: "",
              thingsToAvoid: [],
              whatMayBeHappening: [],
              preventionIdeas: [],
              encouragement: [],
              practiceSkill: [],
              whatToNotice: [],
            },
          }],
        }}
        parentDirect
        onBack={() => {}}
        onOpenSafety={() => {}}
        onDismiss={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Difficulty With Verbal Instructions/ }));
    expect(screen.getByText("From the document")).toBeTruthy();
    expect(screen.getByText("Several spoken directions may be difficult to follow.")).toBeTruthy();
    expect(screen.queryByText(/No safe general step could be generated/)).toBeNull();
    expect(screen.queryByText(/No safe, document-informed avoid suggestion/)).toBeNull();
    expect(screen.queryByTestId("notice-generation-unavailable")).toBeNull();
  });

  it("withholds suggestions for safety-sensitive or source-review-required draft cards", () => {
    const restricted = {
      ...documentConcern,
      behaviorName: "Self-Injury",
      displayName: "Self-Injury",
      safetySensitiveTopic: true,
      sourceReviewRequired: true,
      reviewStatus: "needs_review",
      generalSupportSuggestions: ["A generated suggestion must not appear."],
      sourceReferences: [{ ...documentConcern.sourceReferences[0], excerptVerified: false }],
    };
    render(
      <BehaviorSelector
        child={{ id: "child-1", child_name: "Sam" }}
        profile={{ documentSupportCards: [restricted] }}
        parentDirect
        onBack={() => {}}
        onOpenSafety={() => {}}
        onDismiss={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Self-Injury/ }));
    expect(screen.queryByText("A generated suggestion must not appear.")).toBeNull();
    expect(screen.getByTestId("notice-source-review")).toBeTruthy();
    expect(screen.getByTestId("notice-document-safety")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open safety plan" })).toBeTruthy();
    expect(screen.getByText("Source excerpt needs review")).toBeTruthy();
  });

  it("shows parent-uploaded guidance without an unverified-source warning", () => {
    const parentUploaded = {
      ...documentConcern,
      sourceReviewRequired: true,
      reviewStatus: "needs_review",
      sourceReferences: [{
        ...documentConcern.sourceReferences[0],
        excerptVerified: false,
      }],
      missingClinicalInformation: [
        "One or more source excerpts still need review before the concern can be relied on.",
      ],
    };
    render(
      <BehaviorSelector
        child={{ id: "child-1", child_name: "Sam" }}
        profile={{
          sourceDocuments: [{ id: "document-1", uploadedBy: "parent" }],
          documentSupportCards: [parentUploaded],
        }}
        parentDirect
        onBack={() => {}}
        onOpenSafety={() => {}}
        onDismiss={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Difficulty With Verbal Instructions/ }));
    expect(screen.queryByTestId("notice-source-review")).toBeNull();
    expect(screen.queryByText("Source excerpt needs review")).toBeNull();
    expect(screen.queryByText(/excerpts still need review/i)).toBeNull();
    expect(screen.getByRole("heading", { name: "Things to Avoid" })).toBeTruthy();
    expect(screen.getByText("Avoid stacking several spoken directions at once.")).toBeTruthy();
    expect(screen.getByTestId("label-document-informed-status").textContent).toBe("Not clinician-reviewed");
  });

  it("lets a parent correct the suggestion label without changing its review status", async () => {
    supportMocks.updateParentDocumentSupportCard.mockResolvedValueOnce({
      ...documentConcern,
      displayName: "Instructions feel overwhelming",
      parentDisplayName: "Instructions feel overwhelming",
    });
    render(
      <BehaviorSelector
        child={{ id: "child-1", child_name: "Sam" }}
        profile={{ documentSupportCards: [documentConcern] }}
        parentDirect
        onBack={() => {}}
        onOpenSafety={() => {}}
        onDismiss={() => {}}
        onUpdateDocumentSupportCard={supportMocks.updateParentDocumentSupportCard}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Difficulty With Verbal Instructions/ }));
    fireEvent.click(screen.getByRole("button", { name: "Correct label" }));
    fireEvent.change(screen.getByLabelText("Correct support area name"), { target: { value: "Instructions feel overwhelming" } });
    fireEvent.click(screen.getByRole("button", { name: "Save label" }));
    expect(await screen.findByRole("heading", { name: /Instructions feel overwhelming/ })).toBeTruthy();
    expect(supportMocks.updateParentDocumentSupportCard).toHaveBeenCalledWith(
      documentConcern.id,
      { action: "rename", label: "Instructions feel overwhelming" },
    );
    expect(screen.getByTestId("label-document-informed-status").textContent).toContain("Not clinician-reviewed");
  });

  it("loads parent-owned document suggestions through the authorized parent dashboard", async () => {
    supportMocks.filterProfiles.mockResolvedValueOnce([]);
    supportMocks.getParentDashboard.mockResolvedValueOnce({
      documentSupportCards: [{
        ...documentConcern,
        generalSupportSuggestions: ["Try one short direction, then pause for a response."],
      }],
      documents: [{ id: "document-1", uploadedBy: "parent" }],
    });
    render(
      <SupportNowOverlay
        user={{ id: "parent-1", role: "parent", account_type: "parent_free" }}
        children={[{ id: "child-1", child_name: "Sam" }]}
        parentDirect
        logEngagement={false}
        openRequest={1}
        autoOpen={false}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Continue to support options" }));
    fireEvent.click(await screen.findByRole("button", { name: /Help With a Behavior/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Difficulty With Verbal Instructions/ }));
    expect(await screen.findByTestId("section-active-step")).toBeTruthy();
    expect(screen.getByText("Client-uploaded")).toBeTruthy();
    expect(screen.getByTestId("label-document-informed-status").textContent).toContain("Not clinician-reviewed");
    expect(screen.getByText("Give one short direction, then wait.")).toBeTruthy();
    expect(supportMocks.getParentDashboard).toHaveBeenCalledWith("child-1", expect.objectContaining({
      credentials: "include",
      headers: expect.any(Object),
    }));
  });

  it("lets a parent restore a dismissed document suggestion", async () => {
    const dismissed = { ...documentConcern, dismissed: true };
    supportMocks.updateParentDocumentSupportCard.mockResolvedValueOnce({ ...documentConcern, dismissed: false });
    render(
      <BehaviorSelector
        child={{ id: "child-1", child_name: "Sam" }}
        profile={{ documentSupportCards: [dismissed] }}
        parentDirect
        onBack={() => {}}
        onOpenSafety={() => {}}
        onDismiss={() => {}}
        onUpdateDocumentSupportCard={supportMocks.updateParentDocumentSupportCard}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Dismissed document suggestions (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(supportMocks.updateParentDocumentSupportCard).toHaveBeenCalledWith(
      documentConcern.id,
      { action: "restore" },
    ));
  });

  it("does not show high-risk steps without a current child-bound plan", () => {
    render(
      <BehaviorSelector
        child={{ id: "child-1", child_name: "Sam" }}
        profile={{
          behaviors: [{
            ...currentApproval,
            name: "Elopement",
            do_this_right_now: ["Use individualized step"],
          }],
        }}
        onBack={() => {}}
        onDismiss={() => {}}
      />,
    );

    expect(screen.queryByText("Use individualized step")).toBeNull();
    expect(screen.getByText("No current approved behavior steps are available.")).toBeTruthy();
  });

  it("keeps keyed portal behaviors as separate choices in the support popup", async () => {
    supportMocks.invokePortal.mockResolvedValue({
      data: {
        profile: {
          behaviors: {
            elopement: {
                ...currentApproval,
              planId: "plan-1",
              childId: "child-1",
              planStatus: "approved",
              name: "Leaving the area",
              do_this_right_now: ["Move to a safer place"],
            },
            aggression: {
                ...currentApproval,
              planId: "plan-1",
              childId: "child-1",
              planStatus: "approved",
              name: "Hitting",
              do_this_right_now: ["Create space"],
            },
          },
        },
        plans: [],
      },
    });

    render(
      <SupportNowOverlay
        user={{ id: "client-1" }}
        children={[{ id: "child-1", child_name: "Sam" }]}
        isIndividual
        logEngagement={false}
        openRequest={1}
        autoOpen={false}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Continue to support options" }));
    fireEvent.click(await screen.findByRole("button", { name: /Help With a Behavior/ }));

    expect(await screen.findByRole("button", { name: /Leaving the area/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Hitting/ })).toBeTruthy();
    expect(supportMocks.invokePortal).toHaveBeenCalledWith("getClientPortalData", {
      child_id: "child-1",
      account_id: "client-1",
      invite_token: undefined,
    });
  });

  it("shows the missing-safety-plan warning only when no plan guidance is present", () => {
    const { rerender } = render(
      <CrisisPlan child={{ child_name: "Sam" }} profile={{}} />,
    );

    expect(screen.getByText("No safety plan has been uploaded for this child.")).toBeTruthy();
    expect(screen.getByText(/not contain an individualized crisis plan/i)).toBeTruthy();
    expect(screen.getAllByText("If there is immediate danger, call 911 or emergency services.").length).toBeGreaterThan(0);

    rerender(
      <CrisisPlan
        child={{ child_name: "Sam" }}
        profile={{ safety_plan_uploaded: true }}
      />,
    );
    expect(screen.getByText("A safety plan was uploaded, but its steps are not available in this screen.")).toBeTruthy();
    expect(screen.queryByText("No safety plan has been uploaded for this child.")).toBeNull();

    rerender(
      <CrisisPlan
        child={{ child_name: "Sam" }}
        profile={{ crisis_plan: ["Follow the clinician's written steps."] }}
      />,
    );

    expect(screen.getByText("Crisis plan steps on file")).toBeTruthy();
    expect(screen.queryByText("No safety plan has been uploaded for this child.")).toBeNull();
    expect(screen.getByText("Follow the clinician's written steps.")).toBeTruthy();
  });

  it("shows a parent-uploaded safety source verbatim, labels its review state, and keeps parent actions child-scoped", () => {
    render(
      <MemoryRouter>
        <CrisisPlan
          child={{ id: "child-1", child_name: "Sam" }}
          parentDirect
          profile={{
            safetyPlan: {
              childId: "child-1",
              hasSafetyPlan: true,
              documents: [{ id: "safety-doc-1", title: "Family Safety Plan", hasInstructions: true }],
              instructions: [{
                id: "instruction-1",
                documentId: "safety-doc-1",
                documentTitle: "Family Safety Plan",
                uploadedBy: "parent",
                uploadedAt: "2026-10-22T12:00:00.000Z",
                sourceExcerpt: "Move to the quiet room and call the listed caregiver.",
                sourceSection: "Safety Steps",
                sourcePage: 2,
                sourceExcerptVerified: true,
                sourceReviewRequired: false,
                clinicianApproved: false,
              }],
            },
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("section-source-safety-plan")).toBeTruthy();
    expect(screen.getByText("Parent-uploaded · not clinician-approved")).toBeTruthy();
    expect(screen.getByText("Move to the quiet room and call the listed caregiver.")).toBeTruthy();
    expect(screen.getByText(/Family Safety Plan · Safety Steps · page 2/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Upload or review a plan" }).getAttribute("href"))
      .toBe("/ParentHome?tab=docs&child_id=child-1");
    expect(screen.getByRole("link", { name: "Open care team" }).getAttribute("href"))
      .toBe("/ParentHome?tab=clinic&child_id=child-1");
  });

  it("marks only explicitly approved, verified source instructions as clinician-approved", () => {
    render(
      <CrisisPlan
        child={{ child_name: "Sam" }}
        profile={{
          safetyPlan: {
            hasSafetyPlan: true,
            documents: [{ id: "safety-doc-1", title: "Care Plan", hasInstructions: true }],
            instructions: [{
              id: "instruction-1",
              documentTitle: "Care Plan",
              uploadedBy: "clinician",
              sourceExcerpt: "Use the documented contact steps.",
              sourceExcerptVerified: true,
              sourceReviewRequired: false,
              clinicianApproved: true,
            }],
          },
        }}
      />,
    );
    expect(screen.getByText("Clinician-approved")).toBeTruthy();
    expect(screen.getByText("Use the documented contact steps.")).toBeTruthy();
  });

  it("separates older clinician-profile notes from exact source excerpts and requires source verification", () => {
    render(
      <CrisisPlan
        child={{ child_name: "Sam" }}
        profile={{
          safetyPlan: {
            hasSafetyPlan: true,
            documents: [{ id: "clinical-plan-1", title: "Clinical plan", hasInstructions: true }],
            instructions: [{
              id: "legacy-safety-profile-1-0",
              contentKind: "profile_extraction",
              documentId: "clinical-plan-1",
              sourceDocumentIds: ["clinical-plan-1"],
              documentTitle: "Clinical plan",
              uploadedBy: "clinician",
              uploadedAt: "2026-10-22T12:00:00.000Z",
              sourceExcerpt: null,
              profileNote: "Use the existing caregiver contact sequence.",
              sourceSection: "Clinician profile extraction",
              sourcePage: null,
              sourceExcerptVerified: false,
              sourceReviewRequired: true,
              clinicianApproved: false,
            }],
          },
        }}
      />,
    );

    expect(screen.getByText("Clinician profile extraction · needs source verification")).toBeTruthy();
    expect(screen.getByText(/Clinician profile note \(not an exact source excerpt\):/)).toBeTruthy();
    expect(screen.getByText("Use the existing caregiver contact sequence.")).toBeTruthy();
    expect(screen.getByText("Check this note against the linked original document before relying on it.")).toBeTruthy();
    expect(screen.queryByText(/Source excerpt:/)).toBeNull();
    expect(screen.queryByText("Clinician-approved")).toBeNull();
  });
});
