import { describe, expect, it } from "vitest";
import { getFamilyInviteDeliveryMessage, getInviteDeliveryStatus } from "./inviteDelivery";

describe("invitation delivery status", () => {
  it("only treats an explicit delivered status as delivered", () => {
    expect(getInviteDeliveryStatus({ delivery_status: "delivered" })).toBe("delivered");
    expect(getInviteDeliveryStatus({ delivery_status: "queued" })).toBe("unconfirmed");
    expect(getInviteDeliveryStatus({ delivery_status: "accepted" })).toBe("unconfirmed");
    expect(getInviteDeliveryStatus({ sent: true })).toBe("unconfirmed");
    expect(getInviteDeliveryStatus({})).toBe("unconfirmed");
  });

  it("preserves the explicit unavailable result", () => {
    expect(getInviteDeliveryStatus({ delivery_status: "unavailable" })).toBe("unavailable");
  });

  it("uses truthful reconnect messages for unavailable and unconfirmed delivery", () => {
    expect(getFamilyInviteDeliveryMessage("unavailable", "parent@example.test"))
      .toContain("no email was sent");
    expect(getFamilyInviteDeliveryMessage("unconfirmed", "parent@example.test"))
      .toContain("delivery was not confirmed");
    expect(getFamilyInviteDeliveryMessage("delivered", "parent@example.test"))
      .toContain("Invitation email delivered to parent@example.test");
  });
});
