---
name: Shared document compatibility
description: Preserve existing clinical document consumers when adding a new client's upload or authentication flow.
---

Treat stored document references as cross-client contracts, rather than references specific to one client's authentication transport.

**Why:** A native-only content reference initially prevented existing web-session downloads and clinical scanning from consuming newly uploaded documents. Securing only the new mobile reader was insufficient.

**How to apply:** When changing document storage or download authentication, verify native readers, web-parent session readers, clinician readers, and clinical scanning together. Preserve encrypted existing files and legacy compatibility; do not migrate storage as an incidental part of mobile parity work.

Document consumers must explicitly request binary decoding even for text attachments.

**Why:** A generated download signature promised a Blob, but automatic decoding used the actual text MIME header and returned a string. Browser object-URL creation then failed despite a successful authenticated download.

**How to apply:** Validate the runtime response type across text and binary files, rather than trusting generated return types alone.

Verify text-preview decoding separately from download-byte integrity.

**Why:** A plain-text blob preview misrendered UTF-8 punctuation even though authenticated downloads matched the uploaded bytes exactly. Correct bytes alone do not prove that a browser chose the intended character encoding.

**How to apply:** Include non-ASCII text in preview checks and check actual visible content alongside download bytes. Investigate MIME/charset handling before changing shared content responses; do not silently assume every legacy text file uses one encoding.

## Document errors versus service startup pages

Treat a recognizable upstream startup HTML page as a temporary service interruption, never as evidence that an uploaded document is unsupported or damaged. Preserve a way to retry saved documents.

**Why:** The preview proxy returned an HTML startup page during a scan. Generic file-format matching found CSS text in that page, incorrectly labeled a valid PDF unsupported, exposed the whole page to the user, and removed the retry action. Startup pages can arrive with success or failure status codes and non-HTML content types.

**How to apply:** Distinguish transport responses before classifying file-reading errors across all account clients. Bounded automatic replay is appropriate only for a known startup rejection before the app accepted the request; never blindly replay an upload or AI scan after an ambiguous network error or gateway timeout, since it may already have run.

## Security remediation must preserve document outputs

For security work, change authorization, storage, session, or audit boundaries only. Do not change document parsing, AI prompts, extraction/classification, goal/activity/support generation, or their output contracts without separate approval.

**Why:** The user explicitly requires security fixes to preserve the current scanner and all document-derived outcomes.

**How to apply:** Capture hashes and synthetic-test baselines before security edits. Keep document processing tests in the regression suite and stop for approval if a security fix appears to require changing processing behavior.