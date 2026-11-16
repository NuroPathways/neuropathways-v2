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
