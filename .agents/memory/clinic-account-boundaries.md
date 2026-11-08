---
name: Clinic account boundaries
description: Stable clinic identity, membership roles, and clinical-record access rules
---

Clinic identity and clinical access are separate. A clinic admin or platform administrator does not gain chart access from that role alone. Clinical access requires an active matching clinic membership and explicit assignment to that client; supervisors require an explicit scoped assignment too. New clinics, memberships, assignments, and platform-admin grants must remain pending until an authorized activation step.

Preserve legacy tenant identifiers by mapping them to stable clinic IDs rather than rewriting client or document records. Keep legacy direct clinician access tied to the server-owned clinician assignment and matching tenant scope.

Parent OIDC family links must be established through an authenticated pending invite, with the invited email checked before child ownership is linked. Do not restore email-only auto-linking or allow generic entity updates to change parent, family, clinician, or tenant ownership. Legacy email-based reads require a matching family record and same clinician and tenant.

Reassigning a client changes the clinic's active assignment, not the parent's sharing choice. Keep parent-owned document access scoped to the clinician the parent named; a new clinician must not inherit old document shares or their derived summaries automatically.

Treat AI inference as a clinical-data read: verify the selected child and each source document against the caller's current role and access before sending model input. A caller-supplied prompt or document ID is not authorization; never proxy arbitrary file references.

**Why:** Multiple clinics must not share records accidentally, administrative roles should not expose charts, and existing family and clinical records must remain intact while the account model evolves. Email-only backfills and generic CRUD updates can silently attach a parent to the wrong family or bypass invite validation. Parent document consent is separate from clinic assignment and must remain explicit during staff changes. Model calls can disclose chart content, so they need the same source-visibility checks as other chart reads.

**How to apply:** For every API read or write, resolve clinic and assignment scope from trusted server records, require active membership and assignment, and deny mismatches. Keep family-link changes on dedicated invite/connect routes with consent and ownership checks; never accept role elevation or clinical scope from self-service profile fields. Before any AI call, independently verify its child and source-document scope, and filter derived data by sources that remain visible.
