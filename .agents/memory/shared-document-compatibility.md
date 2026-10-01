---
name: Shared document compatibility
description: Preserve existing clinical document consumers when adding a new client's upload or authentication flow.
---

Treat stored document references as cross-client contracts, rather than references specific to one client's authentication transport.

**Why:** A native-only content reference initially prevented existing web-session downloads and clinical scanning from consuming newly uploaded documents. Securing only the new mobile reader was insufficient.

**How to apply:** When changing document storage or download authentication, verify native readers, web-parent session readers, clinician readers, and clinical scanning together. Preserve encrypted existing files and legacy compatibility; do not migrate storage as an incidental part of mobile parity work.