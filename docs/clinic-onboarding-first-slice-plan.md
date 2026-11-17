# Clinic onboarding first-slice plan

## Baseline

- At the original report, the feature base was `613ce7a2d51a4a60d81b7b13bf745eab53cca0f0`; implementation work later started from `bcaac392022a39d6ea78d873d88540a5f0de3b54`.
- The generated agent-asset metadata was already changed at that original baseline and was preserved.
- The original report found no clinic-provisioning or staff-invitation UI/API; the implementation below now adds that first slice while retaining existing authorization as the source of truth.

## Implementation and verification stages

1. **Safe foundation:** add an additive, reversible invitation schema and email-verification claim storage; hash expiring, single-use clinic invite tokens; provide an operator-only first-platform-admin bootstrap command that requires an explicit existing verified account and refuses to promote an inferred/current user. Rehearse the migration only on a disposable loopback database.
2. **Platform clinic setup:** add platform-admin-only APIs and UI for idempotent clinic creation and first clinic-admin invitation, including safe pending-invite revoke/reissue. A platform grant does not confer chart access.
3. **Clinic staff onboarding:** add clinic-admin-only clinician invitations and pending/active listing, safe invite revoke/reissue, and same-clinic client assignment using the existing authorization-checked reassignment route. Preserve membership revocation behavior; do not add role editing or cross-clinic transfers.
4. **Delivery boundary:** use an injectable server-side invitation-mail interface with a loopback-only test sink. With no sender configured, persist the invitation and report “invitation created, email not sent.” Never send passwords/access codes or log message bodies, credentials, or raw tokens.
5. **Fictional demo and acceptance:** add guarded, idempotent fresh and populated demo setup, isolated credentials and a reset that targets only the exact private demo workflow. The demo creates its own loopback PostgreSQL cluster and storage; genuine audit events from demo interactions are exported separately from fixture setup. Real-backend browser acceptance covers platform/admin/staff/caregiver flows, authorization failures, retries, revocation, audit attribution, and desktop/mobile web.

Each stage will be typechecked and tested against isolated fixtures before being committed. The final evidence will identify tested commits, distinguish real backend/browser checks from mocks, and include migration/rollback, operator bootstrap, demo, and five-minute demonstration instructions. No live email, production data, push, or deployment is in scope.

## Executed verification snapshot

- Last previously committed source before this batch: `bcaac392022a39d6ea78d873d88540a5f0de3b54`.
- Isolated integration suite: 18 passed, 0 failed, using a disposable loopback PostgreSQL cluster and fake email sink; see the dated `.local/verification/clinic-onboarding-first-slice-*` report.
- Signed-in browser acceptance: 12 passed, 0 failed, 0 not run; desktop and mobile web; fictional users only. No live email or AI provider was called.
- The fresh-state demo signed in successfully and displayed the empty clinic workspace (1 browser check passed). The populated demo signed in as the platform administrator and as a caregiver, showing only the linked demo child (3 checks passed). Credentials, database files, and private storage were excluded from retained evidence.
- Existing failed browser attempts are retained with causes: first application failure was missing clinic scope for parent-linked records; later failures were test-harness locator/schema mistakes. The final 12-check browser run passed after the code and harness corrections.

## Unified public entry and workspace verification (2026-11-16)

- Work started from `3298c788c0ceee16b88d64719fd5165e531602dc`. The implementation commit will be recorded in the evidence manifest and final handoff. The pre-existing `.replit` port-mapping edit was preserved and excluded from the implementation commit.
- **Public entry → reused route/service → authorized destination**

  | Public entry | Existing route/service | Server-authorized destination |
  | --- | --- | --- |
  | Caregiver sign in | `/ParentLogin` | Existing caregiver Home or `/ParentQuickStart` |
  | Create caregiver account | `/ParentSignup` | Existing caregiver onboarding and `/ParentQuickStart` |
  | Family username/access code | `/UsernameLogin` | Existing family-scoped caregiver workspace |
  | Clinician sign in | `/ClinicianLogin?workspace=clinician` | `/ClinicianDashboard` only with active clinical access |
  | Clinic administrator sign in | `/ClinicianLogin?workspace=clinic-admin` | `/ClinicianUsers` only with active clinic-admin membership |
  | Register your clinic | `/ClinicRequest` | Pending request only; no role, clinic, account, or invitation until platform-admin approval |
  | Platform administrator | Existing `/ClinicianLogin` (not a public card) | `/PlatformAdminClinics` only with active platform-admin grant |

