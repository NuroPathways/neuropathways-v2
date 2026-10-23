---
name: Document-informed support phase gates
description: Approval boundaries and provenance expectations for document-inferred behavior support.
---

Keep extraction of document-informed support concerns separate from card generation, Help Now integration, Practice integration, and validation. Complete only the currently approved phase and wait for explicit user approval before advancing.

Phase 2 draft cards belong in document metadata, separate from active parent support cards. Keep them source-linked and child-scoped, deduplicate across current parent-owned document versions, and label them as not clinician-reviewed. An unverified excerpt may produce a factual draft marked `needs_review`, but it must not receive generated suggestions. Do not expose draft cards in Help Now or Practice before those integration phases are approved.

**Why:** The user requires review between phases so automatically identified concerns are not mistaken for approved clinical treatment or prematurely exposed as parent-facing guidance.

**How to apply:** Preserve source-document links and uncertainty during extraction and card generation. Keep candidate storage isolated from current support-card consumers; change Help Now or Practice only after the corresponding phase is explicitly authorized.
