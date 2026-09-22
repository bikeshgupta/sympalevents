/**
 * The colour an event wears.
 *
 * Named presets rather than a colour picker, and that is a deliberate
 * refusal. The UI rules set a 4.5:1 floor for body text and require colour
 * to come from the semantic tokens; a free hex field hands a committee the
 * ability to pick a pale yellow primary, put white text on it, and fail both.
 * Five presets are chosen once, checked once, and cannot be got wrong
 * afterwards.
 *
 * Every `primary` below sits at 38% lightness or darker, which is what keeps
 * white `--primary-foreground` text on it above the floor. If a preset is
 * ever added, that is the constraint to hold to.
 *
 * The values are the same HSL triplets `src/styles/globals.css` uses, so a
 * theme is applied by overriding the variables on a wrapper rather than by
 * introducing a second styling mechanism.
 */

export type ThemeKey = "teal" | "marigold" | "indigo" | "rose" | "forest";

export type ThemePreset = {
  key: ThemeKey;
  name: string;
  /** What it looks like, for the swatch's accessible name. */
  description: string;
  primary: string;
  accent: string;
  accentForeground: string;
};

export const themePresets: ThemePreset[] = [
  {
    key: "teal",
    name: "Teal",
    description: "The app's own deep teal and soft green.",
    primary: "182 53% 24%",
    accent: "152 24% 86%",
    accentForeground: "182 53% 20%",
  },
  {
    key: "marigold",
    name: "Marigold",
    description: "Deep amber, for a festival.",
    primary: "32 75% 32%",
    accent: "38 58% 88%",
    accentForeground: "32 75% 24%",
  },
  {
    key: "indigo",
    name: "Indigo",
    description: "Deep blue, for an evening event.",
    primary: "240 42% 34%",
    accent: "240 34% 90%",
    accentForeground: "240 42% 26%",
  },
  {
    key: "rose",
    name: "Rose",
    description: "Deep pink, for a celebration.",
    primary: "345 52% 34%",
    accent: "345 40% 92%",
    accentForeground: "345 52% 26%",
  },
  {
    key: "forest",
    name: "Forest",
    description: "Deep green, for a sports meet.",
    primary: "152 44% 22%",
    accent: "152 28% 88%",
    accentForeground: "152 44% 18%",
  },
];

export const defaultTheme = themePresets[0];

export function themeByKey(key: unknown): ThemePreset {
  return themePresets.find((preset) => preset.key === key) ?? defaultTheme;
}

/**
 * The variables to set on a wrapper. `--ring` follows `--primary` so the
 * focus ring never drifts away from the palette it belongs to.
 */
export function themeVariables(key: unknown): Record<string, string> {
  const preset = themeByKey(key);
  if (preset.key === defaultTheme.key) return {};
  return {
    "--primary": preset.primary,
    "--ring": preset.primary,
    "--accent": preset.accent,
    "--accent-foreground": preset.accentForeground,
  };
}
