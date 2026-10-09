---
name: Mobile packaging isolation
description: Why native packaging should own its bundler rather than reuse a running preview service.
---

Keep native packaging independent of the running component and app previews; a successful HTTP health check alone is not proof that a server belongs to the build.

**Why:** Multiple products share this workspace. Reusing another service can fetch the wrong product, while reusing a development Metro server can package different environment values or development settings. The user approved fixing packaging without stopping the component preview.

**How to apply:** Preserve bundler ownership and production-mode isolation when changing packaging infrastructure. Verify packaging with sibling preview workflows still running, and clean up only processes started by the build.

Keep one-off packaging noninteractive and without development file watching.

**Why:** Packaging writes generated files inside the workspace. Development-only watchers can crash the bundler between platform downloads even after one platform compiled successfully; this caused a publishing failure independent of the app's source code.

**How to apply:** Preserve CI mode for the packaging-owned bundler. Do not disable hot reload in the normal development workflow to address a packaging failure.
