# Clinic onboarding fictional demo

The demo is a local, fictional-data rehearsal. It is not a production onboarding shortcut, does not send mail, and does not bypass authentication or authorization.

## Intended demo states

1. **Fresh onboarding:** one explicitly named, isolated platform administrator exists and the clinic list is empty. The presenter creates the clinic and first administrator through the actual platform UI.
2. **Populated clinic:** one fictional clinic, its administrator, two treating clinicians, five fictional caregiver/child pairs, explicit assignments, and a second clinic actor are present. The second clinic actor demonstrates tenant boundaries.
3. **Optional activity:** any seeded activity data must be labelled as simulated demo content, not as real caregiver or clinical history.

Use unique, randomly generated credentials for each rehearsal. The local demo tooling must write them to a private ignored file with mode `0600`, never print them in build output, never set a shared or universal password, and never place them in an evidence ZIP. This repository intentionally does not seed or activate a user when an ordinary person first registers.

## Safety requirements for demo tooling

The setup/reset command must require all of the following before it can alter data:

- `NODE_ENV=test` (or an explicit demo mode);
- a database name exactly `np_demo_clinic_onboarding`;
- a PostgreSQL connection whose server address is loopback;
- a marker row proving the database was initialized by this demo;
- an explicit reset confirmation for reset operations.

The command must refuse all other database names and all non-loopback hosts before issuing any write. Reset may remove only fixture IDs recorded in the marker table, in foreign-key-safe order. It must preserve unrelated data and genuine audit evidence. If it cannot establish those conditions, it must stop without deleting anything.

## Demo reset and credentials

Do not reset a shared development database. Start a fresh disposable PostgreSQL cluster using the isolated verification instructions in `docs/clinic-onboarding-aws-handoff.md` and use the test mail sink. Store generated credentials only under the local private demo directory described by the runner; remove that directory after the rehearsal. Use the UI login form, not an authentication bypass.

The populated demo state should be seeded only after its safety checks pass. It must not alter existing account memberships, clinical records, caregiver consent, or audit rows.
