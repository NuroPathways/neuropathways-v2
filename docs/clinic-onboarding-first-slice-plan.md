# Clinic onboarding first-slice plan

## Baseline

- Start at `613ce7a2d51a4a60d81b7b13bf745eab53cca0f0` (`main`), clean and two commits ahead of `origin/main`.
- The only path changed since the prior onboarding implementation report (`93cc139d55ebf6a35d3bad915a2d2e8c89aa54a5`) is generated agent-asset metadata; preserve it.
- No clinic-provisioning or staff-invitation UI/API currently exists. Existing clinic memberships, assignments, revocation, account authentication, and parent invitation flows remain the source of truth.

## Implementation and verification stages

1. **Safe foundation:** add an additive, reversible invitation schema and email-verification claim storage; hash expiring, single-use clinic invite tokens; provide an operator-only first-platform-admin bootstrap command that requires an explicit existing verified account and refuses to promote an inferred/current user. Rehearse the migration only on a disposable loopback database.
2. **Platform clinic setup:** add platform-admin-only APIs and UI for idempotent clinic creation and first clinic-admin invitation, including safe pending-invite revoke/reissue. A platform grant does not confer chart access.
3. **Clinic staff onboarding:** add clinic-admin-only clinician invitations and pending/active listing, safe invite revoke/reissue, and same-clinic client assignment using the existing authorization-checked reassignment route. Preserve membership revocation behavior; do not add role editing or cross-clinic transfers.
4. **Delivery boundary:** use an injectable server-side invitation-mail interface with a loopback-only test sink. With no sender configured, persist the invitation and report “invitation created, email not sent.” Never send passwords/access codes or log message bodies, credentials, or raw tokens.
5. **Fictional demo and acceptance:** add guarded, idempotent fresh and populated demo setup, scoped reset, isolated credentials, and real-backend tests using fictional data and the local mail sink. Exercise platform/admin/staff/caregiver flows, authorization failures, retries, revocation, audit attribution, and desktop/mobile-web. Keep demo activity distinct from genuine audit evidence.

Each stage will be typechecked and tested against isolated fixtures before being committed. The final evidence will identify tested commits, distinguish real backend/browser checks from mocks, and include migration/rollback, operator bootstrap, demo, and five-minute demonstration instructions. No live email, production data, push, or deployment is in scope.
