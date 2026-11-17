# Clinic onboarding fictional demo

The demo is a local, fictional-data rehearsal. It is not a production onboarding shortcut, does not send mail, and does not bypass authentication or authorization.

## Intended demo states

1. **Fresh onboarding:** one fictional platform administrator exists and the clinic list is empty. The presenter creates the clinic and first administrator through the actual platform UI.
2. **Populated clinic:** two fictional clinics exist. Clinic North has one administrator, two treating clinicians, and five caregiver/child pairs with explicit clinician assignments. Clinic South has an unrelated clinician to demonstrate tenant boundaries.
3. **Optional activity:** any seeded activity data must be labelled as simulated demo content, not as real caregiver or clinical history.

Use unique, randomly generated credentials for each rehearsal. The demo tooling writes them to `.local/clinic-onboarding-demo/run-<timestamp>-<id>/private/credentials.json` with mode `0600`; it never prints password values, uses a shared password, or includes credentials in evidence ZIPs. A normal clean stop removes the private run directory. If the Replit workflow is terminated unexpectedly, a stale marker and private files can remain; do not use those credentials unless the matching demo workflow and preview port are confirmed active. Clean up stale state only through the guarded reset flow after confirming that the fictional changes can be discarded. This repository intentionally does not seed or activate a user when an ordinary person first registers.

## Safety requirements for demo tooling

The seed command requires all of the following before it can alter data:

- `NODE_ENV=test` (or an explicit demo mode);
- a database name exactly `np_demo_clinic_onboarding`;
- a PostgreSQL connection whose server address is loopback;
- an empty fresh database and a marker row proving which fictional rows were seeded;
- disabled Replit connectors and a private, run-specific storage directory.

The seed command refuses every other database name, non-loopback host, unmarked pre-existing account/clinic, or active conflicting demo state. The workflow creates its own throwaway PostgreSQL cluster, loopback-only API and file storage; it does not point the normal app at demo data. Only the fictional UI listener binds to the unspecified preview address so Replit's proxy can display it; API, database, and storage remain private/loopback, and outbound network requests stay blocked. A reset command first verifies the exact demo mode, run marker, database name/host, private data directory, and owning workflow process. It then stops that workflow; its cleanup removes only that run's entire private cluster, credentials, and storage. Before removal, sanitized demo audit events are exported to `.local/verification/clinic-onboarding-demo/<timestamp>/`, with structural fields only (no document content, prompts, credentials, or response bodies). If ownership checks fail, reset stops without deleting anything.

## Start and reset the interactive demo

The repository has two dedicated, non-artifact demo workflows:

- **Clinic onboarding — populated demo**: a populated fictional state on port 5173.
- **Clinic onboarding — fresh setup**: a platform-admin-only starting state on port 5000.

Start only the state you want to show. The command creates a new local PostgreSQL cluster, applies the existing schema, seeds only fictional accounts, writes random credentials to the private file above, and serves the built web app through a same-origin API proxy. Live email, AI, connectors, cloud storage, and the configured app database are not used. Sign in through the visible login page; do not bypass authentication.

The same modes can be started directly from Replit Shell if needed:

```sh
PORT=5173 scripts/clinic-onboarding/demo-workflow.sh populated
PORT=5000 scripts/clinic-onboarding/demo-workflow.sh fresh
```

For the populated state, open the credential file named in the workflow's private setup output while that workflow is running. It is stored under `.local/clinic-onboarding-demo/run-<timestamp>-<id>/private/credentials.json` with private file permissions. To locate the current run's file in Replit Shell, run `find .local/clinic-onboarding-demo -path '*/private/credentials.json' -print` and choose the run whose mode and start time match the active populated workflow. Read that file only in the private Shell; use the labelled Platform Admin, Clinic Admin, Clinician, or Caregiver entry. Do not paste credentials into chat, screenshots, reports, or evidence packages.

Resetting a run deletes its fictional database, any interaction changes made during the walkthrough, local credentials, and private storage. Do not reset an active manual walkthrough unless the presenter confirms those demo changes can be discarded. To discard a run from Shell, confirm the exact demo mode:

```sh
scripts/clinic-onboarding/reset-demo.sh populated --confirm=RESET-ISOLATED-CLINIC-DEMO
# or
scripts/clinic-onboarding/reset-demo.sh fresh --confirm=RESET-ISOLATED-CLINIC-DEMO
```

