/**
 * FasalSaarthi — the raw colour ramps.
 *
 * Anchored to the brand mark: gold on deep forest. Three palettes had drifted
 * apart (mobile `primary #1B4332`, web `af-primary #284D35`, DESIGN_SPEC §40
 * `#24583A`); this file is the reconciliation, and the web keeps its own copy
 * in tailwind.config.ts. Semantic roles live in `colors.ts` — screens should
 * import those, not these, so a token can be re-pointed in one place.
 */
export const palette = {
  /**
   * The website's dark theme (agent-farmer src/app/globals.css, [data-theme="dark"]),
   * so the app and the site are one company at night. The app is dark-only.
   */
  night0: "#070809", // OLED ground (af-bg)
  night1: "#0D0E10", // alt band, one step up (of-bg-2)
  night2: "#121316", // card (af-card)
  night3: "#1C241E", // sage tint, inverted (af-sage)
  nightLine: "#2A2C31", // hairline (af-border)
  nightBand: "#1B2A21", // raised green emphasis band (af-secondary)
  nightBandDeep: "#0E1711", // deepest band (of-forest)
  nightGreen: "#5FBF82", // primary (af-primary) — 8.8:1 on the ground
  nightGreenHi: "#8ED9A6", // pressed/hover goes LIGHTER in dark (af-primary-deep)
  nightLeaf: "#9BCB73",
  nightLeafSoft: "#5E8C4A",
  nightGold: "#E3B341", // mustard (af-amber)
  nightGoldInk: "#F0C75F", // mustard readable as type (af-amber-ink)
  nightGoldTint: "#221E18", // warm tint, inverted (af-beige)
  nightBrick: "#EF6F57", // danger (af-danger)
  nightBrickTint: "#2A1713",
  nightSky: "#7FA8E8", // AI blue (af-ai)
  nightSkyTint: "#141A24", // (af-ai-soft)
  nightEarth: "#B08E6A", // (af-wood)
  nightInk: "#FFFFFF",
  nightInk2: "#B9C2BC", // green-cooled secondary text
  nightMuted: "#8A938D", // 6.3:1 — carries real labels

  forest900: "#0E2E20",
  forest800: "#123B29",
  forest700: "#1B4332",
  forest600: "#24583A",

  leaf500: "#2D6A4F",
  leaf300: "#86AF99",

  sage100: "#E8F0E3",
  sage200: "#D7E1CD",

  ivory50: "#F7F6EF",
  ivory100: "#F1EFE4",
  white: "#FFFFFF",

  /** The logo gold. Decorative only — 2.2:1 on ivory, never used for text. */
  gold500: "#C9A227",
  /** The gold that is legible as type on a light surface. */
  gold700: "#8A6A12",
  gold100: "#F7EFD4",

  clay600: "#A8452F",
  clay100: "#FBEAEA",

  sky500: "#4A6FA5",
  sky100: "#EAF0F7",

  soil500: "#8B7355",

  ink: "#173B2A",
  ink2: "#3F5347",
  muted: "#6E7A6B",

  /**
   * IMD hazard bands. Deliberately NOT the brand clay: these are a public
   * severity language a farmer already knows from television and radio, and
   * the ramp is validated on monotonic chroma (see the web's chartTheme.ts).
   */
  severityRed: "#B3221A",
  severityOrange: "#E2662A",
  severityYellow: "#E0A81C",
  severityClear: "#2E8B57",
} as const;
