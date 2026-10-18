/* GENERATED FROM tokens.json -- DO NOT EDIT. Run scripts/build-tokens.mjs. */
// Portable design tokens (colors as hex). Web consumes the theme via
// src/index.css; mobile (Expo) and any other platform import this object so the
// whole product shares one source of truth.
export const tokens = {
  "color": {
    "light": {
      "background": "#f5f9f8",
      "foreground": "#1c313f",
      "border": "#d5e1de",
      "card": "#ffffff",
      "cardForeground": "#1c313f",
      "popover": "#ffffff",
      "popoverForeground": "#1c313f",
      "primary": "#496fa4",
      "primaryForeground": "#ffffff",
      "secondary": "#e7ecef",
      "secondaryForeground": "#233c4d",
      "muted": "#eaf0ef",
      "mutedForeground": "#546773",
      "accent": "#d6ebe5",
      "accentForeground": "#233c4d",
      "destructive": "#d12929",
      "destructiveForeground": "#ffffff",
      "input": "#d5e1de",
      "ring": "#496fa4",
      "chart1": "#496fa4",
      "chart2": "#397471",
      "chart3": "#255653",
      "chart4": "#546773",
      "chart5": "#d12929",
      "sidebar": "#f4f5f7",
      "sidebarForeground": "#1c313f",
      "sidebarBorder": "#e3e5e9",
      "sidebarPrimary": "#496fa4",
      "sidebarPrimaryForeground": "#ffffff",
      "sidebarAccent": "#d6ebe5",
      "sidebarAccentForeground": "#233c4d",
      "sidebarRing": "#496fa4"
    },
    "dark": {
      "background": "#121b21",
      "foreground": "#eaf1ef",
      "border": "#36454e",
      "card": "#1a262d",
      "cardForeground": "#eaf1ef",
      "popover": "#1a262d",
      "popoverForeground": "#eaf1ef",
      "primary": "#496fa4",
      "primaryForeground": "#ffffff",
      "secondary": "#2b3840",
      "secondaryForeground": "#eaf1ef",
      "muted": "#26323b",
      "mutedForeground": "#a1b5b0",
      "accent": "#2e4d48",
      "accentForeground": "#eaf1ef",
      "destructive": "#d33636",
      "destructiveForeground": "#ffffff",
      "input": "#36454e",
      "ring": "#66b7ab",
      "chart1": "#496fa4",
      "chart2": "#66b7ab",
      "chart3": "#a1b5b0",
      "chart4": "#36454e",
      "chart5": "#d33636",
      "sidebar": "#1a262d",
      "sidebarForeground": "#eaf1ef",
      "sidebarBorder": "#36454e",
      "sidebarPrimary": "#496fa4",
      "sidebarPrimaryForeground": "#ffffff",
      "sidebarAccent": "#2e4d48",
      "sidebarAccentForeground": "#eaf1ef",
      "sidebarRing": "#66b7ab"
    }
  },
  "fontFamily": {
    "sans": [
      "DM Sans",
      "Inter",
      "ui-sans-serif",
      "system-ui",
      "sans-serif"
    ],
    "serif": [
      "Georgia",
      "serif"
    ],
    "mono": [
      "Menlo",
      "monospace"
    ],
    "display": [
      "Manrope",
      "DM Sans",
      "sans-serif"
    ]
  },
  "fontSize": {
    "page-title": "1.625rem",
    "section-title": "1.25rem",
    "card-title": "1.0625rem",
    "body": "1rem",
    "body-sm": "0.9375rem",
    "support": "0.875rem",
    "support-sm": "0.8125rem"
  },
  "lineHeight": {
    "page-title": "1.25",
    "section-title": "1.3",
    "card-title": "1.35",
    "body": "1.55",
    "body-sm": "1.55",
    "support": "1.45",
    "support-sm": "1.45"
  },
  "space": {
    "gutter": "1.25rem",
    "section": "2rem",
    "related": "0.75rem",
    "related-lg": "1rem",
    "card": "1rem",
    "card-lg": "1.25rem",
    "list": "0.5rem",
    "list-lg": "0.75rem",
    "control": "2.75rem"
  },
  "elevation": {
    "floating": "0 8px 24px -12px rgb(28 49 63 / 0.28), 0 2px 6px -2px rgb(28 49 63 / 0.10)",
    "raised": "0 1px 2px rgb(28 49 63 / 0.06)"
  },
  "radius": "0.75rem",
  "spacing": "0.25rem"
} as const;

export type Tokens = typeof tokens;
export default tokens;
