# Clinic onboarding AWS handoff and isolated verification

This is a preparation checklist, not an AWS deployment. No production configuration, live provider, or real-family data was used to build the feature.

## Migration preparation blockers

- Review and approve the additive `20261116_clinic_onboarding_invitations.sql` migration and its rollback approach.
- Confirm the deployment's schema-migration mechanism, PostgreSQL version/extensions, connection pooling behavior, transaction/advisory-lock support, and required indexes.
- Decide who may be bootstrapped as the first platform administrator and how that decision is approved, recorded, and recovered if that person is unavailable.
- Confirm verified-email semantics for every supported identity provider; the application currently relies on the provider's `email_verified` claim or matching invite-token possession.
- Design and approve production email delivery; the current service intentionally has no live sender.
- Configure private object storage, encryption keys, session secrets, CORS origins, URL origins, outbound network policy, logging redaction, backups, monitoring, and audit retention through the deployment's secret manager.

## Staging blockers

- Apply the migration to a restored staging snapshot and compare user, clinic, membership, assignment, parent, child, session, and audit counts before and after.
- Bootstrap a named staging platform administrator through the operator CLI and verify the audit record.
- Add an approved server-side email provider before sending invitations. Verify sender-domain configuration and run delivery, retry, duplicate-request, revoked-link, expired-link, wrong-email, and replay tests with staged recipient mailboxes.
- Run the signed-in browser acceptance suite against staging with fictional accounts, desktop and mobile web sizes, and a deny-by-default egress policy except for the approved staging services.
- Confirm logs and observability omit raw invitation tokens, cookies, passwords, access codes, email content, document contents, and sensitive request bodies.
- Exercise a tested rollback rehearsal using the pre-migration snapshot; rollback must not silently delete invitation/audit evidence.

## Real-family pilot blockers

- Complete the staging and external security review, including cross-clinic, caregiver, document, session-revocation, and platform-versus-chart-access boundaries.
- Obtain policy decisions for MFA enrollment/enforcement/recovery, missing or invalid encryption-key behavior, and whether safety-critical guidance may be visible before clinician review.
- Confirm support ownership, incident response, account recovery, audit access, data retention, and user-facing invitation/privacy notices.
- Verify a clinician has only explicitly assigned chart access; clinic-admin membership and platform-admin grant alone must not open charts.
- Start with a small authorized pilot and monitor invitation delivery, acceptance, assignment, revocation, and audit events before expanding.

## Rollback preparation

1. Capture and verify an encrypted database snapshot and a copy of deployment configuration before migration.
2. Rehearse migration and application rollback against a recent restore.
3. If rollback is needed, first disable clinic-onboarding UI and routes; do not delete invitations or audit records.
4. Restore the pre-migration snapshot only under the approved database recovery process. Do not run `drizzle-kit push --force` or truncate tables in shared data.
5. Preserve the exact migration, tested commit, sanitized reports, and evidence checksums.

## Local evidence and Git

The onboarding work is local-only. At the start of this batch, `HEAD` was `bcaac392022a39d6ea78d873d88540a5f0de3b54` and `origin/main` was `3e9fc0aa6143e006f2849a53ef25d7c86837fad3`, with four local commits already ahead. This batch was uncommitted at that point; its final tested commit, final `origin/main`, and ahead/behind counts are recorded in the associated evidence report. No push or deployment is part of this handoff.

The interactive demo workflows are local verification aids only: each starts a new loopback PostgreSQL cluster and private storage, seeds fictional accounts, disables connectors and live providers, and removes only its own temporary resources when stopped. Their generated credentials are private and excluded from evidence archives.

## What the current isolated checks can establish

The verification harness must use a new PostgreSQL cluster bound to `127.0.0.1`, a database named `np_clinic_onboarding_test`, fictional accounts, a private temporary storage directory, a loopback-only mail sink, and outbound-network guards. It must stop only the test processes it started. Test-sink acceptance is not proof of real email delivery; mocked or fake-provider tests are not live-provider verification. Web viewport tests do not replace native-device testing. No test in this project alone establishes HIPAA compliance.
