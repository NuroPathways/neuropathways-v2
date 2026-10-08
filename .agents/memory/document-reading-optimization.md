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
