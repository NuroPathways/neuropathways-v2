import assert from "node:assert/strict";
import { test } from "node:test";
import {
  captureDemoClinicInvitation,
  clearCapturedDemoClinicInvitationsForTests,
  getCapturedDemoClinicInvitations,
  isIsolatedClinicInvitationDemo,
} from "./demoClinicInvitationInbox";
import { hashClinicInvitationToken } from "./clinicInvitationSecurity";

function manualDemoEnvironment() {
  const cwd = "/tmp/fictional-neuropathways/artifacts/api-server";
  const privateDir = "/tmp/fictional-neuropathways/.local/clinic-onboarding-demo/run-20261116T000000Z-fictional/private";
  return {
    cwd,
    env: {
      NODE_ENV: "test",
      NP_CLINIC_ONBOARDING_DEMO_INBOX: "1",
      NP_CLINIC_ONBOARDING_DEMO_MODE: "1",
      REPLIT_CONNECTORS_ENABLED: "false",
      DATABASE_URL: "postgres://fictional@127.0.0.1:5432/np_demo_clinic_onboarding",
      NP_DEMO_PRIVATE_DIR: privateDir,
      NP_TEST_STORAGE_DIR: `${privateDir}/storage`,
      NP_CLINIC_INVITATION_BASE_URL: "http://127.0.0.1:5173/ClinicInvitation",
    } satisfies NodeJS.ProcessEnv,
  };
}

test("demo invitation inbox is restricted to exact isolated loopback environments", () => {
  const manual = manualDemoEnvironment();
  assert.equal(isIsolatedClinicInvitationDemo(manual.env, manual.cwd), true);
  assert.equal(isIsolatedClinicInvitationDemo({ ...manual.env, NODE_ENV: "production" }, manual.cwd), false);
  assert.equal(isIsolatedClinicInvitationDemo({ ...manual.env, NODE_ENV: "development" }, manual.cwd), false);
  assert.equal(isIsolatedClinicInvitationDemo({ ...manual.env, REPLIT_CONNECTORS_ENABLED: "true" }, manual.cwd), false);
  assert.equal(isIsolatedClinicInvitationDemo({
    ...manual.env,
    DATABASE_URL: "postgres://fictional@db.example.test/np_demo_clinic_onboarding",
  }, manual.cwd), false);
  assert.equal(isIsolatedClinicInvitationDemo({
    ...manual.env,
    DATABASE_URL: "postgres://fictional@127.0.0.1:5432/application",
  }, manual.cwd), false);
  assert.equal(isIsolatedClinicInvitationDemo({
    ...manual.env,
    NP_DEMO_PRIVATE_DIR: "/tmp/public/credentials",
  }, manual.cwd), false);
});

test("demo invitation capture keeps only valid invitation token metadata in process memory", () => {
  clearCapturedDemoClinicInvitationsForTests();
  try {
    const { env, cwd } = manualDemoEnvironment();
    const token = "fictional-token-0123456789abcdefghijklmnopqrstuvwxyz";
    const invitation = {
      to: "fictional.clinician@example.test",
      clinicName: "Fictional Clinic",
      roleLabel: "treating clinician",
      invitationUrl: `${env.NP_CLINIC_INVITATION_BASE_URL}#token=${token}`,
    };
    assert.equal(captureDemoClinicInvitation(invitation, env, cwd), true);
    const captured = getCapturedDemoClinicInvitations();
    assert.equal(captured.length, 1);
    assert.equal(captured[0].tokenHash, hashClinicInvitationToken(token));
    assert.equal(captured[0].token, token);
    assert.equal(captured[0].invitedEmail, invitation.to);

    assert.equal(captureDemoClinicInvitation({
      ...invitation,
      invitationUrl: `https://outside.example.test/ClinicInvitation#token=${token}`,
    }, env, cwd), false);
    assert.equal(getCapturedDemoClinicInvitations().length, 1);
  } finally {
    clearCapturedDemoClinicInvitationsForTests();
  }
});
