/**
 * Generates the consumable web theme (src/index.css) and the portable token
 * object (src/generated/tokens.tsx) from tokens.json.
 *
 * tokens.json (DTCG) is the single source of truth. This runs on dev start and
 * on every tokens.json change (see vite.config.ts) and before build/typecheck
 * (see package.json). Do not edit the generated files by hand.
 *
 * - src/index.css        the design system's theme. The preview app imports it,
 *                        and consuming apps import this same file (web).
 * - src/generated/tokens.tsx  hex token object for mobile (Expo) and any other
 *                             platform, so web + mobile share one source.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const tokensPath = join(root, "tokens.json");
const templatePath = join(here, "theme-template.css");
const cssOut = join(root, "src", "index.css");
const tsOutDir = join(root, "src", "generated");
const indexHtmlPath = join(root, "index.html");
const faviconOut = join(root, "public", "favicon.svg");

/** Resolve a DTCG node's $value, following {alias} references. */
function resolveValue(node, tokens) {
  const raw = node?.$value;
  if (typeof raw === "string" && raw.startsWith("{") && raw.endsWith("}")) {
    const path = raw.slice(1, -1).split(".");
    let cur = tokens;
    for (const key of path) cur = cur?.[key];
    return resolveValue(cur, tokens);
  }
  return raw;
}

function hexToHslChannels(hex) {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let s = 0;
  let hue = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        hue = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        hue = (b - r) / d + 2;
        break;
      default:
        hue = (r - g) / d + 4;
    }
    hue /= 6;
  }
  const H = Math.round(hue * 360);
  const S = Math.round(s * 1000) / 10;
  const L = Math.round(l * 1000) / 10;
  return `${H} ${S}% ${L}%`;
}

function toFontStack(value) {
  return Array.isArray(value) ? value.join(", ") : value;
}

function normalizeHex(hex) {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return `#${h}`;
}

/** Pick black or white text for best contrast on the given background hex. */
function contrastColor(hex) {
  const h = normalizeHex(hex).slice(1);
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.5 ? "#000000" : "#ffffff";
}

