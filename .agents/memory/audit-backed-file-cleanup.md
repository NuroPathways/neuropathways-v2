---
name: Audit-backed file cleanup
description: Durable document-file cleanup and audit-event design for authorized deletions.
---

For user-authorized document deletion, revoke the document's database access in the same transaction that records an immutable cleanup task and the deletion audit event. Store storage references encrypted, retry failed file removal asynchronously, and append completion/failure events rather than editing prior audit records.

**Why:** A database row can disappear while its file remains in private or local storage; reporting a completed deletion in that state is misleading. Using append-only audit events as the retry outbox avoids a separate queue schema while keeping state changes and evidence durable.

**How to apply:** Queue source documents and encrypted scan outputs, use idempotent storage deletes, expose pending or failed cleanup states to callers, and never include document contents or plaintext storage locations in audit metadata. Keep account-deletion and retention policies separate from access revocation.
