---
name: Parent multi-behavior experience
description: Product scope for initial setup and the parent dashboard
---

Parents must be able to select one or more behaviors from initial setup, with an independent goal for each, and add or remove selections later.

**Why:** The user explicitly rejected restricting initial setup to a single behavior and requested both separate behavior cards and the dashboard progress, goals, and quick-action cards back.

**How to apply:** Preserve both card groups on website and mobile. A selected behavior can focus a help or logging interaction, but must not replace or hide the other saved selections. Progress is based on recorded observations; goal check-ins are explicit caregiver ratings per behavior and do not increment numeric progress. Clear the prior check-in when that behavior's goal changes.

## Current responsive visual direction

Use a calm, light, mobile-first visual system with navy text, soft teal accents, compact cards and source/status labels, and progressive disclosure. Keep red reserved for urgent help.

**Why:** The user requested an app-wide redesign to reduce visual bulk and heavy blue while retaining the existing workflows.

**How to apply:** Preserve the desktop sidebar and mobile navigation. Apply the quieter system across parent and clinician screens without changing routes, role access, clinical information, source/review states, or parent features.

Keep “I Need Help Right Now” separate from the Behavior Support Library.

**Why:** The user explicitly asked to remove that action from the library while restoring the older dashboard presentation.

**How to apply:** Urgent support may remain in navigation or a separate dashboard action, but do not put its CTA inside the library.

## Essential information must be visible immediately

Dashboard metrics, actions, and urgent guidance must be visible on first paint. Decorative motion must not gate their visibility.

**Why:** Signed-in reference checks showed real dashboard content and urgent behavior cards present in the layout but invisible or faded during entrance animations.

**How to apply:** When revising the restored dashboard and Help Now screens, keep essential content visible independently of animation timing.

## Document discoveries remain parent-controlled

Surface newly discovered plan behaviors automatically in Help Now and the library, not as replacements for the parent's active selections.

**Why:** A plan upload should personalize support without undoing the parent's choices or sending a completed account back through setup because a new target has no chosen goal.

**How to apply:** Let the parent use discovered support and goal-based daily practice without adding it first. Require parent confirmation before adding it to active behaviors for logging. Keep source provenance, do not write activity feedback as clinical progress, and distinguish plan guidance from the parent's current goal. If plan guidance conflicts, do not show families a review-only activity; use safe Behavior Support Library guidance only for an already selected behavior, otherwise omit it.

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

Give username/access-code families a prominent Documents tab with visible scan status and a way to re-read a document. Start support for client and parent accounts with child selection before the menu, even for a single-child account.

**Why:** The user explicitly requested these as the expected entry points for client documents and immediate support, then clarified that parent logins also need the child-first support popup.

**How to apply:** Keep document reads and scans within the authenticated child or authorized same-family, same-clinician sibling boundary. Use each parent route's own authenticated child data when loading support. The AI should refresh the scanned profile before answering and must not present an unread or failed document as current.

## Parent-facing behavior provenance

Show parent behavior blocks only a concise origin label: "Source: Pre-programmed library" or "Source: Behavior plan." Keep conflict-review warnings on clinician review surfaces, not family support cards.

**Why:** The user explicitly asked to replace repeated parent-facing conflict warnings with the behavior's origin.

**How to apply:** Map starter guidance to the pre-programmed label and uploaded or reviewed plan guidance to the behavior-plan label. Do not surface conflict messages or source excerpts in parent support blocks.

## Daily-first parent home and practice feedback

Make child-specific daily activities the main parent-home content while keeping urgent help separate and preserving multi-behavior goals, progress, the support library, and other parent tools. Clinic-connected activities must use concrete plan routine, opportunity, and skill details; include reinforcement only when the plan specifies it. Parent-direct mode may offer clearly labeled, low-pressure activities from starter support, a selected behavior or goal, uploaded plans, or caregiver notes. Do not invent child-specific routines or reinforcement. Keep source and review labels explicit. Completion ratings and activity outcomes are caregiver reports, not clinical findings.

**Why:** The user first required concrete plan-based clinic activities, then clarified that Parent-Direct Mode must work without a clinician and may use starter support, parent choices, uploads, and logs. Families still should not be shown invented child-specific routines, prompts, or reinforcement.

**How to apply:** Keep clinic-connected generation grounded in plan details. In parent-direct mode, low-pressure support can come from approved app starter content or family-provided sources and must be labeled as such. Scope support to parent-selected areas; do not add plan discoveries on the parent's behalf. Keep crisis support separate and caregiver feedback distinct from behavior occurrences or clinical findings.