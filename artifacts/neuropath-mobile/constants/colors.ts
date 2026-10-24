import tokens from "@workspace/neuropathways-foundations";

type FoundationPalette = typeof tokens.color.light | typeof tokens.color.dark;

const mobilePalette = (palette: FoundationPalette) => ({
  text: palette.foreground,
  tint: palette.primary,
  background: palette.background,
  foreground: palette.foreground,
  card: palette.card,
  cardForeground: palette.cardForeground,
  primary: palette.primary,
  primaryForeground: palette.primaryForeground,
  secondary: palette.mutedForeground,
  secondaryForeground: palette.secondaryForeground,
  muted: palette.muted,
  mutedForeground: palette.mutedForeground,
  accent: palette.accent,
  accentForeground: palette.accentForeground,
  destructive: palette.destructive,
  destructiveForeground: palette.destructiveForeground,
  border: palette.border,
  input: palette.input,
});

const colors = {
  light: mobilePalette(tokens.color.light),
  dark: mobilePalette(tokens.color.dark),
  radius: Number.parseFloat(tokens.radius) * 16,
};

export default colors;
