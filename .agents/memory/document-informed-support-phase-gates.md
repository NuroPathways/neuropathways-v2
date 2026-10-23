---
name: Document-informed support phase gates
description: Approval boundaries and provenance expectations for document-inferred behavior support.
---

Keep extraction of document-informed support concerns separate from card generation, Help Now integration, Practice integration, and validation. Complete only the currently approved phase and wait for explicit user approval before advancing.

Phase 2 draft cards belong in document metadata, separate from active parent support cards. Keep them source-linked and child-scoped, deduplicate across current parent-owned document versions, and label them as not clinician-reviewed. An unverified excerpt may produce a factual draft marked `needs_review`, but it must not receive generated suggestions. Do not expose draft cards in Help Now or Practice before those integration phases are approved.

Legacy clinician-profile safety notes may be shown to a parent only when every linked source document is visible to that parent and has a successful scan. Label these as derived profile notes that need source verification; do not present them as exact excerpts or clinician-approved guidance. Prefer current, verified source excerpts when available.

**Why:** Older aggregate profile fields do not retain per-note citation or approval metadata, so treating them as exact or approved could mislead a family during a crisis.

**How to apply:** Keep the linked documents child-scoped and access-checked. If source visibility or scan status cannot be confirmed, do not expose the profile note; show the appropriate document review path instead.

**Why:** The user requires review between phases so automatically identified concerns are not mistaken for approved clinical treatment or prematurely exposed as parent-facing guidance.

**How to apply:** Preserve source-document links and uncertainty during extraction and card generation. Keep candidate storage isolated from current support-card consumers; change Help Now or Practice only after the corresponding phase is explicitly authorized.
