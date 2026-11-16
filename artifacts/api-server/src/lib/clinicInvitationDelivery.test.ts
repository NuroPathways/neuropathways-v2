import assert from "node:assert/strict";
import { test } from "node:test";
import { createClinicInvitationMailer } from "./clinicInvitationDelivery";

const invitation = {
  to: "fictional.clinician@example.test",
  clinicName: "Fictional Clinic",
  roleLabel: "treating clinician",
  invitationUrl: "http://127.0.0.1:4100/ClinicInvitation#token=fictional-only-token",
};

test("invitation email delivery is disabled outside the test environment", async () => {
  let requests = 0;
  const send = createClinicInvitationMailer({
    nodeEnv: "production",
    sinkUrl: "http://127.0.0.1:4010/mail",
    invitationBaseUrl: "http://127.0.0.1:4100/ClinicInvitation",
    fetchImpl: async () => {
      requests += 1;
      return new Response(null, { status: 202 });
    },
  });
  assert.equal(await send(invitation), "not_sent");
  assert.equal(requests, 0);
});

test("test mail sink accepts only loopback and captures no response data in the app", async () => {
  let captured: unknown;
  const send = createClinicInvitationMailer({
    nodeEnv: "test",
    sinkUrl: "http://127.0.0.1:4010/mail",
    invitationBaseUrl: "http://127.0.0.1:4100/ClinicInvitation",
    fetchImpl: async (_input, init) => {
      captured = JSON.parse(String(init?.body));
      return new Response(null, { status: 202 });
    },
  });
  assert.equal(await send(invitation), "test_sink_accepted");
  assert.equal((captured as { to: string }).to, invitation.to);
  assert.match((captured as { text: string }).text, /fictional-only-token/);
  assert.equal(
    await createClinicInvitationMailer({
      nodeEnv: "test",
      sinkUrl: "https://mail.example.test/send",
      invitationBaseUrl: "https://app.example.test/ClinicInvitation",
      fetchImpl: async () => {
        throw new Error("External services must never be called");
      },
    })(invitation),
    "not_sent",
  );
});

test("a failed test sink is reported without exposing its response body", async () => {
  const send = createClinicInvitationMailer({
    nodeEnv: "test",
    sinkUrl: "http://127.0.0.1:4010/mail",
    invitationBaseUrl: "http://127.0.0.1:4100/ClinicInvitation",
    fetchImpl: async () => new Response("synthetic private error", { status: 500 }),
  });
  assert.equal(await send(invitation), "failed");
});
