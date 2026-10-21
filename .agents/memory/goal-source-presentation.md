---
name: Goal source and draft safety
description: Goal grouping, display-only title cleanup and retaining edits during disclosure changes.
---

Classify a goal by the origin of the goal itself, not the origin of related guidance. Parent-saved behavior goals remain Family Goals even when a linked support card came from a clinician or uploaded plan. Keep that guidance's provenance and separate plan goal in the details instead of duplicating the primary goal across groups.

**Why:** Source categories must not make a caregiver's chosen goal appear clinician-authored, or make an extracted milestone appear to be assessed progress.

**How to apply:** Preserve record identities and existing deduplication. Use the explicit goal source when available; do not infer ownership or edit permissions from a visual group.

Technical goal titles require source review, not silent record cleanup. Display fallbacks may use already-saved text, but the raw saved title must remain available and editor defaults must still come from the underlying record.

**Why:** The user explicitly requested review flags rather than invented clinical objectives or automatic record rewrites.

**How to apply:** Keep title presentation separate from mutations and avoid changing shared display helpers on unapproved screens.

A clinical goal or milestone is not automatically a parent-child activity. Create a practice activity only when the source supports a concrete activity; do not fill missing activity details from a generic library and present the result as plan-derived.

**Why:** Turning an objective into an instruction can change its meaning and falsely present generic content as an individualized recommendation.

**How to apply:** Keep goals and activities in their existing separate models. Require source evidence for plan-derived activities, retain the source and approval state, and label any explicitly chosen starter activity as general support.

Collapsing goal details must not discard an in-progress edit.

**Why:** A presentation-only disclosure can otherwise unmount a stateful form and silently erase its draft.

**How to apply:** Keep detail children mounted and semantically hidden while closed, or lift drafts to a stable owner. Verify close/reopen retention and keep unrelated known goals available when a separate query is loading or fails.
