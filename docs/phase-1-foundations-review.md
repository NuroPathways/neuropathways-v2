# NeuroPathways — Phase 1 foundation review

## PHASE 1 COMPLETE

This phase implements isolated visual foundations and component previews, not a
replacement Home page. Phase 0 and Phase 1 were explicitly approved. Phase 2 has
not been authorized.

### What Changed

Created the **NeuroPathways Design System** preview at
`/neuropathways-foundations/`, with all eight requested examples on its Overview:

1. Page header: child context, a 26px title, short description and responsive action.
2. Primary action: brand-blue emphasis, secondary/quiet alternatives, loading and disabled examples.
3. Compact activity card: source, title, skill/duration, short preview and focused-action state.
4. Goal card: source, observations and clinical progress shown separately, with optional details.
5. Menu row: consistent Lucide icon, label, supporting text, active and disabled states.
6. Floating support card: restrained elevation, existing urgent red and always-visible safety context.
7. Status badge: explicit text labels rather than color alone.
8. Expandable section: optional, non-urgent material only, including open/closed/disabled examples.

The package exports reusable primitives and tokens. All preview content is
explicitly illustrative; actions demonstrate local state only. Nothing saves a
record, sends a message, changes a child or calls a clinical API.

### Design Decisions

- Preserved the existing brand blue `#496fa4`, teal, sea-glass surfaces, red,
  neutral/text colors and genuine logo. The logo copy was verified byte-identical.
- Retained the existing DM Sans body and Manrope heading fonts, with Inter as
  a legacy fallback.
- Defined 26px page titles, 20px section headings, 17px card titles, 16px body text,
  14px supporting text, 20px mobile gutters, 32px section gaps, related spacing
  of 12–16px, 16–20px card padding and 44px primary controls.
- Open sections and separated groups avoid unnecessary card nesting. Subtle
  elevation is reserved for support/current-focus surfaces.
- Preserved the exact blue fill in the dark token set; the existing dark teal
  provides the dark focus ring. This does not change the application's theme.
- Clinical progress is never inferred from practice participation. No new
  intervention, behavior recommendation or emergency instruction was invented.

### Files Modified

The new package is `artifacts/neuropathways-foundations/`. Its scaffold contains
the stock component catalog and the Phase 1-specific work:

- `tokens.json` and `scripts/build-tokens.mjs`: source values and generated
  web/native token, utility and scoped-foundation outputs.
- `src/components/ui/{page-header,compact-card,menu-row,surface,status-badge,disclosure}.tsx`:
  new reusable primitives.
- `src/components/ui/{button,card}.tsx`: consistent action sizing/focus and restrained elevation.
- `src/preview/{phase-one,foundations,registry,DesignSystemBrowser}.tsx` and
  `src/preview/demos/neuropathways.tsx`: the review examples and component stories.
- `docs/phase-1-foundations.md`, the retained genuine logo and package usage guidance.
- Generated `src/index.css`, `src/generated/{tokens.tsx,scoped.css}` and favicon.
- Package configuration, fonts and preview scaffold.

Workspace changes are the lockfile addition, this review and the existing
approval-boundary memory note. **No existing web, native or API application
files were changed.**

### Before and After

- **Before:** the actual parent-app screenshots from Phase 0 remain the current
  application state.
- **After:** the new isolated foundation examples are available in the style-guide
  preview. They have not been applied to Home or any other current application page.
- Actual Phase 1 screenshots were captured at desktop width 1440px and phone
  widths 390px and 320px. All eight examples are included.

The downloadable review pairs a baseline parent screenshot with these clearly
labeled isolated previews. It must not be interpreted as an implemented Home redesign.

### What Was Preserved

Existing routes, shortcuts, palettes, application logo, parent/clinician account
modes, permissions, data, consent behavior, clinical content, desktop sidebar and
emergency access are unchanged. No database, authentication or API changes were made.
The original app artifacts were compared against the pre-Phase-1 Git baseline.
No reset, squash, merge, push or publishing action was performed.

### Testing

- The design-system token generator completed.
- TypeScript checking passed for the new package.
- A production-format build passed, with output written to `/tmp`, not published.
- Automated checks confirmed 32 complete color roles in each mode and all
  **22 tested foreground/surface pairs at or above 4.83:1**.
- The original logo's retained bytes match.
- Existing web/native/API artifacts have no Git changes against the baseline.
- Running-preview screenshots were inspected at 1440px, 390px and 320px widths;
  the eight examples remain readable and contained without visible horizontal
  clipping. The preview served without browser errors.
- The new managed preview workflow is running cleanly. Existing workflows remain running.

These checks are not a full accessibility certification, keyboard/screen-reader
audit, native-device test or clinical-flow regression run. Existing application
tests from Phase 0 were not rerun because application source was unchanged.
Local preview click states are code-inspected; no interactive browser test was run.

### Remaining Issues

- Application integration is intentionally deferred. The new preview uses
  Tailwind 4; the existing web app uses Tailwind 3. The exported scoped stylesheet
  supplies foundation utilities, **not all component styling**. Complete
  component-style compatibility must be verified during the approved screen
  integration; do not import the global preview theme into the existing app.
- Native components/adoption were not implemented or device-tested.
- Phase 0 issues such as dense Home/Goals content and the cramped mobile AI
  composer remain in the original app; their dedicated phases are not yet authorized.
- Full keyboard, screen-reader and real-flow regression checks remain for the
  relevant integration phases.

### Approval Required

**Do you approve the new NeuroPathways design system and authorize Phase 2 — Home?**

Approval would authorize Home only, using the approved foundation while preserving
the child selector, Help Now behavior, existing actions/data and account boundaries.
It does not authorize later phases or application-wide theme migration.
