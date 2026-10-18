# Phase 6 — Menu and navigation review

## Pre-edit shortcut inventory

The existing `/Menu` page has nine shortcuts. The selected `child_id` is appended unless the destination already supplies one.

| Shortcut | Existing destination | Unified parent / legacy-family destination |
| --- | --- | --- |
| History | `/History` | `/History` |
| Support library | `/HelpNow` | `/ParentHome?tab=today&section=library` |
| Care plan & documents | `/DocumentCenter` | `/ParentHome?tab=docs` |
| Upload a plan | `/ParentUpload` | `/ParentHome?tab=docs` |
| AI Chat | `/AIChat` | `/ParentHome?tab=ask` |
| Enjoyment & preferences | `/ChildProfile` | `/ParentHome?tab=practice&section=preferences` |
| Clinic connection | `/ParentHome?tab=clinic` | `/ParentHome?tab=clinic` |
| Settings | `/Settings` | `/Settings` |
| Messages | `/Messages` | `/ParentHome?tab=messages` |

Clinic connection is absent for `legacy_family`. Other original menu links remain present. Both `accountType` and `account_type` are supported.

Home, Help Now, Practice and Goals are already available through the surrounding navigation. Sign out and child selection belong to the existing shell. This phase does not duplicate those controls, create new destinations, or add unavailable profile/privacy/account actions.

## Scope

Presentation of the existing parent Menu only, plus its preservation tests. Keep mapping, account filtering, child context, routing, hamburger, bottom navigation, sidebar, back behavior and shell controls unchanged. Do not edit AI Chat or begin Phase 7.

## What changed

The Menu now uses the actual foundation PageHeader and MenuRow components. Existing links are organized into Resources, Family & Care Team, and Account sections, with icons, small chevrons, full-width rows and subtle separators. The original header copy and all shortcut labels/descriptions remain.

Styles are scoped to the Menu. The shared shell, sidebar, bottom navigation, other pages, authentication and API were not modified.

## Files modified

- `artifacts/neuropath/src/pages/ParentMenu.jsx`
- `artifacts/neuropath/src/pages/parent-menu-phase-six.css`
- `artifacts/neuropath/src/pages/ParentMenu.test.jsx`
- `docs/phase-6-menu-review.md`

## Before and after

Before: nine shortcuts appeared as a single undifferentiated list.

After: the same authorized shortcuts are divided into three labelled groups. Each group shares a single bordered list instead of placing every link in a separate colored card.

## What was preserved

The original entries, descriptions, icons, test IDs, handler mappings, selected-child query parameter, account-type aliases and legacy-family Clinic connection restriction. Existing navigation destinations and browser-back behavior are covered by tests.

## Testing

- Full suite: 194 tests passed across 18 files.
- Fifty new tests click every original shortcut across independent/legacy-family account modes and both account-type field aliases. They also verify exact authorized shortcut inventories, original non-unified fallback routes, missing/encoded child context and browser back.
- Production build passed; the existing bundle-size warning remains.
- The web and API workflows restarted successfully.
- Signed-in browser verification was blocked: the persistent browser reset and lost the existing test sessions. The temporary access fixture was no longer available. No new accounts were created and no account or clinical data was changed.

## Remaining issues and approval boundary

Actual phone/desktop screenshots, row measurements and keyboard-focus appearance have not yet been verified. This phase is not being submitted for completion approval until that visual review is possible. Fresh isolated verification accounts require permission; existing accounts must not be reset or modified to regain access.

Phase 7 — AI Chat has not started. No push, merge or deployment.
