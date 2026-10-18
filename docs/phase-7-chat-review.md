# Phase 7 — Parent AI Chat review

## Scope

The approved parent ChatPanel in `/ParentHome?tab=ask` only. The other-role `AIChat.jsx`, shared chat components, backend, model, prompts, authorization and crisis safeguards are unchanged. Phase 8 — Document Center has not started.

## What changed

- Actual foundation Button, Input and Disclosure components, with styles scoped to `.np-chat-v7`.
- A shrinking input and nonwrapping Send button, an accessible input label and token-based 44px minimum controls.
- Clearer message contrast, paragraph/list/heading spacing and long-text wrapping. User-entered spacing is retained.
- The emergency instruction and medical-advice notice remain visible at all times.
- Only the original static, nonurgent introductory explanation is inside Important information.
- Every AI answer and returned disclaimer remains visible without rewriting clinical content.
- Sources (n) expands to show all provided titles, excerpts and document IDs. No new document URLs are invented.
- The original clinician-review warning logic remains; warnings now apply to AI answers rather than the user's own messages.

## Files modified

- `artifacts/neuropath/src/components/parentfree/ChatPanel.jsx`
- `artifacts/neuropath/src/components/parentfree/chat-phase-seven.css`
- `artifacts/neuropath/src/components/parentfree/ChatPanel.test.jsx`
- `docs/phase-7-chat-review.md`
- Durable safety/styling notes in `.agents/memory/chat-safety-presentation.md`, `.agents/memory/phased-ui-redesign.md` and the memory index.

## Before and after

Before: the composer could squeeze Send onto multiple lines, sources were inline, and a lengthy introduction crowded the panel. User bubbles also received the AI-review warning.

After: the composer stays in one row, messages have clearer formatting and optional source details are expandable. Emergency guidance and returned safety notices stay outside disclosures.

## Preserved behavior

The request payload, selected-child identifier, local-date header, send guard, optimistic messages, success/error handling, draft restoration, settled-conversation reset, auto-scroll and provenance criteria.

Syntax-tree comparison confirmed that `send`, `parentLocalDay` and `allRefsReviewed` are unchanged. No route, shortcut, account relationship, existing record, model, prompt or backend was modified.

## Verification

- Full suite: 206 tests passed across 19 files.
- Twelve new tests cover request fields/local-day headers, whitespace/pending submission guards, failed-send draft recovery, settled child switching, visible safety notices/disclaimers, complete expandable citations, five review-provenance cases and unchanged markdown content.
- After the browser exposed obsolete legacy grid/scroll sizing, those structural classes were removed only from the redesigned ChatPanel. All twelve focused regressions and the final production build passed again.
- Production build passed. The existing bundle-size warning remains.
- Browser access was checked before the pass. The previously authorized synthetic verification profiles required minimum initial setup before Chat could be opened. Existing accounts and clinical records were not changed.

## Browser evidence

Both synthetic account types successfully submitted one harmless live question at 390×844. Both requests returned HTTP 200 for the correct child, disabled Send while pending and displayed the returned answer and exact disclaimer. Static Important information started closed and expanded correctly. No crisis prompts or clinical-advice validation were used.

At 320×844, the composer had a 163px input and a 68×44px one-line Send button without horizontal overflow. A 1440×1000 desktop view was also captured.

The independent synthetic profile required minimum QuickStart setup: one explicitly synthetic custom behavior and goal, with generated starter support. The legacy-family profile required no changes. No existing real profile, diagnosis, plan, permission or clinical record was changed; no new accounts were created in this phase.

Live responses had no citations. Complete citation fields and review states are verified by unit tests, not a live document-backed AI response.

Initial browser screenshots:

- Independent live phone answer — `bnrrmd`
- Legacy-family live phone answer — `qhvm5i`
- Narrow composer — `9pnw5x`
- Desktop Ask view — `hwiqun`

Final layout-only evidence after correcting inherited blank space:

- Narrow 320×844 Ask view — `85ai73`
- Desktop 1440×1000 Ask view — `0syg1q`

The collapsed information section measured 46px including its borders, rather than occupying the obsolete large grid row. Send remained 68×44px with no wrapping, the input measured 162.8px, and document/client widths matched at 305px. No additional AI request or repeated journey was needed.

## Remaining issues

The existing shared header crowds long child names at 320px; it was not changed outside the approved ChatPanel scope. The existing bundle-size warning remains. Native Expo and other-role Chat pages were not modified or re-tested.

## Existing issue found outside this visual change

An isolated diagnostic reproduced an existing child-switch race: a pending reply can arrive after the selected child changes and be appended to the new thread. The request callback is unchanged by this phase. A separate focused fix was proposed rather than silently changing asynchronous behavior in the visual redesign.

The temporary diagnostic was removed after confirming the issue; it is not a regression test endorsing that behavior.

## Approval boundary

No push, merge or deployment. Phase 8 requires explicit approval.
