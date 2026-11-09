---
name: Document deletion permissions
description: Sharing and clinic assignment do not automatically grant document deletion rights.
---

Document visibility, sharing, and clinic assignment are separate from deletion authority. A clinician must not be shown or allowed to delete a family/client-uploaded document solely because it is shared with them or attached to a client in their caseload. Allow deletion only for the uploader/owner or another role with a separately approved delete permission; otherwise deny and preserve the source and its history.

**Why:** The user's latest approved permissions structure explicitly says sharing does not grant deletion rights, superseding the earlier share-based clinician-delete approval.

**How to apply:** Enforce the same ownership or explicit delete grant in both UI visibility and server authorization. Test family-uploaded shared documents, clinician-owned uploads, cross-clinician access, and unshared documents separately. An authorized source deletion must not silently erase derived goals, notes, or support history.
