---
name: Expo dependency override boundaries
description: Why workspace-wide dependency security floors must also preserve Expo major-version compatibility.
---

Workspace-wide dependency overrides used as security floors must include an upper major-version bound when Expo requires a specific major.

**Why:** A lower-bound-only override can silently begin resolving a newly released incompatible major during a clean publishing install, even while development still works from an older local installation.

**How to apply:** When changing an override for Babel or other Expo build tooling, preserve Expo's supported major range and verify with a frozen-lockfile install plus the mobile production build.

Apply the same upper-major-bound rule to workspace-wide code-generation dependencies.

**Why:** An unbounded js-yaml security floor resolved a new major whose exports were incompatible with Orval, preventing client generation even though the prior lockfile worked.

**How to apply:** Check the generator's supported dependency major before raising a security floor, and verify generation from the updated lockfile. Do not repair generated output by hand.

For Expo SDK 54, keep the Metro 0.83.8 override that avoids passing filenames into the secure `image-size` v2 API. That Metro patch line emits file-map changes as `addedFiles`/`modifiedFiles`/`removedFiles`, while the SDK's Expo CLI TypeScript watcher expects `eventsQueue`.

**Why:** Downgrading Metro to restore the old watcher event shape reintroduces the Metro/image-size incompatibility; leaving the mismatch unhandled crashes the preview on TypeScript edits.

**How to apply:** Keep the narrow Expo CLI event-shape adapter while this Metro override is in use. Before removing it, confirm the resolved Expo CLI handles Metro's `changes` payload and verify a TypeScript source edit leaves Metro running.