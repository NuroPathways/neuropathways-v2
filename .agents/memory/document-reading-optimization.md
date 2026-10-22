---
name: Document reading optimization boundaries
description: Keep scan speed improvements compatible with source fidelity and sensitive-file handling.
---

Reuse a completed document reading only when its file, selected support areas/goals, and clinician-document context still match. Retry incomplete readings rather than treating their saved findings as a complete cache.

**Why:** Plans are immutable uploads, so unchanged repeat reads need not generate new model output. Changes in goals or higher-priority clinician sources can change the needed support and must not be hidden by caching.

**How to apply:** Include reader-policy changes in invalidation. Caregiver ratings alone should not invalidate a reading. Keep current ownership and source-access checks in front of cached responses.

Preserve original PDF pages when optimizing AI inputs; keep extracted raw health text in bounded, expiring process memory rather than adding unencrypted copies to database fields.

**Why:** Searchable PDF text can omit charts or scanned portions, and storing another plaintext copy of sensitive files would expand their exposure.

**How to apply:** Improve repeat extraction and shared prompt-prefix reuse without removing original visual sources. Saved derived findings may remain in their existing storage format.

Validate PDF structure, not just its header, before multi-document AI requests. A rejected combined request must not mark every included document as corrupt. Partial rereads must preserve an existing complete clinical profile rather than replace it with a smaller subset.

**Why:** One PDF passed the old header-only check but the AI reader rejected it, causing repeated whole-client scan failures and misleading errors on healthy documents.

**How to apply:** Prepare complete visual pages in memory, keep originals unchanged, report errors on the actual affected document, and distinguish invalid/password-protected files from temporary service failures. Require a readable replacement for files no PDF reader can open; do not invent missing content or fall back silently to text-only clinical interpretation.

PDF reading is required for every supported account type, including individual clients, without broadening document ownership or family access.

**Why:** The user repeatedly reported reader-unavailable failures after earlier scanner checks. A successful clinician PDF scan and a parent text-file scan did not establish PDF reading in the other entry points.

**How to apply:** Verify real PDFs through each distinct account path and execute the bundled reader, not only source tests. Searchable text is supplementary to complete-page visual reading; never fabricate it or treat an empty extraction as verified evidence.
