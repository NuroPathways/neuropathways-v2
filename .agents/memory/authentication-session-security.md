---
name: Authentication and session security
description: Credential response filtering, credential rotation, and family-session invalidation
---

Treat password and access-code fields as secrets regardless of whether their names are camelCase or snake_case. Apply recursive filtering at the shared API serialization boundary, not only to selected routes.

**Why:** Database rows and nested records use different naming conventions and flow through multiple response paths; route-by-route filtering allowed hashes to slip into legacy client responses.

**How to apply:** Keep credential removal in shared serializers and test nested camelCase input through the final JSON-shaped result. After password or access-code changes, revoke all other sessions within the affected account/family scope; retain only the session performing the change when continued access is needed. Recheck legacy family authorization on every use and destroy the presented token when the relationship is no longer valid.
