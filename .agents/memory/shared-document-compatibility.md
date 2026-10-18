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