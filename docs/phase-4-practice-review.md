# Phase 4 — Practice implementation review

## Scope

Approved parent web Practice presentation on phone and desktop. Phase 5 — Goals & Milestones has not started. Native Expo, clinician navigation, Home, Help Now, authentication, databases and deployment configuration are unchanged.

## What changed

- The host uses the approved PageHeader for “Practice With [Child Name]”.
- Activity previews use the design system's actual CompactCard component, with category icons, existing skill/category and duration, descriptions, Start/Review and Save actions.
- Published care-team assignments retain their existing conditional section and small source indicator, without a large colored banner per assignment.
- Existing category filters retain their logic and receive clearer spacing and selected states.
- My Routines and Saved Activities use the package's MenuRow component and distinct icons.
- Guided practice has one clearly emphasized instruction panel with the existing step counter, Back, Next and Finish.
- Parent guide transitions move keyboard focus to the current instruction or feedback heading, with an outline and a step-count description. Clinician preview does not opt into this behavior.
- Difficulty guidance is visible during parent practice instead of requiring a disclosure to open it.
- Feedback has a separate muted, dashed surface. All three outcomes, optional notes, Save Update, Skip and Back remain.
- Descriptions are not line-clamped. Existing source, goal, sharing and safety text remain available.
- Styling is local to Practice and uses the approved foundation colors, typography, spacing and surfaces. No global CSS or design-system source migration.

## Related save-position correction

During the required Save for Later verification, the existing daily-activity path was found to use the position from the dashboard snapshot rather than the live guided step.

Daily activity progress now keeps the current local position until the dashboard catches up. Step requests are ordered, and pause/feedback saves wait for pending writes, so an older request cannot undo the later save in that activity flow.

The persistence format, API endpoints, stable backend identity, parent/child scope, activity generation and care-team assignment logic are unchanged.

## Files modified

- `artifacts/neuropath/src/components/parentfree/PracticePage.jsx`
- `artifacts/neuropath/src/components/parentfree/practice-phase-four.css` — new scoped stylesheet.
- `artifacts/neuropath/src/components/parentfree/PracticePage.test.jsx`
- `artifacts/neuropath/src/pages/ParentHome.jsx` — Practice-only header and foundation scope.
- `docs/phase-4-practice-review.md`
- `.agents/memory/practice-progress-identity.md` — durable distinction between frozen instructions and live resume position.

## Preserved behavior

- Activity generation, the six category definitions and category matching.
- Published-assignment filtering, selected-child filtering and care-team source labels.
- Frozen assignment instructions and version while open, with the existing live bookmark handling.
- Daily and assignment deep links, closed/read-only review, existing resume encoding and saved-activity storage.
- Existing outcome values, optional notes, sharing explanations and error/busy states.
- Related goals, history, existing skill-step fallback and behavior-creation shortcuts.
- Routines and preferences behavior and storage.
- Clinician preview: the new guide presentation is opt-in only for parent Practice; preview remains non-saving.

## Verification

- The initial full regression suite passed: 127 tests across 16 files.
- After the browser identified the Back-to-Step-1 focus issue, the correction passed all 23 Practice tests, including two new focus tests. The final production build also passed. The browser was not rerun after this focus-only correction.
- Added tests cover current-step saving, deliberately delayed step requests, all three outcome payloads with trimmed notes, retained notes after save failure, source/goal/history preservation, visible difficulty guidance and unchanged non-saving clinician preview.
- Production build passed. The existing large JavaScript chunk warning remains; no unrelated bundling refactor was attempted.
- Whitespace validation passed and the web workflow restarted cleanly. Other configured services remain running.

## Browser evidence

Both independent-parent and connected-family fixtures were checked at 390×844 and 1440×1000.

- Open starter activities, skill/time metadata, category filtering, My Routines and Saved Activities were exercised.
- A synthetic starter activity was saved at Step 2. After reload, it remained in Saved Activities and resumed at Step 2 of 7.
- One clearly marked synthetic outcome and note were submitted. A read-only dashboard response after reload confirmed the completed status, saved position, outcome and exact note. Reopening the activity showed completed, read-only review.
- The connected-family fixture showed four existing published care-team assignments. Instructions, source, related goal, visible difficulty guidance, Next/Back, Finish and the feedback/sharing fields were checked. No connected-family feedback was submitted.
- Related goal and history destinations worked without modifying goal data. The routine editor was opened but not edited.
- No horizontal overflow was observed. Mobile final controls could be scrolled above the fixed bottom navigation.
- The browser reviewer reported one focus failure when the Back button disappeared at Step 1. It was corrected as described above, including focus on guide entry and feedback transitions, without stealing focus while typing notes.

Actual screenshots were displayed in the conversation. These capture the browser-tested layouts before the final focus-only correction.

| Screenshot | Image ID |
| --- | --- |
| Independent-parent mobile activity list | qnd0ej |
| Saved activity resumed at Step 2 after reload | eyzf7s |
| Saved Activities before completion | bmc69a |
| Feedback form with all controls | ec9rq6 |
| Connected-family mobile care-team assignments | d3s1s8 |
| Connected-family desktop activity list | n21oge |
| Desktop assigned instructions and safety guidance | pp6489 |
| Desktop care-team feedback and sharing text | qe76yw |

The baseline comparison is `generated-artifacts/phase0-audit/screenshots/independent-practice-mobile.png`.

## Remaining issues and limits

- History currently shows the raw outcome code and does not display the saved note in the tested activity row. Both persisted correctly in the read-only API response; History presentation was not changed during Practice.
- A visible success confirmation was not observed after saving feedback; the view returned to the activity list. Persistence was verified separately rather than inferred from that navigation.
- Connected-family feedback submission, routine creation/editing, native Expo, dark mode and a full screen-reader audit were not exercised by this browser pass.
- The existing large main-bundle warning remains. Bundle optimization is outside this visual phase.

## Approval boundary

No manual Git commit, push, merge or deployment. Phase 5 requires separate approval.
