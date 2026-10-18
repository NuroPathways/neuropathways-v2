# NeuroPathways — Phase 1 foundations

Status: **Phase 1 only — isolated preparation, not adoption.** Nothing in the
existing web app (`artifacts/neuropath`), native app, API or sandbox was
changed. Current app pages stay byte-identical until their own approved phases.
Phase 2 (Home) has not started.

## 1. Scope and adoption rules

- This package is a self-contained foundation. It does not import from any
  sibling artifact or shared workspace library.
- **Tailwind versions differ.** The existing web app uses Tailwind 3; this
  package (and its preview) uses Tailwind 4. Phase 1 does **not** upgrade or
  migrate the app, does not add this package as an app dependency, and does not
  import `./styles.css` (the generated Tailwind 4 theme, which sets `:root`,
  `body` and base styles) into any app. Importing `./styles.css` into the
  existing app would act as a global restyle and is out of scope.
- **Scoped stylesheet for later phases.** `pnpm tokens` also generates
  `src/generated/scoped.css` (exported as `@workspace/neuropathways-foundations/scoped.css`).
  It contains no Tailwind and nothing global: every variable is `--np-*` and
  every rule is under `.np-foundations` (dark: `.dark .np-foundations` or
  `.np-foundations.dark`). Classes: `np-page-title`, `np-section-title`,
  `np-card-title`, `np-text-<size>`, `np-muted`, `np-gutter`,
  `np-section-stack`, `np-related-stack`, `np-control`, `np-surface-separated`,
  `np-surface-floating`, `np-surface-urgent`. A later approved phase can opt a
  single subtree into it without a Tailwind migration.
