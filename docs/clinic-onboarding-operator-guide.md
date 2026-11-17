# NeuroPathways clinic onboarding operator guide

## Security model

- Platform-administrator grants authorize clinic provisioning only. They do not add clinic membership, client assignments, or chart access.
- A clinic administrator can invite treating clinicians and change assignments only inside an active clinic they administer. Clinic administration does not make a person a treating clinician or give them access to every chart.
- Treating clinicians receive no client assignment as a side effect of joining a clinic. An authorized clinic administrator must assign clients explicitly.
- Accepting a clinic invitation sets the clinician's primary clinic tenant only when no tenant is already set. It does not overwrite an existing tenant or create a chart assignment. For a caregiver-linked child, clinic-directory scope comes from an explicit family clinic association, or from exactly one active clinic membership when a legacy association is absent; ambiguous legacy multi-clinic associations fail closed.
- The public clinician-registration route creates a pending, non-privileged clinician account. It cannot grant a clinic role, a platform role, or chart access.
- Invitation acceptance requires a signed-in account whose normalized email matches the invitation and possession of its single-use token. The token is stored as a SHA-256 hash, expires after seven days, and is delivered in a URL fragment so browsers do not send it in HTTP requests or referrers.
- Existing user IDs, caregiver relationships, clinical records, clinic memberships, and assignments are not replaced when an invitation is accepted. A revoked membership remains revoked until a new authorized invitation is accepted.
- Invitations grant only `clinic_admin` or `treating_clinician`. No public or clinic-level role editor exists.

## First platform administrator

There is deliberately no public bootstrap endpoint and no automatic promotion of a registrant, current user, or first user. An operator must provision the first administrator from a trusted shell with database access and an explicit, pre-existing, verified clinician account. The command refuses to run if an active platform administrator already exists.

1. Confirm the target account ID and approval reference through the organization's out-of-band process. Do not use an email address as the identifier.
2. Confirm the application has the additive onboarding schema.
3. In the operator's shell, set the explicit approval guard and run:

   ```sh
   NP_ALLOW_PLATFORM_ADMIN_BOOTSTRAP=approved \
     pnpm --filter @workspace/api-server run bootstrap:platform-admin -- \
       --user-id='<EXISTING_VERIFIED_CLINICIAN_USER_ID>' \
       --approval-reference='<APPROVED_CHANGE_REFERENCE>' \
       --confirm=BOOTSTRAP-ONE-PLATFORM-ADMIN
   ```

4. Review the `platform_admin_bootstrapped` audit event and sign in as that named user. The command does not create credentials or print secrets.
5. Use the platform-clinic page to create a clinic and invite its first clinic administrator.

Do not run the bootstrap command in an ordinary developer shell or point it at a database that has not been independently confirmed. Do not put the approval reference, user ID, database URL, or credentials into screenshots or evidence archives.

## Invitation lifecycle

The platform clinic page creates a pending clinic and first-admin invitation. The clinic becomes active only when that first administrator accepts. A clinic administrator can create a treating-clinician invitation, revoke or reissue a pending invitation, and assign/reassign a client within that clinic. Each action is checked again on the server and recorded in the audit log.

No production email provider is configured by this implementation. Outside an isolated test run the server records `not_sent` and tells the administrator “Invitation created, email not sent.” In the guarded interactive onboarding demo, invitations are captured only in server memory and can be opened from **Local invitation links** by an authorized platform or clinic administrator. Platform administrators see pending first-administrator links; clinic administrators see pending treating-clinician links for clinics they administer. The panel is absent from normal builds, and signed-out users, caregivers, and treating clinicians cannot retrieve its links. Captured links disappear when that isolated server stops.

The automated browser runner uses a fake email sink enabled only when `NODE_ENV=test` and its URL is loopback `127.0.0.1` with an explicit port. Neither isolated mode sends external email. Never set the test sink to a public URL.

The first-slice browser verification used a local fake mail sink only. A newly clinic-invited clinician's clinic tenant is established on acceptance only when unset; active assignments remain a separate, explicit clinic-admin action.

## Account activation and existing accounts

- A recipient may use an existing clinician identity, or create a clinician account through the invitation page. A new account remains `pending_clinician` until it signs in with the invitation token and completes acceptance.
- A pending invitation session can read its own account-status response, accept the invitation, or sign out. It cannot access charts or other APIs before acceptance.
- For Replit/OIDC accounts, the server stores the identity provider's `email_verified` claim. Password-registration invitees prove mailbox control by using the token delivered to the exact address recorded on their invitation.
- The invitation accept endpoint never accepts a browser-supplied clinic ID or role. It derives both from the stored invitation.
- An email mismatch, expired/revoked/superseded token, inactive inviter, wrong account type, or replay is denied without returning invitation contents.

## Migration and rollback

`lib/db/migrations/20261116_clinic_onboarding_invitations.sql` is additive. It adds verified-email state, clinic-creation idempotency, and the dedicated invitation table. It does not rewrite old invitation records, memberships, client assignments, caregiver records, sessions, or audit history.

Before applying in a real environment, use that environment's approved migration pipeline, take a database snapshot, rehearse against a current restore, and compare counts of users, clinics, memberships, assignments, parent accounts, and child records. The rollback is not an automatic down migration: disable the new routes/UI first, preserve invitation and audit records, and remove invitation structures only after a separately approved retention review. Never use a destructive schema reset in a shared or production database.

## Remaining operational prerequisite

Live email delivery is intentionally absent. Before invitations can be used with real recipients, an approved server-side mail integration must be added and reviewed. It must use verified sender configuration, rate limiting, delivery/accepted/failure state, retry/idempotency, and redacted logs. Demo capture is not delivery and does not make invitations usable by real recipients. This guide does not establish HIPAA compliance.
