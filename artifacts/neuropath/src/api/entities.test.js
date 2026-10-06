import { afterEach, describe, expect, it, vi } from "vitest";
import { entities } from "./entities";

afterEach(() => vi.unstubAllGlobals());

describe("non-blocking engagement tracking", () => {
  it("rejects an unauthorized tracking request without navigating away from caregiver support", async () => {
    const location = { href: "/ParentHome", pathname: "/ParentHome" };
    vi.stubGlobal("window", { location });
    vi.stubGlobal("localStorage", { getItem: () => null });
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 401, ok: false })));

    await expect(entities.EngagementEvent.create({
      child_id: "child-1", event_type: "behavior_viewed", topic: "Transition difficulty",
    })).rejects.toThrow("401");
    expect(location.href).toBe("/ParentHome");
  });
});
