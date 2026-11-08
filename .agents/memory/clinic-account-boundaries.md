---
name: Clinic account boundaries
description: Stable clinic identity, membership roles, and clinical-record access rules
---

Clinic identity and clinical access are separate. A clinic admin or platform administrator does not gain chart access from that role alone. Clinical access requires an active matching clinic membership and explicit assignment to that client; supervisors require an explicit scoped assignment too. New clinics, memberships, assignments, and platform-admin grants must remain pending until an authorized activation step.

Preserve legacy tenant identifiers by mapping them to stable clinic IDs rather than rewriting client or document records. Keep legacy direct clinician access tied to the server-owned clinician assignment and matching tenant scope.

Parent OIDC family links must be established through an authenticated pending invite, with the invited email checked before child ownership is linked. Do not restore email-only auto-linking or allow generic entity updates to change parent, family, clinician, or tenant ownership. Legacy email-based reads require a matching family record and same clinician and tenant.

**Why:** Multiple clinics must not share records accidentally, administrative roles should not expose charts, and existing family and clinical records must remain intact while the account model evolves. Email-only backfills and generic CRUD updates can silently attach a parent to the wrong family or bypass invite validation.

**How to apply:** For every API read or write, resolve clinic and assignment scope from trusted server records, require active membership and assignment, and deny mismatches. Keep family-link changes on dedicated invite/connect routes with consent and ownership checks; never accept role elevation or clinical scope from self-service profile fields.
