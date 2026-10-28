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

**How to apply:** Rank and include relevant source details, prioritize documented supports and successful approaches, summarize rather than copy excerpts, and suppress boilerplate about missing frequency or triggers. Deduplicate exact repeats, high-confidence paraphrases, and clipped trailing fragments within each section while preserving distinct facts. Keep the source citation and uploader provenance visible. Do not infer diagnosis, function, intent, risk, preferences, or missing clinical facts, and do not create crisis, physical-intervention, or individualized treatment instructions. Family-uploaded content is still not clinician-reviewed; retain safety-plan gates for safety-sensitive content and source-review gates for clinician or unknown origins.

Document-derived support cards should use the same step-by-step layout as other parent behavior cards; their visible distinction is accurate source/approval provenance at the top. Explicitly verbal-only conflict without physical-risk indicators may use ordinary low-risk task supports, while physical risk, self-injury, elopement, and threats remain safety-gated.

**Why:** The user wants identical card presentation and useful steps for document-derived concerns such as homework-related verbal aggression, without mislabeling source material as clinician-approved.

**How to apply:** Reuse the shared parent guidance flow and controls, keep citations and card-management actions secondary, label only genuinely approved plans "Clinician-approved," and distinguish verbal-only concerns from explicit physical or immediate safety risks.

Parents may scan a clinician-uploaded document only when it is already visible in the selected child's Document Center. Process that one document in a parent-scoped extraction flow; preserve clinician review status and do not rewrite the clinician's aggregate profile or goals.

**Why:** Families need document-derived support from documents their clinician has shared, without widening document access or treating a parent scan as clinical review.

**How to apply:** Verify the parent-child relationship, visible-document permission, and clinician ownership for the exact document ID. Keep processing state separate from approval, and store source-linked extraction without changing clinical assignments.

Clinician "Rescan" controls must process only the selected document; they must not rebuild the whole child's profile as a side effect. Keep aggregate profile and goal updates in an explicit full-profile flow.

**Why:** A missing or unsupported sibling document should not block a valid rescan, and a one-document action must not replace aggregate clinical data with partial results.

**How to apply:** Pass the selected document ID through the authenticated scan request, validate it against the clinician-child relationship and visible-document policy, and persist the extraction without rewriting the profile or goal assignments.

When a clinician source file is missing or unreadable, keep its latest nonempty source-linked extraction visible and clearly identify it as previously saved; do not replace the user's only result with an empty error state.

**Why:** The user expects useful extracted information to remain accessible when a later rescan cannot read the original bytes.

**How to apply:** Load the newest saved nonempty run for visible document IDs, include it in a failed-rescan response when appropriate, and show it alongside an accurate source-unavailable message. Recommend re-upload only for a fresh scan.
