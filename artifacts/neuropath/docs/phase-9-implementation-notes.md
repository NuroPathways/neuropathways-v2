# Phase 9 — Parent tools and remaining screens

## What changed

Added an opt-in, token-backed presentation adapter for Phase 9 parent surfaces.
The existing Tailwind 3 app remains in place: `scoped.css` is imported only by
the affected adapters, and `.np-foundations` is applied only to parent-facing
subtrees. No global theme, routing, data, auth, backend, prompt, or scan changes
were made. No emojis or decorative imagery were added.

FamilyTools now has grouped routine, preference, and reminder sections; clearer
step rows; a distinct current-step routine player; readable day/time fields;
and a visible delivery limitation. The actual foundations `Button` is used for
the FamilyTools actions. History and log records use compact, readable rows and
forms. Messages, profile editing, clinic connection, account settings, and data
requests receive the same scoped visual treatment where the current account is
a parent.

## Exact surfaces and route adapters

- **Independent and clinician-connected parents:** `/ParentHome` is the common
  parent shell. Its Practice view keeps `PracticePage` → `FamilyTools`; profile,
  log, clinic, and messages remain the existing child-scoped panels. `/History`,
  `/Settings`, `/DataRequests`, `/Messages`, and the existing `/ChildProfile`
  route remain available at their current paths.
- **Legacy family:** `App.jsx` keeps `/Practice`, `/GoalsMilestones`, and
  `/DocumentCenter` routed through `ParentLegacyDestination`; the legacy bridge
  still enters the existing parent home and retains child/family context.
  `ParentHistory` continues using its legacy account and child-scoped reads.
  Existing legacy Clinic messaging and demographic locks are unchanged.
- **Shared routes:** Settings, Messages, DataRequests, LogBehavior, History,
  and ChildProfile receive the new class only when the existing account/user
  data identifies a parent. Individual/client and clinician views do not opt
  into these styles. The ChildProfile route's portal behavior is unchanged.
- **Other existing parent tool:** the current independent-parent ClinicPanel
  gets scoped layout styling. The legacy family “clinic managed” branch and
  its existing Open Messages action remain untouched.

## What was preserved

- **FamilyTools:** query key, child ID, save payload (`routines`,
  `routineRuns`, `preferences`, `reminders`), cache update, routine create/edit,
  step metadata and reordering/removal, current-step player start/resume/pause/
  back/next/finish/exit, routine run records, reminder target/day/time/timezone/
  snooze/quiet-hours fields, enable/pause/remove/edit actions, preference
  categories, and validation. The delivery-unavailable notice remains explicit;
  no notification delivery is implied.
- **ChildEditor:** `save` mutation payload, demographic lock, behavior/goal
  validation, upload shortcut, refresh/invalidation, and child context.
- **History / Log:** history queries, selected-child mapping, retry, timeline
  source distinctions, existing activity links, and `LogPanel`/`LogBehavior`
  submission fields, payloads, validation, success/error behavior, and handlers.
- **Messages:** both existing message adapters and their child scopes, send
  payloads, recipient constraints, cache/realtime behavior, urgent-safety
  notice, and account-specific route handling.
- **Settings / privacy:** all account-gated profile/password/access-code/theme/
  sign-out/deletion-request controls and their existing callbacks, payloads,
  validations, links, and deletion confirmation text remain unchanged.
- **Clinic:** invite lookup, consent, sharing, merge review, connect/revoke
  actions, payloads, refreshes, and the legacy-family restriction remain
  unchanged.

No backend changes are needed.

## Files modified or created

- `src/components/parentfree/FamilyTools.jsx`
- `src/components/parentfree/family-tools-phase-nine.css` (new)
- `src/components/parentfree/parent-tools-phase-nine.css` (new)
- `src/components/parentfree/ChildEditor.jsx`
- `src/components/parentfree/LogPanel.jsx`
- `src/components/parentfree/MessagesPanel.jsx`
- `src/components/parentfree/ClinicPanel.jsx`
- `src/pages/ParentHistory.jsx`
- `src/pages/LogBehavior.jsx`
- `src/pages/ChildProfile.jsx`
- `src/pages/Messages.jsx`
- `src/pages/Settings.jsx`
- `src/pages/DataRequests.jsx`
- `docs/phase-9-implementation-notes.md` (new)

## Verification and remaining limitations

- `pnpm --filter @workspace/neuropath run test`: 236 tests passed across 20
  files.
- Production Vite build passed. The existing large-chunk warning remains.
- `git diff --check` passed.
- Restarted the existing `artifacts/neuropath: web` workflow; the Vite server
  came up cleanly.
- A direct headless-browser session used a fresh, isolated parent account and
  fictional child created through the app's normal signup/setup screens. At a
  390px viewport, verified the routine editor, saved a synthetic routine,
  opened its Now player, exited it, and viewed Preferences, Reminders, History,
  and Messages. The reminder delivery-unavailable notice remained visible.
  The saved routine appeared in History.
- Screenshots of the routine editor, routine player, reminders, preferences,
  messages, and history are in `generated-artifacts/phase9-review/`.

Not live-verified: independent vs. clinician-connected vs. legacy-family parity;
profile edits, clinic actions, logs, reminder mutations or delivery, preference
saving, message sending, privacy requests, all settings actions, and clinician
or individual-client non-parent styling. No real user records or existing
credentials were used. The isolated synthetic account and its synthetic child
remain separate from real families; generated test credentials were not
included in source or screenshots. Phase 10 should cover these remaining
checks and broader responsive review.

The direct `/ChildProfile` route is a shared client-portal page rather than the
parent editor. Only its presentation is parent-opted-in; its clinical/portal
content and actions were not altered. No claim is made about mutation success,
reminder delivery, or browser parity for previously unverified states.
