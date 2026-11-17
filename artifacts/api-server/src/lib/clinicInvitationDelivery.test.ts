import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { createClinicInvitationMailer } from "./clinicInvitationDelivery";
import {
  clearCapturedDemoClinicInvitationsForTests,
  getCapturedDemoClinicInvitations,
} from "./demoClinicInvitationInbox";
import { hashClinicInvitationToken } from "./clinicInvitationSecurity";

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

test("the isolated interactive demo captures invitation links locally without sending email", async () => {
  const root = path.resolve(process.cwd(), "../..");
  const privateDir = path.join(root, ".local", "clinic-onboarding-demo", "run-test-only", "private");
  const envKeys = [
    "NODE_ENV",
    "NP_CLINIC_ONBOARDING_DEMO_INBOX",
    "NP_CLINIC_ONBOARDING_DEMO_MODE",
    "REPLIT_CONNECTORS_ENABLED",
    "DATABASE_URL",
    "NP_DEMO_PRIVATE_DIR",
    "NP_TEST_STORAGE_DIR",
    "NP_CLINIC_INVITATION_BASE_URL",
    "NP_CLINIC_INVITATION_TEST_SINK_URL",
  ] as const;
  const original = new Map(envKeys.map((key) => [key, process.env[key]]));
  let requests = 0;
  const demoToken = "fictional-demo-link-0123456789abcdefghijklmnopqrstuvwxyz";
  try {
    process.env.NODE_ENV = "test";
    process.env.NP_CLINIC_ONBOARDING_DEMO_INBOX = "1";
    process.env.NP_CLINIC_ONBOARDING_DEMO_MODE = "1";
    process.env.REPLIT_CONNECTORS_ENABLED = "false";
    process.env.DATABASE_URL = "postgres://fictional@127.0.0.1:5432/np_demo_clinic_onboarding";
    process.env.NP_DEMO_PRIVATE_DIR = privateDir;
    process.env.NP_TEST_STORAGE_DIR = path.join(privateDir, "storage");
    process.env.NP_CLINIC_INVITATION_BASE_URL = "http://127.0.0.1:5173/ClinicInvitation";
    process.env.NP_CLINIC_INVITATION_TEST_SINK_URL = "";
    clearCapturedDemoClinicInvitationsForTests();
    const send = createClinicInvitationMailer({
      nodeEnv: "test",
      sinkUrl: "",
      invitationBaseUrl: process.env.NP_CLINIC_INVITATION_BASE_URL,
      fetchImpl: async () => {
        requests += 1;
        throw new Error("The interactive demo must not call an email service.");
      },
    });
    assert.equal(await send({
      ...invitation,
      invitationUrl: `${process.env.NP_CLINIC_INVITATION_BASE_URL}#token=${demoToken}`,
    }), "not_sent");
    assert.equal(requests, 0);
    const captured = getCapturedDemoClinicInvitations();
    assert.equal(captured.length, 1);
    assert.equal(captured[0].tokenHash, hashClinicInvitationToken(demoToken));
  } finally {
    clearCapturedDemoClinicInvitationsForTests();
    for (const [key, value] of original) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
