---
name: Clinic account boundaries
description: Stable clinic identity, membership roles, and clinical-record access rules
---

Clinic identity and clinical access are separate. A clinic admin or platform administrator does not gain chart access from that role alone. Clinical access requires an active matching clinic membership and explicit assignment to that client; supervisors require an explicit scoped assignment too. New clinics, memberships, assignments, and platform-admin grants must remain pending until an authorized activation step.

Preserve legacy tenant identifiers by mapping them to stable clinic IDs rather than rewriting client or document records. Keep legacy direct clinician access tied to the server-owned clinician assignment and matching tenant scope.

**Why:** Multiple clinics must not share records accidentally, administrative roles should not expose charts, and existing family and clinical records must remain intact while the account model evolves.

**How to apply:** For every API read or write, resolve clinic and assignment scope from trusted server records, require active membership and assignment, and deny mismatches. Never accept role elevation or clinical scope from self-service profile fields.
