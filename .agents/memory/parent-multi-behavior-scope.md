---
name: Parent multi-behavior experience
description: Product scope for initial setup and the parent dashboard
---

Parents must be able to select one or more behaviors from initial setup, with an independent goal for each, and add or remove selections later.

**Why:** The user explicitly rejected restricting initial setup to a single behavior and requested both separate behavior cards and the dashboard progress, goals, and quick-action cards back.

**How to apply:** Preserve both card groups on website and mobile. A selected behavior can focus a help or logging interaction, but must not replace or hide the other saved selections. Progress reflects recorded observations, not inferred goal completion.

## Restore presentation without removing functionality

Keep the earlier professional blue desktop website and fuller landing-page feel. Restore presentation without rolling back the newer parent features.

**Why:** The user explicitly requested the old desktop/blue UI back while keeping the newly added functionality, rather than another redesign.

**How to apply:** Use older code only as a visual reference. Preserve current accounts, plans, independent behavior goals, progress, and optional upload flows.

## Document discoveries remain parent-controlled

Surface newly discovered plan behaviors automatically in Help Now and the library, not as replacements for the parent's active selections.

**Why:** A plan upload should personalize support without undoing the parent's choices or sending a completed account back through setup because a new target has no chosen goal.

**How to apply:** Let the parent use discovered support without adding it first. Require parent confirmation before adding it to active behaviors for logging. Keep source provenance and distinguish plan guidance from the parent's current goal.

## Help Now blocks and separate plan goals

Always show selectable behavior blocks when Help Now opens, even with one active behavior. Keep the blocks visible while showing the chosen behavior's steps.

**Why:** The user reiterated that Help Now should still show behavior blocks and allow selection, and that uploaded plans should automatically update Help Now and goals.

**How to apply:** Include active behaviors and plan-found candidates. Refresh their support and plan-goal displays after a successful scan on web and mobile, without repeating setup.

Keep saved parent goals unchanged and show explicit plan goals alongside them, including when they differ.

**Why:** The user explicitly chose “Keep my saved goal and show the plan goal alongside it,” rather than replacing saved goals automatically.

**How to apply:** Label the two goals distinctly. Do not fill an empty saved goal automatically or infer a plan goal from a legacy guidance goal or related-goal list.

## Existing client account continuity

Keep established username/access-code client accounts, credentials, and associated plans and records as the source of truth when updating the client experience. Do not create duplicate accounts or rewrite those records as part of a UI migration.

**Why:** The user explicitly chose to keep current client logins and existing records rather than convert or duplicate accounts.

**How to apply:** Reuse the existing client-session authentication and portal data endpoints; make new client screens read the existing records.

## Client documents and support entry

Give username/access-code families a prominent Documents tab with visible scan status and a way to re-read a document. Start the support popup with child selection before its menu, even for a single-child account.

**Why:** The user explicitly requested these as the expected entry points for client documents and immediate support.

**How to apply:** Keep document reads and scans within the authenticated child or authorized same-family, same-clinician sibling boundary. The AI should refresh the scanned profile before answering and must not present an unread or failed document as current.