- The React primitives (below) are written with Tailwind 4 utilities from this
  package's theme. Rendering them inside the Tailwind 3 app needs a deliberate
  integration decision in an approved phase (either a Tailwind 4 consumer
  boundary or styling the app's own markup with the scoped classes). That
  decision is **not** made in Phase 1.
- No auth, API, routes, navigation destinations, clinical logic or content
  were touched. Examples use local UI state only: no requests, no success
  toasts, no links posing as real routes.

## 2. Palette provenance (exact values, no new colors)

All colors live in `tokens.json` with a `$description` naming their source.

| Role | Light | Dark | Source |
| --- | --- | --- | --- |
| primary (brand blue) | `#496fa4` | `#496fa4` | `legacy-skin.css` `.np-legacy --primary 216 38% 47%` / `--np-nav-accent` |
| primary foreground | `#ffffff` | `#ffffff` | white on brand blue = 5.0:1 |
| background | `#f5f9f8` | `#121b21` | `index.css --background` 165 25% 97% / 204 31% 10% |
| foreground | `#1c313f` | `#eaf1ef` | `--foreground` 204 38% 18% / 165 20% 93% |
| card | `#ffffff` | `#1a262d` | `--card` |
| secondary | `#e7ecef` | `#2b3840` | `--secondary` |
| muted / muted text | `#eaf0ef` / `#546773` | `#26323b` / `#a1b5b0` | `--muted`, `--muted-foreground` |
| accent (sea-glass) | `#d6ebe5` | `#2e4d48` | `--accent` |
| destructive (urgent red) | `#d12929` | `#d33636` | `--destructive` |
| border / input | `#d5e1de` | `#36454e` | `--border` |
| ring | `#496fa4` | `#66b7ab` | light: `.np-legacy --ring`; dark: existing `.dark --ring` teal |
| chart-2 (teal) | `#397471` | `#66b7ab` | `index.css` light `--primary` 177 34% 34% / dark `--primary` 171 36% 56% |
| chart-3 | `#255653` | `#a1b5b0` | `.np-care-badge` text 177 40% 24% / muted text |
| sidebar / sidebar border | `#f4f5f7` / `#e3e5e9` | card / border | `.np-legacy --np-nav-bg`, `--np-nav-line` |

HSL sources were converted to hex by formula; the generator converts back to
HSL channels for the web theme.

**Preview-only dark adaptation:** the brand blue keeps its exact value in dark
mode but is used as a **fill only** (with white text). As text on the dark
background it would be about 3.4:1, so dark links/emphasis use foreground, and
the dark focus ring uses the existing dark teal `#66b7ab`. The app's own dark
mode currently maps primary to teal; nothing in the app was changed.

Teal is exposed via `chart-2` (no new role name) and is used for
support/supporting icons and the `support` status tone; it is not a second
primary.

## 3. Typography provenance

- Body/UI: **DM Sans** (app `--font-sans`), with **Inter** as legacy
  `.np-legacy` fallback. Headings: **Manrope** (app `--font-display`), exposed
  as `font-display` and applied to `h1`–`h4`. No other font is loaded.
- Sizes from the Phase 1 brief (`typography.fontSize` in `tokens.json`):
  page title 26px (`text-page-title`), section 20px (`text-section-title`),
  card 17px (`text-card-title`), body 16/15px (`text-body`, `text-body-sm`),
  supporting 14/13px (`text-support`, `text-support-sm`).

## 4. Spacing, radius and elevation

`spacing.semantic` emits Tailwind spacing names: `gutter` 20px, `section` 32px
(28–36 range), `related` 12px / `related-lg` 16px, `card` 16px / `card-lg`
20px, `list` 8px / `list-lg` 12px, `control` 44px. Radius base is 12px
(matching `.np-legacy` nav items). Elevation: `shadow-raised` (barely
separated cards) and `shadow-floating` (support and current focus only).

The generator (`scripts/build-tokens.mjs`) was extended to emit these optional
groups into `src/index.css`, `src/generated/tokens.tsx` and
`src/generated/scoped.css`. Edit `tokens.json` only, then run `pnpm tokens`.

## 5. Components added or themed

- Themed stock: `Button` (44px default height, 2px visible focus ring,
  semibold support-size label), `Card` (`shadow-raised` instead of `shadow`).
- New product-agnostic primitives, each with a story under
  `src/preview/demos/neuropathways.tsx` and a registry entry in
  “NeuroPathways primitives”:
  `PageHeader` + `SectionHeading` (`page-header`), `CompactCard`
  (`compact-card`), `MenuRow` (`menu-row`, `asChild` for app-owned links),
  `Surface` (`surface`: open / separated / floating, urgent tone),
  `StatusBadge` (`status-badge`), `Disclosure` (`disclosure`).
- Activity card and goal card are compositions of `CompactCard`; product data
  and meaning stay in the app.

## 6. Usage and accessibility rules (from the brief)

- One clear title per page; selected child as context; no repeated
  introductory panels.
- Open sections for headings and short descriptions; lightly separated groups
  for lists; floating cards only for Help Now, current activity/step,
  featured activity or active routine. No cards inside cards.
- Urgent red is reserved for urgent help and safety. Brand blue marks the one
  primary action in a region.
- Status and source are always stated in text; color only supports it.
- Observations/participation are visually and semantically separate from
  clinical progress. Never compute or show an invented percentage.
- Disclosures hold only optional explanations and secondary metadata.
  Emergency, escalation and critical safety content always stays visible.
- Lucide icons, one meaningful icon per row or heading, never beside every line.
- Controls are at least 44px, have accessible names and visible keyboard focus;
  motion is disabled under `prefers-reduced-motion`.
- Long text wraps (`overflow-wrap: anywhere`); layouts collapse to one column
  below 768px.

## 7. Preview

Deep links (preview path `/neuropathways-foundations/`):

- Eight examples: `/neuropathways-foundations/#page=overview`
- Logo: `#page=logo`; colors `#page=color-roles`; type `#page=type-scale`;
  spacing `#page=spacing-radius`
- Primitives: `#page=page-header`, `#page=compact-card`, `#page=menu-row`,
  `#page=surface`, `#page=status-badge`, `#page=disclosure`

The logo is the genuine PNG copied unchanged from
`artifacts/neuropath/public/neuro-pathways-mark.png` to
`docs/references/logos/neuro-pathways-mark.png` and imported through Vite
(base-path safe).

All sample content is illustrative, not clinical advice or real records.
