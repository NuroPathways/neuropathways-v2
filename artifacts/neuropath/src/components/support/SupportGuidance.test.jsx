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
  it("normalizes a single-object behavior profile and opens its support card", () => {
    render(
      <BehaviorSelector
        child={{ id: "child-1", child_name: "Sam" }}
        profile={{
          behaviors: {
            elopement: {
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

    expect(screen.getByText("No behavior cards on file yet.")).toBeTruthy();
  });

  it("keeps keyed portal behaviors as separate choices in the support popup", async () => {
    supportMocks.invokePortal.mockResolvedValue({
      data: {
        profile: {
          behaviors: {
            elopement: {
              name: "Leaving the area",
              do_this_right_now: ["Move to a safer place"],
            },
            aggression: {
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

  it("shows general safety guidance only when no plan guidance is present", () => {
    const { rerender } = render(
      <CrisisPlan child={{ child_name: "Sam" }} profile={{}} />,
    );

    expect(screen.getByText("General safety guidance")).toBeTruthy();
    expect(screen.getByText(/not an individualized crisis plan/i)).toBeTruthy();

    rerender(
      <CrisisPlan
        child={{ child_name: "Sam" }}
        profile={{ crisis_plan: ["Follow the clinician's written steps."] }}
      />,
    );

    expect(screen.getByText("Crisis plan steps on file")).toBeTruthy();
    expect(screen.queryByText("General safety guidance")).toBeNull();
    expect(screen.getByText("Follow the clinician's written steps.")).toBeTruthy();
  });
});
