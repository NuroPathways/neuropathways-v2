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

- [ ] Consistent child selection across web and native mobile.
- [ ] Parent navigation: Home, Help Now, Practice, Goals, and Menu.
- [ ] Simplify Home while retaining urgent help and saved progress.
- [ ] Add History without duplicating existing logs or observations.
- [ ] Preserve old routes and deep links.

## Phase 2 — Practice, activities, goals, and observations

- [ ] Reuse existing activity and goal data where available; add only additive schema changes when needed.
- [ ] Activity flow: Understand, See, Try, Reflect.
- [ ] Optional, repeat-safe logging and separate saved progress.
- [ ] Never treat completion as mastery or clinical improvement.

## Phase 3 — Help Now and ongoing support

- [ ] Shared, source-aware Help Now experience with immediate access.
- [ ] Routines, preserved preferences, and original learning content.
- [ ] Opt-in reminders with truthful availability and no real sends during implementation.

## Phase 4 — Clinic sharing and review

- [ ] Explicit consent scopes and revocation.
- [ ] Versioned clinician review and publishing.
- [ ] Parent ownership and private-source provenance remain intact.

## Cross-platform and verification

- [ ] Web and Expo mobile parity for the parent workflows.
- [ ] Role-specific clinician and individual-client flows remain supported.
- [ ] Add/extend authorization, privacy, account-type, responsive, and mobile tests.
- [ ] Record actual tests and remaining limitations before completion.
