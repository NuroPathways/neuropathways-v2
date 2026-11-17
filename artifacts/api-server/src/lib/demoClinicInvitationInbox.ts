import path from "node:path";
import type { ClinicInvitationEmail } from "./clinicInvitationDelivery";
import { hashClinicInvitationToken } from "./clinicInvitationSecurity";

type CapturedInvitation = {
  token: string;
  invitedEmail: string;
  clinicName: string;
  roleLabel: string;
  capturedAt: string;
};

const capturedInvitations = new Map<string, CapturedInvitation>();
const MAX_CAPTURED_INVITATIONS = 500;

function isWithin(childPath: string, parentPath: string): boolean {
  const relative = path.relative(parentPath, childPath);
  return Boolean(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/**
 * The demo inbox is available only in the exact disposable loopback demo and
 * signed-in browser-test environments. A normal development or production
 * process cannot enable it merely by setting the feature flag.
 */
export function isIsolatedClinicInvitationDemo(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): boolean {
  if (
    env.NODE_ENV !== "test" ||
    env.NP_CLINIC_ONBOARDING_DEMO_INBOX !== "1" ||
    env.REPLIT_CONNECTORS_ENABLED !== "false"
  ) return false;

  let database: URL;
  try {
    database = new URL(env.DATABASE_URL || "");
  } catch {
    return false;
  }
  if (database.hostname !== "127.0.0.1") return false;

  const projectRoot = path.resolve(cwd, "../..");
  const privateDir = path.resolve(env.NP_DEMO_PRIVATE_DIR || "");
  const storageDir = path.resolve(env.NP_TEST_STORAGE_DIR || "");
  if (!env.NP_DEMO_PRIVATE_DIR || !env.NP_TEST_STORAGE_DIR || !isWithin(storageDir, privateDir)) return false;

  if (
    env.NP_CLINIC_ONBOARDING_DEMO_MODE === "1" &&
    database.pathname === "/np_demo_clinic_onboarding"
  ) {
    const demoRoot = path.join(projectRoot, ".local", "clinic-onboarding-demo");
    const relative = path.relative(demoRoot, privateDir).split(path.sep);
    return relative.length === 2 && /^run-[^/]+$/.test(relative[0]) && relative[1] === "private";
  }

  if (
    database.pathname === "/np_clinic_onboarding_browser_test" &&
    env.NP_TEST_BROWSER_EXPECTED_DATABASE === "np_clinic_onboarding_browser_test" &&
    env.NP_TEST_BROWSER_EVIDENCE_DIR
  ) {
    const evidenceDir = path.resolve(env.NP_TEST_BROWSER_EVIDENCE_DIR);
    const verificationRoot = path.join(projectRoot, ".local", "verification");
    return isWithin(evidenceDir, verificationRoot) &&
      /^run-\d{8}T\d{6}Z$/.test(path.basename(evidenceDir)) &&
      privateDir === path.join(evidenceDir, "private-run");
  }

  return false;
}

function getInvitationToken(invitationUrl: string): string | null {
  try {
    const url = new URL(invitationUrl);
    const token = new URLSearchParams(url.hash.replace(/^#/, "")).get("token");
    return token && /^[A-Za-z0-9_-]{32,128}$/.test(token) ? token : null;
  } catch {
    return null;
  }
}

export function captureDemoClinicInvitation(
  email: ClinicInvitationEmail,
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): boolean {
  if (!isIsolatedClinicInvitationDemo(env, cwd)) return false;

  const token = getInvitationToken(email.invitationUrl);
  const baseUrl = env.NP_CLINIC_INVITATION_BASE_URL;
  if (!token || !baseUrl) return false;
  try {
    const invitationUrl = new URL(email.invitationUrl);
    const expectedUrl = new URL(baseUrl);
    if (invitationUrl.origin !== expectedUrl.origin || invitationUrl.pathname !== expectedUrl.pathname) return false;
  } catch {
    return false;
  }

  const tokenHash = hashClinicInvitationToken(token);
  capturedInvitations.set(tokenHash, {
    token,
    invitedEmail: email.to,
    clinicName: email.clinicName,
    roleLabel: email.roleLabel,
    capturedAt: new Date().toISOString(),
  });
  while (capturedInvitations.size > MAX_CAPTURED_INVITATIONS) {
    const oldest = capturedInvitations.keys().next().value;
    if (oldest) capturedInvitations.delete(oldest);
  }
  return true;
}

export function getCapturedDemoClinicInvitations() {
  return [...capturedInvitations.entries()].map(([tokenHash, invitation]) => ({
    tokenHash,
    ...invitation,
  }));
}

export function clearCapturedDemoClinicInvitationsForTests(): void {
  capturedInvitations.clear();
}
