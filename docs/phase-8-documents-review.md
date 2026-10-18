# Phase 8 — Document Center review

**Status: implementation and automated checks complete; signed-in verification is blocked by unavailable private test sessions. Phase 8 is not yet approved or delivered as complete.**

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
- A durable disclosure-safety note in `.agents/memory/phased-ui-redesign.md`.

## Before and after

Before: each document stacked processing, category, uploader, sharing and review badges alongside full scan errors and several actions.

After: one status indicator and a quiet source/category/privacy line identify the document. Secondary metadata and complete technical errors are available through View details. Full safety notes are not collapsed.

Actual signed-in visual evidence is still required before final review.

## What was preserved

Search behavior, category derivation, View, scan/retry handlers, sequential batch reading with continue-on-failure, operation locks, child-change scan cancellation, sharing permissions/payloads and cache refreshes.

Syntax-tree comparison confirmed that `readPlans`, `retry`, `toggle`, `view` and `categoryOf` remained unchanged. No backend, storage, authentication, model, prompt, shared navigation or other-role document page was changed. Upload authorization, accepted types, 20 MB validation, upload/retry behavior and consent text are unchanged.

## Testing

- Full app suite: 235 tests passed across 20 files.
- Twenty-nine new document tests cover search, categories, empty states, thirteen status inputs, exact safety-note visibility, metadata/error disclosure, authenticated binary View/Download, denied-content errors, read-only permissions, clinic-dependent sharing, payloads, sequential batch reading, continued reading after a failed file and child-change cancellation.
- After final metadata/status-label corrections, all 29 document tests passed again.
- Final production build passed; the existing bundle-size warning remains.
- Managed web workflow restarted after the code changes.

## Signed-in verification blocker

The previous private verification fixture and browser sessions were lost after an environment/notebook reset. The fixture is absent from both the tester and main environment. No account reset, new account creation, upload, scan, data mutation or browser-flow assertion occurred in this attempted pass.

Fresh isolated verification accounts require permission before the planned live checks can continue. Never reset existing accounts or weaken authentication to recover access.

## Checks still pending

Phone/desktop screenshots, real upload and scan status, real View/Download bytes, persistence after reload, retry, clinic-dependent sharing where supported, correct child association and a real cross-account private-document denial.

Automated component tests do not substitute for those live checks.

## Approval boundary

Phase 9 has not started. No push, merge or publish action was performed.
