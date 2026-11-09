---
name: Authentication and session security
description: Credential response filtering, credential rotation, and family-session invalidation
---

Treat password and access-code fields as secrets regardless of whether their names are camelCase or snake_case. Apply recursive filtering at the shared API serialization boundary, not only to selected routes.

**Why:** Database rows and nested records use different naming conventions and flow through multiple response paths; route-by-route filtering allowed hashes to slip into legacy client responses.

Family access removal revokes web/mobile sessions and pending access-code reset tokens while retaining clinical records, goals, documents, and source files. Reissue access only through an authorized reconnection flow.

**Why:** The approved account model treats removal as revocation, not deletion of clinical history; partially deleting a family can leave orphaned records and active sessions.

**How to apply:** Keep credential removal in shared serializers and test nested camelCase input through the final JSON-shaped result. After password or access-code changes, revoke all other sessions within the affected account/family scope; retain only the session performing the change when continued access is needed. Recheck legacy family authorization on every use and destroy the presented token when the relationship is no longer valid. When a family is removed, atomically revoke its web/mobile/reset tokens and retain its clinical history and uploaded files.
