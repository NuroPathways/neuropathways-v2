import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import SupportNowOverlay from "./SupportNowOverlay";
import BehaviorSelector from "./BehaviorSelector";
import CrisisPlan from "./CrisisPlan";
import CalmDownTool from "./CalmDownTool";

const tracking = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock("@/api/entities", () => ({
  base44: {
    entities: { EngagementEvent: { create: tracking } },
  },
}));

const child = { id: "phase3-child", child_name: "Sam", clinician_id: "clinician-a" };
const behavior = {
  name: "A familiar transition",
  parentDirectEligible: true,
  sourceLabel: "Starter support",
  do_this_right_now: ["First saved instruction", "Second saved instruction", "Third saved instruction"],
  if_it_escalates: ["Saved escalation instruction"],
  avoid: ["Saved caution"],
  when_to_contact_clinician: "Saved contact threshold",
};
function mountOverlay(overrides = {}) {
  return render(<SupportNowOverlay
    user={{ id: "phase3-parent", account_type: "parent_free" }}
    children={[child]}
    initialChildId={child.id}
    loadProfileForChild={async () => ({ behaviors: [behavior] })}
    openRequest={1}
    autoOpen={false}
    logEngagement={false}
    {...overrides}
  />);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Help Now preservation", () => {
  it("offers all four choices and emergency access immediately for the selected child", async () => {
    mountOverlay();
    for (const name of [/Help With a Behavior/, /Safety.*Crisis Plan/, /Calm Down First/, /Go to Dashboard/]) {
      expect(await screen.findByRole("button", { name })).toBeTruthy();
    }
    expect(screen.getByText("Sam").closest("p").textContent).toBe("For: Sam");
    expect(screen.getByText("If there is immediate danger, call 911 or emergency services.")).toBeTruthy();
    expect(tracking).not.toHaveBeenCalled();
  });

  it("keeps selection bound to the requested child and the same logging contracts", async () => {
    const load = vi.fn(async () => ({ behaviors: [behavior] }));
    mountOverlay({
      children: [{ id: "other-child", child_name: "Alex" }, child],
      loadProfileForChild: load,
      logEngagement: true,
    });
    expect((await screen.findByText("Sam")).closest("p").textContent).toBe("For: Sam");
    await waitFor(() => expect(load).toHaveBeenCalledWith(child.id));
    fireEvent.click(screen.getByRole("button", { name: /Help With a Behavior/ }));
    fireEvent.click(await screen.findByRole("button", { name: /A familiar transition/ }));
    expect(tracking).toHaveBeenCalledWith({
      child_id: child.id, clinician_id: child.clinician_id,
      event_type: "help_opened", topic: "support_now_opened",
    });
    expect(tracking).toHaveBeenCalledWith({
      child_id: child.id, clinician_id: child.clinician_id,
      event_type: "support_section_opened", topic: "behavior",
    });
    expect(tracking).toHaveBeenCalledWith({
      child_id: child.id, clinician_id: child.clinician_id,
      event_type: "behavior_viewed", topic: behavior.name,
    });
  });

  it("retains every immediate step, bounded navigation and the existing simpler branch", () => {
    render(<BehaviorSelector child={child} parentDirect profile={{ behaviors: [behavior] }} logEngagement={false} />);
    fireEvent.click(screen.getByRole("button", { name: /^A familiar transition/ }));
    expect(screen.getByText(behavior.do_this_right_now[0])).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back" }).disabled).toBe(true);
    for (const instruction of behavior.do_this_right_now.slice(1)) {
      fireEvent.click(screen.getByRole("button", { name: /^Next/ }));
      expect(screen.getByText(instruction)).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: /^Next/ }).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "This isn't working" }));
    expect(screen.getAllByText("Saved escalation instruction").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Return to saved step" }));
    expect(screen.getByText(behavior.do_this_right_now[2])).toBeTruthy();
    expect(screen.getByText("Saved caution").closest('[data-state="closed"]')).toBeNull();
    expect(screen.getByText("Saved contact threshold").closest('[data-state="closed"]')).toBeNull();
    expect(screen.getByText("If there is immediate danger, call 911 or emergency services.")).toBeTruthy();
  });

  it("preserves the no-immediate-step warning without inventing instructions", () => {
    render(<BehaviorSelector child={child} parentDirect profile={{
      behaviors: [{ ...behavior, do_this_right_now: [], if_it_escalates: [] }],
    }} logEngagement={false} />);
    fireEvent.click(screen.getByRole("button", { name: /^A familiar transition/ }));
    expect(screen.getByText(/No immediate step is saved/)).toBeTruthy();
    expect(screen.getByText("No support steps are on file for this behavior.")).toBeTruthy();
    expect(screen.getByText("Please contact your clinician for guidance.")).toBeTruthy();
  });

  it("leaves every supplied crisis instruction and emergency warning outside disclosures", () => {
    const steps = ["Saved safety step one", "Saved safety step two", "Saved safety step three"];
    render(<CrisisPlan child={child} profile={{ crisis_plan: steps }} />);
    for (const text of steps) {
      expect(screen.getByText(text).closest('[data-state="closed"]')).toBeNull();
    }
    expect(screen.getAllByText("If there is immediate danger, call 911 or emergency services.").length).toBeGreaterThan(0);
  });

  it("retains safety access when the profile cannot be loaded", async () => {
    mountOverlay({ loadProfileForChild: async () => { throw new Error("Synthetic unavailable source"); } });
    fireEvent.click(await screen.findByRole("button", { name: /Safety.*Crisis Plan/ }));
    expect(await screen.findByText(/Could not load safety information/)).toBeTruthy();
    expect(screen.getAllByText("If there is immediate danger, call 911 or emergency services.").length).toBeGreaterThan(0);
  });

  it("retains start/pause breathing and all five grounding prompts", async () => {
    render(<CalmDownTool child={child} profile={{}} />);
    fireEvent.click(screen.getByRole("button", { name: "Start Breathing Exercise" }));
    expect(screen.getByText("Breathe In")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Pause Breathing Exercise" }));
    expect(screen.getByRole("button", { name: "Start Breathing Exercise" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Grounding" }));
    for (const sense of ["Things you can SEE", "Things you can TOUCH", "Things you can HEAR", "Things you can SMELL", "Thing you can TASTE"]) {
      expect(await screen.findByText(sense)).toBeTruthy();
    }
  });

  it("keeps all escalation warnings outside optional disclosures before changing steps", () => {
    const warnings = ["First escalation warning", "Second escalation warning"];
    render(<BehaviorSelector child={child} parentDirect profile={{
      behaviors: [{ ...behavior, if_it_escalates: warnings }],
    }} logEngagement={false} />);
    fireEvent.click(screen.getByRole("button", { name: /^A familiar transition/ }));
    for (const warning of warnings) {
      expect(screen.getByText(warning).closest('[data-state="closed"]')).toBeNull();
    }
  });

  it("supports arrow-key navigation and links calming tabs to their panel", () => {
    render(<CalmDownTool child={child} profile={{}} />);
    const breathing = screen.getByRole("tab", { name: "Breathing" });
    const grounding = screen.getByRole("tab", { name: "Grounding" });
    breathing.focus();
    fireEvent.keyDown(breathing, { key: "ArrowRight" });
    expect(document.activeElement).toBe(grounding);
    expect(grounding.getAttribute("aria-selected")).toBe("true");
    expect(grounding.tabIndex).toBe(0);
    expect(breathing.tabIndex).toBe(-1);
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(grounding.id);
    fireEvent.keyDown(grounding, { key: "Home" });
    expect(document.activeElement).toBe(breathing);
  });

  it("keeps keyboard focus inside support and restores it and scrolling on Escape", async () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const previousOverflow = document.body.style.overflow;
    const mounted = mountOverlay();
    const dialog = await screen.findByRole("dialog");
    expect(document.activeElement).toBe(dialog);
    expect(document.body.style.overflow).toBe("hidden");
    const controls = dialog.querySelectorAll("button");
    controls[controls.length - 1].focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(controls[0]);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe(previousOverflow);
    expect(document.activeElement).toBe(trigger);
    mounted.unmount();
    trigger.remove();
  });
});