/** First alphanumeric character of the design system's title, uppercased. */
function faviconLetter() {
  let title = "";
  try {
    const html = readFileSync(indexHtmlPath, "utf8");
    title = html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "";
  } catch {
    title = "";
  }
  const match = title.match(/[A-Za-z0-9]/);
  return (match?.[0] ?? "D").toUpperCase();
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function buildFavicon(tokens) {
  const primary = normalizeHex(resolveValue(tokens.color.light.primary, tokens));
  const letter = escapeXml(faviconLetter());
  const fg = contrastColor(primary);
  return `<svg width="180" height="180" viewBox="0 0 180 180" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="180" height="180" rx="36" fill="${primary}"/>
  <text x="90" y="92" fill="${fg}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="104" font-weight="700" text-anchor="middle" dominant-baseline="central">${letter}</text>
</svg>
`;
}

function colorEntries(scope, tokens) {
  const out = {};
  for (const [name, node] of Object.entries(tokens.color[scope])) {
    if (name.startsWith("$")) continue;
    out[name] = resolveValue(node, tokens);
  }
  return out;
}

function buildCss(tokens) {
  let css = readFileSync(templatePath, "utf8");
  const replacements = {};

  for (const scope of ["light", "dark"]) {
    for (const [name, hex] of Object.entries(colorEntries(scope, tokens))) {
      replacements[`__DS_${scope.toUpperCase()}_${name.toUpperCase()}__`] =
        hexToHslChannels(hex);
    }
  }

  replacements.__DS_FONT_SANS__ = toFontStack(
    resolveValue(tokens.typography.fontFamily.sans, tokens),
  );
  replacements.__DS_FONT_SERIF__ = toFontStack(
    resolveValue(tokens.typography.fontFamily.serif, tokens),
  );
  replacements.__DS_FONT_MONO__ = toFontStack(
    resolveValue(tokens.typography.fontFamily.mono, tokens),
  );
  replacements.__DS_RADIUS__ = resolveValue(tokens.radius.base, tokens);
  replacements.__DS_SPACING__ = resolveValue(tokens.spacing.base, tokens);

  for (const [token, value] of Object.entries(replacements)) {
    css = css.split(token).join(value);
  }

  const leftover = css.match(/__DS_[A-Z0-9_]+__/g);
  if (leftover) {
    throw new Error(
      `tokens.json is missing values for: ${[...new Set(leftover)].join(", ")}`,
    );
  }
  return css + buildExtendedCss(tokens);
}

/** Named entries of a DTCG group (skips $-prefixed metadata). */
function namedEntries(group) {
  return Object.entries(group ?? {}).filter(([name]) => !name.startsWith("$"));
}

/**
 * Optional extended tokens: display font, semantic font sizes, semantic
 * spacing, and elevation. Emitted as Tailwind v4 theme variables so consumers
 * use utilities (text-page-title, p-gutter, shadow-floating, font-display).
 */
function buildExtendedCss(tokens) {
  const lines = [];
  const display = tokens.typography.fontFamily.display;
  if (display) lines.push(`  --font-display: ${toFontStack(resolveValue(display, tokens))};`);
  for (const [name, node] of namedEntries(tokens.typography.fontSize)) {
    lines.push(`  --text-${name}: ${resolveValue(node, tokens)};`);
    if (node.lineHeight) lines.push(`  --text-${name}--line-height: ${node.lineHeight};`);
  }
  for (const [name, node] of namedEntries(tokens.spacing.semantic)) {
    lines.push(`  --spacing-${name}: ${resolveValue(node, tokens)};`);
  }
  for (const [name, node] of namedEntries(tokens.elevation)) {
    lines.push(`  --shadow-${name}: ${resolveValue(node, tokens)};`);
  }
  if (lines.length === 0) return "";
  return `
/* Extended tokens (GENERATED from tokens.json typography.fontSize,
 * typography.fontFamily.display, spacing.semantic, elevation). */
@theme {
${lines.join("\n")}
}

@layer base {
  h1, h2, h3, h4 {
    font-family: var(--font-display, var(--app-font-sans));
  }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
`;
}

function extendedPortable(tokens) {
  const pick = (group) =>
    Object.fromEntries(namedEntries(group).map(([n, node]) => [n, resolveValue(node, tokens)]));
  return {
    fontSize: pick(tokens.typography.fontSize),
    lineHeight: Object.fromEntries(
      namedEntries(tokens.typography.fontSize).map(([n, node]) => [n, node.lineHeight ?? null]),
    ),
    space: pick(tokens.spacing.semantic),
    elevation: pick(tokens.elevation),
  };
}

const kebab = (name) => name.replace(/[A-Z0-9]+/g, (m) => `-${m.toLowerCase()}`);

/**
 * Scoped, framework-free stylesheet (src/generated/scoped.css, exported as
 * ./scoped.css). Everything lives under `.np-foundations` with `--np-*`
 * variables and `np-*` classes, so a consumer (including a Tailwind 3 app)
 * can opt one subtree in later without global CSS or a Tailwind migration.
 */
function buildScopedCss(tokens) {
  const vars = (scope) =>
    Object.entries(colorEntries(scope, tokens))
      .map(([n, hex]) => `  --np-color-${kebab(n)}: ${normalizeHex(hex)};`)
      .join("\n");
  const ext = extendedPortable(tokens);
  const misc = [
    `  --np-font-sans: ${toFontStack(resolveValue(tokens.typography.fontFamily.sans, tokens))};`,
    `  --np-font-display: ${toFontStack(resolveValue(tokens.typography.fontFamily.display ?? tokens.typography.fontFamily.sans, tokens))};`,
    `  --np-radius: ${resolveValue(tokens.radius.base, tokens)};`,
    ...Object.entries(ext.fontSize).map(([n, v]) => `  --np-text-${n}: ${v};`),
    ...Object.entries(ext.lineHeight).filter(([, v]) => v).map(([n, v]) => `  --np-leading-${n}: ${v};`),
    ...Object.entries(ext.space).map(([n, v]) => `  --np-space-${n}: ${v};`),
    ...Object.entries(ext.elevation).map(([n, v]) => `  --np-shadow-${n}: ${v};`),
  ].join("\n");
  const text = Object.keys(ext.fontSize)
    .map((n) => `.np-foundations .np-text-${n} { font-size: var(--np-text-${n}); line-height: var(--np-leading-${n}, 1.5); }`)
    .join("\n");
  return `/* GENERATED FROM tokens.json BY scripts/build-tokens.mjs -- DO NOT EDIT.
 * Scoped NeuroPathways foundations: opt-in under .np-foundations only.
 * Imports no Tailwind and sets nothing on :root, html or body. */
.np-foundations {
${vars("light")}
${misc}
  font-family: var(--np-font-sans);
  color: var(--np-color-foreground);
}
.dark .np-foundations, .np-foundations.dark {
${vars("dark")}
}
.np-foundations :is(h1, h2, h3, h4) { font-family: var(--np-font-display); }
${text}
.np-foundations .np-page-title { font-size: var(--np-text-page-title); line-height: var(--np-leading-page-title); font-weight: 700; }
.np-foundations .np-section-title { font-size: var(--np-text-section-title); line-height: var(--np-leading-section-title); font-weight: 600; }
.np-foundations .np-card-title { font-size: var(--np-text-card-title); line-height: var(--np-leading-card-title); font-weight: 600; }
.np-foundations .np-muted { color: var(--np-color-muted-foreground); }
.np-foundations .np-gutter { padding-inline: var(--np-space-gutter); }
.np-foundations .np-section-stack > * + * { margin-top: var(--np-space-section); }
.np-foundations .np-related-stack > * + * { margin-top: var(--np-space-related); }
.np-foundations .np-control { min-height: var(--np-space-control); }
.np-foundations .np-surface-separated { border: 1px solid var(--np-color-border); border-radius: var(--np-radius); background: var(--np-color-card); padding: var(--np-space-card); }
.np-foundations .np-surface-floating { border: 1px solid var(--np-color-border); border-radius: calc(var(--np-radius) + 4px); background: var(--np-color-card); padding: var(--np-space-card); box-shadow: var(--np-shadow-floating); }
.np-foundations .np-surface-urgent { border-left: 4px solid var(--np-color-destructive); }
@media (min-width: 640px) {
  .np-foundations .np-surface-separated, .np-foundations .np-surface-floating { padding: var(--np-space-card-lg); }
}
@media (prefers-reduced-motion: reduce) {
  .np-foundations *, .np-foundations *::before, .np-foundations *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
`;
}

function buildTs(tokens) {
  const portable = {
    color: {
      light: colorEntries("light", tokens),
      dark: colorEntries("dark", tokens),
    },
    fontFamily: {
      sans: resolveValue(tokens.typography.fontFamily.sans, tokens),
      serif: resolveValue(tokens.typography.fontFamily.serif, tokens),
      mono: resolveValue(tokens.typography.fontFamily.mono, tokens),
      ...(tokens.typography.fontFamily.display
        ? { display: resolveValue(tokens.typography.fontFamily.display, tokens) }
        : {}),
    },
    ...extendedPortable(tokens),
    radius: resolveValue(tokens.radius.base, tokens),
    spacing: resolveValue(tokens.spacing.base, tokens),
  };
  return `/* GENERATED FROM tokens.json -- DO NOT EDIT. Run scripts/build-tokens.mjs. */
// Portable design tokens (colors as hex). Web consumes the theme via
// src/index.css; mobile (Expo) and any other platform import this object so the
// whole product shares one source of truth.
export const tokens = ${JSON.stringify(portable, null, 2)} as const;

export type Tokens = typeof tokens;
export default tokens;
`;
}

export function buildTokens() {
  const tokens = JSON.parse(readFileSync(tokensPath, "utf8"));
  writeFileSync(cssOut, buildCss(tokens));
  mkdirSync(tsOutDir, { recursive: true });
  writeFileSync(join(tsOutDir, "tokens.tsx"), buildTs(tokens));
  writeFileSync(join(tsOutDir, "scoped.css"), buildScopedCss(tokens));
  mkdirSync(dirname(faviconOut), { recursive: true });
  writeFileSync(faviconOut, buildFavicon(tokens));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildTokens();
  process.stdout.write(
    "Generated src/index.css, src/generated/tokens.tsx, src/generated/scoped.css, and public/favicon.svg\n",
  );
}
