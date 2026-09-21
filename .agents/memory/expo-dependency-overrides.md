---
name: Expo dependency override boundaries
description: Why workspace-wide dependency security floors must also preserve Expo major-version compatibility.
---

Workspace-wide dependency overrides used as security floors must include an upper major-version bound when Expo requires a specific major.

**Why:** A lower-bound-only override can silently begin resolving a newly released incompatible major during a clean publishing install, even while development still works from an older local installation.

**How to apply:** When changing an override for Babel or other Expo build tooling, preserve Expo's supported major range and verify with a frozen-lockfile install plus the mobile production build.