The command signals only the positively identified matching demo workflow. Normal app services and databases are not targets. The workflow exports sanitized fictional audit events, stops its private PostgreSQL process, and removes its private database files, object storage, and credentials. It retains the audit export and non-secret run summary. Starting the same workflow again creates a new isolated database and new credentials.

## Five-minute demonstration

1. Open the **Clinic onboarding — fresh setup** preview and use the private Platform Admin credentials at `/OperatorLogin`. The same staff sign-in service is used; the clinic list starts empty.
2. Use **Create a clinic and invite** to create a fictional clinic and enter a fictional first-admin address. No real email is sent. In the isolated demo, open **Local invitation links**, choose **Show local links**, and use **Open invitation** to continue the first-admin activation in the browser.
3. Open the **Clinic onboarding — populated demo** preview. Sign in as Clinic Admin and use **Clinic overview**, **Staff & invitations**, and **Client assignments** in the navigation. These sections use the existing `ClinicianUsers` page; they do not grant clinical chart access by themselves.
4. Sign in as a seeded treating clinician to confirm the client list is limited to explicit assignments. Sign in as a caregiver to see the seeded child's Home, support and practice surfaces.
5. Optionally use the second clinic's clinician to confirm their account is separate. Do not use real email addresses or real client data.
6. Stop/reset the demo workflow(s) with the exact mode-specific reset command above only after confirming the fictional changes can be discarded. Keep the sanitized audit export if you want evidence of the demo interactions.

## Current public entry points and workspaces

The landing page offers **Caregiver sign in**, **Create a caregiver account**, and **Use family username and access code** using the existing caregiver routes. **Clinician sign in** and **Clinic administrator sign in** use the same existing `ClinicianLogin` form; the selected link only supplies a navigation preference and does not grant a role. **Request clinic setup** opens `ClinicRequest`, which submits only a pending request. The discreet **NeuroPathways operator sign in** link in the footer opens `/OperatorLogin`; it is not a role card and does not grant access.

After sign-in, workspace options are derived from the account's active server-side permissions. A platform administrator goes to **Clinic management** (`PlatformAdminClinics`); a clinic administrator goes to `ClinicianUsers` with clinic-only administration; a treating clinician goes to `ClinicianDashboard`; and an independent caregiver goes to the existing caregiver home. Accounts with multiple authorized roles can choose among only those existing workspaces. A workspace link never changes a membership or role.

On a populated demo, open **Staff & invitations** to view membership status and invitation history. Delivery state is separate from invitation state. A pending invitee is labelled **Account not activated**. **Last delivery attempt** is recorded only when the isolated test mail sink was actually invoked; if no attempt is recorded, the interface says so. Reissue actions are labelled **Reissue**, not “Resend,” and the demo does not send real email.

The **Register your clinic** form accepts clinic name, contact name, work email, and optional website, and explicitly says not to submit patient details. Submission alone creates no clinic, account, membership, or invitation. Only an explicitly authorized platform administrator can review a pending request and approve it; approval asks the operator to confirm the first administrator address and invokes the existing clinic-provisioning and invitation service.

The formal signed-in browser acceptance run separately exercised first-admin invitation acceptance, clinician invitations, caregiver consent/merge, assignment changes, session revocation, and mobile-sized web navigation through a loopback fake mail sink. That automation does not send live mail and is not reproduced by the fresh interactive setup's no-send invitation.

The populated state is entirely fictional. The parent/clinic consent rows are synthetic seed data for demonstration only; they do not represent real permission or consent. Seeding starts with an empty isolated database and does not alter existing account memberships, clinical records, caregiver consent, or audit rows. UI actions create genuine application audit records for fictional actors; fixture setup itself creates none.

## Role sign-in and navigation

All roles use existing authentication. Public **Clinician sign in** and **Clinic administrator sign in** links reach the same `/ClinicianLogin` page with different heading/navigation intent; the intent never grants a role. **NeuroPathways operator sign in** opens `/OperatorLogin`, which renders that same shared staff sign-in component with an operator-specific heading. It offers no registration or role selection. Use **Sign In with Email**, enter the selected private account's email and password, then **Sign In**. The server-provided active platform-administrator workspace determines access; any other signed-in account receives an access-denied message and a link only to its authorized workspace. Direct access to `/PlatformAdminClinics` redirects to operator sign-in for other accounts, and platform-management API authorization remains enforced server-side.