- Multiple valid workspaces route to `/WorkspaceSelect`; the server response is the source of authorized workspace IDs. The `workspace` query parameter is navigation intent only and cannot grant a role.
- Staff UI distinguishes membership and invitation states, shows invitation creation/last-attempt/expiry separately from delivery state, and reports pending invitees as “Account not activated.” Clinic admin navigation exposes the clinic overview, staff/invitations, and client assignments; treating clinicians and caregivers do not receive clinic or platform controls. No role editor or platform staff-management privilege was added.
- **Current run results:** 18 signed-in/unauthenticated browser checks passed, 0 failed, 0 not run; 19 isolated real-backend API integration checks passed; frontend tests passed 368/368 across 40 files; frontend and API typechecks passed; generated shared-library TypeScript check and frontend production build passed. No live AI, external mail, or paid provider was used. Browser evidence covers desktop and mobile-sized web, not native-device behavior.
- The browser run used base commit `3298c788c0ceee16b88d64719fd5165e531602dc` plus the working-tree implementation and test changes recorded in the sanitized run evidence. The final commit and its application-file checksum are recorded in the evidence ZIP so the committed application code can be compared with the tested tree.
- The already-running populated demo was intentionally left untouched. Its run record identifies commit `6db5bd46bae93324d73c4f34876c28d12650273e`, port 5173, isolated database `np_demo_clinic_onboarding`, disabled connectors, and no live AI/email. A read-only check confirmed two clinics, five clinician credential profiles (one platform operator, one clinic admin, three treating clinicians), five caregiver accounts, five children, five active child assignments, and one active platform-admin grant. Clinic memberships are one active clinic admin and three active treating clinicians split across the two clinics. The active run predates the new workspace landing implementation.
- At that verification snapshot, the isolated acceptance runner's fake mail sink accepted invitations only on loopback, while the interactive populated demo had no operator-only invitation-link inbox. The guarded inbox added afterward is documented and verified below; it does not send real email.
- Exact command: `scripts/clinic-onboarding/run-isolated-browser-e2e.sh`. Sanitized run evidence, audit events, screenshots, test commands/results, and checksums are in the downloadable archive linked from the handoff. Private demo credentials, temporary database/storage, browser profiles, and raw invitation tokens are excluded.

## Isolated demo invitation-link inbox (2026-11-17)

- Added a memory-only invitation-link inbox for the isolated fresh/populated demo builds. No second invitation engine or account system was introduced; invitation creation, expiry, reissue, revocation, and acceptance still use the existing services and records.
- The platform administrator can open only pending first-administrator invitations. A clinic administrator can open only pending treating-clinician invitations for an active clinic they administer. Signed-out users and family accounts are denied; accepted, expired, revoked, and superseded invitation rows are not returned.
- The web control is compiled only when the guarded isolated-demo build flag is set. The API also checks test mode, disabled connectors, loopback database name/host, run-specific private storage, and the exact demo or browser-evidence directory. Responses are marked private/no-store; event metadata contains only a result count and never invitation tokens.
- Links are held in the API process memory, available only during that isolated run, and opened through the existing `/ClinicInvitation` flow. This remains local demonstration behavior, not email delivery.
- Final isolated results: signed-in browser acceptance **19/19 passed** with 0 failed/not run; isolated API suite **22/22 passed**; frontend unit tests **368/368 passed**; API/frontend/shared-library typechecks, API build, and demo-flagged web build passed. Exact run directories and genuine audit evidence are recorded in `docs/clinic-onboarding-demo.md` and the sanitized evidence archive. Prior harness locator/race failures remain preserved as separate attempts and are not counted as final passes.
- The final run exercised the UI-created link through the existing `/ClinicInvitation` page, verified the invitation token by comparing its hash to the stored invitation hash without printing it, verified clinic-admin and platform-admin role scoping, and confirmed success/denial audit events without raw links in audit data.
