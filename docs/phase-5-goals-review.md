# Phase 5 — Goals & Milestones review

## Scope

Approved parent web Goals & Milestones and the goal-editor route on phone and desktop. Phase 6 — Menu has not started. No authentication, navigation destinations, database, API, native Expo or clinician-dashboard changes.

## What changed

- The host uses the foundation PageHeader for Goals & Milestones and Edit Goals.
- Family Goals, Goals From Your Care Team, and Goals From Plans & Documents have distinct groups, shown where the data supports them.
- Each goal has a compact package CompactCard preview with icon, existing title, source, optional real practice/check-in date and View Goal.
- Detail panels preserve descriptions, progress, milestones, practice records, source labels, related activities and authorized controls.
- Parent observations, participation, plan milestones and clinician-assessed progress have different labels. Practice is not presented as clinical improvement.
- Existing Add a goal and Add a family goal entry points remain. Forms have clearer spacing without additional steps.
- Technical titles such as “F4 retest” are flagged for source review. Any display fallback uses already-saved text; the original title remains available and is not rewritten.
- Detail panels use actual package Collapsible primitives with mounted but hidden content. Closing and reopening retains unsaved edit fields.
- Previously available behavior goals remain accessible if the separate saved-goal query is loading or fails.
- All new styling is scoped to the parent Goals/goal-editor routes and uses approved foundation tokens. Other pages keep their existing styling.

## Source classification

Parent-saved behavior goals remain Family Goals even when related guidance came from a clinician or document. Linked plan goals and provenance remain inside their details rather than duplicating the primary entry.

Existing care-team filtering and published-only restrictions remain. A published care-team goal is shown once even when the dashboard also projects its ID as a plan goal. Its linked plan source, description, milestones and practice links remain inside the care-team details. This uses the existing shared care-team query cache; there is no new endpoint. Visual grouping never grants edit or delete permission.

## Files modified

- `artifacts/neuropath/src/components/parentfree/ParentGoalsTab.jsx`
- `artifacts/neuropath/src/components/parentfree/ClinicalGoals.jsx`
- `artifacts/neuropath/src/components/parentfree/goalPresentation.jsx` — new presentation composition and local title/date helpers.
- `artifacts/neuropath/src/components/parentfree/goals-phase-five.css` — new scoped stylesheet.
- `artifacts/neuropath/src/components/parentfree/ParentGoalsTab.test.jsx`
- `artifacts/neuropath/src/components/parentfree/ClinicalGoals.test.jsx` — new preservation tests.
- `artifacts/neuropath/src/pages/ParentHome.jsx` — Goals-only host scope and header.
- `docs/phase-5-goals-review.md`
- `.agents/memory/goal-source-presentation.md` and its index entry — durable source/draft decisions.

## Preserved behavior

- Goal creation, editing, confirmed removal, practice recording, caregiver check-ins and their existing request contracts.
- Permission flags and clinician-authored goal restrictions.
- Progress values and the existing percentage calculation.
- Source labels, milestones, related activity/assignment destinations and record identities.
- Error/retry/loading states and saved data.
- Existing shared clinician preview: the new CareTeamGoalCard presentation is opt-in on the parent screen only.
- Home, Help Now, Practice, the sidebar and mobile navigation.

## Verification

- Final full regression suite passed: 144 tests across 17 files.
- New tests verify create/edit payloads, draft retention on collapse, practice increments, percentage limits, permission checks, removal confirmation, published-only care-team records and deduplication, milestones, related assignments, technical-title review without writes, failed-edit retention, query refresh and known behavior goals during loading/error.
- Existing plan-goal tests now open details before checking milestones and actions.
- Syntax-tree comparison before browser corrections confirmed existing request/mutation expressions unchanged. The final deduplication adds a read-only observer of the existing shared care-team query cache; mutation contracts remain covered by tests.
- Production build passed. The existing large main-bundle warning remains; its separate performance follow-up was already proposed during Practice.

## Browser evidence

The signed-in pass used the existing independent-parent and legacy-family synthetic fixtures at 390×844 and 1440×1000.

- Both accounts: created a new temporary family goal with target 3, recorded once, edited to target 5, reloaded and verified progress remained 1 of 5.
- Both accounts: closing/reopening retained the unsaved edit draft; Remove → Keep cancelled; Confirm remove and reload verified cleanup.
- Existing goals, clinical records, assignments and child fields were not changed.
- Both accounts: Behavior Library and the goal-editor shortcut opened without saving existing child fields.
- Connected account: care-team milestones, measurement, participation, practice history and the related assignment appeared. The assignment destination loaded without finishing or saving practice.
- Desktop lists did not overflow horizontally. Closed details had a valid hidden target and were skipped by keyboard navigation; visible keyboard focus was observed.
- Technical-title review is covered by unit tests; the live care-team fixture did not contain the specific “F4 retest” title.
- Independent fixture had no plan/care-team data. Plan details were inspected in the connected account and are also covered by unit tests.

The initial browser pass found undersized controls, a duplicated Practice prefix and a goal appearing in both care-team and plan groups. These were corrected afterward: higher-specificity token-based control sizing, display-only prefix normalization, and ID-based primary grouping with linked plan details preserved. Dedicated regressions and the final full suite/build passed. These final presentation fixes were not re-run in another browser pass; the screenshots below were captured before those small corrections.

Actual screenshots shown in the conversation:

- Independent phone list — `h2p8ou`
- Connected phone care-team detail — `qbp53y`
- Connected desktop list — `390vqt`
- Independent desktop list — `imsq17`

The browser run took longer than expected and was stopped after collecting the critical-flow and visual evidence. No additional test pass was launched. Native Expo and unrelated pages were not re-tested.

## Before and after

Before: goal information was expanded and repeated across stacked cards, and the same care-team ID could also appear under plan goals.

After: compact source-grouped previews lead to optional details; the care-team record has one primary location with its linked plan provenance retained. Saved titles, progress and permissions remain data-driven.

## Remaining issues

- The existing production bundle-size warning remains under its previously proposed performance follow-up.
- Final control-size and grouping corrections were verified through source inspection, regressions and build, not a second signed-in browser measurement.
- Screenshots are browser-pass evidence, not newly captured images of the final three minor corrections.

## Approval boundary

No manual Git commit, push, merge or deployment. Phase 6 requires separate approval.
