---
name: Workspace-scoped dependency installs
description: Installing JavaScript packages into one app inside a pnpm monorepo
---

In this Replit workspace, the generic JavaScript package installer ran `pnpm add` from the monorepo root and failed with `ERR_PNPM_ADDING_TO_ROOT`; it could not select an individual workspace package.

**Why:** The web app needed isolated test dependencies, and adding them at the root would have widened the dependency change beyond that app.

**How to apply:** Use the package-management skill first. If its installer cannot target the intended workspace, use pnpm's workspace filter to add dependencies only to that package.
