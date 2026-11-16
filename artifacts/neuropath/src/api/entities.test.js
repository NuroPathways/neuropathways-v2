import { afterEach, describe, expect, it, vi } from "vitest";
const { fetchWithServiceRecovery } = vi.hoisted(() => ({ fetchWithServiceRecovery: vi.fn() }));
vi.mock("@workspace/api-client-react", () => ({
  fetchWithServiceRecovery,
  fetchDocumentScan: vi.fn(),
}));
import { base44, entities, integrations } from "./entities";

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

describe("invitation email adapter", () => {
  it("reports email delivery as unavailable", async () => {
    const response = await base44.functions.invoke("sendInviteEmail", {
      to: "caregiver@example.test",
      inviteToken: "fictional-invite-token-9573",
    });

    expect(response).toEqual({ data: { delivery_status: "unavailable" } });
  });

  it("never logs access codes, passwords, or invitation tokens", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const secrets = ["fictional-access-code-4821", "fictional-password-7319", "fictional-invite-token-9573"];

    const response = await base44.functions.invoke("sendInviteEmail", {
      access_code: secrets[0],
      password: secrets[1],
      inviteToken: secrets[2],
    });

    expect(response.data.delivery_status).toBe("unavailable");
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    for (const secret of secrets) {
      expect([log, warn, error].flatMap((spy) => spy.mock.calls.flat()).join(" ")).not.toContain(secret);
    }
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
