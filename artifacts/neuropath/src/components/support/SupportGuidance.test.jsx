import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import BehaviorSelector from "./BehaviorSelector";
import CrisisPlan from "./CrisisPlan";
import SupportNowOverlay from "./SupportNowOverlay";

const supportMocks = vi.hoisted(() => ({
  createEngagementEvent: vi.fn(() => Promise.resolve()),
  invokePortal: vi.fn(),
  filterProfiles: vi.fn(),
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

    expect(screen.getByText("Do This Right Now")).toBeTruthy();
    expect(screen.getByText("Move to a safer place")).toBeTruthy();
    expect(screen.getByText("Offer a clear choice")).toBeTruthy();
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
});
