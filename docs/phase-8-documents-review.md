# Phase 8 — Document Center review

**Status: Phase 8 implementation and verification complete; awaiting approval before Phase 9.**

## What changed

- Compact document rows with a file icon, full wrapping name, category, uploader role and privacy indication.
- One small Ready, Processing, Failed or Needs Review indicator rather than several large badges.
- Per-document View details disclosures retain reading status, original technical scan errors, file name, category/type, source, upload date, related child, privacy and clinician-review metadata.
- Successful readings with safety notes and explicit Needs Review notes remain visible outside collapsed details.
- Technical failures show a concise summary with the original full error in details.
- New authenticated Download action uses the same binary content endpoint as View, the original file name and a temporary object URL.
- Actual foundation Button, Input, Disclosure and StatusBadge components; all adapter styles scoped to `.np-docs-v8`.
- Existing UploadBox is unchanged; only its Document Center wrapper receives scoped visual adjustments.

## Files modified

- `artifacts/neuropath/src/components/parentfree/DocsPanel.jsx`
- `artifacts/neuropath/src/components/parentfree/docs-phase-eight.css`
- `artifacts/neuropath/src/components/parentfree/DocsPanel.test.jsx`
- `docs/phase-8-documents-review.md`
- Durable safety, verification-permission and document-compatibility notes in the existing memory topics.

## Before and after

Before: each document stacked processing, category, uploader, sharing and review badges alongside full scan errors and several actions.

After: one status indicator and a quiet source/category/privacy line identify the document. Secondary metadata and complete technical errors are available through View details. Full safety notes are not collapsed.

Actual signed-in phone and desktop screenshots were captured and reviewed. Mobile uses one column; desktop places uploads beside the compact document list.

## What was preserved

Search behavior, category derivation, View, scan/retry handlers, sequential batch reading with continue-on-failure, operation locks, child-change scan cancellation, sharing permissions/payloads and cache refreshes.

Syntax-tree comparison confirmed that `readPlans`, `retry`, `toggle`, `view` and `categoryOf` remained unchanged. No backend, storage, authentication, model, prompt, shared navigation or other-role document page was changed. Upload authorization, accepted types, 20 MB validation, upload/retry behavior and consent text are unchanged.

## Testing

- Final full app suite: 236 tests passed across 20 files.
- Thirty new document tests cover search, categories, empty states, thirteen status inputs, exact safety-note visibility, metadata/error disclosure, authenticated binary View/Download, denied-content errors, read-only permissions, clinic-dependent sharing, payloads, selected-document retry, sequential batch reading, continued reading after a failed file and child-change cancellation.
- Final production build passed; the existing bundle-size warning remains.
- Managed web workflow restarted after the code changes.

## Live signed-in verification

The earlier private sessions were lost after an environment/notebook reset. The user explicitly authorized fresh isolated verification accounts and minimal synthetic data for the remaining redesign phases. Verification used isolated independent-parent and legacy-family fixtures with one fictional nonclinical text document each. Existing real accounts, credentials, family records and clinic relationships were not changed.

- Both upload controls stayed disabled until the uploader authorization checkbox was checked.
- Real uploads returned 201 and scans returned 200 for the correct selected child. Both documents reached Ready and remained present after reload.
- Search and category filters returned the expected document; details retained source, child association, reading status, privacy and review metadata.
- Authenticated View opened each file's text in a blob popup. The independent View response contained all 230 expected bytes. A family View response-body capture was incomplete, but its popup visibly displayed the text.
- Both Download actions saved their original file names and exact uploaded bytes: 230 bytes for the independent document, 238 bytes for the family document.
- A request for the independent account's private file under the other account's observed family-token transport returned HTTP 403 JSON, not document bytes.
- Sharing remained disabled without a connected clinic. No real clinic connection or sharing mutation was attempted; enabled sharing and stop-sharing payloads are covered by automated tests.
- At 390px and 1440px, there was no horizontal overflow and View, Download and Read again controls measured 44px high.
- Workflow logs showed the web/API services running without a new application startup error.

## Screenshots

- `29gjmy` — independent parent, 390px, search and persisted Ready/Private document.
- `487dl5` — independent document details expanded.
- `shfa25` — legacy-family document list after reload, 390px.
- `32t364` — desktop, 1440px, metadata expanded and upload authorization gate.

## Remaining issues and verification limits

- Plain-text View misrendered a UTF-8 em dash as `â€”`, although Download preserved the exact original bytes. The existing View handler is unchanged; this encoding issue was not silently fixed through shared content/backend changes.
- Live checks used small synthetic text files. PDF, Word, image scans, invalid-PDF failures and 320px layout were not re-tested in this pass.
- No live scan failure occurred. Failed/Needs Review/Processing variants, full scan-error disclosure, safety-note visibility, individual retry and batch continue-on-failure were verified in component tests.
- The existing bundle-size warning remains.
- Native Expo and other-role document pages were not changed or re-tested.

## Approval boundary

Phase 9 has not started. No push, merge or publish action was performed.
