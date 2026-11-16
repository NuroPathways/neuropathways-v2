/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
    "../neuropathways-foundations/src/components/ui/**/*.tsx",
  ],
  theme: {
    extend: {
      fontSize: {
        "page-title": ["var(--np-text-page-title)", { lineHeight: "var(--np-leading-page-title)" }],
        "section-title": ["var(--np-text-section-title)", { lineHeight: "var(--np-leading-section-title)" }],
        "card-title": ["var(--np-text-card-title)", { lineHeight: "var(--np-leading-card-title)" }],
        body: ["var(--np-text-body)", { lineHeight: "var(--np-leading-body)" }],
        "body-sm": ["var(--np-text-body-sm)", { lineHeight: "var(--np-leading-body-sm)" }],
        support: ["var(--np-text-support)", { lineHeight: "var(--np-leading-support)" }],
        "support-sm": ["var(--np-text-support-sm)", { lineHeight: "var(--np-leading-support-sm)" }],
      },
      spacing: {
        gutter: "var(--np-space-gutter)",
        section: "var(--np-space-section)",
        related: "var(--np-space-related)",
        "related-lg": "var(--np-space-related-lg)",
        card: "var(--np-space-card)",
        "card-lg": "var(--np-space-card-lg)",
        list: "var(--np-space-list)",
        "list-lg": "var(--np-space-list-lg)",
        control: "var(--np-space-control)",
      },
      boxShadow: {
        raised: "var(--np-shadow-raised)",
        floating: "var(--np-shadow-floating)",
      },
      colors: {
        background: "var(--np-color-background, hsl(var(--background)))",
        foreground: "var(--np-color-foreground, hsl(var(--foreground)))",
        card: {
          DEFAULT: "var(--np-color-card, hsl(var(--card)))",
          foreground: "var(--np-color-card-foreground, hsl(var(--card-foreground)))",
        },
        popover: {
          DEFAULT: "var(--np-color-popover, hsl(var(--popover)))",
          foreground: "var(--np-color-popover-foreground, hsl(var(--popover-foreground)))",
        },
        primary: {
          DEFAULT: "var(--np-color-primary, hsl(var(--primary)))",
          foreground: "var(--np-color-primary-foreground, hsl(var(--primary-foreground)))",
        },
        secondary: {
          DEFAULT: "var(--np-color-secondary, hsl(var(--secondary)))",
          foreground: "var(--np-color-secondary-foreground, hsl(var(--secondary-foreground)))",
        },
        muted: {
          DEFAULT: "var(--np-color-muted, hsl(var(--muted)))",
          foreground: "var(--np-color-muted-foreground, hsl(var(--muted-foreground)))",
        },
        accent: {
          DEFAULT: "var(--np-color-accent, hsl(var(--accent)))",
          foreground: "var(--np-color-accent-foreground, hsl(var(--accent-foreground)))",
        },
        destructive: {
          DEFAULT: "var(--np-color-destructive, hsl(var(--destructive)))",
          foreground: "var(--np-color-destructive-foreground, hsl(var(--destructive-foreground)))",
        },
        border: "var(--np-color-border, hsl(var(--border)))",
        input: "var(--np-color-input, hsl(var(--input)))",
        ring: "var(--np-color-ring, hsl(var(--ring)))",
        "chart-2": "var(--np-color-chart-2)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        display: ["var(--np-font-display)"],
        inter: ["var(--font-inter)"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};