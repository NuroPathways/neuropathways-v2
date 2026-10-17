---
name: Sandboxed document preview verification
description: Verify readable protected-file previews without weakening iframe isolation or losing the browser test session.
---

Keep uploaded-file preview frames sandboxed. Verify actual readable body text visually, not only the modal title, and use the parent-page controls for Close and navigation.

**Why:** A protected text preview was visibly readable, but a test helper's direct body read inside the opaque-origin sandbox timed out and reset its browser worker, destroying the authenticated test context. Script-blocking console messages from that sandbox are expected, not a reason to remove the protection.

**How to apply:** Use a screenshot to check rendered text and separate API checks for protected bytes and sharing/revocation. Avoid unnecessary frame introspection; test Close and other controls from the outer modal. Never disable the sandbox just to make a test helper read the frame.
