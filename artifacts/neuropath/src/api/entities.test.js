import { afterEach, describe, expect, it, vi } from "vitest";
const { fetchWithServiceRecovery } = vi.hoisted(() => ({ fetchWithServiceRecovery: vi.fn() }));
vi.mock("@workspace/api-client-react", () => ({
  fetchWithServiceRecovery,
  fetchDocumentScan: vi.fn(),
}));
import { entities, integrations } from "./entities";

afterEach(() => vi.unstubAllGlobals());

describe("non-blocking engagement tracking", () => {
  it("rejects an unauthorized tracking request without navigating away from caregiver support", async () => {
    const location = { href: "/ParentHome", pathname: "/ParentHome" };
    vi.stubGlobal("window", { location });
    vi.stubGlobal("localStorage", { getItem: () => null });
    fetchWithServiceRecovery.mockResolvedValue({ status: 401, ok: false });

    await expect(entities.EngagementEvent.create({
      child_id: "child-1", event_type: "behavior_viewed", topic: "Transition difficulty",
    })).rejects.toThrow("401");
    expect(location.href).toBe("/ParentHome");
  });
});

describe("server-controlled AI chat requests", () => {
  afterEach(() => fetchWithServiceRecovery.mockReset());

  it.each([
    ["individual client", "individual", "X-Client-Session"],
    ["legacy family", "legacy_family", "X-Family-Token"],
  ])("sends %s credentials only in the authorization header", async (_label, accountType, headerName) => {
    fetchWithServiceRecovery.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ answer: "Safe test response", outcome: "success" }),
    });

    await integrations.Core.Chat({
      child_id: "fictional-child",
      message: "What can I do?",
      prior_messages: ["Earlier safe question"],
      client_session_token: "synthetic-token",
      client_session_type: accountType,
      mode: "chat",
    });

    expect(fetchWithServiceRecovery).toHaveBeenCalledTimes(1);
    const [url, init] = fetchWithServiceRecovery.mock.calls[0];
    expect(url).toBe("/api/ai/chat");
    expect(init.headers[headerName]).toBe("synthetic-token");
    const sentBody = JSON.parse(init.body);
    expect(sentBody).toEqual({
      childId: "fictional-child",
      message: "What can I do?",
      priorMessages: ["Earlier safe question"],
      mode: "chat",
    });
    expect(sentBody).not.toHaveProperty("system");
    expect(sentBody).not.toHaveProperty("role");
    expect(sentBody).not.toHaveProperty("sourceDocumentIds");
    expect(sentBody).not.toHaveProperty("conversationId");
    expect(sentBody).not.toHaveProperty("client_session_token");
  });
});
