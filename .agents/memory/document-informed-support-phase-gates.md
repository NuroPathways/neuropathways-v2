---
name: Document-informed support phase gates
description: Approval boundaries and provenance expectations for document-inferred behavior support.
---

Keep extraction of document-informed support concerns separate from card generation, Help Now integration, Practice integration, and validation. Complete only the currently approved phase and wait for explicit user approval before advancing.

Phase 2 draft cards belong in document metadata, separate from active parent support cards. Keep them source-linked and child-scoped, deduplicate across current parent-owned document versions, and label them as not clinician-reviewed. Do not expose draft cards in Help Now or Practice before those integration phases are approved. For parent- or client-uploaded documents, exact excerpt verification is not a gate for low-risk document-informed summaries and suggestions; preserve source attribution and never imply clinician approval. Keep review gates for clinician-uploaded or unknown-origin sources.

Legacy clinician-profile safety notes may be shown to a parent only when every linked source document is visible to that parent and has a successful scan. Label these as derived profile notes that need source verification; do not present them as exact excerpts or clinician-approved guidance. Prefer current, verified source excerpts when available.

**Why:** Older aggregate profile fields do not retain per-note citation or approval metadata, so treating them as exact or approved could mislead a family during a crisis.

**How to apply:** Keep the linked documents child-scoped and access-checked. If source visibility or scan status cannot be confirmed, do not expose the profile note; show the appropriate document review path instead.

**Why:** The user requires review between phases so automatically identified concerns are not mistaken for approved clinical treatment or prematurely exposed as parent-facing guidance.

**How to apply:** Preserve source-document links and uncertainty during extraction and card generation. Keep candidate storage isolated from current support-card consumers; change Help Now or Practice only after the corresponding phase is explicitly authorized.

For document-informed support cards, use all relevant verified facts from the same child's uploaded documents, summarize them in plain language, and put the resulting specifics into the matching sections. Do not show generic "the document does not specify..." or "no safe suggestion" filler in place of useful card content. Cautious, low-risk caregiver ideas may be added when they directly fit the documented context, but keep their provenance internally. In cards sourced from family uploads, show "Self-uploaded document" as the visible source label instead of AI-generated or clinician-review disclaimer copy. Keep clinician/unknown-source review labels and safety gates where applicable.

**Why:** The user wants document-supported cards to contain concrete extracted summaries rather than generic absence messages, and wants family-uploaded cards identified simply as "Self-uploaded document" without AI-generated or clinician-review disclaimer text.

**How to apply:** Rank and include relevant source details, prioritize documented supports and successful approaches, summarize rather than copy excerpts, and suppress boilerplate about missing frequency or triggers. Keep the source citation and uploader provenance visible. Do not infer diagnosis, function, intent, risk, preferences, or missing clinical facts, and do not create crisis, physical-intervention, or individualized treatment instructions. Family-uploaded content is still not clinician-reviewed; retain safety-plan gates for safety-sensitive content and source-review gates for clinician or unknown origins.
