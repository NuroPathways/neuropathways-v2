# NeuroPathways — Phase 2 Home review

## PHASE 2 COMPLETE

Scope: the shared parent Home on the existing website, at mobile and desktop
widths, for independent and clinician-connected families. Phase 3 is not started.

### What Changed

- Replaced Home's decorative heading with the approved design-system PageHeader:
  child name, short subtitle, privacy shortcut and existing child selector above.
- Retained the red Help Now shortcut and its exact existing trigger.
- Reused the approved CompactCard primitive for activities. Previews retain the
  title, behavior, duration, source, status and description. Descriptions are
  deliberately not line-clamped because they can contain safety context.
- Try Today / View Activity / Review Activity opens the existing full steps,
  skill, explanation and applicable outcome/save controls. Needs-review guidance
  and saved feedback remain visible in the closed preview. Errors stay visible.
- Moved Prepare before This Week in document/reading order. Preparation is a
  lightweight section with its original support-step action; saved prevention
  instructions remain available in a disclosure. Its existing safety caution
  remains visible.
- Made This Week a lighter summary, retaining the same counts, source and
  observation-versus-clinical-finding distinction.
- Preserved all Quick Actions, behavior selections and Support Library controls.
- Added Home-only bottom spacing so the final controls clear the mobile nav.

### Design-System Integration

Home consumes the shared package's real PageHeader and CompactCard components
and generated, scoped tokens directly. A Home-only CSS bridge applies their
approved visual values without importing the global Tailwind 4 theme or
upgrading the existing Tailwind 3 application. No token values or component
source were copied into the app. Styles are conditional on the Home view.

Other tabs retain their previous header and appearance. The package dependency
and lockfile add only the existing workspace design-system package.

### Files Modified

- `artifacts/neuropath/package.json`
- `artifacts/neuropath/src/pages/ParentHome.jsx`
- `artifacts/neuropath/src/components/parentfree/DailySupportHome.jsx`
- `artifacts/neuropath/src/components/parentfree/DailySupportHome.test.jsx`
- `artifacts/neuropath/src/components/parentfree/HomeWeekSummary.jsx` — new
- `artifacts/neuropath/src/components/parentfree/home-phase-two.css` — new
- `pnpm-lock.yaml`
- This review and the browser-verification memory note.

No API, database, auth, native app, navigation shell, Help Now dialog, Practice,
Goals, AI Chat or design-system component implementation was changed.

### Before and After

The Phase 0 baseline remains in
`generated-artifacts/phase0-audit/screenshots/`.
Actual updated Home screenshots were captured using existing synthetic fixtures:

- Independent parent, Alex: 390×844 (`w4l5k7`) and 1440×1000 (`2d5iye`).
- Connected family, River: 390×844 (`hh7c3j`) and 1440×1000 (`vcmkh4`).
- Expanded activity: `6rxylc`.
- Bottom-of-Home navigation clearance: `1p1weg`.
- Existing AI tab appearance retained: `ijq6zp`.
- Settled Help Now on independent/connected mobile: `6c17ls`, `otbrf6`.

Screenshots are supplied in the conversation; these identifiers refer to the
browser evidence, not new application routes.

### What Was Preserved

- Existing colors, genuine logo, desktop sidebar and mobile navigation.
- Child selection and independent/connected account boundaries.
- Help Now's four choices, safety copy, routes and behavior.
- Every Quick Action callback and destination.
- Source information, skills, full instructions, preparation, feedback and
  safety notes.
- Done / Didn't get a chance / We struggled request payloads.
- Save for Later / Move to Today payloads, pending locks, errors and the same
  child's dashboard invalidation.
- Activity and support-area lists, focus selection, empty states and more/fewer
  controls.
- Existing Practice continuation/progress storage. Home had no separate
  persisted Continue control before this phase; no replacement persistence,
  synthetic progress or unsupported Continue state was invented.
- Clinical records, permissions, consent and historical instructions.

No reset, rebase, squash, push, merge or publishing action was performed.

### Testing

- All **109 tests across 15 files passed**, including 13 added Home preservation
  cases covering requests, failures, pending locks, warnings, feedback, shortcuts,
  multiple selections, empty states and reading order.
- Production-format Vite build passed into `/tmp`; it was not published.
- Signed-in browser verification passed on both parent modes at phone and
  desktop widths.
- All seven Quick Actions reached their expected destinations and returned Home:
  Quick Log, Upload a Plan, Ask NeuroPathways, Support Library, Manage Goals,
  Edit Child Profile and Add a Behavior.
- The browser checked the child selector, privacy link, Help Now opening,
  activity expansion, saved preparation disclosure, support-step destination,
  existing completed feedback, bottom navigation clearance and desktop sidebar.
- Verification was read-only: no clinical outcomes, save statuses, messages,
  AI questions, uploads or profile edits were submitted.
- A first Help Now screenshot caught the opening animation and appeared
  translucent. A focused follow-up measured both account modes at two settled
  times: wrapper and panel opacity were 1, with an opaque panel background.
  The reviewer corrected the verdict to success; no Help Now fix was needed.
- Managed workflows are running. Git whitespace checks passed.

### Remaining Issues

- The supplied browser fixtures lacked needs-review and saved-for-later
  activities. Their warnings, Move to Today and mutation behavior were verified
  by automated component tests, not real persisted browser submissions.
- The browser did not toggle the Support Library focus button; its selection
  callback is covered by the component tests.
- The existing narrow AI Send label still wraps. AI Chat is an unapproved later
  phase and was not changed.
- Dark-mode styling has scoped guards but was not browser-verified. Full
  keyboard/screen-reader validation and native-device coverage are not claimed.
- The Expo app was not redesigned in this web phase.
- The build reports the existing large JavaScript chunk warning; code splitting
  was not added as an unrelated refactor.

### Approval Required

**Do you approve Phase 2 — Home, and authorize Phase 3 — Help Now?**

Further Home revisions remain in Phase 2. Approval to proceed authorizes only
the Help Now phase, not later pages or a global redesign.
