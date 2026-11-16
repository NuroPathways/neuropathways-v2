# Clinic onboarding fictional demo

The demo is a local, fictional-data rehearsal. It is not a production onboarding shortcut, does not send mail, and does not bypass authentication or authorization.

## Intended demo states

1. **Fresh onboarding:** one fictional platform administrator exists and the clinic list is empty. The presenter creates the clinic and first administrator through the actual platform UI.
2. **Populated clinic:** two fictional clinics exist. Clinic North has one administrator, two treating clinicians, and five caregiver/child pairs with explicit clinician assignments. Clinic South has an unrelated clinician to demonstrate tenant boundaries.
3. **Optional activity:** any seeded activity data must be labelled as simulated demo content, not as real caregiver or clinical history.

Use unique, randomly generated credentials for each rehearsal. The demo tooling writes them to `.local/clinic-onboarding-demo/run-<timestamp>-<id>/private/credentials.json` with mode `0600`; it never prints password values, uses a shared password, or includes credentials in evidence ZIPs. The private file exists only while the corresponding demo workflow is running. This repository intentionally does not seed or activate a user when an ordinary person first registers.

## Safety requirements for demo tooling

The seed command requires all of the following before it can alter data:

- `NODE_ENV=test` (or an explicit demo mode);
- a database name exactly `np_demo_clinic_onboarding`;
- a PostgreSQL connection whose server address is loopback;
- an empty fresh database and a marker row proving which fictional rows were seeded;
- disabled Replit connectors and a private, run-specific storage directory.

The seed command refuses every other database name, non-loopback host, unmarked pre-existing account/clinic, or active conflicting demo state. The workflow creates its own throwaway PostgreSQL cluster, loopback-only API and file storage; it does not point the normal app at demo data. A reset command first verifies the exact demo mode, run marker, database name/host, private data directory, and owning workflow process. It then stops that workflow; its cleanup removes only that run's entire private cluster, credentials, and storage. Before removal, sanitized demo audit events are exported to `.local/verification/clinic-onboarding-demo/<timestamp>/`. If ownership checks fail, reset stops without deleting anything.

## Demo reset and credentials

## Start and reset the interactive demo

The repository has two dedicated, non-artifact demo workflows:

- **Clinic onboarding — populated demo**: a populated fictional state on port 5173.
- **Clinic onboarding — fresh setup**: a platform-admin-only starting state on port 5000.

Start only the state you want to show. The command creates a new local PostgreSQL cluster, applies the existing schema, seeds only fictional accounts, writes random credentials to the private file above, and serves the built web app through a same-origin loopback API proxy. Live email, AI, connectors, cloud storage, and the configured app database are not used. Sign in through the visible login page; do not bypass authentication.

The same modes can be started directly from Replit Shell if needed:

```sh
PORT=5173 scripts/clinic-onboarding/demo-workflow.sh populated
PORT=5000 scripts/clinic-onboarding/demo-workflow.sh fresh
```

For the populated state, open the credential file named in the workflow's private setup output while that workflow is running. Use the labelled Platform Admin, Clinic Admin, Clinician, or Caregiver entry. Do not paste credentials into chat, screenshots, reports, or evidence packages.

To discard a run from Shell, confirm the exact demo mode:

```sh
scripts/clinic-onboarding/reset-demo.sh populated --confirm=RESET-ISOLATED-CLINIC-DEMO
# or
scripts/clinic-onboarding/reset-demo.sh fresh --confirm=RESET-ISOLATED-CLINIC-DEMO
```

The command signals only the positively identified matching demo workflow. Normal app services and databases are not targets. The workflow exports sanitized fictional audit events, stops its private PostgreSQL process, and removes its private database files, object storage, and credentials. It retains the audit export and non-secret run summary. Starting the same workflow again creates a new isolated database and new credentials.

## Five-minute demonstration

1. Open the **Clinic onboarding — fresh setup** preview and sign in using the private Platform Admin credentials. The clinic list starts empty.
2. Use **Create a clinic and invite** to create a fictional clinic and enter a fictional first-admin address. The app reports that no email was sent; this demo does not activate the invite automatically.
3. Open the **Clinic onboarding — populated demo** preview in another run. Sign in as Clinic Admin and open **Clinic team** to view the seeded staff and the client assignment controls.
4. Sign in as a seeded treating clinician to confirm the client list is limited to explicit assignments. Sign in as a caregiver to see the seeded child's Home, support and practice surfaces.
5. Optionally use the second clinic's clinician to confirm their account is separate. Do not use real email addresses or real client data.
6. Stop/reset the demo workflow(s) with the exact mode-specific reset command above. Keep the sanitized audit export if you want evidence of the demo interactions.

The formal signed-in browser acceptance run separately exercised first-admin invitation acceptance, clinician invitations, caregiver consent/merge, assignment changes, session revocation, and mobile-sized web navigation through a loopback fake mail sink. That automation does not send live mail and is not reproduced by the fresh interactive setup's no-send invitation.

The populated state is entirely fictional. The parent/clinic consent rows are synthetic seed data for demonstration only; they do not represent real permission or consent. Seeding starts with an empty isolated database and does not alter existing account memberships, clinical records, caregiver consent, or audit rows. UI actions create genuine application audit records for fictional actors; fixture setup itself creates none.