| Demo role | Sign-in route | Authorized landing page | Navigation in that workspace |
| --- | --- | --- | --- |
| Platform administrator | `/OperatorLogin` (or existing `/ClinicianLogin`) | `/PlatformAdminClinics` — **Clinic management** | Clinic list and request review/provisioning controls only; no client records or clinical tools |
| Clinic administrator | `/ClinicianLogin?workspace=clinic-admin` | `/ClinicianUsers` | **Clinic overview**, **Staff & invitations**, and **Client assignments** for their clinic |
| Treating clinician | `/ClinicianLogin?workspace=clinician` | `/ClinicianDashboard` | Clinical workspace, limited to explicitly assigned clients |
| Caregiver | `/ParentLogin` or `/UsernameLogin` for family access-code login | `/ParentQuickStart` for a new account; otherwise `/ParentHome` | Home, Help Now, Practice, Goals, AI Chat, history and documents according to account permissions |

Accounts with more than one active authorized workspace see **Choose your workspace** at `/WorkspaceSelect`. Selecting a workspace changes navigation only; it does not change the account's memberships or clinical assignments. A standalone caregiver can use the caregiver workspace without clinic membership.

## Local invitation links

The isolated interactive demo keeps invitation tokens in server memory for the current run and does not send real email. The **Local invitation links** panel appears only in the isolated demo build. Platform administrators can open pending first-administrator links. Clinic administrators can open pending treating-clinician links only for clinics they actively administer. Signed-out visitors, caregivers, and treating clinicians are denied. Accepted, expired, revoked, and superseded links are not displayed. Tokens are not shown as page text or written to audit metadata or application logs. The links disappear when the demo process stops; do not share or capture them in screenshots.

The automated browser acceptance runner separately uses a loopback-only fake email sink and its own isolated database. It opens its captured links in a signed-in test browser; no external email is sent. Run `scripts/clinic-onboarding/run-isolated-browser-e2e.sh` to repeat that automated flow. Raw tokens are not printed or included in evidence.

## Prior local verification snapshot (2026-11-16)

On 2026-11-16, the public landing and workspace changes were checked against an isolated fictional database, temporary local storage, real application authentication/session/API/database writes, and a loopback-only test email sink. The browser run recorded **18 passed, 0 failed, 0 not run**. The API onboarding integration recorded **19 passed, 0 failed**. Frontend unit tests recorded **368 passed** across 40 files. API and frontend typechecks, shared-library generated TypeScript checks, and the production frontend build passed. The browser checks exercised desktop and mobile-sized web layouts; they do not establish native-device behavior or live email/provider delivery.

The sanitized browser evidence, genuine audit-event export, screenshots, and command results are kept in the local ignored directory `.local/verification/clinic-onboarding-browser-20261116T202514Z/run-20261116T202514Z/`. The downloadable evidence archive is separate from the private demo credential file. Do not move `private-run/`, credentials, temporary databases, browser profiles, or raw invitation tokens into the archive.

## Latest local verification (2026-11-17)

The guarded inbox was tested with actual signed-in browser sessions and isolated fictional PostgreSQL/storage. The final browser run recorded **19 passed, 0 failed, 0 not run**; it covered public navigation, real platform/clinic-admin/clinician/caregiver sign-ins, request approval, invitation creation and acceptance, role-scoped local links, reissue hiding the superseded link, caregiver/clinician/signed-out denials, clinic assignment and revocation, and mobile-sized web layouts. The inbox responses are private/no-store and the browser run confirmed genuine success and denial audit events without invitation token values.

The isolated API runner recorded **22 passed, 0 failed**; focused invitation-inbox unit tests recorded **6 passed, 0 failed** (included in the API runner total). Frontend tests passed **368/368 across 40 files**. API and frontend typechecks, shared-library typecheck, API build, and demo-flagged production web build passed. No native-device test, live email delivery, live AI, AWS/staging deployment, or real-family test was performed.

The final sanitized browser run and screenshots are in `.local/verification/clinic-onboarding-browser-20261117T040903Z/run-20261117T040903Z/`; the isolated API run is in `.local/verification/clinic-onboarding-first-slice-20261117T040738Z/api-20261117T040738Z/`. The test runner removed only its own database, storage, and browser profiles, and did not start, stop, or reset the separate interactive demo. Check its current workflow status before using or resetting it.
