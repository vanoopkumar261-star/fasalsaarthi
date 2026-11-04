import type { TextStyle } from "react-native";

/**
 * Two faces: Newsreader (an editorial serif) for titles and figures, Inter for
 * everything else. Loaded in app/_layout.tsx — before this, nothing was loaded
 * at all and the app rendered in system Roboto.
 */
export const fonts = {
  displayRegular: "Newsreader_400Regular",
  displayMedium: "Newsreader_500Medium",
  displaySemi: "Newsreader_600SemiBold",
  bodyRegular: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
  bodySemi: "Inter_600SemiBold",
  bodyBold: "Inter_700Bold",
} as const;

/**
 * Indic scripts fall back to the system font on purpose.
 *
 * Android ships Noto for Devanagari, Kannada, Tamil, Telugu, Malayalam, Bengali
 * and Gurmukhi, so bundling seven more families would add ~2.5 MB to the APK to
 * render what the platform already renders well. Returning `undefined` hands the
 * decision to the OS, which then also picks the right face for a mixed string.
 */
const LATIN_ONLY = new Set(["en"]);

export function displayFont(locale: string): string | undefined {
  return LATIN_ONLY.has(locale) ? fonts.displaySemi : undefined;
}

export function bodyFont(locale: string, weight: "regular" | "medium" | "semi" | "bold" = "regular") {
  if (!LATIN_ONLY.has(locale)) return undefined;
  return {
    regular: fonts.bodyRegular,
    medium: fonts.bodyMedium,
    semi: fonts.bodySemi,
    bold: fonts.bodyBold,
  }[weight];
}

/**
 * Seven sizes, down from the 25 the app had grown (including fractional ones
 * like 13.5 and 10.5). The floor is 12: §49 forbids tiny metadata text, and 11
 * was previously the single most common size in the codebase.
 */
export const type = {
  display: { fontSize: 28, lineHeight: 34, letterSpacing: -0.4 },
  title: { fontSize: 24, lineHeight: 30, letterSpacing: -0.3 },
  section: { fontSize: 18, lineHeight: 24 },
  card: { fontSize: 16, lineHeight: 22 },
  body: { fontSize: 15, lineHeight: 22 },
  secondary: { fontSize: 13, lineHeight: 18 },
  meta: { fontSize: 12, lineHeight: 16 },
} as const;

/** Small uppercase section labels — §42 says use uppercase HERE and nowhere else. */
export const eyebrow: TextStyle = {
  fontSize: 12,
  lineHeight: 16,
  letterSpacing: 0.8,
  textTransform: "uppercase",
};

/** Prices, pH, temperatures — so columns of figures stop jittering as they change. */
export const tabularNums: TextStyle = { fontVariant: ["tabular-nums"] };
