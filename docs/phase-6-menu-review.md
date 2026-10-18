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
- The first signed-in browser attempt was blocked by a browser reset and a missing temporary access fixture. The user then explicitly authorized fresh isolated verification accounts.
- A subsequent read-only Menu pass succeeded with synthetic independent-parent and legacy-family sessions at 390×844, plus an independent-parent desktop view at 1440×1000.
- The independent view had 9 original rows; the legacy-family view had 8, correctly excluding Clinic connection. Resources, Family & Care Team, and Account groups appeared in both modes.
- All menu rows measured at least 68px high. Neither mobile page overflowed horizontally. Keyboard focus had a visible 2px outline, and Menu was highlighted as active.
- The legacy-family History shortcut preserved the selected child context.
- No existing records were changed. Verification created only one independent parent account and child profile, one clinician account, and one legacy family account and child profile. No goals, plans or practice records were created.

## Screenshots

Actual signed-in screenshots were shown in the conversation:

- Independent phone Menu — `reewib`
- Legacy-family phone Menu — `4rt0im`
- Independent desktop Menu with keyboard focus — `eyn0yx`

Credentials/session material is excluded from this review and screenshots.

## Remaining issues and approval boundary

No blocking Menu issue was found. Long synthetic child names wrap in the existing mobile shell header and its workspace label truncates; neither obstructs Menu controls. That shared header was not changed in this phase.

The existing bundle-size warning remains. Native Expo was not modified or re-tested. Unit tests cover every original shortcut; the browser pass was deliberately limited to Menu presentation and a representative navigation/context check, not the contents of every destination page.

Phase 6 is ready for approval. Phase 7 — AI Chat has not started. No push, merge or deployment.
