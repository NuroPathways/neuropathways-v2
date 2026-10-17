# NeuroPathways parent experience redesign

Implementation follows the attached phased specification. Existing accounts, data, roles, routes, brand, and independent-parent access must remain intact. Do not deploy, send real notifications, or modify production data during this work.

## Phase 0 — Shared security and independent access

- [x] Generic record updates reject changes to identity and ownership fields.
- [x] Regression coverage rejects attempts to reassign a behavior plan to another clinician or child.
- [x] Goal mutations verify clinician ownership of both the goal and child; null clinician ownership grants no clinician access.
- [ ] Consolidate child and linked-record authorization across API routes.
- [x] Require an authenticated clinician, parent, child session, or mobile session for AI requests.
- [x] Reject caller-supplied AI file paths rather than reading unverified upload paths.
- [ ] Finish the upload/download, ownership, signup-response, and independent-parent security review.
- [x] Run the parent/clinic integration regressions, including new ownership and AI checks (93 passed).
- [ ] Run the remaining API security and independent-account regression suite.

## Phase 1 — Shared parent context and navigation

- [x] Consistent, account-scoped child selection across web and native mobile; authorized child deep links take precedence.
- [x] Parent navigation: Home, Help Now, Practice, Goals, and Menu.
- [x] Simplify Home while retaining urgent help and showing saved information only when it exists.
- [x] Add History using existing observations and practice records without duplicating them.
- [x] Preserve old routes and deep links.

## Phase 2 — Practice, activities, goals, and observations

- [x] Reuse existing activity and goal data; add only an additive, parent-and-child-scoped activity-position/bookmark record.
- [x] Shared web/mobile activity flow: Understand, See, Try one authored step at a time, and Reflect.
- [x] Optional, repeat-safe reflections; save-for-later and step position are persisted separately from reflection.
- [x] Practice activity is linked from Goals and History; activity participation is not clinical progress or mastery.
- [x] Parent-created accounts can open, pause, resume, exit without logging, and optionally reflect on a saved activity.
- [x] My Routines is present with an explicit empty state when no routine records exist.

## Phase 3 — Help Now and ongoing support

- [x] Source-aware, step-by-step Help Now in web and mobile; emergency information remains available while guidance loads, and the “This isn't working” branch offers a simpler step/safety information.
- [x] Parent-owned visual routines with editable/reordered steps, optional icons/times, and separately persisted pause/resume runs.
- [x] Editable preferences are stored separately from scanned clinical profiles; comfort preferences are never presented as rewards.
- [x] Original Learn Why lessons include examples, optional ungraded reflection, a path back to activities, and skip.
- [x] Recurring reminder schedules support time, days, timezone, snooze, pause/cancel, and quiet hours; new reminders default off.
- [x] No reminder notifications are sent or simulated; delivery is explicitly marked unavailable.

## Phase 4 — Clinic sharing and review

- [x] Parents choose whether to share all, selected, or no uploaded documents and separately opt in to caregiver observations; clinician log reads filter to the active observation-consent scope.
- [x] Consent scopes are persisted per parent/child/clinician and cleared when clinic access is revoked.
- [x] Clinicians can review each shared plan activity and assign/unassign it to the family; each review and assignment is bound to a hash of the exact activity content.
- [x] Revoking a clinic link clears its document-sharing access without deleting the parent account, child records, uploaded files, or support history.
- [x] Invite creation uses a single-use, expiring copy-link flow; the UI does not claim email delivery.
- [x] Clinician feedback on parent observations is available only with active observation-sharing consent, and appears in the parent's existing History view.

## Cross-platform and verification

- [x] Web and Expo mobile shared parent navigation, child context, Home, Help Now, Practice, Goals, and History surfaces.
- [x] Web and Expo mobile Phase 3 Help Now and family tools, backed by parent-and-child scoped persistence.
- [x] Web and Expo mobile clinic connection revocation; both retain parent-owned records.
- [x] Role-specific clinician and individual-client navigation remains in place.
- [x] Add/extend navigation and account-context regression coverage; web tests and mobile typecheck pass.
- [x] Record actual tests and remaining limitations before completion.

Phase 1 limitation: History in the Expo parent session and independent-parent dashboard includes behavior observations and practice activity. Informational engagement events are available only in the legacy web history source because the parent-session dashboard API does not expose them.

Phase 2 limitation: This phase reuses the saved daily-action activity content and does not add a routine-authoring system. Saved activity position and bookmarks persist across web/mobile and daily-action refreshes; no production database schema was changed.

Phase 3 limitations: Reminder delivery infrastructure is not configured, so schedules persist but do not notify. Private routine images are not supported; routines offer short icon names and optional times. The UI explicitly identifies both limitations.

Phase 4 limitation: Activity review/assignment and observation feedback are available in the web clinician workflow and the assigned activity/feedback is visible to parents on web and Expo. Reminder delivery is still unavailable. Invitation delivery is copy-link only; no email is claimed or sent.

Verification: `pnpm --filter @workspace/neuropath test` (62 passed), web production build passed, `pnpm --filter @workspace/neuropath-mobile run typecheck` passed, and API server typecheck/build passed. The additive practice-progress table was applied to the development database only. The web build reports the existing large JavaScript chunk advisory.
