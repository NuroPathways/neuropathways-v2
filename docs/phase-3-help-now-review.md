# NeuroPathways — Phase 3 Help Now review

## What Changed

Help Now uses the approved foundation's real PageHeader, MenuRow and Disclosure
components and scoped tokens. A Help Now-only stylesheet adapts their markup to
the existing app without importing the design system's global theme.

- The existing four choices are lightweight rows with clear labels, large
  targets and a visible emergency line.
- Child selection retains its existing preselection, explicit selection and
  Continue behavior.
- The current saved instruction is the dominant element, with its original
  Back/Next bounds and simpler-step switch.
- Every supplied escalation instruction is now also shown outside disclosures.
  This exposes existing source text without changing the escalation branch.
- Things to Avoid, clinician-contact thresholds, missing/error guidance and
  emergency information remain outside collapsed content.
- Only the optional explanation, prevention, encouragement, helpful-skill and
  observation sections use progressive disclosure.
- Crisis guidance uses numbered instructions instead of a colored card for
  every instruction. Uploaded/missing-plan distinctions are retained.
- Calming tools retain the same grounding prompts, strategies, breathing phases
  and timings. Reduced motion disables scaling and entrance animation.
- The modal keeps keyboard focus inside, supports Escape, restores trigger
  focus and body scrolling, and labels back/close controls. Calm tabs support
  arrow/Home/End keys and have linked tab/panel semantics.

## Files Modified

- `artifacts/neuropath/src/components/support/SupportNowOverlay.jsx`
- `artifacts/neuropath/src/components/support/BehaviorSelector.jsx`
- `artifacts/neuropath/src/components/support/CrisisPlan.jsx`
- `artifacts/neuropath/src/components/support/CalmDownTool.jsx`
- `artifacts/neuropath/src/components/support/help-now.css` — new
- `artifacts/neuropath/src/components/support/SupportNowFlow.test.jsx` — new
- `artifacts/neuropath/src/components/support/SupportGuidance.test.jsx`
- `artifacts/neuropath/src/components/navigation/navigationModels.test.jsx`
  — motion mock updated for the new reduced-motion hook; navigation code unchanged
- This review and the existing phased-redesign memory note.

## Before and After

Before: large colored choice cards and repeated colored instruction containers.
After: clear choice rows, one prominent current instruction, open numbered
safety lists and optional background disclosures.

The actual Phase 0 menu and active-support screenshots remain in
`generated-artifacts/phase0-audit/screenshots/`. Updated running-app screenshots
are supplied with the completion message.

## What Was Preserved

All public props, four menu destinations, child/account boundaries, source
labels, profile loading/fallback rules, clinical approval and child-bound-plan
eligibility, safety copy, step navigation, simpler-step branch, dismissal
tracking, reopening, engagement logging and breathing timings.

A syntax-tree comparison found all seven existing request/tracking expressions
in SupportNowOverlay and both expressions in BehaviorSelector unchanged.

No API, database, authentication, navigation implementation, Home, Practice,
Goals, AI Chat, native app or design-system package source was changed.
Nothing was pushed, merged or published.

## Testing

- Full regression suite: 118 tests across 16 files passed.
- After adding complete calming-tab keyboard semantics, all 10 focused Help Now
  preservation tests passed, including the additional keyboard regression.
- Production-format build passed after the final stylesheet change, into
  `/tmp`; this was not a deployment.
- Existing request/tracking expression comparison passed.
- Git whitespace checks passed; managed web workflow restarted and serving.
- Signed-in browser checks covered both parent types at 390×844 and the
  connected-parent account at 1440×1000. Home, mobile-navigation and sidebar
  Help Now shortcuts opened the chooser for the correct child.
- Four choices fit on mobile with no horizontal overflow. Choice heights were
  94/94/94/72px; the close button measured 44×44px.
- Next/Back, the simpler branch and return, optional prevention disclosure,
  behavior-list/menu return, both missing-plan safety screens, breathing
  start/pause, grounding and personal-strategy tab navigation worked.
- Keyboard focus stayed in the modal. Escape, Close and Dashboard exit worked;
  focus and body scrolling were restored. Reduced-motion breathing stayed
  static while the phase labels/timer continued.
- Review was read-only: no clinical data, logs, outcomes, uploads, messages or
  AI questions were submitted. Browser images are synthetic fixture evidence.

### Running-App Screenshot References

- Independent mobile menu: `rnvtpc`; connected mobile menu: `8qoy3m`.
- Independent behavior selection: `uthabr`; connected selection: `pmjd1c`.
- Independent active guidance: `sieiwn`; connected active guidance: `n40738`.
- Independent safety screen: `qn7f5p`; connected safety screen: `rw28eg`.
- Connected desktop menu: `8cvnba`; active guidance: `ds3der`;
  sidebar entry: `v0clnz`.
- Calming tool: `c39n7q`; reduced-motion breathing: `s76vb1`;
  restored trigger focus after Escape: `c9d57e`.

## Remaining Issues

- The browser reviewer flagged that River had no separate If it escalates
  heading. This section is intentionally conditional on a nonempty saved
  escalation list. Its always-visible rendering with multiple instructions
  passed component tests; the browser fixture did not exercise that state.
  River's clinician-contact escalation copy and emergency guidance were visible.
- Both supplied browser cases lacked an uploaded individualized crisis plan.
  Supplied crisis instructions were covered by component tests, not browser
  fixture data. No missing clinical content was invented.
- Independent-parent desktop, native Expo, dark-mode browser and full
  screen-reader coverage are not claimed.
- The existing production-build large-chunk warning remains; an unrelated
  application-wide bundling refactor was not added.

## Approval Required

Do you approve Phase 3 — Help Now, and authorize Phase 4 — Practice?

Phase 4 has not started. Requested revisions stay within Phase 3.
